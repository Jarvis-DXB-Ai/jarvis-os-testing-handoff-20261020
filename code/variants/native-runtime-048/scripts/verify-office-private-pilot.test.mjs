import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {authorizeOwner} from '../src/cloudflare/owner-access.ts';
import {localOfficeEnabled,privateMacPilotEnabled,coordinatorWorkerEnvironment,officeLocalOrigin} from '../src/lib/office-runtime.mjs';
import {createPrivateOfficeOrigin} from './lib/office-private-origin.mjs';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {requestForContainer} from '../src/cloudflare/owner-access.ts';

const env={NODE_ENV:'production',JARVIS_PRIVATE_MAC_PILOT:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55421',JARVIS_PRIVATE_ORIGIN_AUTH:'cloudflare_access',JARVIS_RUNTIME_WORKER_ORIGIN:'https://jarvis-office-private.fixture.workers.dev',JARVIS_ACCESS_TEAM_DOMAIN:'https://jarvis-test.cloudflareaccess.com',JARVIS_ACCESS_AUDIENCE:'fixture-pilot-audience',JARVIS_OWNER_EMAILS:'owner@example.invalid,owner@example.invalid'};
const {privateKey,publicKey}=await generateKeyPair('RS256');
const keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'fixture',alg:'RS256'}]});
const workerSource=ts.transpileModule(readFileSync(new URL('../src/cloudflare/office-private-pilot.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const workerModule={exports:{}};
new Function('require','module','exports',workerSource)(()=>({authorizeOwner:(r,c)=>authorizeOwner(r,c,keys),requestForContainer}),workerModule,workerModule.exports);
const edge=workerModule.exports.privateOfficeGateway;
async function token(overrides={}) {const now=Math.floor(Date.now()/1000);return new SignJWT({sub:'fixture-owner',email:'owner@example.invalid',iss:env.JARVIS_ACCESS_TEAM_DOMAIN,aud:env.JARVIS_ACCESS_AUDIENCE,iat:now,exp:now+120,...overrides}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign(privateKey);}
async function listen(server) {await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
async function fixture(t) {
 const requests=[];
 const backend=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);requests.push({path:req.url,headers:req.headers,body:Buffer.concat(chunks).toString()});res.setHeader('set-cookie',['one=1; Path=/','two=2; Path=/']);res.end('fixture output');});
 const upstreamPort=await listen(backend);
 const gateway=createPrivateOfficeOrigin({env,upstreamPort,platform:'darwin',authorize:(r,c)=>authorizeOwner(r,c,keys)});
 const port=await listen(gateway);
 t.after(()=>{gateway.closeAllConnections();backend.closeAllConnections();gateway.close();backend.close();});
 return{requests,url:`http://127.0.0.1:${port}`};
}

test('production Mac mode requires explicit authentication, loopback datastore, approved origin and a Mac',()=>{
 assert.equal(privateMacPilotEnabled(env,'darwin'),true);
 assert.equal(localOfficeEnabled({NODE_ENV:'development',JARVIS_ISOLATED_TEST:'1'},'linux'),true);
 assert.equal(localOfficeEnabled({NODE_ENV:'production',JARVIS_ISOLATED_TEST:'1'},'darwin'),false);
 for(const key of ['JARVIS_PRIVATE_MAC_PILOT','JARVIS_PRIVATE_ORIGIN_AUTH','NEXT_PUBLIC_SUPABASE_URL','JARVIS_ACCESS_AUDIENCE','JARVIS_OWNER_EMAILS','JARVIS_ACCESS_TEAM_DOMAIN','JARVIS_RUNTIME_WORKER_ORIGIN']) assert.equal(privateMacPilotEnabled({...env,[key]:''},'darwin'),false,key);
 assert.equal(privateMacPilotEnabled({...env,JARVIS_ISOLATED_TEST:'1'},'darwin'),false);
 assert.equal(privateMacPilotEnabled(env,'linux'),false);
 for(const origin of ['http://localhost:3103','https://evil.example','https://owner@example.invalid','https://jarvis-office-private.fixture.workers.dev/other']) assert.equal(privateMacPilotEnabled({...env,JARVIS_RUNTIME_WORKER_ORIGIN:origin},'darwin'),false);
 assert.throws(()=>createPrivateOfficeOrigin({env:{...env,JARVIS_PRIVATE_MAC_PILOT:''}}));
});
test('private workers use the production loopback runtime without inheriting deployment or provider secrets',()=>{
 const worker=coordinatorWorkerEnvironment({...env,HOME:'/fixture',OPENAI_API_KEY:'secret',JARVIS_ACCESS_AUDIENCE:'sensitive-deployment-context'},'darwin');
 assert.equal(officeLocalOrigin(worker),'http://127.0.0.1:3103');assert.equal(worker.HOME,'/fixture');assert.equal(worker.OPENAI_API_KEY,undefined);assert.equal(worker.JARVIS_ACCESS_AUDIENCE,undefined);
 assert.equal(officeLocalOrigin(coordinatorWorkerEnvironment({HOME:'/fixture'},'darwin')),'http://127.0.0.1:3101');
 for(const value of ['https://evil.example','http://localhost:3103','http://127.0.0.1:3103/other'])assert.throws(()=>officeLocalOrigin({JARVIS_OFFICE_LOCAL_URL:value}));
});
test('anonymous pages, assets and APIs cannot reach the private application',async t=>{
 const f=await fixture(t);
 for(const path of ['/office','/_next/static/test.js','/api/office/library','/api/owner-data/rest/v1/clients','/_jarvis/office/start']) {const r=await fetch(f.url+path);assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal(f.requests.length,0);
});
test('forged identity, expired token, wrong audience and unapproved user fail closed',async t=>{
 const f=await fixture(t);
 for(const headers of [{'x-jarvis-owner-email':'owner@example.invalid'},{'cf-access-jwt-assertion':'unsigned'},...await Promise.all([{exp:1},{aud:'another-app'},{iss:'https://another.cloudflareaccess.com'},{email:'owner@example.invalid'}].map(async c=>({'cf-access-jwt-assertion':await token(c)})))]) {const r=await fetch(f.url+'/office',{headers});assert.ok([401,403].includes(r.status));}
 assert.equal(f.requests.length,0);
});
test('both approved owners receive real upstream data with canonical trusted identity and separate cookies',async t=>{
 const f=await fixture(t);
 for(const email of ['owner@example.invalid','owner@example.invalid']) {
 const r=await fetch(f.url+'/api/office/library?clientId=fixture',{headers:{'cf-access-jwt-assertion':await token({email}),'x-jarvis-owner-id':'spoof','x-jarvis-owner-email':'owner@example.invalid','x-jarvis-agent-runtime-token':'spoof'}});
 assert.equal(await r.text(),'fixture output');assert.equal(r.status,200);assert.equal(r.headers.get('x-jarvis-private-pilot'),'mac-origin');assert.equal(r.headers.getSetCookie().length,2);
 const saved=f.requests.at(-1);assert.equal(saved.headers['x-jarvis-owner-email'],email);assert.equal(saved.headers['x-jarvis-owner-id'],'fixture-owner');assert.equal(saved.headers['x-jarvis-agent-runtime-token'],undefined);assert.equal(saved.path,'/api/office/library?clientId=fixture');assert.equal(saved.headers['x-forwarded-host'],'jarvis-office-private.fixture.workers.dev');
 }
});
test('mutations require exact configured Origin and preserve body in one upstream request',async t=>{
 const f=await fixture(t),jwt=await token();
 for(const origin of [undefined,'https://evil.example','null']) {const r=await fetch(f.url+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':jwt,...(origin?{origin}:{})},body:'fixture'});assert.equal(r.status,403);}
 assert.equal(f.requests.length,0);
 const body=JSON.stringify({id:'fixture',brief:'Synthetic private pilot request'});
 const r=await fetch(f.url+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':jwt,origin:env.JARVIS_RUNTIME_WORKER_ORIGIN,'content-type':'application/json'},body});
 assert.equal(r.status,200);assert.equal(f.requests.length,1);assert.equal(f.requests[0].body,body);
});
test('oversized mutation bodies never reach the application',async t=>{
 const f=await fixture(t);const r=await fetch(f.url+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),origin:env.JARVIS_RUNTIME_WORKER_ORIGIN},body:'x'.repeat(2*1024*1024+1)});assert.equal(r.status,413);assert.equal(f.requests.length,0);
});
test('offline application gives a safe unavailable response without replay',async t=>{
 const closed=createServer();const port=await listen(closed);await new Promise(resolve=>closed.close(resolve));
 const gateway=createPrivateOfficeOrigin({env,upstreamPort:port,platform:'darwin',authorize:(r,c)=>authorizeOwner(r,c,keys)});const localPort=await listen(gateway);t.after(()=>{gateway.closeAllConnections();gateway.close();});
 const r=await fetch(`http://127.0.0.1:${localPort}/office`,{headers:{'cf-access-jwt-assertion':await token()}});assert.equal(r.status,502);assert.match((await r.json()).error,/No request was replayed/);
});
test('edge denies anonymous, unapproved identity, foreign origin and cross-site mutation before the tunnel',async()=>{
 let count=0;const bindings={...env,PRIVATE_OFFICE:{fetch:async()=>{count++;return new Response('fixture');}}};
 const base=env.JARVIS_RUNTIME_WORKER_ORIGIN;
 const requests=[new Request(base+'/office'),new Request(base+'/office',{headers:{'cf-access-jwt-assertion':await token({email:'owner@example.invalid'})}}),new Request('https://evil.example/office',{headers:{'cf-access-jwt-assertion':await token()}}),new Request(base+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),origin:'https://evil.example'},body:'fixture'})];
 for(const request of requests)assert.ok([401,403].includes((await edge(request,bindings)).status));
 assert.equal(count,0);
});
test('edge streams the fixed service response and forwards each authorised mutation exactly once',async()=>{
 let count=0;const body='synthetic task',bindings={...env,PRIVATE_OFFICE:{fetch:async request=>{count++;assert.equal(new URL(request.url).origin,'http://127.0.0.1:3104');assert.equal(request.headers.get('x-jarvis-owner-email'),'owner@example.invalid');assert.equal(await request.text(),body);return new Response('fixture task receipt',{status:202});}}};
 const result=await edge(new Request(env.JARVIS_RUNTIME_WORKER_ORIGIN+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),origin:env.JARVIS_RUNTIME_WORKER_ORIGIN},body}),bindings);
 assert.equal(result.status,202);assert.equal(await result.text(),'fixture task receipt');assert.equal(count,1);
});
test('edge tunnel disconnect fails safely and never retries a mutation',async()=>{
 let count=0;const bindings={...env,PRIVATE_OFFICE:{fetch:async()=>{count++;throw new Error('sensitive tunnel diagnostic');}}};
 const result=await edge(new Request(env.JARVIS_RUNTIME_WORKER_ORIGIN+'/api/office/team',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),origin:env.JARVIS_RUNTIME_WORKER_ORIGIN},body:'fixture'}),bindings);
 assert.equal(result.status,502);assert.equal(count,1);assert.ok(!JSON.stringify(await result.json()).includes('sensitive'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {OFFICE_COO_SERVICE_BODY_LIMIT} from './lib/office-coo-service-auth.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const {NextRequest}=require('next/server');
const source=readFileSync(new URL('../src/app/api/office/internal/coo/route.ts',import.meta.url),'utf8');
function fixture(privatePilot){
 const calls=[],module={exports:{}};
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const stubs={
  'next/server':require('next/server'),
  '@/lib/office-runtime.mjs':{privateMacPilotEnabled:()=>privatePilot},
  '@/lib/office-coo-reactive-server':{OFFICE_COO_SERVICE_BODY_LIMIT,officeCooServiceCall:async(body,auth)=>{calls.push({body,auth});return {ok:true};}},
 };
 new Function('require','module','exports',compiled)(name=>{assert.ok(Object.hasOwn(stubs,name),'Unexpected dependency '+name);return stubs[name];},module,module.exports);
 return {calls,post:module.exports.POST};
}
function request(url,body='{"version":1,"action":"events"}',headers={}){
 return new NextRequest(url+'/api/office/internal/coo',{method:'POST',headers:{'content-type':'application/json','x-jarvis-coo-at':'synthetic-at','x-jarvis-coo-signature':'synthetic-signature',...headers},body,duplex:'half'});
}
for(const privatePilot of [false,true]){
 const port=privatePilot?3103:3101;
 test(`real NextRequest normalizes both loopback spellings and reaches service at ${port}`,async()=>{
  const f=fixture(privatePilot);
  for(const host of ['127.0.0.1','localhost']){
   const req=request(`http://${host}:${port}`);
   assert.equal(req.nextUrl.origin,`http://localhost:${port}`);
   const result=await f.post(req);
   assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  }
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.calls[0],{body:'{"version":1,"action":"events"}',auth:{at:'synthetic-at',signature:'synthetic-signature'}});
 });
 test(`real NextRequest rejects foreign hosts, wrong ports and schemes in ${port} mode`,async()=>{
  const f=fixture(privatePilot);
  for(const origin of [`http://example.com:${port}`,`http://localhost.example.com:${port}`,`http://127.0.0.1.example.com:${port}`,`http://localhost:${privatePilot?3101:3103}`,`http://localhost:${port+1}`,`https://localhost:${port}`,`https://127.0.0.1:${port}`])assert.equal((await f.post(request(origin))).status,403,origin);
  assert.equal(f.calls.length,0);
 });
}
test('real NextRequest preserves exact bounded UTF8 body bytes',async()=>{
 const f=fixture(true),body='é'.repeat(OFFICE_COO_SERVICE_BODY_LIMIT/2);
 assert.equal(Buffer.byteLength(body),OFFICE_COO_SERVICE_BODY_LIMIT);assert.equal((await f.post(request('http://127.0.0.1:3103',body))).status,200);assert.equal(f.calls[0].body,body);
});
test('real NextRequest rejects chunked overflow before service and cancels stream',async()=>{
 const f=fixture(true);let cancelled=false,index=0;
 const stream=new ReadableStream({pull(controller){if(index===0){controller.enqueue(new Uint8Array(OFFICE_COO_SERVICE_BODY_LIMIT));index++;}else if(index===1){controller.enqueue(new Uint8Array(1));index++;}else controller.close();},cancel(){cancelled=true;}});
 assert.equal((await f.post(request('http://127.0.0.1:3103',stream))).status,403);assert.equal(f.calls.length,0);assert.equal(cancelled,true);
});
test('real NextRequest rejects malformed UTF8, declared oversize and wrong media type',async()=>{
 const f=fixture(true);
 for(const req of [request('http://127.0.0.1:3103',new Uint8Array([0xff])),request('http://127.0.0.1:3103','{}',{'content-length':String(OFFICE_COO_SERVICE_BODY_LIMIT+1)}),request('http://127.0.0.1:3103','{}',{'content-type':'text/plain'})])assert.equal((await f.post(req)).status,403);
 assert.equal(f.calls.length,0);
});

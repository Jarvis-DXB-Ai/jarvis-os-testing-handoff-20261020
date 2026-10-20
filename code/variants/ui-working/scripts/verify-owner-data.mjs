import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig} from './isolated-home-config.mjs';
const config=localTestConfig();
const source=await readFile(new URL('../src/lib/owner-data-proxy.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {proxyOwnerData}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let calls=0;
const send=async (url,init)=>{calls++;assert.equal(url.origin,config.API_URL);assert.equal(init.headers.get('authorization'),'Bearer server-secret');assert.equal(init.headers.get('accept-profile'),'public');assert.equal(init.redirect,'manual');return Response.json([{name:'TEST'}]);};
const options={url:config.API_URL,key:'server-secret'};
const request=(method='GET',headers={})=>new Request('http://127.0.0.1:3101/api/owner-data/rest/v1/clients',{method,headers});
assert.equal((await proxyOwnerData(request(),['rest','v1','clients'],options,send)).status,200);
assert.equal(calls,1);
for (const path of [['auth','v1','admin'],['rest','v1','rpc','anything'],['rest','v1','client_secure_credentials'],['rest','v1','..'],['storage','v1','object','private','secret']])
 assert.equal((await proxyOwnerData(request(),path,options,send)).status===200,false);
assert.equal((await proxyOwnerData(request('POST'),['rest','v1','clients'],options,send)).status,403);
assert.equal((await proxyOwnerData(request('POST',{origin:'https://attacker.example'}),['rest','v1','clients'],options,send)).status,403);
assert.equal((await proxyOwnerData(request('GET',{'sec-fetch-site':'cross-site'}),['rest','v1','clients'],options,send)).status,403);
assert.equal((await proxyOwnerData(request(),['rest','v1','clients'],{url:'https://attacker.example',key:'secret'},send)).status,503);
assert.equal((await proxyOwnerData(request(),['rest','v1','clients'],{url:'bad',key:'secret'},send)).status,503);
assert.equal(calls,1,'Rejected routes must never send server credentials');
assert.equal((await proxyOwnerData(request(),['rest','v1','clients'],options,async()=>new Response(null,{status:302,headers:{location:'https://attacker.example'}}))).status,502);
// Real isolated permissions and compatibility path.
const anon=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false}});
for (const table of ['clients','agents','ai_models']) {
 assert.ok((await anon.from(table).select('id').limit(1)).error,`${table} must deny direct anonymous reads`);
}
const url='http://127.0.0.1:3101/api/owner-data/rest/v1/clients';
const list=await fetch(url+'?select=id,name');assert.equal(list.status,200);assert.ok((await list.json()).every(c=>c.name.startsWith('TEST ')));
const denied=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.example'},body:JSON.stringify({name:'SHOULD NEVER EXIST'})});assert.equal(denied.status,403);
const created=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:3101',prefer:'return=representation'},body:JSON.stringify({name:'TEST owner proxy'})});assert.equal(created.status,201);const [{id}]=await created.json();
try { const saved=await fetch(url+`?id=eq.${id}&select=name`);assert.equal((await saved.json())[0].name,'TEST owner proxy'); }
finally { const r=await fetch(url+`?id=eq.${id}`,{method:'DELETE',headers:{origin:'http://127.0.0.1:3101'}});assert.equal(r.status,204); }
console.log('PASS: restricted proxy paths, origin checks, credential isolation, redirects, anonymous DB denial and real owner create/read/delete.');

// Invalid payload exercises the shared origin guard without writing client data.
const guestModels='http://127.0.0.1:3101/api/clients/a7604343-92d7-56ec-bf35-b272cac7f8b7/guest-models';
for (const [origin, status] of [['http://127.0.0.1:3101',400],['https://attacker.example',403]]) {
  const response=await fetch(guestModels,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
  assert.equal(response.status,status,`Guest model origin check: ${origin}`);
}
console.log('PASS container-aware same-origin mutation guard');

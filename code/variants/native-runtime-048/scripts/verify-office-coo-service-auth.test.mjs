import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm,chmod,symlink,link,rename,open} from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHmac,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {readOfficeCooPrivateJson,signOfficeCooServiceRequest,verifyOfficeCooServiceRequest,OFFICE_COO_SERVICE_BODY_LIMIT} from './lib/office-coo-service-auth.mjs';
import {officeCooTaskLineage} from './lib/office-coo-native-admission.mjs';
import {readOfficeCooServiceResponse,saveOfficeCooServiceResponse} from './lib/office-coo-service-receipts.mjs';
import {officeCooReactiveTaskRequest} from './lib/office-coo-reactive.mjs';
import {resolveCooFoundation,cooMessageInput} from '../src/lib/office-coo-message.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const secret='a'.repeat(64),at='2026-10-15T12:00:00.000Z',now=Date.parse(at),body='{"version":1,"action":"events"}';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
async function directory(t){const p=await realpath(await mkdtemp(join(tmpdir(),'coo-service-test-')));t.after(()=>rm(p,{recursive:true,force:true}));return p;}
function execute(source,stubs){const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{}};runInNewContext(compiled,{module,exports:module.exports,require:name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('node:')?require(name):assert.fail('Unexpected unstubbed dependency '+name),Buffer,Date,TextDecoder,process:{getuid:()=>process.getuid()}},{timeout:1000});return module.exports;}
async function serviceFixture(){
 const source=await readFile(new URL('../src/lib/office-coo-reactive-server.ts',import.meta.url),'utf8');
 const clientId='a7604343-92d7-56ec-bf35-b272cac7f8b7';
 const state={now:Date.now(),enabled:true,nativeChecks:0,submits:[],reads:[],privateReads:[],captureReads:0,job:null,events:[],responses:new Map(),foundations:[{id:'agency-company',title:'Company',status:'approved',scope:{kind:'agency',clientId:null}},{id:'audit-receipt-current',title:'Synthetic Client · receipt foundation',status:'draft',scope:{kind:'client',clientId}}]};
 state.policy={version:1,enabled:true,channelId:'channel',accountId:'account',profileId:'profile',ownerSenderId:'12025550102',ownerRecipientId:'12025550102',activationAt:new Date(state.now-60000).toISOString(),expiresAt:new Date(state.now+600000).toISOString(),excludeEventIds:[],authority:{kind:'owner-instruction',reference:'synthetic service-only policy'}};
 const config={binding:{channelId:'channel',accountId:'account',profileId:'profile',senderPhone:'12025550101',ownerParticipantId:'12025550102'},storage:{recordsRoot:'/synthetic-no-read',recordsVolume:'/synthetic-no-read',testing:true}};
 state.events=[{eventId:'event',messageId:'native-message',rawSha256:hash('native'),signedRawSha256:hash('envelope'),channelId:'channel',accountId:'account',profileId:'profile',senderId:'12025550102',authenticated:true,direction:'incoming',type:'text',text:'Write Synthetic Client captions',sentAt:new Date(state.now-30000).toISOString(),capturedAt:new Date(state.now-29000).toISOString(),scope:{kind:'client',clientId},aliases:['event']}];
 const fixed='/synthetic-owner/Library/Application Support/Jarvis Office/coo-channel';
 const stubs={
  'server-only':{},'node:os':{homedir:()=>'/synthetic-owner'},
  './office-runtime.mjs':{localOfficeEnabled:()=>state.enabled},
  '../../scripts/start-office-coo-capture.mjs':{loadOfficeCooCapture:async path=>{assert.equal(path,fixed);return {config};}},
  '../../scripts/lib/office-coo-service-auth.mjs':{OFFICE_COO_SERVICE_BODY_LIMIT,readOfficeCooPrivateJson:async(path,name,max)=>{assert.equal(path,fixed);state.privateReads.push({path,name,max});if(name==='reactive-service-secret.json')return {version:1,secret};if(name==='reactive-policy.json')return clone(state.policy);assert.fail('unexpected private read');},verifyOfficeCooServiceRequest:(key,input)=>verifyOfficeCooServiceRequest(key,input,state.now)},
  '../../scripts/lib/office-coo-captured-input.mjs':{readOfficeCooCapturedInputs:async({config:c,policy,resolveScope})=>{assert.equal(c,config);assert.equal(policy.channelId,state.policy.channelId);state.captureReads++;const events=[];for(const e of state.events)events.push({...clone(e),scope:await resolveScope(e.text)});return {revision:'synthetic-capture-revision',events,ignored:[]};}},
  '../../scripts/lib/office-coo-reactive.mjs':{officeCooReactiveTaskRequest},
  '../../scripts/lib/office-coo-reactive-grant.mjs':{canonical:v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)},
  './office-current-routing-server':{officeCurrentRoutingFoundations:async()=>state.foundations},
  './office-coo-message.mjs':{resolveCooFoundation,cooMessageInput},
  './office-paperclip-team-server':{submitOfficeTeamTask:async task=>{state.submits.push(clone(task));if(state.submitError==='before')throw Error('synthetic admission hold');state.job={id:task.id,brief:task.brief,context:task.context,status:'active',knowledgeContext:{scope:{clientId:task.contextRequest.foundationId==='agency-company'?null:clientId}}};if(state.submitError==='after')throw Error('synthetic lost task ack');return state.job;}},
  '../../scripts/lib/office-coo-native-admission.mjs':{officeCooTaskLineage,createOfficeCooNativeAdmission:()=>{state.nativeChecks++;return {admit:async()=>({canDispatch:true,reason:'synthetic'})};}},
  '../../scripts/lib/office-coo-service-receipts.mjs':{readOfficeCooServiceResponse:async(d,r)=>{assert.equal(d,fixed);const saved=state.responses.get(r.jobId);if(saved)assert.equal(saved.requestSha256,r.requestSha256);return saved??null;},saveOfficeCooServiceResponse:async(d,r,code)=>{assert.equal(d,fixed);const saved={...r,code,output:'Deterministic '+code};state.responses.set(r.jobId,saved);return saved;}},
  '../../scripts/lib/office-team-engine.mjs':{readJob:async id=>{state.reads.push(id);if(state.readError)throw state.readError;if(!state.job)throw Object.assign(Error('missing'),{code:'ENOENT'});return state.job;}}
 };
 const service=execute(source,stubs).officeCooServiceCall;
 const request=()=>officeCooReactiveTaskRequest(state.policy,state.events[0],state.now);
 const call=async(action,req,extra={})=>{const raw=JSON.stringify({version:1,action,...(req?{request:req}:{}),...extra}),at=new Date(state.now).toISOString();return service(raw,{at,signature:signOfficeCooServiceRequest(secret,at,raw)});};
 return {state,service,request,call,clientId,fixed};
}
test('synthetic HMAC pins exact body bytes and fixed service domain',()=>{
 const signature=signOfficeCooServiceRequest(secret,at,body);assert.equal(signature,createHmac('sha256',secret).update('jarvis-office-coo-service:v1\n'+at+'\n'+body).digest('hex'));assert.equal(verifyOfficeCooServiceRequest(secret,{at,body,signature},now),true);
 for(const changed of [body+' ',body.replace('events','submit'),'jarvis-office-other:v1\n'+body])assert.equal(verifyOfficeCooServiceRequest(secret,{at,body:changed,signature},now),false);
 const foreign=createHmac('sha256',secret).update('other-domain:v1\n'+at+'\n'+body).digest('hex');assert.equal(verifyOfficeCooServiceRequest(secret,{at,body,signature:foreign},now),false);
});
test('synthetic HMAC freshness includes exact30seconds and rejects future/stale/invalid clocks',()=>{
 const signature=signOfficeCooServiceRequest(secret,at,body);assert.equal(verifyOfficeCooServiceRequest(secret,{at,body,signature},now+30000),true);for(const clock of [now+30001,now-1,NaN,Infinity])assert.equal(verifyOfficeCooServiceRequest(secret,{at,body,signature},clock),false);
});
test('synthetic bad secret/signature/timestamp/nonstring UTF8 payloads refuse authentication',()=>{
 const signature=signOfficeCooServiceRequest(secret,at,body);for(const bad of ['short','A'.repeat(64),'é'.repeat(64),null]){assert.throws(()=>signOfficeCooServiceRequest(bad,at,body));assert.equal(verifyOfficeCooServiceRequest(bad,{at,body,signature},now),false);}for(const bad of ['bad','A'.repeat(64),'0'.repeat(64),null])assert.equal(verifyOfficeCooServiceRequest(secret,{at,body,signature:bad},now),false);for(const value of [Buffer.from([0xff]),null,{}]){assert.throws(()=>signOfficeCooServiceRequest(secret,at,value));assert.equal(verifyOfficeCooServiceRequest(secret,{at,body:value,signature},now),false);}assert.equal(verifyOfficeCooServiceRequest(secret,{at:'2026-10-15T12:00:00Z',body,signature},now),false);
});
test('synthetic payload cap measures UTF8 bytes rather than JavaScript character count',()=>{
 const exact='é'.repeat(16384),signature=signOfficeCooServiceRequest(secret,at,exact);assert.equal(Buffer.byteLength(exact),32768);assert.equal(verifyOfficeCooServiceRequest(secret,{at,body:exact,signature},now),true);assert.throws(()=>signOfficeCooServiceRequest(secret,at,exact+'x'));assert.equal(verifyOfficeCooServiceRequest(secret,{at,body:exact+'x',signature},now),false);
});
test('synthetic private JSON requires bounded valid bytes and fixed basename in owner directory',async t=>{
 const dir=await directory(t),path=join(dir,'secret.json');await writeFile(path,'{"version":1}',{mode:0o600});assert.deepEqual(await readOfficeCooPrivateJson(dir,'secret.json'),{version:1});await assert.rejects(readOfficeCooPrivateJson(dir,'../secret.json'));await assert.rejects(readOfficeCooPrivateJson(dir,'secret.json',2));await writeFile(path,Buffer.from([0x7b,0xff,0x7d]));await assert.rejects(readOfficeCooPrivateJson(dir,'secret.json'));await writeFile(path,'not JSON');await assert.rejects(readOfficeCooPrivateJson(dir,'secret.json'));
});
test('synthetic private reader rejects permissive file and directory modes',async t=>{
 for(const mode of ['file','directory']){const dir=await directory(t),path=join(dir,'secret.json');await writeFile(path,'{}',{mode:0o600});await chmod(mode==='file'?path:dir,mode==='file'?0o644:0o755);await assert.rejects(readOfficeCooPrivateJson(dir,'secret.json'),/permissions/);}
});
test('synthetic private reader refuses symlink/hardlink files and symlink ancestors',async t=>{
 for(const mode of ['symlink','hardlink','ancestor']){const dir=await directory(t),path=join(dir,'secret.json'),other=join(dir,'other.json');await writeFile(other,'{}',{mode:0o600});if(mode==='ancestor'){await writeFile(path,'{}',{mode:0o600});const alias=join(dir,'alias');await symlink(dir,alias);await assert.rejects(readOfficeCooPrivateJson(alias,'secret.json'));}else{await(mode==='symlink'?symlink:link)(other,path);await assert.rejects(readOfficeCooPrivateJson(dir,'secret.json'));}}
});
test('synthetic deterministic racing-file replacement is detected by actual private-reader source',async t=>{
 const dir=await directory(t),path=join(dir,'secret.json'),replacement=join(dir,'replacement.json');await writeFile(path,'{"a":1}',{mode:0o600});await writeFile(replacement,'{"a":2}',{mode:0o600});let swapped=false;
 const fs={...fsPromises,open:async(...args)=>{const h=await open(...args);return {stat:()=>h.stat(),close:()=>h.close(),readFile:async(...readArgs)=>{const raw=await h.readFile(...readArgs);await rename(replacement,path);swapped=true;return raw;}};}};
 const source=await readFile(new URL('./lib/office-coo-service-auth.mjs',import.meta.url),'utf8'),api=execute(source,{'node:fs/promises':fs});await assert.rejects(api.readOfficeCooPrivateJson(dir,'secret.json'),/private_changed/);assert.equal(swapped,true);
});
test('synthetic exact captured request reaches intended receipt foundation through real COO builder with autoContext',async()=>{
 const f=await serviceFixture(),request=f.request(),result=await f.call('submit',request);assert.equal(result.jobId,request.jobId);assert.equal(f.state.submits.length,1);const task=f.state.submits[0];assert.equal(task.id,request.jobId);assert.equal(task.brief,request.text.trim());assert.equal(task.autoContext,true);assert.equal(task.contextRequest.foundationId,'audit-receipt-current');assert.equal(task.contextRequest.mode,'draft');assert.equal(task.departmentId,null);assert.match(task.context,/Owner WhatsApp task lineage v1/);assert.ok(task.context.includes(request.requestSha256));assert.ok(task.context.includes(request.eventId));assert.ok(task.context.includes('No client sending'));assert.equal('headers'in task,false);assert.equal('jwt'in task,false);assert.equal(task instanceof Request,false);
});
test('synthetic events service uses fixed private folder and returns verified capture only without submission',async()=>{
 const f=await serviceFixture(),result=await f.call('events');assert.equal(result.events.length,1);assert.equal(f.state.submits.length,0);assert.equal(f.state.reads.length,0);assert.equal(result.policySha256,hash(f.state.policy));assert.ok(f.state.privateReads.every(r=>r.path===f.fixed));assert.deepEqual(f.state.privateReads.map(r=>r.name),['reactive-service-secret.json','reactive-policy.json']);
});
test('synthetic changed native hash/IDs/scope/request hash and caller-owned brief cannot submit',async()=>{
 for(const change of [{rawSha256:'0'.repeat(64)},{eventId:'other-event'},{messageId:'other-native'},{jobId:'c8aef456-9613-5dd2-9a9e-2207708a7338'},{requestSha256:'0'.repeat(64)},{scope:{kind:'agency'}},{text:'Caller replacement brief'}]){const f=await serviceFixture();await assert.rejects(f.call('submit',{...f.request(),...change}));assert.equal(f.state.submits.length,0);}const f=await serviceFixture();await assert.rejects(f.call('submit',f.request(),{brief:'caller-owned extra brief'}));assert.equal(f.state.submits.length,0);
});
test('synthetic saved job cross-client/context/brief identity changes are refused before output disclosure',async()=>{
 for(const change of ['client','context','brief','id']){const f=await serviceFixture(),r=f.request();await f.call('submit',r);f.state.job.output='DO NOT DISCLOSE';if(change==='client')f.state.job.knowledgeContext.scope.clientId='c8aef456-9613-5dd2-9a9e-2207708a7338';if(change==='context')f.state.job.context+='changed';if(change==='brief')f.state.job.brief='changed';if(change==='id')f.state.job.id='foreign';await assert.rejects(f.call('read',r),/different event or client/);}
});
test('synthetic active/needs_review statuses map honestly and missing exact jobs return null',async()=>{
 const f=await serviceFixture(),r=f.request();await f.call('submit',r);let result=await f.call('read',r);assert.equal(result.task.status,'active');assert.equal(result.task.scope.clientId,f.clientId);assert.equal(result.task.requestSha256,r.requestSha256);assert.equal('output'in result.task,false);f.state.job.status='needs_review';f.state.job.output='Exact final raw output\n';result=await f.call('read',r);assert.equal(result.task.status,'awaiting_review');assert.equal(result.task.output,f.state.job.output);f.state.readError=Object.assign(new Error('missing'),{code:'ENOENT'});assert.equal((await f.call('read',r)).task,null);
});
test('synthetic service auth/runtime/revocation failures cannot reach capture or submission',async()=>{
 const f=await serviceFixture();await assert.rejects(f.service(body,{at:new Date(f.state.now).toISOString(),signature:'0'.repeat(64)}),/authentication/);assert.equal(f.state.captureReads,0);f.state.enabled=false;await assert.rejects(f.call('events'),/unavailable/);assert.equal(f.state.captureReads,0);f.state.enabled=true;f.state.policy.enabled=false;await assert.rejects(f.call('events'),/policy/);assert.equal(f.state.captureReads,0);assert.equal(f.state.submits.length,0);
});
test('synthetic retired client foundation cannot replace the current receipt foundation on submit',async()=>{
 const f=await serviceFixture();f.state.foundations.splice(1,0,{id:'retired-client-foundation',title:'Synthetic Client · retired',status:'retired',scope:{kind:'client',clientId:f.clientId}});await f.call('submit',f.request());assert.equal(f.state.submits[0].contextRequest.foundationId,'audit-receipt-current');
});

test('synthetic historical/frozen/future signed capture cannot create a service task',async()=>{
 for(const mode of ['historical','frozen','future']){const f=await serviceFixture(),request=f.request();if(mode==='historical')f.state.events[0].sentAt=f.state.policy.activationAt;if(mode==='frozen')f.state.policy.excludeEventIds=[request.eventId];if(mode==='future')f.state.events[0].capturedAt=new Date(f.state.now+60000).toISOString();await assert.rejects(f.call('submit',request));assert.equal(f.state.submits.length,0);}
});

test('synthetic valid6000 CJK characters fit signed32KiB service body and preserve exact captured task',async()=>{
 const f=await serviceFixture();f.state.events[0].text='漢'.repeat(6000);f.state.events[0].scope={kind:'agency'};const request=f.request(),raw=JSON.stringify({version:1,action:'submit',request});assert.equal(request.text.length,6000);assert.ok(Buffer.byteLength(raw)>16384);assert.ok(Buffer.byteLength(raw)<OFFICE_COO_SERVICE_BODY_LIMIT);const signedAt=new Date(f.state.now).toISOString(),signature=signOfficeCooServiceRequest(secret,signedAt,raw);assert.equal(verifyOfficeCooServiceRequest(secret,{at:signedAt,body:raw,signature},f.state.now),true);const result=await f.service(raw,{at:signedAt,signature});assert.equal(result.jobId,request.jobId);assert.equal(f.state.submits.length,1);assert.equal(f.state.submits[0].brief,request.text);assert.equal(f.state.submits[0].autoContext,true);assert.equal(f.state.submits[0].contextRequest.foundationId,'agency-company');
});
test('synthetic >32KiB service bodies are refused before private reads',async()=>{
 const f=await serviceFixture(),raw='x'.repeat(OFFICE_COO_SERVICE_BODY_LIMIT+1);await assert.rejects(f.service(raw,{at:new Date(f.state.now).toISOString(),signature:'0'.repeat(64)}),/unavailable/);assert.equal(f.state.privateReads.length,0);assert.equal(f.state.submits.length,0);
});
async function routeFixture(){
 const source=await readFile(new URL('../src/app/api/office/internal/coo/route.ts',import.meta.url),'utf8'),state={calls:[],cancelled:0};
 const route=execute(source,{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}},'@/lib/office-coo-reactive-server':{OFFICE_COO_SERVICE_BODY_LIMIT,officeCooServiceCall:async(body,headers)=>{state.calls.push({body,headers});return {accepted:true};}},'@/lib/office-runtime.mjs':{privateMacPilotEnabled:()=>true}});
 const request=(chunks,{origin='http://localhost:3103',length=null,type='application/json'}={})=>{let index=0;return {nextUrl:{origin},headers:{get:name=>name==='content-type'?type:name==='content-length'?length:name==='x-jarvis-coo-at'?at:name==='x-jarvis-coo-signature'?'a'.repeat(64):null},body:{getReader:()=>({read:async()=>index<chunks.length?{done:false,value:chunks[index++]}:{done:true},cancel:async()=>{state.cancelled++;}})}};};
 return {state,post:route.POST,request};
}
test('synthetic streamed route accepts6000CJK bytes split within Unicode sequences and keeps fixedorigin/auth headers',async()=>{
 const f=await routeFixture(),raw=JSON.stringify({version:1,action:'submit',request:{text:'漢'.repeat(6000)}}),bytes=Buffer.from(raw),response=await f.post(f.request([bytes.subarray(0,101),bytes.subarray(101)],{length:String(bytes.length)}));assert.equal(response.status,200);assert.equal(f.state.calls.length,1);assert.equal(f.state.calls[0].body,raw);assert.equal(f.state.calls[0].headers.at,at);assert.equal(f.state.calls[0].headers.signature,'a'.repeat(64));assert.equal(f.state.cancelled,1);assert.equal(response.headers['Cache-Control'],'no-store');
});
test('synthetic route enforces exact32KiB stream and declared bounds with fatal UTF8/fixedorigin intact',async()=>{
 const f=await routeFixture(),max=Buffer.alloc(OFFICE_COO_SERVICE_BODY_LIMIT,97);assert.equal((await f.post(f.request([max]))).status,200);const before=f.state.calls.length;for(const request of [f.request([max,Buffer.from('x')]),f.request([Buffer.from('{}')],{length:String(OFFICE_COO_SERVICE_BODY_LIMIT+1)}),f.request([Buffer.from('{}')],{length:'invalid'}),f.request([Buffer.from([0xff])]),f.request([Buffer.from('{}')],{origin:'https://foreign.example'}),f.request([Buffer.from('{}')],{type:'text/plain'})])assert.equal((await f.post(request)).status,403);assert.equal(f.state.calls.length,before);
});

test('synthetic ambiguous multi-client event yields exact durable clarification while next agency event stays available',async()=>{
 const f=await serviceFixture();f.state.foundations.push({id:'second-client',title:'Other Company · approved',status:'approved',scope:{kind:'client',clientId:'c8aef456-9613-5dd2-9a9e-2207708a7338'}});f.state.events[0].text='Write Synthetic Client and Other Company captions';f.state.events[0].scope={kind:'agency'};
 const request=f.request();const events=await f.call('events');assert.equal(events.events[0].scope.kind,'agency');const result=await f.call('submit',request);assert.equal(result.task.status,'service_response');assert.equal(f.state.responses.get(request.jobId).code,'scope_clarification');assert.equal(f.state.submits.length,0);
 assert.equal((await f.call('read',request)).task.output,result.task.output);await f.call('submit',request);assert.equal(f.state.submits.length,0);
 f.state.events.push({...f.state.events[0],eventId:'next',messageId:'native-next',text:'Hello COO'});assert.equal((await f.call('events')).events.length,2);
});
test('synthetic admission rejection gets durable honest no-retry response, lost acknowledgement reconciles exact existing job',async()=>{
 for(const when of ['before','after']){const f=await serviceFixture(),request=f.request();f.state.submitError=when;const result=await f.call('submit',request);assert.equal(f.state.submits.length,1);if(when==='before'){assert.equal(result.task.status,'service_response');assert.equal(f.state.responses.get(request.jobId).code,'admission_unconfirmed');assert.equal((await f.call('read',request)).task.output,result.task.output);}else{assert.equal(result.jobId,request.jobId);assert.equal((await f.call('read',request)).task.status,'active');assert.equal(f.state.responses.size,0);}await f.call('submit',request);assert.equal(f.state.submits.length,1);}
});
test('actual private service response persists exact immutable request, rejects retargeting/corruption/links and never overwrites',async t=>{
 const dir=await directory(t),f=await serviceFixture(),r=f.request();assert.equal(await readOfficeCooServiceResponse(dir,r),null);
 const response=await saveOfficeCooServiceResponse(dir,r,'admission_unconfirmed',at),file=join(dir,'coo-service-response.'+r.jobId+'.json'),bytes=await readFile(file);assert.match(response.output,/not retry/);assert.equal(response.output.includes(r.jobId),true);
 assert.deepEqual(await readOfficeCooServiceResponse(dir,r),response);assert.deepEqual(await saveOfficeCooServiceResponse(dir,r,'scope_clarification'),response);assert.deepEqual(await readFile(file),bytes);
 await assert.rejects(readOfficeCooServiceResponse(dir,{...r,requestSha256:'0'.repeat(64)}));await assert.rejects(readOfficeCooServiceResponse(dir,{...r,scope:{kind:'agency'}}));
 await chmod(file,0o700);await assert.rejects(readOfficeCooServiceResponse(dir,r));await chmod(file,0o600);const copied=join(dir,'copy.json');await writeFile(copied,bytes,{mode:0o600});await rm(file);await symlink(copied,file);await assert.rejects(readOfficeCooServiceResponse(dir,r));await rm(file);await writeFile(file,JSON.stringify({...response,output:'changed'}),{mode:0o600});await assert.rejects(readOfficeCooServiceResponse(dir,r));
});

test('synthetic unacknowledged narrow worker launch surfaces existing recovery timeout without mutation or relaunch',async()=>{
 const f=await serviceFixture(),request=f.request();await f.call('submit',request);f.state.job.status='queued';f.state.job.createdAt=new Date(f.state.now-120000).toISOString();f.state.job.ownerPid=null;
 const result=await f.call('read',request);assert.equal(result.task.status,'recovery_required');assert.equal(f.state.job.status,'queued');assert.equal(f.state.submits.length,1);
});

test('private unconfirmed response stays honest about absent native job and preserves exact legacy receipt on read',async t=>{
 const dir=await directory(t),f=await serviceFixture(),request=f.request(),response=await saveOfficeCooServiceResponse(dir,request,'admission_unconfirmed',at);assert.match(response.output,/accepted request/);assert.equal(response.output.includes('saved task'),false);
 const {revision,...body}=response;body.output=`I could not confirm that Office accepted task ${request.jobId}. I will not retry it automatically. Open Office to inspect the saved task and error before trying again.`;
 const legacy={...body,revision:createHash('sha256').update(JSON.stringify(body,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)).digest('hex')},file=join(dir,'coo-service-response.'+request.jobId+'.json');await writeFile(file,JSON.stringify(legacy));assert.deepEqual(await readOfficeCooServiceResponse(dir,request),legacy);assert.deepEqual(await saveOfficeCooServiceResponse(dir,request,'admission_unconfirmed'),legacy);
});

test('anchored owner greetings/help produce durable labelled service replies without native authority or tasks',async t=>{
 for(const text of ['Hi!','hello','HELP','/help','Who are you?','good morning','Hello Jarvis!','Hi, COO.','Hey Jarvis?','Thanks','thank you!','received','ok','okay.']){const f=await serviceFixture();f.state.events[0].text=text;f.state.events[0].scope={kind:'agency'};const request=f.request(),result=await f.call('submit',request);assert.equal(result.task.status,'service_response');assert.equal(f.state.responses.get(request.jobId).code,'owner_help');assert.equal(f.state.nativeChecks,0);assert.equal(f.state.submits.length,0);assert.equal((await f.call('read',request)).task.output,result.task.output);await f.call('submit',request);assert.equal(f.state.nativeChecks,0);}
 const dir=await directory(t),f=await serviceFixture(),response=await saveOfficeCooServiceResponse(dir,f.request(),'owner_help',at);assert.match(response.output,/^Office help:/);assert.equal(response.output.includes('task was started'),false);assert.match(response.output,/approval requirements/);
});
test('nonanchored briefs containing hello/help remain actual COO work requests',async()=>{
 for(const text of ['Hello, write Synthetic Client captions','Hello Jarvis, write a checklist','Thanks, draft a checklist','ok publish the draft','Write a hello greeting','Can you help write captions?','help\nwrite a checklist']){const f=await serviceFixture();f.state.events[0].text=text;f.state.events[0].scope=text.includes('Synthetic Client')?{kind:'client',clientId:f.clientId}:{kind:'agency'};await f.call('submit',f.request());assert.equal(f.state.nativeChecks,1,text);assert.equal(f.state.submits.length,1,text);assert.equal(f.state.responses.size,0,text);}
});

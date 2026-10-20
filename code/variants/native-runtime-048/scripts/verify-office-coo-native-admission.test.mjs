import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,readdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {ingestOfficeCooWebhook} from './lib/office-coo-whatsapp.mjs';
import {readOfficeCooCapturedInputs} from './lib/office-coo-captured-input.mjs';
import {officeCooReactiveTaskRequest} from './lib/office-coo-reactive.mjs';
import {sha,policyHash,officeCooReactiveGrantRevision} from './lib/office-coo-reactive-grant.mjs';
import {createOfficeCooNativeAdmission,officeCooNativeGrantRevision,officeCooTaskLineage,readOfficeCooNativeRequest} from './lib/office-coo-native-admission.mjs';
import {createJob,readJob,executeJob} from './lib/office-team-engine.mjs';
import {runOfficeCooTask} from './office-coo-task-worker.mjs';
const stamp='2026-10-16T12:00:00.000Z',agentId='a7604343-92d7-56ec-bf35-b272cac7f8b7',actor={agentId,adapterType:'codex_local',model:'gpt-5.6'};
async function fixture(t){
 const volume=await realpath(await mkdtemp(join(tmpdir(),'coo-native-')));t.after(()=>rm(volume,{recursive:true,force:true}));const directory=join(volume,'private'),archive=join(volume,'archive');await mkdir(directory,{mode:0o700});await mkdir(archive);
 const binding={channelId:'synthetic-coo',accountId:'synthetic-account',profileId:'synthetic-profile',senderPhone:'12025550101',ownerParticipantId:'12025550102'},config={binding,storage:{testing:true,recordsVolume:volume,recordsRoot:archive}};
 const policy={version:1,enabled:true,channelId:binding.channelId,accountId:binding.accountId,profileId:binding.profileId,ownerSenderId:binding.ownerParticipantId,ownerRecipientId:binding.ownerParticipantId,activationAt:'2026-10-16T11:59:00.000Z',expiresAt:'2026-10-17T12:00:00.000Z',excludeEventIds:[],authority:{kind:'owner-instruction',reference:'synthetic future owner authority'}};
 const payload={id:'exact-signed-event',event:'message.received',timestamp:stamp,profiles:[{id:binding.profileId}],account:{id:binding.accountId,accountId:binding.accountId,profileId:binding.profileId,platform:'whatsapp',username:binding.senderPhone},conversation:{id:'thread',platformConversationId:'native-thread',participantId:binding.ownerParticipantId},message:{id:'message',platformMessageId:'wamid.synthetic==',conversationId:'thread',platform:'whatsapp',direction:'incoming',sender:{id:binding.ownerParticipantId},sentAt:stamp,text:'Draft an internal office checklist',attachments:[]}},rawBody=Buffer.from(JSON.stringify(payload)),secret='synthetic-HMAC-secret-01234567890123456789';
 await ingestOfficeCooWebhook(config,{rawBody,eventId:payload.id,signature:createHmac('sha256',secret).update(rawBody).digest('hex')},{secret,now:()=>stamp});
 const event=(await readOfficeCooCapturedInputs({config,policy,resolveScope:async()=>({kind:'agency'}),now:()=>Date.parse(stamp)})).events[0],request=officeCooReactiveTaskRequest(policy,event,Date.parse(stamp)),privacy=Buffer.from('SYNTHETIC original opt-outs OFF');
 const reply={version:1,enabled:true,purpose:'future-owner-task-completion',principal:'synthetic-owner',authority:{kind:'owner-instruction',reference:'synthetic durable owner replies'},binding,policySha256:policyHash(policy),issuedAt:stamp,expiresAt:policy.expiresAt,keyExpiresAt:'2026-11-01T00:00:00.000Z',privacy:{cloudApiEventSharing:false,marketingOptimization:false,observedAt:stamp,validUntil:policy.expiresAt,evidenceFile:'runtime-privacy-observation.json',evidenceSha256:sha(privacy)},provenance:{mode:'whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded',basis:'manual-reviewed-new-cloud-api-noncoexistence-inference',manifestSha256:sha('manifest'),receiptPins:Object.fromEntries(Array.from({length:7},(_,i)=>['synthetic-'+i+'.json',sha(String(i))])),reviewPurpose:'automatic-future-owner-replies'}};reply.revision=officeCooReactiveGrantRevision(reply);
 const grant={version:1,enabled:true,purpose:'exact-owner-whatsapp-native-task',authority:{kind:'owner-instruction',principal:'synthetic-owner',reference:'exact new agency event one-hour native proof'},replyGrantRevision:reply.revision,policySha256:policyHash(policy),request,actors:[actor],issuedAt:stamp,expiresAt:'2026-10-16T13:00:00.000Z',maxStages:3};grant.revision=officeCooNativeGrantRevision(grant);
 const save=(name,value)=>writeFile(join(directory,name),Buffer.isBuffer(value)?value:JSON.stringify(value),{mode:0o600});await save('reactive-policy.json',policy);await save('reactive-runtime-grant.json',reply);await save('runtime-privacy-observation.json',privacy);await save('reactive-native-grant.json',grant);
 const state={now:Date.parse(stamp)},job={id:request.jobId,brief:request.text,context:officeCooTaskLineage(request),departmentId:null,autoContext:true,status:'queued',knowledgeContext:{scope:{clientId:null}},calls:[]};
 const options={config,request,directory,now:()=>state.now,readJob:async id=>{assert.equal(id,request.jobId);return structuredClone(job);}},driver=()=>createOfficeCooNativeAdmission(options),call=stage=>{const ctx={...actor,stage};job.calls.push({...ctx,model:actor.model,status:'dispatching',runId:null});return ctx;};
 const add=async(id,text='Another internal task',scope={kind:'agency'})=>{const v=structuredClone(payload);v.id=id;v.timestamp=new Date(state.now).toISOString();v.message.platformMessageId='wamid.'+id;v.message.sentAt=v.timestamp;v.message.text=text;const bytes=Buffer.from(JSON.stringify(v));await ingestOfficeCooWebhook(config,{rawBody:bytes,eventId:id,signature:createHmac('sha256',secret).update(bytes).digest('hex')},{secret,now:()=>new Date(state.now).toISOString()});const e=(await readOfficeCooCapturedInputs({config,policy,resolveScope:async()=>scope,now:()=>state.now})).events.find(e=>e.eventId===id);return officeCooReactiveTaskRequest(policy,e,state.now);};
 return {directory,config,request,policy,reply,grant,job,state,options,driver,call,save,add};
}
test('exact authentic task admission and finite pre-call stage receipts never alter paused global policy',async t=>{
 const f=await fixture(t),d=f.driver();await f.save('goal-native-policy.json',{enabled:false,history:'unchanged'});const before=await readFile(join(f.directory,'goal-native-policy.json'));
 assert.equal((await d.admit(f.job)).canDispatch,true);for(const stage of ['planning','specialist:one','qa'])assert.equal(await d.modelPolicy(f.call(stage)),true);
 assert.equal(await d.modelPolicy(f.call('synthesis')),false);const receipts=(await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.'));assert.equal(receipts.length,3);assert.deepEqual(await readFile(join(f.directory,'goal-native-policy.json')),before);
});
test('duplicate stage consumes no new allowance; concurrent distinct stages receive separate chained receipts',async t=>{
 const f=await fixture(t),d=f.driver();await d.admit(f.job);const ctx=f.call('planning');assert.equal(await d.modelPolicy(ctx),true);assert.equal(await d.modelPolicy(ctx),false);
 assert.deepEqual(await Promise.all([d.modelPolicy(f.call('specialist:one')),d.modelPolicy(f.call('specialist:two'))]),[true,true]);
 const names=(await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.')).sort(),rows=await Promise.all(names.map(n=>readFile(join(f.directory,n),'utf8').then(JSON.parse)));assert.equal(rows[1].previousRevision,rows[0].revision);assert.equal(rows[2].previousRevision,rows[1].revision);
});
test('JSON repair labels cannot reopen a consumed stage without private operator authority',async t=>{
 const f=await fixture(t),d=f.driver();await d.admit(f.job);const first=f.call('planning');assert.equal(await d.modelPolicy(first),true);f.job.calls[0].status='succeeded';f.job.calls[0].runId=randomUUID();
 f.job.operatorRepair={enabled:true,repairRevision:'1'.repeat(64)};const repeated={...f.call('planning'),repairRevision:'1'.repeat(64),operatorGrantRevision:'2'.repeat(64)};
 assert.equal(await d.modelPolicy(repeated),false);assert.equal((await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.')).length,1);
});
test('foreign actor/model/adapter/stage or missing exact saved dispatch intent cannot invoke',async t=>{
 for(const mode of ['actor','model','adapter','stage','intent','job','scope','queue']){const f=await fixture(t),d=f.driver(),ctx=f.call('planning');if(mode==='actor')ctx.agentId='c8aef456-9613-5dd2-9a9e-2207708a7338';if(mode==='model')ctx.model='paid-model';if(mode==='adapter')ctx.adapterType='api';if(mode==='stage')ctx.stage='conversation';if(mode==='intent')f.job.calls=[];if(mode==='job')f.job.context+='changed';if(mode==='scope')f.job.knowledgeContext.scope.clientId=agentId;if(mode==='queue')f.job.queueManaged=true;assert.equal(await d.modelPolicy(ctx),false,mode);assert.equal((await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.')).length,0);}
});
test('grant revocation, expiry, policy change, raw tampering and partial receipt refuse further work',async t=>{
 for(const mode of ['native','reply','expiry','policy','partial']){const f=await fixture(t),d=f.driver();if(mode==='native'){f.grant.enabled=false;f.grant.revision=officeCooNativeGrantRevision(f.grant);await f.save('reactive-native-grant.json',f.grant);}if(mode==='reply'){f.reply.enabled=false;f.reply.revision=officeCooReactiveGrantRevision(f.reply);await f.save('reactive-runtime-grant.json',f.reply);}if(mode==='expiry')f.state.now=Date.parse(f.grant.expiresAt);if(mode==='policy'){f.policy.excludeEventIds=[f.request.eventId];await f.save('reactive-policy.json',f.policy);}if(mode==='partial')await f.save('coo-native-stage.'+f.request.jobId+'.0001.json',{});assert.equal(await d.modelPolicy(f.call('planning')),false,mode);}
});
test('exact native grant cannot retarget request, widen duration or survive permissive private permissions',async t=>{
 for(const mode of ['request','duration','actor','permissions']){const f=await fixture(t);if(mode==='request')f.grant.request={...f.request,scope:{kind:'client',clientId:agentId}};if(mode==='duration')f.grant.expiresAt='2026-10-16T13:00:00.001Z';if(mode==='actor')f.grant.actors=[{...actor,adapterType:'api'}];f.grant.revision=officeCooNativeGrantRevision(f.grant);await f.save('reactive-native-grant.json',f.grant);if(mode==='permissions')await chmod(join(f.directory,'reactive-native-grant.json'),0o700);assert.throws(()=>f.driver(),undefined,mode);}
});
test('one-job worker never executes unrelated, existing terminal or invalid tasks and supplies guarded modelPolicy',async()=>{
 const id='9f1cf2db-e7d2-5a0b-9bd4-bf7dfd11513c',calls=[],modelPolicy=async()=>false,state={status:'queued'};
 const deps={loadCapture:async()=>({config:{}}),readNativeRequest:()=>({jobId:id}),createAdmission:()=>({assertJob:async j=>assert.equal(j.id,id),modelPolicy}),readTask:async task=>({id:task,status:state.status}),readPlan:async()=>({synthetic:true}),execute:async(task,plan,options)=>{calls.push({task,plan,options});return {status:'failed'};}};
 await assert.rejects(runOfficeCooTask('be1a0e46-e144-5e33-9b87-d9f29a9a630b',deps));await assert.rejects(runOfficeCooTask('../other',deps));assert.equal(calls.length,0);await runOfficeCooTask(id,deps);assert.equal(calls.length,1);assert.equal(calls[0].task,id);assert.equal(calls[0].options.modelPolicy,modelPolicy);state.status='needs_review';assert.equal((await runOfficeCooTask(id,deps)).executed,false);assert.equal(calls.length,1);
});

const require=createRequire(import.meta.url),ts=require('typescript');
async function submissionFixture(){
 const source=await readFile(new URL('../src/lib/office-paperclip-team-server.ts',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const state={globalAllowed:false,globalChecks:0,created:[],spawned:[],jobs:[],prior:null,readiness:0,contextReads:0};
 const stubs={
  'server-only':{},'node:child_process':{spawn:(...args)=>{state.spawned.push(args);return {on(){},unref(){}};}},
  './office-runtime.mjs':{localOfficeEnabled:()=>true,coordinatorWorkerEnvironment:()=>({SYNTHETIC:'only'})},
  '../../scripts/lib/office-team-engine.mjs':{activeStates:['queued','planning','working'],validateTask:input=>input,readJob:async()=>{if(state.prior)return state.prior;throw Object.assign(Error('missing'),{code:'ENOENT'});},listJobs:async()=>state.jobs,createJob:async(input,dir,options)=>{state.created.push({input,options});return {created:true,job:{...input,status:'queued'}};}},
  './office-stack-plan.json':{storage:{testing:true},departmentPackageReviewEnabled:true},
  '../../scripts/lib/office-archive.mjs':{storageReadiness:async()=>({status:'connected'})},
  '../../scripts/lib/office-foundations.mjs':{readFoundation:async()=>({scope:{clientId:null}}),persistTaskContext:async()=>({scope:{clientId:null}})},
  '../../scripts/lib/office-source-activation.mjs':{},
  './office-foundations-server':{previewOfficeContext:async()=>{state.contextReads++;return {bundle:{revision:'test'}};}},
  '../../scripts/lib/office-task-routing.mjs':{officeTaskRoute:()=>({})},
  './office-readiness-server':{officeReadiness:async()=>{state.readiness++;return {canEnqueue:true};}},
  './office-readiness.mjs':{},
  './office-coo-message.mjs':{resolveCooFoundation:(text,request)=>request,requireOfficeContextRevision:()=>{}},
  '../../scripts/lib/office-goal-policy-runtime.mjs':{checkOfficeGoalAdmission:async()=>{state.globalChecks++;return {canDispatch:state.globalAllowed,reason:'paused'};}},
  './office-current-routing-server':{officeCurrentRoutingFoundations:async()=>[]},
  '../../scripts/lib/office-task-queue.mjs':{},'../../scripts/lib/office-tool-bridge.mjs':{},
 };
 const module={exports:{}};new Function('require','module','exports',compiled)(name=>{if(Object.hasOwn(stubs,name))return stubs[name];if(name.startsWith('node:'))return require(name);throw Error('Unexpected import '+name);},module,module.exports);
 const input={id:'9f1cf2db-e7d2-5a0b-9bd4-bf7dfd11513c',kind:'team',autoContext:true,departmentId:null,brief:'Exact synthetic task',context:'Exact lineage',contextRequest:{foundationId:'agency-company',taskType:'internal',mode:'draft'}};
 return {state,input,submit:module.exports.submitOfficeTeamTask};
}
test('normal task input and JSON-like capability cannot bypass paused global admission',async()=>{
 const f=await submissionFixture();await assert.rejects(f.submit({...f.input,cooExecution:{canDispatch:true}}),/safety hold/);assert.equal(f.state.globalChecks,1);assert.equal(f.state.created.length,0);assert.equal(f.state.spawned.length,0);await assert.rejects(f.submit(f.input,{cooExecution:{admit:true,launch:true}}),/trusted/);assert.equal(f.state.created.length,0);
});
test('trusted narrow seam retains fresh readiness/context, disables global drain, and launches only exact job',async()=>{
 const f=await submissionFixture(),admitted=[],launched=[],cap={admit:async task=>{admitted.push(task);return {canDispatch:true,reason:'synthetic grant'};},launch:id=>launched.push(id)};
 const job=await f.submit(f.input,{cooExecution:cap});assert.equal(job.id,f.input.id);assert.equal(admitted.length,1);assert.deepEqual(launched,[f.input.id]);assert.equal(f.state.created[0].options.queueManaged,false);assert.equal(f.state.globalChecks,0);assert.equal(f.state.readiness,1);assert.equal(f.state.contextReads,1);assert.equal(f.state.spawned.length,0);
 f.state.prior={...job,cooRequestHash:f.state.created[0].input.cooRequestHash};await f.submit(f.input,{cooExecution:cap});assert.equal(launched.length,1);assert.equal(f.state.created.length,1);
});
test('narrow seam refuses another active/recovery task and ordinary approved submission keeps standard worker',async()=>{
 for(const status of ['working','recovery_required']){const f=await submissionFixture();f.state.jobs=[{id:'other',status}];await assert.rejects(f.submit(f.input,{cooExecution:{admit:async()=>({canDispatch:true}),launch:()=>assert.fail('no launch')}}));assert.equal(f.state.created.length,0);}
 const f=await submissionFixture();f.state.globalAllowed=true;await f.submit(f.input);assert.equal(f.state.globalChecks,1);assert.equal(f.state.created[0].options.queueManaged,true);assert.equal(f.state.spawned.length,1);assert.match(f.state.spawned[0][1][0],/office-paperclip-worker\.mjs$/);assert.equal(f.state.spawned[0][2].env.SYNTHETIC,'only');
});

test('real existing engine planning call consumes exact grant before mocked invocation and retains blocked outcome without extra dispatch',async t=>{
 const f=await fixture(t),jobs=join(f.directory,'jobs');await mkdir(jobs);const input={id:f.request.jobId,brief:f.request.text,context:officeCooTaskLineage(f.request),criteria:['Return a concrete checklist'],departmentId:null,autoContext:true};
 const d=createOfficeCooNativeAdmission({...f.options,readJob:id=>readJob(id,jobs)});await d.admit(input);await createJob(input,jobs);
 const agents=[{id:agentId,name:'COO',adapterType:'codex_local',adapterConfig:{model:actor.model},metadata:{jarvisBlueprintRoleId:'coo',modelBilling:'subscription_only'}},{id:'c8aef456-9613-5dd2-9a9e-2207708a7338',adapterType:'codex_local',adapterConfig:{model:actor.model},metadata:{jarvisBlueprintRoleId:'test',modelBilling:'subscription_only'}}],issues=new Map(),runs=new Map();let invocations=0;
 const api=async(path,body,method)=>{if(path.endsWith('/agents')&&!body)return agents;if(path.endsWith('/issues')&&body){const issue={...body,id:randomUUID()};issues.set(issue.id,issue);return issue;}if(path.endsWith('/heartbeat/invoke')){invocations++;const receipts=(await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.'));assert.equal(receipts.length,1);const id=randomUUID();runs.set(id,{id,status:'succeeded',resultJson:{summary:JSON.stringify({blockedReason:'Synthetic boundary stop after exact admission proof'})},usageJson:{billingType:'subscription_included',model:actor.model}});return {id,status:'queued'};}if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);if(method==='PATCH')return body;throw Error('Unexpected mock path '+path);};
 const result=await executeJob(f.request.jobId,{paperclipCompanyId:'synthetic-company',roles:[{id:'test',name:'QA',model:actor.model}],toolBridgeEnabled:false},{directory:jobs,api,pollMs:1,modelPolicy:d.modelPolicy});assert.equal(result.status,'blocked');assert.equal(invocations,1);assert.equal(result.calls.length,1);assert.equal(result.calls[0].stage,'planning');assert.equal(result.calls[0].status,'succeeded');
 await executeJob(f.request.jobId,{},{directory:jobs,api:()=>assert.fail('terminal job cannot dispatch'),modelPolicy:d.modelPolicy});assert.equal(invocations,1);
});

async function operational(t,overrides={}){
 const f=await fixture(t),{request,maxStages,...common}=f.grant;
 f.grant={...common,version:2,purpose:'future-owner-whatsapp-native-tasks',expiresAt:'2026-10-16T18:00:00.000Z',scopes:[{kind:'agency'}],maxTasks:3,maxStagesPerTask:2,maxTotalStages:3,allowTaskHelpers:false,...overrides};f.grant.revision=officeCooNativeGrantRevision(f.grant);await f.save('reactive-native-grant.json',f.grant);
 f.forRequest=(request,job,readActors)=>createOfficeCooNativeAdmission({...f.options,request,readJob:async()=>job,readActors});
 f.jobFor=request=>({id:request.jobId,brief:request.text,context:officeCooTaskLineage(request),autoContext:true,status:'queued',knowledgeContext:{scope:{clientId:request.scope.kind==='client'?request.scope.clientId:null}},calls:[]});
 f.dispatch=(job,stage,extra={})=>{const ctx={...actor,stage,...extra};job.calls.push({...ctx,status:'dispatching',runId:null});return ctx;};return f;
}
test('operational grant admits only finite authentic future tasks; duplicate admission is an immutable no-op',async t=>{
 const f=await operational(t),requests=[f.request,await f.add('second'),await f.add('third'),await f.add('fourth')];
 for(const request of requests.slice(0,3)){const job=f.jobFor(request),d=f.forRequest(request,job);assert.equal((await d.admit(job)).canDispatch,true);assert.deepEqual(readOfficeCooNativeRequest(f.directory,request.jobId),request);}
 const before=await readFile(join(f.directory,'coo-native-task.'+f.request.jobId+'.json'));await f.forRequest(f.request,f.jobFor(f.request)).admit(f.jobFor(f.request));assert.deepEqual(await readFile(join(f.directory,'coo-native-task.'+f.request.jobId+'.json')),before);
 const request=requests[3];await assert.rejects(f.forRequest(request,f.jobFor(request)).admit(f.jobFor(request)));assert.equal((await readdir(f.directory)).filter(n=>n.startsWith('coo-native-task.')).length,3);
});
test('operational concurrent claims cannot exceed task cap or consume multiple slots for one event',async t=>{
 const f=await operational(t,{maxTasks:2,maxTotalStages:4}),second=await f.add('second'),third=await f.add('third');
 const admit=request=>f.forRequest(request,f.jobFor(request)).admit(f.jobFor(request));const same=await Promise.allSettled([admit(f.request),admit(f.request)]);assert.equal(same.filter(r=>r.status==='fulfilled').length,2);
 const results=await Promise.allSettled([admit(second),admit(third)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readdir(f.directory)).filter(n=>n.startsWith('coo-native-task.')).length,2);
});
test('operational per-task and total-stage limits are durable across workers and never refund a consumed attempt',async t=>{
 const f=await operational(t),r2=await f.add('second'),j1=f.jobFor(f.request),j2=f.jobFor(r2),d1=f.forRequest(f.request,j1),d2=f.forRequest(r2,j2);await d1.admit(j1);await d2.admit(j2);
 assert.equal(await d1.modelPolicy(f.dispatch(j1,'planning')),true);assert.equal(await d1.modelPolicy(f.dispatch(j1,'specialist:one')),true);assert.equal(await d1.modelPolicy(f.dispatch(j1,'qa')),false);assert.equal(await d2.modelPolicy(f.dispatch(j2,'planning')),true);assert.equal(await d2.modelPolicy(f.dispatch(j2,'synthesis')),false);
 const restarted=f.forRequest(r2,j2);assert.equal(await restarted.modelPolicy({...actor,stage:'planning'}),false);assert.equal((await readdir(f.directory)).filter(n=>n.startsWith('coo-native-stage.')).length,3);
});
test('operational grant rejects unlisted client/owner changes, fabricated capture and invalid finite limits',async t=>{
 const f=await operational(t),client=await f.add('client','Write for synthetic client',{kind:'client',clientId:agentId});assert.throws(()=>f.forRequest(client,f.jobFor(client)));
 const fabricated={...f.request,eventId:'not-captured',messageId:'foreign'};await assert.rejects(f.forRequest(fabricated,f.jobFor(fabricated)).admit(f.jobFor(fabricated)));
 for(const change of [{scopes:[{kind:'all'}]},{maxTasks:0},{maxStagesPerTask:129},{maxTotalStages:4097},{expiresAt:'2026-12-01T00:00:00.000Z'},{authority:{...f.grant.authority,principal:'foreign'}}]){const changed={...f.grant,...change};changed.revision=officeCooNativeGrantRevision(changed);await f.save('reactive-native-grant.json',changed);assert.throws(()=>f.forRequest(f.request,f.jobFor(f.request)));}
});
test('operational grant explicitly scoped client claims preserve their exact client and cannot mix agency context',async t=>{
 const f=await operational(t,{scopes:[{kind:'agency'},{kind:'client',clientId:agentId}]}),request=await f.add('client','Draft client checklist',{kind:'client',clientId:agentId}),job=f.jobFor(request),d=f.forRequest(request,job);await d.admit(job);assert.equal(await d.modelPolicy(f.dispatch(job,'planning')),true);job.knowledgeContext.scope.clientId=null;assert.equal(await d.modelPolicy(f.dispatch(job,'qa')),false);
});
test('operational expiry/revocation and grant replacement stop existing workers without renewal or old-claim reuse',async t=>{
 for(const mode of ['expiry','revoke','replace']){const f=await operational(t),job=f.jobFor(f.request),d=f.forRequest(f.request,job);await d.admit(job);if(mode==='expiry')f.state.now=Date.parse(f.grant.expiresAt);else{f.grant={...f.grant,...(mode==='revoke'?{enabled:false}:{maxTasks:4})};f.grant.revision=officeCooNativeGrantRevision(f.grant);await f.save('reactive-native-grant.json',f.grant);}assert.equal(await d.modelPolicy(f.dispatch(job,'planning')),false);if(mode==='replace')await assert.rejects(f.forRequest(f.request,job).admit(job));}
});
test('operational corrupted other-task stage history cannot grant a fresh total-stage allowance',async t=>{
 const f=await operational(t),r2=await f.add('second'),j1=f.jobFor(f.request),j2=f.jobFor(r2),d1=f.forRequest(f.request,j1),d2=f.forRequest(r2,j2);await d1.admit(j1);await d2.admit(j2);assert.equal(await d1.modelPolicy(f.dispatch(j1,'planning')),true);const path=join(f.directory,'coo-native-stage.'+f.request.jobId+'.0001.json'),row=JSON.parse(await readFile(path));row.stage='changed';await writeFile(path,JSON.stringify(row));assert.equal(await d2.modelPolicy(f.dispatch(j2,'planning')),false);
});
test('operational task helper inherits permission only from exact saved base and fresh matching same-task actor',async t=>{
 for(const mode of ['valid','disabled','client','task','part','model','billing','base','role']){const f=await operational(t,{allowTaskHelpers:mode!=='disabled'}),job=f.jobFor(f.request),helperId='64318790-4907-53cb-ad3f-7b547855c242';job.steps=[{id:'part',roleId:'copy',agentId:helperId,spawnedFromAgentId:agentId}];
 const base={id:agentId,status:'idle',adapterType:actor.adapterType,adapterConfig:{model:actor.model},metadata:{modelBilling:'subscription_only',jarvisBlueprintRoleId:'copy'}},helper={...structuredClone(base),id:helperId,metadata:{...base.metadata,jarvisSpawnedForTask:f.request.jobId,jarvisTaskPartId:'part'}};
 if(mode==='client')helper.metadata.jarvisClientId=agentId;if(mode==='task')helper.metadata.jarvisSpawnedForTask='other';if(mode==='part')helper.metadata.jarvisTaskPartId='other';if(mode==='model')helper.adapterConfig.model='different';if(mode==='billing')helper.metadata.modelBilling='paid';if(mode==='base')base.status='paused';if(mode==='role')helper.metadata.jarvisBlueprintRoleId='other';
 const d=f.forRequest(f.request,job,async()=>[base,helper]);await d.admit(job);const ctx=f.dispatch(job,'specialist:part',{agentId:helperId});job.calls[0].roleId='copy';assert.equal(await d.modelPolicy(ctx),mode==='valid',mode);}
});

test('operational corruption cannot relabel a consumed claim or stage as retired authority and free capacity',async t=>{
 for(const mode of ['claim','stage']){const f=await operational(t),r2=await f.add('second'),j1=f.jobFor(f.request),j2=f.jobFor(r2),d1=f.forRequest(f.request,j1),d2=f.forRequest(r2,j2);await d1.admit(j1);await d2.admit(j2);if(mode==='stage')assert.equal(await d1.modelPolicy(f.dispatch(j1,'planning')),true);const name=mode==='claim'?'coo-native-task.'+f.request.jobId+'.json':'coo-native-stage.'+f.request.jobId+'.0001.json',path=join(f.directory,name),row=JSON.parse(await readFile(path));row.grantRevision='0'.repeat(64);await writeFile(path,JSON.stringify(row));assert.equal(await d2.modelPolicy(f.dispatch(j2,'qa')),false,mode);}
});

test('client lineage and worker request survive canonical private claim serialization without scope-key-order drift',async t=>{
 const f=await operational(t,{scopes:[{kind:'client',clientId:agentId}]}),request=await f.add('client','Draft a client checklist',{kind:'client',clientId:agentId}),job=f.jobFor(request),d=f.forRequest(request,job);await d.admit(job);
 const loaded=readOfficeCooNativeRequest(f.directory,request.jobId);assert.deepEqual(Object.keys(loaded.scope),['clientId','kind']);assert.equal(officeCooTaskLineage(loaded),officeCooTaskLineage(request));const ctx=f.dispatch(job,'planning');let executes=0;
 const result=await runOfficeCooTask(request.jobId,{loadCapture:async()=>({config:f.config}),readNativeRequest:(_,id)=>readOfficeCooNativeRequest(f.directory,id),createAdmission:options=>createOfficeCooNativeAdmission({...options,directory:f.directory,now:()=>f.state.now}),readTask:async()=>job,readPlan:async()=>({synthetic:true}),execute:async(id,plan,options)=>{executes++;assert.equal(id,request.jobId);assert.equal(await options.modelPolicy(ctx),true);return {status:'blocked'};}});
 assert.equal(result.executed,true);assert.equal(executes,1);
});

test('explicit actor grant admits512 bounded exact IDs/models and refuses513 without wildcard authority',async t=>{
 for(const length of [512,513]){const f=await fixture(t);f.grant.actors=Array.from({length},(_,i)=>({agentId:'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),adapterType:'codex_local',model:'m'.repeat(200)}));f.grant.revision=officeCooNativeGrantRevision(f.grant);await f.save('reactive-native-grant.json',f.grant);assert.ok(Buffer.byteLength(JSON.stringify(f.grant))>131072);if(length===512)assert.doesNotThrow(()=>f.driver());else assert.throws(()=>f.driver());}
});

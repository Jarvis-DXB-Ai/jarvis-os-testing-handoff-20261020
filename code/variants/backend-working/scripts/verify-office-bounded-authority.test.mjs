import {withOfficeSourceAdmission} from './lib/office-source-activation.mjs';
import sharp from 'sharp';
import {clientProfileHash} from './lib/office-client-artifacts.mjs';
import {authorizeToolActor,performTool,roleWorkspaceTools} from './lib/office-tool-bridge.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {boundedSha256,boundedRequestSha256,boundedDenialReceipt,createBoundedOfficeAuthority} from './lib/office-goal-bounded-authority.mjs';
import {createOfficeGoalPolicyRuntime} from './lib/office-goal-policy-runtime.mjs';
import {readGoalNativeBinding,createGoalNativePolicy} from './lib/office-goal-native-policy.mjs';
import {observeGoalBudget} from './lib/office-goal-budget.mjs';
import {validateTask,createJob,readJob,listJobs,executeJob,stopJob} from './lib/office-team-engine.mjs';
import {initialiseFoundations,buildTaskContext,persistTaskContext,readFoundation,readTaskContext} from './lib/office-foundations.mjs';
import {requireOfficeContextRevision} from '../src/lib/office-coo-message.mjs';

async function fixture(t,{cap=20,phase='direction',clientId=null,configure,initialize=true,prepareSources}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'office-bounded-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const privateDirectory=join(root,'control'),goalId='G-FIXTURE',goalRoot=join(privateDirectory,goalId);await mkdir(goalRoot,{recursive:true,mode:0o700});
 const ownerPath=join(root,'owner-authorization.txt'),sourcePath=join(root,'source.txt');await writeFile(ownerPath,'Synthetic explicitly scoped work order only.');await writeFile(sourcePath,'Synthetic operational source.');
 const ownerAuthorizationRef={path:ownerPath,sha256:boundedSha256(await readFile(ownerPath,'utf8'))},sourcePin={path:sourcePath,sha256:boundedSha256(await readFile(sourcePath,'utf8'))};
 const extraPins=prepareSources?await prepareSources({root,clientId}):[];
 const storage={testing:true,recordsVolume:root,recordsRoot:join(root,'records')};
 await initialiseFoundations(storage,[{id:'fixture',title:'Fixture',scope:clientId?{kind:'client',id:'fixture-client',clientId}:{kind:'internal',id:'fixture-agency',clientId:null},fields:{},sources:[sourcePin,...extraPins]}]);
 const contextRequest={foundationId:'fixture',taskType:'internal',mode:'draft'},context=await buildTaskContext(storage,contextRequest),task=validateTask({id:randomUUID(),brief:'Prepare the synthetic direction checkpoint.',context:'Internal fixture only.',criteria:['Use only the synthetic source.'],contextRequest});
 const agentId=randomUUID(),companyId=randomUUID(),grant={authorityId:'AUTH-FIXTURE',ownerAuthorizationRef,workOrderId:'WO-FIXTURE',companyId,scope:{kind:clientId?'client':'agency',clientId},requestSha256:boundedRequestSha256(task),contextRevision:context.revision,sourcePins:[sourcePin,...extraPins],methodPins:[],allowedStages:[{kind:'planning',roleId:'coo',agentId,adapterType:'claude_local',model:'fixture-model',tools:[],methodsSha256:boundedSha256([]),maxAttempts:cap}],planPolicy:{allowedRoleIds:['copy'],maxTasks:10,maxConcurrency:1},notBefore:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z',maxJobs:1,maxDispatchAttempts:cap,maxConcurrentRuns:1,externalActions:[],directionGate:{phase,directionApproval:null,sampleApproval:null},publicationGate:'owner_exact_version_required'};
 let registry={version:1,goalId,grants:[grant]},binding,usageCalls=0,afterUsage=null;
 const persist=async()=>{await writeFile(join(goalRoot,'authority-registry.json'),JSON.stringify(registry),{mode:0o600});binding={version:2,enabled:true,goalId,ledgerPath:join(goalRoot,'usage-ledger.json'),authorityPath:join(goalRoot,'authority-registry.json'),authoritySha256:boundedSha256(JSON.stringify(registry))};await writeFile(join(privateDirectory,'goal-native-policy.json'),JSON.stringify(binding),{mode:0o600});};if(configure)await configure({root,grant});await persist();
 const clock=()=>Date.parse('2026-10-16T12:00:00Z');
 if(initialize)await createBoundedOfficeAuthority({...binding,privateDirectory},{now:clock}).initialize(ownerAuthorizationRef);
 const runtime=()=>createOfficeGoalPolicyRuntime({privateDirectory,createAuthority:b=>createBoundedOfficeAuthority(b,{now:clock}),createPolicy:()=>({check:async()=>{usageCalls++;if(afterUsage)await afterUsage();return{canDispatch:true,reason:'ready',checkpointSaved:true};}})});
 const load=()=>readGoalNativeBinding(privateDirectory),authority=async()=>createBoundedOfficeAuthority(await load(),{now:clock});
 const meta={task,context,stage:'planning',roleId:'coo',agentId,adapterType:'claude_local',model:'fixture-model',billing:'subscription_only',issueId:randomUUID(),companyId,tools:[],methods:[],plan:null,concurrency:1};
 const journal=async()=>JSON.parse(await readFile(join(goalRoot,'work-order-journal.json'),'utf8'));
 const terminal=(ticket,runId=randomUUID())=>({id:runId,agentId,companyId,contextSnapshot:{issueId:meta.issueId},status:'succeeded',usageJson:{billingType:'subscription_included'}});
 return{root,privateDirectory,goalRoot,load,authority,task,context,grant,meta,storage,runtime,persist,journal,terminal,agentId,companyId,ownerPath,sourcePath,get binding(){return binding;},get registry(){return registry;},setRegistry:value=>{registry=value;},usageCalls:()=>usageCalls,setAfterUsage:fn=>{afterUsage=fn;}};
}

test('strict v2 binding rejects v1, extra keys and a foreign ledger domain without fallback',async t=>{
 const f=await fixture(t),path=join(f.privateDirectory,'goal-native-policy.json');
 for(const c of [{version:1,enabled:true,goalId:'old',ledgerPath:'/old'},{...f.binding,extra:true},{...f.binding,ledgerPath:join(f.privateDirectory,'usage-ledger.json')},{...f.binding,enabled:false}]){await writeFile(path,JSON.stringify(c));await assert.rejects(f.load);}
});
test('admission binds exact request/client/context, duplicate acknowledged intake consumes no new job and new IDs cannot bypass cap',async t=>{
 const f=await fixture(t),a=await f.authority();await a.admit(f.meta);await a.admit(f.meta);assert.equal(Object.keys((await f.journal()).jobs).length,1);
 await assert.rejects(a.admit({...f.meta,task:{...f.task,id:randomUUID()}}),/job_cap/);
 for(const meta of [{...f.meta,task:{...f.task,brief:'A different task'}},{...f.meta,context:{...f.context,scope:{kind:'client',clientId:randomUUID()}}},{...f.meta,context:{...f.context,revision:'a'.repeat(64)}}])await assert.rejects(a.inspect(meta),/work_order/);
});
test('missing, expired, unsupported external authority and missing early opinions refuse before usage',async t=>{
 for(const change of [f=>f.setRegistry({...f.registry,grants:[]}),f=>{f.grant.expiresAt='2026-10-16T01:00:00Z';},f=>{f.grant.externalActions=['publish'];},f=>{f.grant.directionGate.phase='production';}]){
  const f=await fixture(t);change(f);await f.persist();const result=await f.runtime().checkOfficeGoalAdmission({task:f.task,context:f.context,companyId:f.companyId});assert.equal(result.canDispatch,false);assert.equal(f.usageCalls(),0);
 }
});
test('source/method/owner pins and authority revocation during awaited usage fail closed',async t=>{
 const f=await fixture(t),runtime=f.runtime();f.setAfterUsage(async()=>{await writeFile(join(f.goalRoot,'authority-registry.json'),'{}');});
 assert.equal((await runtime.checkOfficeGoalAdmission({task:f.task,context:f.context,companyId:f.companyId})).canDispatch,false);
 await f.persist();f.setAfterUsage(null);await writeFile(f.sourcePath,'Changed source');assert.equal((await runtime.checkOfficeGoalAdmission({task:f.task,context:f.context,companyId:f.companyId})).canDispatch,false);
});
test('actual method files/references must be pinned and a changed method blocks the final reservation check',async t=>{
 let methodRoot,path;const method={id:'fixture',repo:'fixture',ref:'v1',sha256:boundedSha256('Fixture method'),contextPath:'SKILL.md',references:[]};
 const f=await fixture(t,{configure:async({root,grant})=>{methodRoot=join(root,'methods');path=join(methodRoot,'fixture','SKILL.md');await mkdir(join(methodRoot,'fixture'),{recursive:true});await writeFile(path,'Fixture method');grant.methodPins=[{path,sha256:method.sha256}];grant.allowedStages[0].methodsSha256=boundedSha256([method]);}});
 const a=await f.authority(),meta={...f.meta,methods:[method],methodRoot};await a.admit(meta);const ticket=await a.reserve(meta);await writeFile(path,'Changed method');await assert.rejects(ticket.recheck(),/pin_changed/);await ticket.cancelBeforeDispatch();
});
test('unexpected stage, role, agent, model, method, tool or paid adapter never reserves',async t=>{
 const f=await fixture(t),a=await f.authority();await a.admit(f.meta);
 for(const bad of [{stage:'qa'},{roleId:'copy'},{agentId:randomUUID()},{model:'other'},{methods:[{id:'unreviewed'}]},{tools:['publish']},{adapterType:'paid_api'},{billing:'api'}])await assert.rejects(a.reserve({...f.meta,...bad}),/stage_identity/);
 assert.equal((await f.journal()).attempts.length,0);
});
test('atomic concurrent reservations yield one attempt and unknown outcome holds without refund or retry',async t=>{
 const f=await fixture(t),a=await f.authority();await a.admit(f.meta);const results=await Promise.allSettled([a.reserve(f.meta),a.reserve({...f.meta,issueId:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const ticket=results.find(r=>r.status==='fulfilled').value;await ticket.unknown();assert.equal((await f.journal()).attempts.length,1);assert.equal((await f.journal()).attempts[0].state,'unknown');await assert.rejects(a.reserve({...f.meta,issueId:randomUUID()}),/unknown_dispatch/);
});
test('acknowledged concurrent ceiling, terminal identity/billing and lifetime cap are enforced',async t=>{
 const f=await fixture(t,{cap:2}),a=await f.authority();await a.admit(f.meta);const ticket=await a.reserve(f.meta),run=f.terminal(ticket);await ticket.acknowledge(run.id);await ticket.acknowledge(run.id);
 await assert.rejects(a.reserve(f.meta),/concurrency/);await assert.rejects(ticket.settle({...run,usageJson:{billingType:'api'}}),/terminal_unverified/);await ticket.settle(run);assert.equal((await f.journal()).attempts[0].state,'terminal');
 const next={...f.meta,issueId:randomUUID()},second=await a.reserve(next),other={...f.terminal(second),contextSnapshot:{issueId:next.issueId}};await second.acknowledge(other.id);await second.settle(other);await assert.rejects(a.reserve(f.meta),/attempt_cap/);assert.deepEqual((await f.journal()).attempts[0].events.map(e=>e.state),['reserved','acknowledged','terminal']);
});
test('configured work-order ceiling supports more than eight dispatches without implicit expansion',async t=>{
 const f=await fixture(t,{cap:10}),a=await f.authority();await a.admit(f.meta);
 for(let n=0;n<10;n++){const meta={...f.meta,issueId:randomUUID()},ticket=await a.reserve(meta),run={...f.terminal(ticket),contextSnapshot:{issueId:meta.issueId}};await ticket.acknowledge(run.id);await ticket.settle(run);}
 assert.equal((await f.journal()).attempts.length,10);await assert.rejects(a.reserve(f.meta),/attempt_cap/);
});
test('a late stop can cancel an unissued reservation but never refunds its consumed attempt',async t=>{
 const f=await fixture(t,{cap:1}),a=await f.authority();await a.admit(f.meta);const ticket=await a.reserve(f.meta);await ticket.cancelBeforeDispatch();const j=await f.journal();assert.equal(j.attempts[0].state,'cancelled_before_dispatch');assert.equal(j.attempts[0].runId,null);await assert.rejects(a.reserve(f.meta),/attempt_cap/);
});
test('fresh authority needs explicit initialization; restart or lost journal never resets consumed unknown state',async t=>{
 const f=await fixture(t,{cap:1,initialize:false}),a=await f.authority();await assert.rejects(a.admit(f.meta),/initialization_missing/);
 await a.initialize(f.grant.ownerAuthorizationRef);await a.admit(f.meta);const ticket=await a.reserve(f.meta);await ticket.unknown();
 const restarted=await f.authority(),next={...f.meta,task:{...f.task,id:randomUUID()},issueId:randomUUID()};await assert.rejects(restarted.admit(next),/unknown_dispatch/);
 await fs.unlink(join(f.goalRoot,'work-order-journal.json'));await assert.rejects(restarted.admit(next),/journal_missing/);await assert.rejects(restarted.initialize(f.grant.ownerAuthorizationRef),/already_initialized/);
});
test('malformed rows and broken relationships reject even when an altered journal checksum is recomputed',async t=>{
 const f=await fixture(t,{cap:1}),a=await f.authority();await a.admit(f.meta);const ticket=await a.reserve(f.meta),run=f.terminal(ticket);await ticket.acknowledge(run.id);await ticket.settle(run);
 const path=join(f.goalRoot,'work-order-journal.json'),original=await readFile(path,'utf8');
 for(const mutate of [j=>{delete j.attempts[0].authorityId;},j=>{j.attempts[0].authorityId='foreign';},j=>{j.attempts[0].jobId=randomUUID();},j=>{delete j.jobs[f.task.id];},j=>{j.attempts.push({...j.attempts[0],id:randomUUID()});},j=>{j.attempts=[];},j=>{j.attempts[0].runId=null;},j=>{j.attempts[0].events=[];},j=>{j.attempts[0].state='refunded';},j=>{j.jobs[f.task.id].requestSha256='b'.repeat(64);}]){
  const changed=JSON.parse(original);mutate(changed);const {integrity:_old,...body}=changed;void _old;changed.integrity=boundedSha256(body);const raw=JSON.stringify(changed);await writeFile(path,raw);
  await assert.rejects(a.reserve({...f.meta,issueId:randomUUID()}),/authority_(journal|schema)/);assert.equal(await readFile(path,'utf8'),raw,'Corrupt state must not be repaired into a new allowance');
 }
 await writeFile(path,original);await assert.rejects(a.reserve({...f.meta,issueId:randomUUID()}),/attempt_cap/);
});
test('same pinned registry replaced atomically is reread as a complete valid generation',async t=>{
 const f=await fixture(t),a=await f.authority(),path=f.binding.authorityPath,raw=await readFile(path,'utf8'),originalOpen=fs.open;let armed=true,oldLinks;
 fs.open=async function(target,...args){const handle=await originalOpen(target,...args);if(armed&&String(target)===path){armed=false;await writeFile(path+'.replacement',raw,{mode:0o600});await fs.rename(path+'.replacement',path);oldLinks=(await handle.stat()).nlink;}return handle;};syncBuiltinESMExports();
 try{await a.inspect(f.meta);assert.equal(oldLinks,0);}finally{fs.open=originalOpen;syncBuiltinESMExports();}
});
test('concurrent terminal settlement during reservation recheck preserves both attempts without replay or refund',async t=>{
 const f=await fixture(t,{cap:2,configure:({grant})=>{grant.maxJobs=2;grant.maxConcurrentRuns=2;grant.planPolicy.maxConcurrency=2;}}),a=await f.authority();await a.admit(f.meta);const first=await a.reserve(f.meta),run=f.terminal(first);await first.acknowledge(run.id);
 const next={...f.meta,task:{...f.task,id:randomUUID()},issueId:randomUUID()};await a.admit(next);const second=await a.reserve(next),path=join(f.goalRoot,'work-order-journal.json'),originalOpen=fs.open;let armed=true,oldLinks;
 fs.open=async function(target,...args){const handle=await originalOpen(target,...args);if(armed&&String(target)===path){armed=false;await first.settle(run);oldLinks=(await handle.stat()).nlink;}return handle;};syncBuiltinESMExports();
 try{await second.recheck();assert.equal(oldLinks,0);}finally{fs.open=originalOpen;syncBuiltinESMExports();}
 await second.cancelBeforeDispatch();const j=await f.journal();assert.deepEqual(j.attempts.map(a=>a.state),['terminal','cancelled_before_dispatch']);assert.equal(j.attempts.length,2);
});
test('symlink, hardlink and unsafe-permission substitutions never pass the fresh-read path',async t=>{
 for(const attack of ['symlink','hardlink','permissions']){
  const f=await fixture(t),a=await f.authority(),path=f.binding.authorityPath;
  if(attack==='symlink'){const target=path+'.target';await fs.rename(path,target);await fs.symlink(target,path);}
  if(attack==='hardlink')await fs.link(path,path+'.alias');if(attack==='permissions')await fs.chmod(path,0o644);
  await assert.rejects(a.inspect(f.meta));assert.equal((await f.journal()).attempts.length,0);
 }
});
test('repeated proven replacements stop after three fresh reads without dispatch or state reset',async t=>{
 const f=await fixture(t),a=await f.authority(),path=f.binding.authorityPath,raw=await readFile(path,'utf8'),originalOpen=fs.open;let replacements=0;
 fs.open=async function(target,...args){const handle=await originalOpen(target,...args);if(String(target)===path){replacements++;await writeFile(path+'.replacement',raw,{mode:0o600});await fs.rename(path+'.replacement',path);}return handle;};syncBuiltinESMExports();
 try{await assert.rejects(a.inspect(f.meta),/snapshot_changed/);assert.equal(replacements,3);}finally{fs.open=originalOpen;syncBuiltinESMExports();}
 assert.equal((await f.journal()).attempts.length,0);
});
test('denial receipt uses a closed category set and never retains uncontrolled message or file content',()=>{
 const id=randomUUID(),safe=boundedDenialReceipt({id,reason:'authority_file_links',checkpointSaved:false,fileClass:'authority_journal',validationPhase:'read_snapshot'},{stage:'planning'});assert.equal(safe.decisionId,id);assert.equal(safe.reason,'authority_file_links');assert.equal(safe.checkpointSaved,false);
 const untrusted=boundedDenialReceipt({id:'secret-token',reason:'secret-token /private/credential.txt',fileClass:'secret-token',validationPhase:'secret-token',checkpointSaved:'yes'},{stage:'planning'});assert.equal(untrusted.reason,'guard_unavailable');assert.equal(untrusted.decisionId,null);assert.equal(untrusted.checkpointSaved,false);assert.ok(!JSON.stringify(untrusted).includes('secret-token'));
});
test('actual engine persists sanitized denial evidence before rejecting with zero invocation',async t=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'office-denial-r2-')));t.after(()=>rm(directory,{recursive:true,force:true}));const id=randomUUID(),agentId=randomUUID(),decisionId=randomUUID();await createJob({id,brief:'Synthetic denied call',context:'Offline only.',criteria:['No invocation'],kind:'conversation',targetAgentId:agentId},directory);
 const actor={id:agentId,name:'Fixture',status:'idle',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:'subscription_only'},adapterType:'codex_local',adapterConfig:{model:'fixture'}};
 const api=async(path,body,method)=>{if(path.endsWith('/agents'))return[actor];if(path.endsWith('/issues')&&body)return{id:randomUUID(),...body};if(method==='PATCH')return body;assert.fail('No native invocation or unexpected transport: '+path);};
 await executeJob(id,{paperclipCompanyId:randomUUID(),roles:[{id:'copy',name:'Copy',output:'Synthetic',rosterStatus:'active'}],executives:[],skillLibrary:[],toolBridge:{enabled:false}},{directory,api,modelPolicy:async()=>({id:decisionId,canDispatch:false,reason:'authority_file_links',checkpointSaved:false,fileClass:'authority_journal',validationPhase:'read_snapshot'})});
 const saved=await readJob(id,directory),call=saved.calls[0];assert.equal(call.status,'rejected_before_authorization');assert.equal(call.runId,null);assert.equal(call.admissionDenial.decisionId,decisionId);assert.equal(call.admissionDenial.reason,'authority_file_links');assert.equal(call.admissionDenial.stage,call.stage);assert.equal(call.admissionDenial.fileClass,'authority_journal');
});
test('validated planner task IDs/roles/concurrency are bound once; unexpected specialist or changed plan cannot dispatch',async t=>{
 const f=await fixture(t,{configure:({grant})=>{grant.allowedStages.push({...grant.allowedStages[0],kind:'specialist',roleId:'copy'});}}),a=await f.authority();await a.admit(f.meta);
 const plan={tasks:[{id:'one',roleId:'copy',assignment:'Synthetic part.',dependsOn:[]}]},meta={...f.meta,stage:'specialist:one',roleId:'copy',plan,concurrency:1};
 await assert.rejects(a.reserve({...meta,stage:'specialist:other'}),/specialist/);await assert.rejects(a.reserve({...meta,concurrency:2}),/plan/);
 const ticket=await a.reserve(meta),run=f.terminal(ticket);await ticket.acknowledge(run.id);await ticket.settle(run);
 await assert.rejects(a.reserve({...meta,issueId:randomUUID(),plan:{tasks:[{...plan.tasks[0],assignment:'Changed part'}]}}),/plan_changed/);
});
test('saved stage cannot restore a consumed cap through empty, unplanned or another planned specialist identity',async t=>{
 const f=await fixture(t,{cap:2,configure:({grant})=>{grant.allowedStages.push({...grant.allowedStages[0],kind:'specialist',roleId:'copy',maxAttempts:1});}}),a=await f.authority();await a.admit(f.meta);
 const plan={tasks:[{id:'one',roleId:'copy',assignment:'First synthetic part.',dependsOn:[]},{id:'two',roleId:'copy',assignment:'Different synthetic part.',dependsOn:['one']}]},meta={...f.meta,stage:'specialist:one',roleId:'copy',plan};
 const ticket=await a.reserve(meta),run=f.terminal(ticket);await ticket.acknowledge(run.id);await ticket.settle(run);const next={...meta,issueId:randomUUID()},path=join(f.goalRoot,'work-order-journal.json'),valid=await readFile(path,'utf8');await assert.rejects(a.reserve(next),/attempt_cap/);
 const original=JSON.parse(valid);assert.deepEqual(original.jobs[f.task.id].planEvidence.plan,plan);assert.equal(original.jobs[f.task.id].planSha256,boundedSha256(plan));assert.ok(original.attempts[0].events.every(e=>e.intentSha256===original.attempts[0].events[0].intentSha256));
 for(const stage of ['specialist:','specialist:unplanned','specialist:two','specialist:one:extra','planning:one','qa:one']){
  const j=JSON.parse(valid);j.attempts[0].stage=stage;const {integrity:_old,...body}=j;void _old;j.integrity=boundedSha256(body);const raw=JSON.stringify(j);await writeFile(path,raw);
  await assert.rejects(a.reserve(next),/authority_journal/);assert.equal(await readFile(path,'utf8'),raw,'Refuse before rewriting corrupted accounting');
 }
 await writeFile(path,valid);await assert.rejects(a.reserve(next),/attempt_cap/);
 const second=await a.reserve({...next,stage:'specialist:two'});await second.cancelBeforeDispatch();const after=await f.journal();assert.equal(after.attempts.length,2);assert.deepEqual(after.attempts.map(a=>a.stage),['specialist:one','specialist:two']);
});
test('saved plan and stage evidence retain task/role graph and transition identity across rechecks',async t=>{
 const f=await fixture(t,{configure:({grant})=>{grant.allowedStages.push({...grant.allowedStages[0],kind:'specialist',roleId:'copy',tools:['source_read','draft_check']});}}),a=await f.authority();await a.admit(f.meta);
 const plan={tasks:[{id:'one',roleId:'copy',assignment:'Bound synthetic part.',dependsOn:[]}]},meta={...f.meta,stage:'specialist:one',roleId:'copy',plan,tools:['source_read']},ticket=await a.reserve(meta),path=join(f.goalRoot,'work-order-journal.json'),valid=await readFile(path,'utf8');
 for(const mutate of [j=>{j.jobs[f.task.id].planEvidence=null;},j=>{j.jobs[f.task.id].planEvidence.plan.tasks[0].roleId='unplanned-role';},j=>{j.jobs[f.task.id].planEvidence.plan.tasks[0].dependsOn=['one'];},j=>{j.jobs[f.task.id].planEvidence.plan.tasks[0].id='changed';},j=>{j.attempts[0].planSha256='b'.repeat(64);},j=>{j.attempts[0].events[0].intentSha256='b'.repeat(64);}]){
  const j=JSON.parse(valid);mutate(j);const {integrity:_old,...body}=j;void _old;j.integrity=boundedSha256(body);const raw=JSON.stringify(j);await writeFile(path,raw);await assert.rejects(ticket.recheck(),/authority_journal/);assert.equal(await readFile(path,'utf8'),raw);
 }
 await writeFile(path,valid);plan.tasks[0].assignment='Changed after reservation';await assert.rejects(ticket.recheck(),/reservation_changed/);assert.equal((await f.journal()).attempts[0].state,'reserved');assert.equal((await f.journal()).jobs[f.task.id].planEvidence.plan.tasks[0].assignment,'Bound synthetic part.');plan.tasks[0].assignment='Bound synthetic part.';meta.tools.push('draft_check');await assert.rejects(ticket.recheck(),/reservation_changed/);await ticket.cancelBeforeDispatch();
});
test('the actual enforced usage guard uses an isolated initialized ledger and never accepts inherited waiver mode',async t=>{
 const f=await fixture(t),now=Date.parse('2026-10-16T12:00:00Z'),observedAt=new Date(now).toISOString(),resetsAt='2026-10-23T12:00:00Z';
 const meters=[{provider:'codex',source:'Synthetic authoritative fixture',observedAt,windows:[{label:'Codex · 7 days',usedPercent:1,windowDurationMins:10080,resetsAt}]},{provider:'claude',source:'Synthetic authoritative fixture',observedAt,windows:[{label:'7 days · all models',usedPercent:1,windowDurationMins:10080,resetsAt}]}];
 await observeGoalBudget({goalId:f.binding.goalId,ledgerPath:f.binding.ledgerPath,nowMs:now},{initialise:true,observedAt,meters});
 const guard=createGoalNativePolicy(await f.load(),{now:()=>now,readCodexUsage:async()=>meters[0],readClaudeUsage:async()=>meters[1]});assert.equal((await guard.check('admission')).canDispatch,true);
 const ledger=JSON.parse(await readFile(f.binding.ledgerPath,'utf8'));ledger.policy.usageStopMode='owner-waived';await writeFile(f.binding.ledgerPath,JSON.stringify(ledger));assert.equal((await guard.check('admission')).canDispatch,false);
});

async function serverFixture(f){
 const require=createRequire(import.meta.url),ts=require('typescript'),source=await readFile(new URL('../src/lib/office-paperclip-team-server.ts',import.meta.url),'utf8'),mod={exports:{}},jobs=join(f.root,'jobs'),effects={spawn:0,preview:0,persist:0};
 const plan={paperclipCompanyId:f.companyId,storage:f.storage,departmentPackageReviewEnabled:true,specialistArtifactEnvelopeEnabled:true};
 const stubs={
  './office-runtime.mjs':{localOfficeEnabled:()=>true,coordinatorWorkerEnvironment:()=>({})},
  '../../scripts/lib/office-team-engine.mjs':{activeStates:[],jobDirectory:jobs,validateTask,readJob:id=>readJob(id,jobs),listJobs:()=>listJobs(jobs,{kind:'all'}),createJob:(input,_dir,options)=>createJob(input,jobs,options)},
  '../../scripts/lib/office-source-activation.mjs':{withOfficeSourceAdmission},
  '../../scripts/lib/office-archive.mjs':{storageReadiness:async()=>({status:'connected'})},
  '../../scripts/lib/office-foundations.mjs':{readFoundation:(...args)=>readFoundation(...args),readTaskContext,persistTaskContext:async(...args)=>{effects.persist++;return persistTaskContext(...args);}},
  './office-foundations-server':{previewOfficeContext:async()=>{effects.preview++;return{bundle:f.context};}},
  '../../scripts/lib/office-task-routing.mjs':{officeTaskRoute:()=>({})},
  './office-coo-message.mjs':{requireOfficeContextRevision},
  './office-readiness-server':{officeReadiness:async()=>({canEnqueue:true})},
  '../../scripts/lib/office-goal-policy-runtime.mjs':f.runtime(),
  './office-stack-plan.json':{default:plan},
  'node:crypto':require('node:crypto'),'node:path':require('node:path'),
  'node:child_process':{spawn:()=>{effects.spawn++;return{on(){},unref(){}};}},
 };
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',compiled)(name=>stubs[name]??{},mod,mod.exports);
 return{submit:mod.exports.submitOfficeTeamTask,jobs,effects};
}
test('actual COO server intake binds before persistence/launch and identical acknowledged replay returns the saved job',async t=>{
 const f=await fixture(t),server=await serverFixture(f),input={...f.task,contextRevision:f.context.revision};
 const saved=await server.submit(input);assert.equal(saved.id,f.task.id);assert.equal(server.effects.spawn,1);assert.equal(server.effects.persist,1);
 const usage=f.usageCalls(),journalBefore=await readFile(join(f.goalRoot,'work-order-journal.json'),'utf8');await server.submit(input);assert.equal(server.effects.spawn,1);assert.equal(server.effects.persist,1);assert.equal(f.usageCalls(),usage);assert.equal(await readFile(join(f.goalRoot,'work-order-journal.json'),'utf8'),journalBefore);
});
test('actual intake rejects ungranted work before context persistence or worker launch; HTTP grant-shaped fields cannot authorize',async t=>{
 const f=await fixture(t),server=await serverFixture(f),input={...f.task,brief:'Unapproved request',contextRevision:f.context.revision,authority:{canDispatch:true},grantId:f.grant.authorityId};
 await assert.rejects(server.submit(input),/safety hold/);assert.equal(server.effects.persist,0);assert.equal(server.effects.spawn,0);await assert.rejects(access(join(server.jobs,f.task.id+'.json')),{code:'ENOENT'});
});
test('actual engine final dispatch binds native identity, preserves unknown acknowledgement and honors late stop',async t=>{
 for(const outcome of ['terminal','unknown','stop']){
  const unknown=outcome==='unknown',stopped=outcome==='stop';
  const f=await fixture(t),server=await serverFixture(f);await server.submit({...f.task,contextRevision:f.context.revision});
  await mkdir(join(f.storage.recordsRoot,'library/references'),{recursive:true});await writeFile(join(f.storage.recordsRoot,'library/references/catalogue.json'),JSON.stringify({version:1,items:[]}));
  const actor=role=>({id:role==='coo'?f.agentId:randomUUID(),name:role,status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture-model'}}),agents=[actor('coo'),actor('test'),actor('copy')];let invoke=0,lastIssue,run;
  const plan={paperclipCompanyId:f.companyId,storage:f.storage,roles:[{id:'copy',name:'Copy',rosterStatus:'active',output:'Synthetic text'}],executives:[],skillLibrary:[],toolBridge:{enabled:false},focusDepartments:[]};
  const api=async(path,body,method)=>{
   if(path.endsWith('/agents'))return agents;
   if(path.endsWith('/issues')&&body){lastIssue={id:randomUUID(),...body};return lastIssue;}
   if(path.endsWith('/heartbeat/invoke')){invoke++;if(unknown)throw Error('Synthetic lost native acknowledgement');run={id:randomUUID(),agentId:f.agentId,companyId:f.companyId,contextSnapshot:{issueId:lastIssue.id},status:'succeeded',resultJson:{summary:'Intentionally malformed synthetic planner output'},usageJson:{billingType:'subscription_included'}};return{id:run.id,status:'queued'};}
   if(path.startsWith('/heartbeat-runs/'))return run;if(method==='PATCH')return body;
   throw Error('Unexpected synthetic API '+path);
  };
  const decisions=[],policy=f.runtime().officeGoalModelPolicy;
  const result=await executeJob(f.task.id,plan,{directory:server.jobs,api,pollMs:1,modelPolicy:async meta=>{const decision=await policy(meta);decisions.push(decision.reason??'reserved');if(stopped)await stopJob(f.task.id,server.jobs);return decision;}});
  assert.equal(invoke,stopped?0:1,result.error+' '+JSON.stringify(decisions));assert.equal(result.calls[0].authority.workOrderId,'WO-FIXTURE');const attempts=(await f.journal()).attempts;assert.equal(attempts.length,1);assert.equal(attempts[0].state,unknown?'unknown':stopped?'cancelled_before_dispatch':'terminal');if(unknown){assert.equal(result.status,'recovery_required');assert.equal((await f.runtime().officeGoalModelPolicy(f.meta)).canDispatch,false);}if(stopped)assert.equal(result.status,'cancelled');
 }
});

async function artifactAuthorityFixture(t){
 let profile,profilePin;const clientId=randomUUID(),designId=randomUUID(),sourceHtml='<!doctype html><html><link rel="stylesheet" href="master.css"><body><article class="canvas"><h1>Synthetic engine</h1><img src="image.png" alt="Fixture"></article></body></html>',sourceCss='.canvas{width:64px;height:80px}h1{font:12px sans-serif}img{width:16px}';
 const f=await fixture(t,{clientId,phase:'sample',prepareSources:async({root})=>{
  const sourceRoot=join(root,'artifact-sources');await mkdir(sourceRoot);const entries=[['master.html',Buffer.from(sourceHtml)],['master.css',Buffer.from(sourceCss)],['image.png',await sharp({create:{width:16,height:16,channels:3,background:'#4488bb'}}).png().toBuffer()]],files=[],pins=[];
  for(let i=0;i<entries.length;i++){const [path,b]=entries[i];await writeFile(join(sourceRoot,path),b);files.push({sourceId:'source-'+i,path,sha256:boundedSha256(b.toString('binary')),status:'draft'});files.at(-1).sha256=(await import('node:crypto')).createHash('sha256').update(b).digest('hex');pins.push({path:join(sourceRoot,path),sha256:files.at(-1).sha256});}
  profile={id:'synthetic',enabled:true,clientId,workOrderId:'synthetic-order',root:sourceRoot,files,masters:[{id:'fixture',htmlSourceId:'source-0',cssSourceId:'source-1',width:64,height:80}]};const path=join(root,'artifact-profile.json'),raw=JSON.stringify(profile);await writeFile(path,raw);profilePin={path,sha256:boundedSha256(raw),profileId:profile.id,profileSha256:clientProfileHash(profile)};pins.push({path,sha256:profilePin.sha256});return pins;
 },configure:({grant})=>{
  grant.workOrderId='synthetic-order';grant.artifactProfile=profilePin;grant.directionGate.directionApproval=grant.ownerAuthorizationRef;grant.planPolicy.allowedRoleIds=['design-system'];grant.allowedStages[0].tools=['artifact_read',...roleWorkspaceTools('coo')];grant.allowedStages.push({kind:'specialist',roleId:'design-system',agentId:designId,adapterType:'claude_local',model:'fixture-model',tools:['artifact_read','artifact_save','artifact_render',...roleWorkspaceTools('design-system')],methodsSha256:boundedSha256([]),maxAttempts:2});
 }});
 const artifactGrant={profileId:profile.id,profileSha256:clientProfileHash(profile),clientId,workOrderId:profile.workOrderId};
 const meta={...f.meta,stage:'specialist:design',roleId:'design-system',agentId:designId,tools:f.grant.allowedStages[1].tools,artifactGrant,plan:{summary:'Synthetic',parallelism:1,tasks:[{id:'design',roleId:'design-system',assignment:'Edit one synthetic HTML/CSS bundle.',dependsOn:[]}]},concurrency:1};
 return {...f,profile,profilePin,artifactGrant,meta,designId,sourceHtml,sourceCss};
}
test('artifact authority binds exact profile/source/client/workorder and journal intent without authorizing external actions',async t=>{
 const f=await artifactAuthorityFixture(t),a=await f.authority();await a.admit(f.meta);const ticket=await a.reserve(f.meta);assert.deepEqual(ticket.receipt.artifactGrant,f.artifactGrant);await ticket.recheck();
 const row=(await f.journal()).attempts[0];assert.deepEqual(row.artifactGrant,f.artifactGrant);
 for(const change of [{profileId:'other'},{profileSha256:'f'.repeat(64)},{clientId:randomUUID()},{workOrderId:'other-order'}])await assert.rejects(a.inspect({...f.meta,artifactGrant:{...f.artifactGrant,...change}}),/artifact_grant/);
 const runId=randomUUID();await ticket.acknowledge(runId);await a.inspect({...f.meta,runId,reservationId:ticket.receipt.reservationId});await assert.rejects(a.inspect({...f.meta,runId:randomUUID(),reservationId:ticket.receipt.reservationId}),/artifact_run/);
 await writeFile(join(f.profile.root,'master.css'),'Changed dependency');await assert.rejects(a.inspect({...f.meta,runId,reservationId:ticket.receipt.reservationId}),/pin_changed/);
});
test('artifact tools require a pinned profile and early direction; no source omission or profile drift bypass',async t=>{
 for(const change of [f=>{delete f.grant.artifactProfile;},f=>{f.grant.directionGate={phase:'direction',directionApproval:null,sampleApproval:null};},f=>{f.grant.artifactProfile.profileSha256='f'.repeat(64);},f=>{f.grant.sourcePins=f.grant.sourcePins.filter(p=>p.path!==join(f.profile.root,'image.png'));}]){
  const f=await artifactAuthorityFixture(t);change(f);await f.persist();await assert.rejects((await f.authority()).inspect(f.meta),/artifact|sources/);
 }
});
test('actual engine persists bounded artifactGrant before fake native tool actor reads/saves; source revocation blocks subsequent write',async t=>{
 const f=await artifactAuthorityFixture(t),server=await serverFixture(f);await server.submit({...f.task,contextRevision:f.context.revision});
 await mkdir(join(f.storage.recordsRoot,'library/references'),{recursive:true});await writeFile(join(f.storage.recordsRoot,'library/references/catalogue.json'),JSON.stringify({version:1,items:[]}));
 const actor=(role,id)=>({id,name:role,status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture-model'}}),agents=[actor('coo',f.agentId),actor('test',randomUUID()),actor('design-system',f.designId)],issues=new Map(),runs=new Map();let currentIssue,invocations=0,toolReceipt;
 const plan={paperclipCompanyId:f.companyId,storage:f.storage,roles:[{id:'design-system',name:'Design',rosterStatus:'active',output:'Editable synthetic artifact'}],executives:[],skillLibrary:[],toolBridge:{enabled:true,clientArtifactProfiles:{synthetic:f.profile}},focusDepartments:[]};
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents'))return agents;
  if(path.endsWith('/issues')&&body){currentIssue={id:randomUUID(),...body};issues.set(currentIssue.id,currentIssue);return currentIssue;}
  if(path.endsWith('/heartbeat/invoke')){invocations++;const run={id:randomUUID(),agentId:path.split('/')[2],companyId:f.companyId,contextSnapshot:{issueId:body.payload.issueId},status:'succeeded',usageJson:{billingType:'subscription_included'}};runs.set(run.id,run);return{id:run.id,status:'queued'};}
  if(path.startsWith('/heartbeat-runs/')){
   const run=runs.get(path.split('/')[2]);if(!run.resultJson){
    if(run.agentId===f.agentId)run.resultJson={summary:JSON.stringify({summary:'Synthetic artifact pipeline',parallelism:1,parallelismRationale:'One author.',blockedReason:null,tasks:f.meta.plan.tasks})};
    else {
     const saved=await readJob(f.task.id,server.jobs),call=saved.calls.find(c=>c.runId===run.id);assert.deepEqual(call.artifactGrant,f.artifactGrant);assert.deepEqual(call.authority.artifactGrant,f.artifactGrant);assert.ok(issues.get(run.contextSnapshot.issueId).description.includes('Selected editable profile'));
     plan.toolBridge.clientArtifactRenderer={enabled:true,clientId:f.profile.clientId,workOrderId:f.profile.workOrderId,leaseId:'synthetic-lease',taskId:'SYNTHETIC-ONLY',ownerRole:'01',leaseAcquiredAt:'synthetic'};
     const env={JARVIS_OFFICE_JOB_ID:f.task.id,PAPERCLIP_AGENT_ID:run.agentId,PAPERCLIP_RUN_ID:run.id},dependencies={readBinding:f.load,createAuthority:b=>createBoundedOfficeAuthority(b,{now:()=>Date.parse('2026-10-16T12:00:00Z')}),checkRendererLease:async()=>{},createRenderer:async options=>({contract:'office-local-bundle-v1',id:'fixture-renderer',sourceSha256:'a'.repeat(64),leaseId:options.leaseId,fixture:false,render:async c=>{assert.ok((await readFile(join(f.storage.recordsRoot,'tool-render-sessions/renderer.lock'),'utf8')).includes(run.id));options.onProcess({state:'closed',cleanupConfirmed:true,pid:99999999});return {png:await sharp({create:{width:64,height:80,channels:3,background:'#4488bb'}}).png().toBuffer(),revisionSha256:c.revisionSha256,complete:true,fontsReady:true,layoutReady:true,networkDenied:true,errors:[],loadedResources:c.resourceNames};}})};
     const ctx=await authorizeToolActor(plan,env,server.jobs,dependencies); // Real authorization code in an isolated synthetic store; provider transport remains fake.
     const source=await performTool(ctx,'artifact_read',{profileId:'synthetic',masterId:'fixture'},'source');toolReceipt=await performTool(ctx,'artifact_save',{profileId:'synthetic',masterId:'fixture',html:source.result.html,css:source.result.css,data:'{"synthetic":true}'},'save');assert.equal(toolReceipt.result.clientArtifact.profileSha256,f.artifactGrant.profileSha256);const rendered=await performTool(ctx,'artifact_render',{profileId:'synthetic',sourceCall:toolReceipt.id,revisionSha256:toolReceipt.result.clientArtifact.revisionSha256},'render');assert.ok(rendered.files.some(f=>f.name==='preview.png'));await assert.rejects(access(join(f.storage.recordsRoot,'tool-render-sessions/renderer.lock')),{code:'ENOENT'});
     await writeFile(join(f.profile.root,'master.css'),'Changed source after completed fixture draft');await assert.rejects(performTool(ctx,'artifact_save',{profileId:'synthetic',masterId:'fixture',html:source.result.html,css:source.result.css,data:'{}'},'revoked'),/pin_changed|Registered source changed/);
     await stopJob(f.task.id,server.jobs);run.resultJson={summary:JSON.stringify({artifact:'Synthetic editable artifact saved.',internalNotes:'Fixture only.'})};
    }
   }return run;
  }
  if(method==='PATCH')return body;
  throw Error('Unexpected synthetic API '+path);
 };
 const result=await executeJob(f.task.id,plan,{directory:server.jobs,api,pollMs:1,modelPolicy:f.runtime().officeGoalModelPolicy});
 assert.equal(invocations,2,result.error);assert.ok(toolReceipt);assert.equal(result.status,'cancelled',JSON.stringify({error:result.error,calls:result.calls,steps:result.steps}));assert.equal((await f.journal()).attempts.length,2);
});

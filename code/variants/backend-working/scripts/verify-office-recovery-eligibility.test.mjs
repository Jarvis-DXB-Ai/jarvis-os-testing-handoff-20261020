import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {officeRecoveryEligibility,readOfficeRecoveryEligibility,assertOfficeRecoveryCurrent} from './lib/office-recovery-eligibility.mjs';

const available={stopRequested:false,workerAlive:false,executionLockPresent:false,continuationBlocked:false};
function planningJob(){const issueId=randomUUID();return{id:randomUUID(),updatedAt:'2026-10-16T00:00:00Z',status:'failed',ownerPid:null,kind:'team',queueManaged:true,issueId,error:'COO invalid assignment',plan:null,steps:[],calls:[{stage:'planning',status:'succeeded',runId:randomUUID(),issueId}]};}
const action=(meta,name)=>meta.actions.find(a=>a.action===name);

test('planning and undispatched metadata distinguish candidates from native verification and model continuation',()=>{
 const job=planningJob(),meta=officeRecoveryEligibility(job,available);
 assert.equal(action(meta,'recoverPlanning').state,'requires_verification');assert.equal(action(meta,'recoverPlanning').startsRemainingModelWork,true);assert.equal(meta.expectedUpdatedAt,job.updatedAt);
 const task={id:'one',roleId:'copy',assignment:'One synthetic item.',dependsOn:[]},step={...task,agentId:'copy',issueId:randomUUID(),status:'failed'};
 Object.assign(job,{plan:{tasks:[task]},steps:[step]});job.calls.push({stage:'specialist:one',status:'rejected_before_authorization',runId:null,usage:null,agentId:step.agentId,issueId:step.issueId});
 assert.equal(action(officeRecoveryEligibility(job,available),'recoverUndispatchedStage').state,'requires_verification');
 job.calls[1].runId=randomUUID();assert.equal(action(officeRecoveryEligibility(job,available),'recoverUndispatchedStage').state,'blocked');
});

test('stopped, unavailable, active and uncertain execution state fails closed',()=>{
 for(const state of [{...available,stopRequested:true},{...available,stopRequested:null},{...available,workerAlive:null},{...available,workerAlive:true}])assert.ok(officeRecoveryEligibility(planningJob(),state).actions.every(a=>a.state==='blocked'));
 for(const status of ['cancelled','stopping'])assert.ok(officeRecoveryEligibility({...planningJob(),status},available).actions.every(a=>a.reasonCode==='owner_stopped'));
 for(const state of [{...available,executionLockPresent:null},{...available,executionLockPresent:true},{...available,continuationBlocked:true}])assert.equal(action(officeRecoveryEligibility(planningJob(),state),'recoverPlanning').state,'blocked');
 assert.ok(officeRecoveryEligibility(planningJob()).actions.every(a=>a.state==='blocked'));
 assert.ok(officeRecoveryEligibility({...planningJob(),queueManaged:undefined},available).actions.every(a=>a.reasonCode==='scope_not_verified'));
});

test('pending rejected-QA handoff stays a board-only verification candidate',()=>{
 const job={...planningJob(),status:'recovery_required',deliveryHandoff:{state:'pending'},output:'Retained rejected artifact',qa:{pass:false},finalQaRawOutput:'saved review',steps:[{status:'completed',output:'Saved part'}]};job.calls=[{stage:'qa',status:'succeeded',runId:randomUUID()}];
 const entry=action(officeRecoveryEligibility(job,{...available,continuationBlocked:true}),'recoverDeliveryHandoff');assert.equal(entry.state,'requires_verification');assert.equal(entry.startsRemainingModelWork,false);
 assert.equal(action(officeRecoveryEligibility({...job,status:'cancelled'},available),'recoverDeliveryHandoff').state,'blocked');
});

test('catalog marker read failure remains unavailable and does not invoke a provider or write state',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'office-local-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));const job=planningJob(),paths=[];
 const meta=await readOfficeRecoveryEligibility(job,{directory,continuationBlocked:false,readMarker:async path=>{paths.push(path);return null;},isAlive:()=>assert.fail('No PID for this job')});
 assert.equal(meta.stopRequested,null);assert.ok(meta.actions.every(a=>a.state==='blocked'));assert.equal(paths.length,2);
 const real=await readOfficeRecoveryEligibility(job,{directory,continuationBlocked:false});assert.equal(action(real,'recoverPlanning').state,'requires_verification');
 await writeFile(join(directory,job.id+'.stop'),'Owner stop');assert.ok((await readOfficeRecoveryEligibility(job,{directory,continuationBlocked:false})).actions.every(a=>a.state==='blocked'));
});

test('final recovery boundary rejects stopped state, marker, changed revision and same-timestamp changed bytes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'office-recovery-cas-'));t.after(()=>rm(directory,{recursive:true,force:true}));const job=planningJob(),path=join(directory,job.id+'.json'),original=JSON.stringify(job);await writeFile(path,original);
 await assertOfficeRecoveryCurrent(job,{directory,original,continuation:true});
 await writeFile(path,JSON.stringify({...job,error:'Changed without timestamp'}));await assert.rejects(assertOfficeRecoveryCurrent(job,{directory,original}),/changed during/);
 await writeFile(path,JSON.stringify({...job,updatedAt:'changed'}));await assert.rejects(assertOfficeRecoveryCurrent(job,{directory}),/changed during/);
 await writeFile(path,JSON.stringify({...job,status:'cancelled'}));await assert.rejects(assertOfficeRecoveryCurrent(job,{directory}),/owner stopped/);
 await writeFile(path,original);await mkdir(join(directory,job.id+'.stop'));await assert.rejects(assertOfficeRecoveryCurrent(job,{directory}),/owner stopped/);
});

async function serverFixture({continuation=false,onAdmission}={}){
 const require=createRequire(import.meta.url),ts=require('typescript'),source=await readFile(new URL('../src/lib/office-paperclip-team-server.ts',import.meta.url),'utf8'),fixtureModule={exports:{}};
 const job={...planningJob(),queueManaged:true},effects={recover:[],archive:0,spawn:0,admission:0,metadata:0};
 const stub={
  './office-runtime.mjs':{localOfficeEnabled:()=>true,coordinatorWorkerEnvironment:()=>({})},
  '../../scripts/lib/office-team-engine.mjs':{activeStates:['queued','working'],jobDirectory:'/synthetic/not-used',readJob:async()=>job,listJobs:async()=>[job],recoverDeliveryHandoff:async(...args)=>{effects.recover.push(args);return {...job,status:'needs_review'};},recoverPlanning:async(...args)=>{effects.recover.push(args);return {...job,status:'queued'};},recoverUndispatchedStage:async(...args)=>{effects.recover.push(args);return {...job,status:'queued'};}},
  '../../scripts/lib/office-archive.mjs':{storageReadiness:async()=>({status:'connected'}),archiveJob:async()=>{effects.archive++;}},
  '../../scripts/lib/office-goal-policy-runtime.mjs':{checkOfficeGoalAdmission:async()=>{effects.admission++;assert.ok(continuation,'No model policy for local catalog or board handoff');if(onAdmission)await onAdmission(job);return{canDispatch:true};}},
  '../../scripts/lib/office-task-queue.mjs':{officeQueueState:()=>({pending:0,running:0,recoveryRequired:false,ids:[]})},
  '../../scripts/lib/office-recovery-eligibility.mjs':{readOfficeRecoveryEligibility:async()=>{effects.metadata++;return officeRecoveryEligibility(job,available);}},
  '../../scripts/lib/office-tool-bridge.mjs':{toolReceipts:async()=>[]},
  './office-stack-plan.json':{default:{storage:{}}},
  'node:child_process':{spawn:()=>{effects.spawn++;assert.ok(continuation,'Board-only action must never spawn a worker or queue');return{on(){},unref(){}};}},
  'node:path':require('node:path'),
 };
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',compiled)(name=>stub[name]??{},fixtureModule,fixtureModule.exports);
 return{...fixtureModule.exports,job,effects};
}

test('dedicated server handoff requires exact revision and returns without worker, queue or model-policy launch',async()=>{
 const f=await serverFixture();await assert.rejects(f.controlOfficeTeamTask({id:f.job.id,action:'recoverDeliveryHandoff'}),/exact saved/);assert.equal(f.effects.recover.length,0);
 const result=await f.controlOfficeTeamTask({id:f.job.id,action:'recoverDeliveryHandoff',expectedUpdatedAt:f.job.updatedAt});
 assert.equal(result.status,'needs_review');assert.equal(f.effects.recover.length,1);assert.equal(f.effects.recover[0][2].expectedUpdatedAt,f.job.updatedAt);assert.equal(f.effects.spawn,0);assert.equal(f.effects.admission,0);assert.equal(f.effects.archive,1);
});

test('server catalog derives local metadata without model-policy or provider invocation',async()=>{
 const f=await serverFixture(),catalog=await f.officeTeamTasks();assert.equal(catalog.jobs[0].recovery.expectedUpdatedAt,f.job.updatedAt);assert.equal(f.effects.metadata,1);assert.equal(f.effects.recover.length,0);assert.equal(f.effects.admission,0);assert.equal(f.effects.spawn,0);
});

for(const marker of [undefined,false])for(const actionName of ['recoverPlanning','recoverUndispatchedStage'])test(`${actionName} direct POST rejects queue scope ${String(marker)} before admission/recovery/spawn`,async()=>{
 const f=await serverFixture({continuation:true});if(marker===undefined)delete f.job.queueManaged;else f.job.queueManaged=marker;
 await assert.rejects(f.controlOfficeTeamTask({id:f.job.id,action:actionName,expectedUpdatedAt:f.job.updatedAt}),/recorded Office queue recovery scope/);
 assert.equal(f.effects.admission,0);assert.equal(f.effects.recover.length,0);assert.equal(f.effects.spawn,0);
});
for(const actionName of ['recoverPlanning','recoverUndispatchedStage'])test(`${actionName} scoped model continuation admits once and launches one remaining-work worker`,async()=>{
 const f=await serverFixture({continuation:true}),result=await f.controlOfficeTeamTask({id:f.job.id,action:actionName,expectedUpdatedAt:f.job.updatedAt});
 assert.equal(result.status,'queued');assert.equal(f.effects.admission,1);assert.equal(f.effects.recover.length,1);assert.equal(f.effects.spawn,1);assert.equal(f.effects.recover[0][1],f.job.updatedAt);
});
for(const changeScope of [true,false])test((changeScope?'queue scope changed':'revision changed')+' during admission blocks continuation before recovery/spawn',async()=>{
 const f=await serverFixture({continuation:true,onAdmission:async job=>{if(changeScope)job.queueManaged=false;else job.error='Same-timestamp saved-record change';}});
 await assert.rejects(f.controlOfficeTeamTask({id:f.job.id,action:'recoverPlanning',expectedUpdatedAt:f.job.updatedAt}),changeScope?/queue recovery scope/:/revision changed/);
 assert.equal(f.effects.admission,1);assert.equal(f.effects.recover.length,0);assert.equal(f.effects.spawn,0);
});

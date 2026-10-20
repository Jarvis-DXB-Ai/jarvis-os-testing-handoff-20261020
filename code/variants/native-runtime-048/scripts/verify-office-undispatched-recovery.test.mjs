import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createJob,executeJob,recoverUndispatchedStage} from './lib/office-team-engine.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'office-undispatched-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const id=randomUUID(),companyId=randomUUID(),criteria=['Use supplied fictional facts.'],roles=['coo','copy','cmo','social-qa','test'],actors=roles.map(role=>({id:role,status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'codex_local',adapterConfig:{model:'fixture'}}));
 const plan={paperclipCompanyId:companyId,roles:[{id:'copy',name:'Copy',model:'fixture',output:'Fictional caption'}],departmentQaEnabled:true,focusDepartments:[{id:'social',name:'Social',roles:['copy'],headRoleId:'cmo',qaRoleId:'social-qa'}],skillLibrary:[]},issues=new Map(),runs=new Map(),invoked=[];
 let intercept=null;
 const api=async(path,body,method)=>{
  if(intercept)await intercept(path,body,method);
  if(path.endsWith('/agents')&&!body)return actors;
  if(path.includes('/heartbeat-runs?'))return [...runs.values()];
  if(path.endsWith('/issues')&&body){const issue={...body,id:randomUUID(),companyId,createdAt:new Date().toISOString()};issues.set(issue.id,issue);return issue;}
  if(path.startsWith('/issues/')&&!body)return issues.get(path.split('/')[2]);
  if(path.endsWith('/heartbeat/invoke')){
   const issue=issues.get(body.payload.issueId);invoked.push(issue.title);let output='Finished fictional caption.';
   if(issue.title.startsWith('COO ·'))output=JSON.stringify({summary:'One useful writer',parallelism:1,parallelismRationale:'One bounded part',tasks:[{id:'caption',roleId:'copy',assignment:'Write one fictional caption.',dependsOn:[]}]});
   if(issue.title.startsWith('Social QA')||issue.title.startsWith('Independent QA')){const checks=issue.title.startsWith('Independent QA')?criteria:JSON.parse(issue.description.match(/Criteria: (\[.*?\])\. Client task:/)[1]);output=JSON.stringify({pass:true,checks:checks.map(criterion=>({criterion,pass:true,evidence:'Synthetic complete evidence.'})),note:''});}
   const runId=randomUUID(),at=new Date().toISOString();runs.set(runId,{id:runId,companyId,agentId:issue.assigneeAgentId,contextSnapshot:{issueId:issue.id},createdAt:at,startedAt:at,finishedAt:at,status:'succeeded',usageJson:{billingType:'subscription_included',model:'fixture'},resultJson:{summary:output}});return {id:runId,status:'queued'};
  }
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(method==='PATCH'){const issue=issues.get(path.split('/')[2]);Object.assign(issue,body);return issue;}
  throw Error('Unexpected mock API '+path);
 };
 await createJob({id,brief:'Write one complete fictional caption.',context:'Synthetic fixture only.',criteria},directory);
 const job=await executeJob(id,plan,{api,directory,pollMs:1,modelPolicy:({stage})=>stage==='planning'});
 assert.equal(job.status,'failed');assert.equal(job.calls.length,2);assert.equal(invoked.length,1);assert.equal(job.calls[1].status,'rejected_before_authorization');
 // The production worker exits; this fixture shares the test process instead.
 job.ownerPid=null;await writeFile(join(directory,id+'.json'),JSON.stringify(job));
 return {directory,id,plan,job,api,issues,runs,actors,invoked,path:join(directory,id+'.json'),setIntercept:f=>{intercept=f;}};
}
test('explicit resume retains verified planner and denial, creates a distinct specialist issue, and completes without replanning',async t=>{
 const f=await fixture(t),planner=structuredClone(f.job.calls[0]),denied=structuredClone(f.job.calls[1]);
 const queued=await recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory});assert.notEqual(queued.resumePlanning,true);assert.equal(queued.resumeUndispatchedStage,true);assert.deepEqual(queued.calls,[planner,denied]);assert.equal(queued.undispatchedRecovery.priorSteps[0].status,'failed');
 const done=await executeJob(f.id,f.plan,{api:f.api,directory:f.directory,pollMs:1,modelPolicy:()=>true});assert.equal(done.status,'needs_review',done.error);assert.equal(done.calls.filter(c=>c.stage==='planning').length,1);assert.equal(f.invoked.filter(s=>s.startsWith('COO ·')).length,1);assert.deepEqual(done.calls[0],planner);assert.deepEqual(done.calls[1],denied);assert.notEqual(done.steps[0].issueId,denied.issueId);assert.match(f.issues.get(done.steps[0].issueId).idempotencyKey,/-undispatched-1/);
 await assert.rejects(recoverUndispatchedStage(f.id,done.updatedAt,f.plan,{api:f.api,directory:f.directory}),/exact failed/);
});
test('resumption cannot bypass a fresh native-stage subscription refusal',async t=>{
 const f=await fixture(t);await recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory});let guardCalls=0;
 const done=await executeJob(f.id,f.plan,{api:f.api,directory:f.directory,pollMs:1,modelPolicy:()=>{guardCalls++;return false;}});assert.equal(done.status,'failed');assert.equal(guardCalls,1);assert.equal(f.invoked.length,1);assert.equal(done.calls.at(-1).runId,null);assert.equal(done.calls.at(-1).status,'rejected_before_authorization');
});
test('stale CAS, dispatched/uncertain calls, outputs, changed plan, changed methods, duplicate runs and active intents are refused',async t=>{
 const f=await fixture(t),original=structuredClone(f.job),planningRun=structuredClone(f.runs.get(f.job.calls[0].runId));
 await assert.rejects(recoverUndispatchedStage(f.id,'stale',f.plan,{api:f.api,directory:f.directory}),/exact failed/);
 for(const mutate of [j=>j.calls[1].runId=randomUUID(),j=>j.calls[1].usage={},j=>j.calls[1].status='dispatching',j=>j.steps[0].output='Unexpected work',j=>j.plan.tasks[0].assignment='Different assignment',j=>j.calls[0].skills=[{id:'unreviewed'}]]){const changed=structuredClone(original);mutate(changed);await writeFile(f.path,JSON.stringify(changed));await assert.rejects(recoverUndispatchedStage(f.id,original.updatedAt,f.plan,{api:f.api,directory:f.directory}));}
 await writeFile(f.path,JSON.stringify(original));
 for(const variant of [{...planningRun,id:randomUUID()},{...planningRun,id:randomUUID(),contextSnapshot:{issueId:original.calls[1].issueId}},{...planningRun,id:randomUUID(),status:'queued',contextSnapshot:{issueId:randomUUID()}}]){f.runs.set(variant.id,variant);await assert.rejects(recoverUndispatchedStage(f.id,original.updatedAt,f.plan,{api:f.api,directory:f.directory}));f.runs.delete(variant.id);}
 const run=f.runs.get(planningRun.id);run.resultJson.summary='Changed response';await assert.rejects(recoverUndispatchedStage(f.id,original.updatedAt,f.plan,{api:f.api,directory:f.directory}),/response changed/);run.resultJson=planningRun.resultJson;
 assert.equal(f.invoked.length,1);assert.equal(JSON.parse(await readFile(f.path,'utf8')).status,'failed');
});
test('owner stop, active lock and same-timestamp concurrent file mutation fail closed',async t=>{
 const f=await fixture(t);
 await writeFile(f.path,JSON.stringify({...f.job,ownerPid:process.pid}));await assert.rejects(recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory}),/worker is still alive/);await writeFile(f.path,JSON.stringify(f.job));
 for(const name of [f.id+'.stop','active-team.lock']){await writeFile(join(f.directory,name),'stop');await assert.rejects(recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory}),/stop or an active/);await rm(join(f.directory,name));}
 let changed=false;f.setIntercept(async path=>{if(!changed&&path.includes('/heartbeat-runs?')){changed=true;const value=JSON.parse(await readFile(f.path,'utf8'));value.context+=' raced';await writeFile(f.path,JSON.stringify(value));}});
 await assert.rejects(recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory}),/changed during/);assert.equal(f.invoked.length,1);
});
test('queued continuation rechecks provider evidence before the first new specialist dispatch',async t=>{
 const f=await fixture(t);await recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory});f.runs.get(f.job.calls[0].runId).resultJson.summary='Changed after preparation';
 const done=await executeJob(f.id,f.plan,{api:f.api,directory:f.directory,pollMs:1,modelPolicy:()=>true});assert.equal(done.status,'failed');assert.match(done.error,/planning response changed/);assert.equal(f.invoked.length,1);
});
test('agency planner and specialist cannot move to another client or become a task helper before recovery',async t=>{
 const f=await fixture(t);
 for(const role of ['coo','copy','cmo','social-qa'])for(const marker of [{jarvisClientId:randomUUID()},{jarvisSpawnedForTask:randomUUID()},{jarvisTaskPartId:'another-part'}]){const actor=f.actors.find(a=>a.id===role),metadata=structuredClone(actor.metadata);Object.assign(actor.metadata,marker);await assert.rejects(recoverUndispatchedStage(f.id,f.job.updatedAt,f.plan,{api:f.api,directory:f.directory}),/client\/runtime allocation/);actor.metadata=metadata;}
 assert.equal(f.invoked.length,1);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {validatePlan,createJob,readJob,recoverPlanning,executeJob,listJobs} from './lib/office-team-engine.mjs';
const source=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url)));
const response=()=>({summary:'Frame followed by a voice document',parallelism:2,tasks:[{id:'frame',roleId:'brand-strategist',assignment:'Define the fictional strategic frame.'},{id:'tov',roleId:'voice',assignment:'Write the fictional voice document.',dependsOn:['frame']}]});
const roles=[{id:'brand-strategist'},{id:'voice'}];
test('an omitted dependency list defaults to independent work without changing the actual dependency graph',()=>{
 const raw=response(),plan=validatePlan(raw,roles);assert.deepEqual(plan.tasks[0].dependsOn,[]);assert.deepEqual(plan.tasks[1].dependsOn,['frame']);assert.equal(Object.hasOwn(raw.tasks[0],'dependsOn'),false);
});
test('explicit malformed fields, unknown roles, duplicates and bad dependency graphs remain rejected with useful errors',()=>{
 for(const value of [null,'frame',false,{}]){const raw=response();raw.tasks[0].dependsOn=value;assert.throws(()=>validatePlan(raw,roles),/assignment "frame".*dependsOn/);}
 const foreign=response();foreign.tasks[0].roleId='unallocated';assert.throws(()=>validatePlan(foreign,roles),/role "unallocated".*permitted/);
 const missing=response();delete missing.tasks[0].assignment;assert.throws(()=>validatePlan(missing,roles),/nonempty assignment/);
 const duplicate=response();duplicate.tasks[1].id='frame';assert.throws(()=>validatePlan(duplicate,roles),/duplicated/);
 const cycle=response();cycle.tasks[0].dependsOn=['tov'];assert.throws(()=>validatePlan(cycle,roles),/circular/);
 const unknown=response();unknown.tasks[1].dependsOn=['missing'];assert.throws(()=>validatePlan(unknown,roles),/missing task dependency/);
 assert.throws(()=>validatePlan({...response(),tasks:[null]},roles),/expected a task object/);
});
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'office-plan-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const request={id:randomUUID(),brief:'Create a fictional voice document.',context:'Fixture only.',criteria:['Answers the supplied brief.']};
 const {job}=await createJob(request,directory);job.status='failed';job.error='COO returned invalid assignments.';job.issueId=randomUUID();job.createdAt=new Date(Date.now()-7200000).toISOString();
 const runId=randomUUID();job.calls=[{stage:'planning',roleId:'coo',agentId:'coo',issueId:job.issueId,runId,status:'succeeded'}];
 let raw=JSON.stringify(response());const saved={id:runId,status:'succeeded',agentId:'coo',usageJson:{billingType:'subscription_included'},resultJson:{summary:raw}};
 await writeFile(join(directory,job.id+'.json'),JSON.stringify(job));
 const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};
 const ids=[...new Set([...source.executives,...source.roles].map(r=>r.id))],methodRoot=join(storage.recordsRoot,'library/skills/protocol');await mkdir(join(methodRoot,'roles'),{recursive:true});await writeFile(join(methodRoot,'SKILL.md'),'Fixture protocol');for(const id of ids)await writeFile(join(methodRoot,'roles',id+'.md'),'Fixture role '+id);
 const plan={...source,storage,toolBridge:{enabled:false},skillLibrary:[{id:'protocol',repo:'fixture',ref:'fixture',license:'Internal',kind:'protocol',roleReferences:true,roles:ids}]};
 const agents=ids.map(id=>({id,status:'idle',metadata:{jarvisBlueprintRoleId:id,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'sonnet'}})),issues=new Map([[job.issueId,{id:job.issueId,title:'Original COO planning'}]]),runs=new Map([[runId,saved]]),invoked=[];
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents')&&!body)return agents;
  if(path.endsWith('/issues')){const issue={...body,id:randomUUID()};issues.set(issue.id,issue);return issue;}
  if(path.endsWith('/heartbeat/invoke')){const issue=issues.get(body.payload.issueId);invoked.push(issue.title);let output='A completed fictional source-grounded voice document.';
   if(issue.title.startsWith('COO ·'))throw new Error('Planner must not run again');
   if(issue.title.includes(' QA ·')||issue.title.startsWith('Independent QA')){const criteria=issue.title.startsWith('Independent QA')?request.criteria:JSON.parse(issue.description.match(/Criteria: (\[.*?\])\. Client task:/)[1]);output=JSON.stringify({pass:true,checks:criteria.map(criterion=>({criterion,pass:true,evidence:'The fictional output meets this check.'})),note:'Fixture review'});}
   const id=randomUUID();runs.set(id,{id,status:'succeeded',resultJson:{summary:output},usageJson:{billingType:'subscription_included',inputTokens:1,outputTokens:1}});return{id,status:'queued'};
  }
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(method==='PATCH')return body;throw new Error('Unexpected fixture request '+path);
 };
 return{directory,job,plan,saved,api,invoked,setRaw(value){raw=value;saved.resultJson.summary=value;}};
}
test('the exact saved plan resumes specialists, department QA/reports and final QA without another planning call',async t=>{
 const f=await fixture(t),queued=await recoverPlanning(f.job.id,f.job.updatedAt,f.plan,{directory:f.directory,api:f.api});
 assert.equal(queued.planningRecovery.priorError,f.job.error);assert.equal(queued.status,'queued');assert.equal(queued.plan,null);assert.deepEqual(queued.planningRecovery.omittedDependencyTaskIds,['frame']);
 assert.equal((await listJobs(f.directory))[0].status,'queued');
 const done=await executeJob(f.job.id,f.plan,{directory:f.directory,api:f.api,pollMs:1,modelPolicy:()=>true});
 assert.equal(done.status,'needs_review',done.error);assert.equal(done.calls.filter(c=>c.stage==='planning').length,1);assert.ok(done.steps.every(s=>s.status==='completed'));assert.equal(done.qa.pass,true);assert.ok(done.departmentReports.every(r=>r.qa.result.pass&&r.status==='completed'));assert.equal(done.reviewedAt,null);assert.ok(!f.invoked.some(title=>title.startsWith('COO ·')));assert.equal(done.issueId,f.job.issueId);
 await assert.rejects(recoverPlanning(f.job.id,done.updatedAt,f.plan,{directory:f.directory,api:f.api}),/only the exact/i);
});
test('stale requests, unverified runs, wrong agents and explicit null dependencies cannot be recovered',async t=>{
 const f=await fixture(t);await assert.rejects(recoverPlanning(f.job.id,'stale',f.plan,{directory:f.directory,api:f.api}),/exact/);
 f.saved.usageJson.billingType='unconfirmed';await assert.rejects(recoverPlanning(f.job.id,f.job.updatedAt,f.plan,{directory:f.directory,api:f.api}),/subscription/);f.saved.usageJson.billingType='subscription_included';
 f.saved.agentId='another-agent';await assert.rejects(recoverPlanning(f.job.id,f.job.updatedAt,f.plan,{directory:f.directory,api:f.api}),/matching/);f.saved.agentId='coo';
 const malformed=response();malformed.tasks[0].dependsOn=null;f.setRaw(JSON.stringify(malformed));await assert.rejects(recoverPlanning(f.job.id,f.job.updatedAt,f.plan,{directory:f.directory,api:f.api}),/Only omitted/);
 assert.equal((await readJob(f.job.id,f.directory)).status,'failed');assert.equal(f.invoked.length,0);
});
test('changed saved evidence after preparation blocks all specialist invocations',async t=>{
 const f=await fixture(t);await recoverPlanning(f.job.id,f.job.updatedAt,f.plan,{directory:f.directory,api:f.api});f.setRaw(JSON.stringify({...response(),summary:'Changed evidence'}));
 const result=await executeJob(f.job.id,f.plan,{directory:f.directory,api:f.api,pollMs:1,modelPolicy:()=>true});assert.equal(result.status,'failed');assert.match(result.error,/evidence changed/);assert.equal(f.invoked.length,0);
});

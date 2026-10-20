import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {officeTaskRoute} from './lib/office-task-routing.mjs';
import {validateTask,validatePlan,createJob,executeJob} from './lib/office-team-engine.mjs';
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url)));
const input=()=>({id:randomUUID(),brief:'Write a welcome email using the supplied facts.',context:'Isolated fixture only.',criteria:['Uses supplied facts']});
test('COO is the default; a department head receives only its non-QA specialist catalogue',()=>{
 assert.equal(officeTaskRoute(plan,null,null).plannerRoleId,'coo');
 const route=officeTaskRoute(plan,null,'email');assert.equal(route.plannerRoleId,'email-lead');assert.ok(route.roles.some(r=>r.id==='email'));assert.ok(!route.roles.some(r=>['copy','email-qa','test'].includes(r.id)));
 assert.throws(()=>validatePlan({summary:'wrong team',tasks:[{id:'copy',roleId:'copy',assignment:'Work in another department',dependsOn:[]}]},route.roles),/permitted specialist catalogue/);
});
test('client paid services are binding; unknown departments and malformed recipients cannot widen scope',()=>{
 const department=plan.focusDepartments.find(d=>d.id==='email');const brain={officeTeam:{roleIds:['email','email-design','email-lead'],maxConcurrentWorkers:2,departments:[department]}};
 assert.equal(officeTaskRoute(plan,brain,'email').plannerRoleId,'email-lead');assert.throws(()=>officeTaskRoute(plan,brain,'social'),/not available/);assert.throws(()=>officeTaskRoute(plan,null,'unknown'),/not available/);
 for(const departmentId of [5,{},'../email','Email'])assert.throws(()=>validateTask({...input(),departmentId}),/department recipient/);
});
test('saved retry binds the recipient and preserves legacy unrestricted tasks',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'office-recipient-'));try{const request={...input(),departmentId:'email'};await createJob(request,directory);assert.equal((await createJob(request,directory)).created,false);await assert.rejects(createJob({...request,departmentId:'social'},directory),/different department/);const old=input();await createJob(old,directory);assert.equal((await createJob({...old,departmentId:null},directory)).created,false);}finally{await rm(directory,{recursive:true,force:true});}
});
test('unknown saved routing fails before any runtime API or model invocation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'office-recipient-block-'));try{const request={...input(),departmentId:'unknown'};await createJob(request,directory);let calls=0;const result=await executeJob(request.id,plan,{directory,api:async()=>{calls++;throw new Error('must not call');}});assert.equal(result.status,'blocked');assert.equal(calls,0);}finally{await rm(directory,{recursive:true,force:true});}
});
test('department-routed execution plans at its head and retains department QA, report, COO assembly and final QA',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'office-recipient-flow-'));try{
  const request={...input(),departmentId:'email'};await createJob(request,directory);
  const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')},ids=['coo','email-lead','email','email-qa','test'];
  const methodRoot=join(storage.recordsRoot,'library/skills/protocol');await mkdir(join(methodRoot,'roles'),{recursive:true});await writeFile(join(methodRoot,'SKILL.md'),'Isolated role method');for(const id of ids)await writeFile(join(methodRoot,'roles',id+'.md'),'Isolated '+id+' method');
  const agents=ids.map(id=>({id,status:'idle',metadata:{jarvisBlueprintRoleId:id,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'sonnet'}}));
  const issues=new Map(),runs=new Map(),invoked=[];
  const api=async(path,body,method)=>{
   if(path.endsWith('/agents')&&!body)return agents;
   if(path.endsWith('/issues')){const row={...body,id:randomUUID()};issues.set(row.id,row);return row;}
   if(path.endsWith('/heartbeat/invoke')){const issue=issues.get(body.payload.issueId);invoked.push(issue.assigneeAgentId);let output='Welcome. This email uses only the supplied facts.';
    if(issue.title.startsWith('Email Marketing head ·'))output=JSON.stringify({summary:'One email part',parallelism:1,parallelismRationale:'One useful specialist',tasks:[{id:'welcome',roleId:'email',assignment:'Write a complete welcome email',dependsOn:[]}]});
    if(issue.title.startsWith('Email Marketing QA')||issue.title.startsWith('Independent QA')){const checks=issue.title.startsWith('Email Marketing QA')?JSON.parse(issue.description.match(/Criteria: (\[.*?\])\. Client task:/)[1]):request.criteria;output=JSON.stringify({pass:true,checks:checks.map(criterion=>({criterion,pass:true,evidence:'The supplied facts are used.'})),note:'Isolated fixture'});}
    const id=randomUUID();runs.set(id,{id,status:'succeeded',resultJson:{summary:output},usageJson:{billingType:'subscription_included',inputTokens:1,outputTokens:1}});return {id,status:'queued'};
   }
   if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
   if(method==='PATCH')return body;throw new Error('Unexpected fixture API '+path);
  };
  const source={...plan,storage,toolBridge:{enabled:false},skillLibrary:[{id:'protocol',repo:'fixture',ref:'fixture',license:'Internal',kind:'protocol',roleReferences:true,roles:ids}]};
  const job=await executeJob(request.id,source,{directory,api,pollMs:1,modelPolicy:()=>true});
  assert.equal(job.status,'needs_review',job.error);assert.equal(job.calls[0].agentId,'email-lead');assert.deepEqual(invoked,['email-lead','email','email-qa','email-lead','coo','test']);assert.ok(job.steps.every(s=>s.roleId==='email'));assert.equal(job.departmentReports[0].qa.result.pass,true);assert.equal(job.departmentReports[0].status,'completed');assert.equal(job.qa.pass,true);assert.equal(job.reviewedAt,null);
 }finally{await rm(directory,{recursive:true,force:true});}
});

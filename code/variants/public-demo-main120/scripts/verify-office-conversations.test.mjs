import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createJob,executeJob,listJobs,reviewJob,savedAgentTaskContext} from './lib/office-team-engine.mjs';

test('department-head follow-ups inherit only that head’s summaries; unrelated agents get no task context',()=>{
 const job={brief:'Fictional brief',output:'Combined draft',steps:[{agentId:'copy',assignment:'Caption',output:'Copy evidence',status:'completed'}],departmentReports:[{agentId:'cmo',departmentName:'Marketing',stepIds:['copy'],output:'Marketing summary',status:'completed'},{agentId:'cfo',departmentName:'Accounting',stepIds:['finance'],output:'Separate finance summary',status:'completed'}],calls:[{agentId:'coo',stage:'planning'}]};
 const marketing=savedAgentTaskContext(job,'cmo');assert.equal(marketing.departmentSummaries[0].output,'Marketing summary');assert.equal(marketing.ownWork.length,0);assert.equal(marketing.combinedDraft,undefined);assert.ok(!JSON.stringify(marketing).includes('Separate finance summary'));
 assert.equal(savedAgentTaskContext(job,'unrelated'),null);assert.equal(savedAgentTaskContext(job,'coo').combinedDraft,'Combined draft');assert.equal(savedAgentTaskContext(job,'copy').ownWork[0].output,'Copy evidence');
});

test('direct conversation runs only the selected role, retains its skill and SSD evidence, and stays out of delivery totals',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'office-chat-')),agentId=randomUUID(),id=randomUUID();
 const input={id,kind:'conversation',targetAgentId:agentId,brief:'What inputs do you need to draft good captions?',context:'Owner: Use only approved product facts.',criteria:['Answer directly.']};
 const agent={id:agentId,name:'Caption & Copy',title:'Copy specialist',status:'idle',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'sonnet'}};
 const issues=new Map(),runs=new Map();let calls=0;
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents'))return [agent];
  if(path.endsWith('/issues')){const record={...body,id:randomUUID()};issues.set(record.id,record);return record;}
  if(path.endsWith('/heartbeat/invoke')){calls++;const runId=randomUUID();runs.set(runId,{id:runId,status:'succeeded',resultJson:{summary:'Please provide approved product facts, tone and the intended audience.'},usageJson:{billingType:'subscription_included',model:'sonnet'}});return{id:runId,status:'queued'};}
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(method==='PATCH')return body;
  throw new Error('Unexpected path '+path);
 };
 try{
  const created=await createJob(input,directory);
  const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};
  const result=await executeJob(created.job.id,{paperclipCompanyId:'fixture',roles:[{id:'copy'}],storage},{api,directory,pollMs:1,modelPolicy:()=>true});
  assert.equal(result.status,'answered');assert.equal(result.qa,null);assert.equal(calls,1);assert.equal(result.steps.length,1);assert.equal(result.steps[0].agentId,agentId);
  assert.equal(result.calls[0].stage,'conversation');assert.equal(result.calls[0].usage.billingType,'subscription_included');assert.equal(result.archive.status,'synced');
  const issue=[...issues.values()][0];assert.equal(issue.assigneeAgentId,agentId);assert.ok(issue.description.includes('owner conversation'));assert.ok(issue.description.includes('Use only approved product facts'));
  assert.deepEqual(await listJobs(directory),[]);assert.equal((await listJobs(directory,{kind:'conversation',agentId})).length,1);
  assert.equal((await listJobs(directory,{kind:'conversation',agentId:randomUUID()})).length,0);
  const manifest=JSON.parse(await readFile(join(storage.recordsRoot,'tasks',id,'manifest.json'),'utf8'));assert.equal(manifest.kind,'conversation');assert.equal(manifest.targetAgentId,agentId);
  await assert.rejects(reviewJob(id,'',directory),/complete/);
  assert.equal((await createJob(input,directory)).created,false);await executeJob(id,{roles:[]},{api,directory});assert.equal(calls,1);
  await assert.rejects(createJob({...input,targetAgentId:randomUUID()},directory),/different agent/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('unknown, paused and unverified subscription targets fail before model calls',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'office-chat-block-'));
 try{for(const type of ['unknown','paused','api']){
  const target=randomUUID(),job=await createJob({id:randomUUID(),kind:'conversation',targetAgentId:target,brief:'Explain your missing connections.',context:'',criteria:['Answer.']},directory);
  let calls=0;const api=async(path)=>{if(path.endsWith('/agents'))return type==='unknown'?[]:[{id:target,name:'Copy',status:type==='paused'?'paused':'idle',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:type==='api'?'api':'subscription_only'},adapterConfig:{model:'sonnet'}}];calls++;throw new Error('Model must not run');};
  const result=await executeJob(job.job.id,{paperclipCompanyId:'fixture',roles:[{id:'copy'}]},{api,directory});assert.equal(result.status,'failed');assert.equal(calls,0);
 }}finally{await rm(directory,{recursive:true,force:true});}
});

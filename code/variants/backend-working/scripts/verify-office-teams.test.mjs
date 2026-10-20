import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { departmentReports, validatePlan, validateQa, runDependencies, createJob, executeJob, reviewJob, readJob, ownerReviewDisposition } from './lib/office-team-engine.mjs';
import { claimOfficeModelRun, recordOfficeReplyForReview } from './office-subscription-runner.mjs';

test('successful team review returns to its actual creating human without approving the output or inventing an owner',()=>{
 assert.deepEqual(ownerReviewDisposition({companyId:'fixture',createdByUserId:'existing-owner'},'fixture'),{status:'in_review',assigneeAgentId:null,assigneeUserId:'existing-owner'});
 const unknown=ownerReviewDisposition({companyId:'fixture'},'fixture');assert.equal(unknown.status,'blocked');assert.equal(unknown.unblockDescriptor.owner,'board');
 assert.throws(()=>ownerReviewDisposition({companyId:'foreign',createdByUserId:'other-user'},'fixture'),/another company/);
});

test('a returned reply records coordinator review before legacy recovery without approving QA or touching another issue',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-reply-disposition-')),id=randomUUID(),run=randomUUID(),agent=randomUUID(),issue=randomUUID();
 const env={PAPERCLIP_COMPANY_ID:'013ec13f-583a-525c-b113-c2651409f3a5',PAPERCLIP_AGENT_ID:agent,PAPERCLIP_RUN_ID:run,JARVIS_OFFICE_JOB_ID:id};
 const job={calls:[{runId:run,agentId:agent,issueId:issue,status:'running'}]},record={id:issue,companyId:env.PAPERCLIP_COMPANY_ID,assigneeAgentId:agent,status:'in_progress',assigneeAdapterOverrides:{adapterConfig:{env:{JARVIS_OFFICE_JOB_ID:id}}}},patches=[];
 const api=async(path,body,method)=>{assert.equal(path,'/issues/'+issue);if(method==='PATCH'){patches.push(body);record.status=body.status;}return record;};
 try{
  await writeFile(join(directory,id+'.json'),JSON.stringify(job));
  await assert.rejects(recordOfficeReplyForReview(env,{directory,api}),/ENOENT/);
  await claimOfficeModelRun('claude',['--print'],env,{directory,waitMs:0});
  await recordOfficeReplyForReview(env,{directory,api});assert.equal(patches.length,1);assert.equal(patches[0].status,'blocked');assert.equal(patches[0].unblockDescriptor.owner,'board');assert.match(patches[0].unblockDescriptor.action,/coordinator must validate/);
  assert.equal(JSON.parse(await readFile(join(directory,id+'.json'),'utf8')).qa,undefined);
  await recordOfficeReplyForReview(env,{directory,api});assert.equal(patches.length,1);
  record.status='blocked';await recordOfficeReplyForReview(env,{directory,api});assert.equal(patches.length,1);
  record.assigneeAgentId=randomUUID();await assert.rejects(recordOfficeReplyForReview(env,{directory,api}),/binding changed/);
  record.assigneeAgentId=agent;job.calls[0].status='succeeded';await writeFile(join(directory,id+'.json'),JSON.stringify(job));
  await assert.rejects(recordOfficeReplyForReview(env,{directory,api}),/active issued call/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('model grants require a saved exact run receipt and block native recovery/relaunch before model execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-model-grant-'));
  const id=randomUUID(),run=randomUUID(),agent=randomUUID();
  const env={PAPERCLIP_COMPANY_ID:'013ec13f-583a-525c-b113-c2651409f3a5',PAPERCLIP_AGENT_ID:agent,PAPERCLIP_RUN_ID:run,JARVIS_OFFICE_JOB_ID:id};
  try {
    await assert.rejects(claimOfficeModelRun('codex',['exec'],{...env,JARVIS_OFFICE_JOB_ID:undefined},{directory,waitMs:0}),/not issued/);
    await assert.rejects(claimOfficeModelRun('codex',['exec'],env,{directory,waitMs:0}),/No saved/);
    await writeFile(join(directory,`${id}.json`),JSON.stringify({calls:[{runId:run,agentId:agent,status:'queued'}]}));
    await claimOfficeModelRun('codex',['exec'],env,{directory,waitMs:0});
    await assert.rejects(claimOfficeModelRun('codex',['exec'],env,{directory,waitMs:0}),/already consumed/);
    await assert.rejects(claimOfficeModelRun('claude',['--print'],{...env,PAPERCLIP_RUN_ID:randomUUID()},{directory,waitMs:0}),/No saved/);
    await claimOfficeModelRun('claude',['--version'],env,{directory,waitMs:0});
    await writeFile(join(directory,`${id}.stop`),'stopped');
    await assert.rejects(claimOfficeModelRun('codex',['exec'],env,{directory,waitMs:0}),/Owner stopped/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('COO chooses an unrestricted useful team while rejecting duplicate work and invalid dependencies', () => {
  const roles = [{ id: 'copy' }, { id: 'analytics' }];
  const task = { id: 'a', roleId: 'copy', assignment: 'write', dependsOn: [] };
  assert.equal(validatePlan({ summary: 'plan', tasks: [task] }, roles).tasks.length, 1);
  assert.throws(() => validatePlan({ summary: 'plan', tasks: [{ ...task, roleId: 'absent' }] }, roles));
  assert.equal(validatePlan({ summary: 'plan', tasks: [task, { ...task, id: 'b',assignment:'Distinct second part' }] }, roles).tasks.length,2);
  assert.throws(() => validatePlan({ summary: 'plan', tasks: [task, task] }, roles));
  const large=Array.from({length:24},(_,i)=>({...task,id:`part-${i}`,assignment:`Distinct part ${i}`}));
  assert.equal(validatePlan({summary:'Twenty-four distinct useful parts',parallelism:24,parallelismRationale:'Independent parts',tasks:large},roles).tasks.length,24);
  assert.throws(()=>validatePlan({summary:'bad',parallelism:25,tasks:large},roles));
  assert.throws(()=>validatePlan({summary:'bad',parallelism:0,tasks:large},roles));
  assert.throws(() => validatePlan({ summary: 'plan', tasks: [{ ...task, dependsOn: ['b'] }, { ...task, id: 'b', roleId: 'analytics', dependsOn: ['a'] }] }, roles));
});
test('independent tasks overlap within the cap and dependent tasks wait for complete inputs', async () => {
  let active = 0, max = 0; const done = [];
  await runDependencies([{ id: 'a', dependsOn: [] }, { id: 'b', dependsOn: [] }, { id: 'c', dependsOn: ['a','b'] }], 2, async t => {
    if (t.id === 'c') assert.deepEqual(new Set(done), new Set(['a','b']));
    max = Math.max(max, ++active); await new Promise(resolve => setTimeout(resolve, 10)); active--; done.push(t.id);
  });
  assert.equal(max, 2); assert.equal(done[2], 'c');
});
test('a failed specialist stops dependent work and drains already-started workers', async () => {
  const started = [];
  await assert.rejects(runDependencies([{ id: 'a', dependsOn: [] }, { id: 'b', dependsOn: [] }, { id: 'c', dependsOn: ['a'] }], 2, async t => {
    started.push(t.id); if (t.id === 'a') throw new Error('failed'); await new Promise(resolve => setTimeout(resolve, 10));
  }), /failed/);
  assert.deepEqual(started, ['a','b']);
});
test('QA rejects missing, reordered or contradictory evidence', () => {
  assert.throws(() => validateQa({ pass: true, checks: [] }, ['Check']));
  assert.throws(() => validateQa({ pass: true, checks: [{ criterion: 'Other', pass: true, evidence: 'Present' }] }, ['Check']));
  assert.throws(() => validateQa({ pass: true, checks: [{ criterion: 'Check', pass: false, evidence: 'Absent' }] }, ['Check']));
});
test('durable complete team stores real-stage evidence, blocks premature review and replays submission without execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-paperclip-test-'));
  try {
    const request = { id: randomUUID(), brief: 'Write an onboarding plan with a content checklist.', context: 'Fictional test only', criteria: ['Include a checklist'], concurrency: 2 };
    const first = await createJob(request, directory);
    assert.equal((await createJob(request, directory)).created, false);
    await assert.rejects(createJob({ ...request, brief: 'Different owner task brief.' }, directory), /different task/);
    await assert.rejects(reviewJob(request.id, '', directory), /complete/);
    const roles = [{ id: 'copy', name: 'Copy', model: 'sonnet' }, { id: 'analytics', name: 'Analyst', model: 'codex' }, { id: 'test', name: 'QA', model: 'codex' }];
    const agents = ['coo','cmo', ...roles.map(r => r.id)].map(role => ({ id: role, status: 'idle', metadata: { jarvisBlueprintRoleId: role, modelBilling: 'subscription_only' }, adapterType: role === 'copy' ? 'claude_local' : 'codex_local', adapterConfig: { model: role === 'copy' ? 'sonnet' : 'codex' } }));
    const issues = new Map(), runs = new Map(); let calls = 0; const paused=[];const teamSize=12;
    const api = async (path, body, method) => {
      if (path.endsWith('/agents')) {
        if(!body)return agents;
        const helper={...body,id:randomUUID(),status:'idle'};agents.push(helper);return helper;
      }
      if (path.endsWith('/issues')) { const issue = { ...body, id: randomUUID() }; issues.set(issue.id, issue); return issue; }
      if (path.endsWith('/heartbeat/invoke')) {
        calls++; const issue = issues.get(body.payload.issueId); const runId = randomUUID(); let output = 'Finished checklist: confirm inputs, draft, independently check, owner review.';
        if (issue.title.startsWith('COO ·')) output = JSON.stringify({summary:'Twelve distinct copy parts',parallelism:teamSize,parallelismRationale:'Each part has a different deliverable',tasks:Array.from({length:teamSize},(_,i)=>({id:`copy-${i}`,roleId:'copy',assignment:`Distinct checklist part ${i}`,dependsOn:[]}))});
        if (issue.title.startsWith('Independent QA')) output = JSON.stringify({ pass: true, checks: [{ criterion: request.criteria[0], pass: true, evidence: 'Checklist is present' }], note: 'Fixture only' });
        runs.set(runId, { id: runId, status: 'succeeded', resultJson: { summary: output }, usageJson: { billingType: 'subscription_included', inputTokens: 12, outputTokens: 20 } });
        return { id: runId, status: 'queued' };
      }
      if (path.startsWith('/heartbeat-runs/')) return runs.get(path.split('/')[2]);
      if (method === 'PATCH') {if(path.startsWith('/agents/')&&body.status==='paused')paused.push(path.split('/')[2]);return body;}
      throw new Error(`Unexpected API path: ${path}`);
    };
    const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'OfficeSSD')};
    const methodRoot=join(storage.recordsRoot,'library/skills/protocol');await mkdir(join(methodRoot,'roles'),{recursive:true});
    await writeFile(join(methodRoot,'SKILL.md'),'FIXTURE-SCOPED-PROTOCOL');
    for(const roleId of ['coo','cmo','copy','test'])await writeFile(join(methodRoot,'roles',roleId+'.md'),`FIXTURE-ROLE-${roleId}`);
    const skillLibrary=[{id:'protocol',repo:'fixture',ref:'fixture',license:'Internal',kind:'protocol',roleReferences:true,roles:['coo','cmo','copy','test']}];
    const result = await executeJob(first.job.id, { paperclipCompanyId: 'company', roles, focusDepartments:[{id:'marketing',name:'Marketing',roles:['copy','analytics'],headRoleId:'cmo'}], storage,skillLibrary }, { api, directory, pollMs: 1, modelPolicy:()=>true });
    assert.equal(result.archive.status,'synced');
    assert.ok([...issues.values()].every(i=>i.assigneeAdapterOverrides.adapterConfig.cwd.startsWith(storage.recordsRoot)));
    assert.ok([...issues.values()].filter(i=>i.title.startsWith('Copy')).every(i=>i.description.includes('Scoped task input')));
    assert.equal(result.status, 'needs_review'); assert.equal(result.calls.length,teamSize+4);assert.equal(calls,teamSize+4);assert.equal(result.concurrency,teamSize);
    for(const call of result.calls){
      assert.equal(call.skills.length,1);assert.deepEqual(call.skills[0].references,[`roles/${call.roleId}.md`]);
      const prompt=issues.get(call.issueId).description;assert.equal(prompt.split('FIXTURE-SCOPED-PROTOCOL').length-1,1);assert.match(prompt,new RegExp(`FIXTURE-ROLE-${call.roleId}`));
      for(const other of ['coo','cmo','copy','test'].filter(r=>r!==call.roleId))assert.ok(!prompt.includes(`FIXTURE-ROLE-${other}`));
    }
    assert.equal(result.departmentReports.length,1);assert.equal(result.departmentReports[0].roleId,'cmo');assert.equal(result.departmentReports[0].stepIds.length,teamSize);assert.equal(result.departmentReports[0].status,'completed');
    const departmentCall=result.calls.find(c=>c.stage==='department:marketing');assert.ok(departmentCall.runId);assert.deepEqual(departmentCall.tools,[]);
    assert.ok([...issues.values()].find(i=>i.title.startsWith('COO synthesis')).description.includes('Department-head reports:'));
    const manifest=JSON.parse(await readFile(join(result.archive.taskPath,'manifest.json'),'utf8'));assert.ok(manifest.departmentReports[0].artifact.sha256);
    assert.ok(result.steps.every(s => s.issueId && s.status === 'completed' && s.output));
    assert.notEqual(result.steps[0].agentId,result.steps[1].agentId);
    assert.equal(result.steps[1].spawnedFromAgentId,'copy');
    assert.equal(paused.length,teamSize-1);assert.equal(new Set(result.steps.map(s=>s.agentId)).size,teamSize);
    assert.equal((await readJob(request.id, directory)).output, result.output);
    assert.equal((await createJob(request,directory)).created,false);
    await executeJob(request.id, { paperclipCompanyId: 'company', roles }, { api, directory }); assert.equal(calls,teamSize+4);
    assert.equal((await reviewJob(request.id, 'Inspected fixture', directory)).status, 'reviewed');
    const saved = await readFile(join(directory, request.id + '.json'), 'utf8'); assert.ok(!saved.includes('API_KEY'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('twenty-four independent workers overlap without a fixed four-worker ceiling',async()=>{
 let active=0,peak=0;
 const tasks=Array.from({length:24},(_,i)=>({id:`part-${i}`,dependsOn:[]}));
 await runDependencies(tasks,24,async()=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,15));active--;});
 assert.equal(peak,24);
});

test('department grouping covers each part once, reuses configured heads and keeps support with its executive',()=>{
 const plan={roles:[{id:'copy',department:'Content',reportsTo:'cmo'},{id:'creative-director',department:'Creative',reportsTo:'cmo'},{id:'implementation',department:'Product & Engineering',reportsTo:'cto'}],focusDepartments:[{id:'marketing',name:'Marketing',roles:['copy'],headRoleId:'cmo'},{id:'design',name:'Graphic Design',roles:['creative-director'],headRoleId:'creative-director'}]};
 const reports=departmentReports([{id:'copy-a',roleId:'copy'},{id:'copy-b',roleId:'copy'},{id:'design',roleId:'creative-director'},{id:'support',roleId:'implementation'}],plan);
 assert.deepEqual(reports.map(r=>[r.departmentId,r.roleId,r.stepIds]),[['marketing','cmo',['copy-a','copy-b']],['design','creative-director',['design']],['product-engineering','cto',['support']]]);
});

async function reportFixture(mode,check){
 const directory=await mkdtemp(join(tmpdir(),'office-head-report-'));
 try{
  const input={id:randomUUID(),brief:'Combine supplied fictional copy and design evidence.',context:'Fixture only.',criteria:['Cover both parts']};
  await createJob(input,directory);
  const roles=[{id:'copy',name:'Copy',model:'fixture'},{id:'design-system',name:'Designer',model:'fixture'},{id:'test',name:'QA',model:'fixture'}];
  const agents=['coo','cmo','creative-director',...roles.map(r=>r.id)].filter(r=>mode!=='missing-head'||r!=='creative-director').map(role=>({id:role,name:role,status:mode==='running-snapshot'?'running':mode==='paused-snapshot'?'paused':'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}}));
  const issues=new Map(),runs=new Map(),stages=[];
  const api=async(path,body,method)=>{
   if(path.endsWith('/agents'))return agents;
   if(path.endsWith('/issues')){const issue={...body,id:randomUUID(),...(mode==='handoff-lost'?{createdByUserId:'fixture-owner'}:{})};issues.set(issue.id,issue);return issue;}
   if(path.endsWith('/heartbeat/invoke')){
    const issue=issues.get(body.payload.issueId),runId=randomUUID();stages.push(issue.title);
    const report=issue.title.includes('head report');
    if(report){
     const saved=await readJob(input.id,directory);assert.equal(saved.status,'reporting');assert.ok(saved.steps.every(s=>s.status==='completed'&&s.output));
     const isMarketing=issue.title.startsWith('Marketing');
     const scoped=JSON.parse(issue.description.split('Department results: ')[1].split('\n')[0]);
     assert.deepEqual(scoped.map(s=>s.id),[isMarketing?'copy-part':'design-part']);
     if(mode==='stop')await writeFile(join(directory,input.id+'.stop'),'Fixture owner stop');
    }
    const output=issue.title.startsWith('COO ·')?JSON.stringify({summary:'Two independent departments',parallelism:2,parallelismRationale:'Independent supplied evidence',tasks:[{id:'copy-part',roleId:'copy',assignment:'Write copy from evidence',dependsOn:[]},{id:'design-part',roleId:'design-system',assignment:'Define layout from evidence',dependsOn:[]}]}):issue.title.startsWith('Independent QA')?JSON.stringify({pass:true,checks:[{criterion:input.criteria[0],pass:true,evidence:'Both supplied parts covered'}]}):report?'Fixture department summary':'Fixture completed evidence';
    runs.set(runId,{id:runId,status:report&&mode==='head-fails'?'failed':'succeeded',error:'Fixture summary failure',usageJson:{billingType:'subscription_included'},resultJson:{summary:output}});
    return {id:runId,status:'queued'};
   }
   if(path.endsWith('/cancel')){const r=runs.get(path.split('/')[2]);r.status='cancelled';return r;}
   if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
   if(method==='PATCH'){if(mode==='handoff-lost'&&body.status==='in_review')throw new Error('Fixture lost final acknowledgement');return body;}
   throw new Error('Unexpected fixture route');
  };
  const plan={paperclipCompanyId:'fixture',roles,focusDepartments:[{id:'marketing',name:'Marketing',roles:['copy'],headRoleId:'cmo'},{id:'design',name:'Graphic Design',roles:['design-system'],headRoleId:'creative-director'}]};
  const result=await executeJob(input.id,plan,{api,directory,pollMs:1,modelPolicy:()=>true});
  await check({result,stages,issues,input,directory});
 }finally{await rm(directory,{recursive:true,force:true});}
}
test('two department heads receive only their own completed parts; COO and QA receive the saved reports',async()=>reportFixture('success',async({result,stages,issues,input,directory})=>{
 assert.equal(result.status,'needs_review');assert.equal(result.version,3);assert.equal(result.departmentReports.length,2);
 assert.deepEqual(result.calls.filter(c=>c.stage.startsWith('department:')).map(c=>c.roleId),['cmo','creative-director']);
 assert.ok(stages.findIndex(s=>s.startsWith('Marketing head report · '+input.brief))<stages.findIndex(s=>s.startsWith('COO synthesis · '+input.brief)));
 const synthesis=[...issues.values()].find(i=>i.title.startsWith('COO synthesis')).description;
 assert.ok(synthesis.includes('Department-head reports:'));assert.ok(synthesis.includes('Fixture department summary'));
 assert.ok([...issues.values()].find(i=>i.title.startsWith('Independent QA')).description.includes('Department coverage:'));
 result.departmentReports[1].output=null;await writeFile(join(directory,input.id+'.json'),JSON.stringify(result));
 await assert.rejects(reviewJob(input.id,'',directory),/complete/);
 result.version=2;delete result.departmentReports;await writeFile(join(directory,input.id+'.json'),JSON.stringify(result));
 assert.equal((await reviewJob(input.id,'Preserved legacy fixture',directory)).status,'reviewed');
}));
test('missing department leader fails before specialist execution',async()=>reportFixture('missing-head',async({result,stages})=>{
 assert.equal(result.status,'failed');assert.match(result.error,/head must be connected/);assert.equal(stages.length,1);
}));
test('failed head report preserves specialist outputs and blocks COO assembly and QA',async()=>reportFixture('head-fails',async({result,stages,input,directory})=>{
 assert.equal(result.status,'failed');assert.ok(result.steps.every(s=>s.output));assert.equal(result.departmentReports[0].status,'failed');assert.equal(result.departmentReports[1].status,'cancelled');assert.equal(result.output,null);
 assert.ok(!stages.some(s=>s.startsWith('COO synthesis')||s.startsWith('Independent QA')));
 await assert.rejects(reviewJob(input.id,'',directory),/complete/);
}));
test('owner stop during department reporting cancels its run and starts no later head or synthesis',async()=>reportFixture('stop',async({result,stages})=>{
 assert.equal(result.status,'cancelled');assert.equal(result.departmentReports[0].status,'cancelled');assert.equal(result.departmentReports[1].status,'cancelled');assert.equal(result.output,null);
 assert.equal(stages.filter(s=>s.includes('head report')).length,1);assert.ok(!stages.some(s=>s.startsWith('COO synthesis')));
}));

test('a running snapshot can queue an acknowledged stage; paused agents still block',async()=>{
 await reportFixture('running-snapshot',async({result})=>assert.equal(result.status,'needs_review'));
 await reportFixture('paused-snapshot',async({result,stages})=>{assert.equal(result.status,'failed');assert.equal(stages.length,0);});
});


test('lost final board acknowledgement preserves QA-passed output for reconciliation without compensating writes or reruns',async()=>reportFixture('handoff-lost',async({result})=>{assert.equal(result.status,'recovery_required');assert.equal(result.qa.pass,true);assert.ok(result.output);assert.equal(result.deliveryHandoff.state,'pending');assert.ok(result.calls.every(c=>c.status==='succeeded'));assert.match(result.error,/handoff is unconfirmed/);}));

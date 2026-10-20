import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID,createHash} from 'node:crypto';
import {buildClientTeam} from '../src/lib/office-client-team.mjs';
import {initialiseFoundations,readFoundation,updateFoundation,buildTaskContext,persistTaskContext} from './lib/office-foundations.mjs';
import {createJob,executeJob,reviewJob,prepareDepartmentRevision,prepareDepartmentEvidenceReview,prepareFinalRevision,recoverDepartmentQa} from './lib/office-team-engine.mjs';
async function run(t,{qaPass=true,assignedRole='copy',parallelism=1,changeAfter=0,agency=false,finalQaPass=true,envelope=false,invalidEnvelope=false,specialistId=null,runtimeAllocation=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'client-office-execution-'));t.after(()=>rm(directory,{recursive:true,force:true}));const id=randomUUID(),clientId=randomUUID(),storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};
 await initialiseFoundations(storage,[{id:'fixture-client',title:'Fictional client',scope:{kind:'client',id:'fixture-client',clientId},fields:Object.fromEntries(['positioning','facts','voice','visual','production','restrictions'].map(k=>[k,'Fixture source'])),gaps:[]}]);let foundation=await readFoundation(storage,'fixture-client');foundation=await updateFoundation(storage,{id:foundation.id,expectedRevision:foundation.revision,action:'approve',note:'Isolated fixture approval only'});
 const team=buildClientTeam(['social'],1);if(runtimeAllocation){const ids=[...new Set([...team.roleIds,...[...team.departments,...team.sharedDepartments].flatMap(d=>[d.headRoleId,d.qaRoleId]),'test','coo'])];team.runtime={roleAgents:Object.fromEntries(ids.map(id=>[id,id])),departments:Object.fromEntries([...team.departments,...team.sharedDepartments].map(d=>[d.id,{headAgentId:d.headRoleId,qaAgentId:d.qaRoleId}])),agentIds:ids,privateOperationalMarker:'PRIVATE_COORDINATOR_ONLY'};}const bundle=await buildTaskContext(storage,{foundationId:foundation.id,taskType:'caption',mode:'approved'},{clientBrain:{officeTeam:team,officeTeamRevision:'fixture-revision'}}),receipt=await persistTaskContext(storage,id,bundle);
 const request={id,brief:'Write one complete fictional caption from supplied facts.',context:'Synthetic evaluation only',criteria:['Return a complete caption'],contextRequest:{foundationId:foundation.id,taskType:'caption',mode:'approved'}};await createJob(request,directory,{knowledgeContext:agency?undefined:receipt,specialistArtifacts:envelope});
 const roleIds=[...new Set([...team.roleIds,...[...team.departments,...team.sharedDepartments].flatMap(d=>[d.headRoleId,d.qaRoleId]),'test','coo'])],roles=roleIds.filter(r=>r!=='coo'&&r!=='cmo').map(id=>({id,name:id,model:'fixture',rosterStatus:'active',output:'Fixture text'})),agents=roleIds.map(id=>({id,metadata:{jarvisBlueprintRoleId:id,modelBilling:'subscription_only'},status:'idle',adapterType:'codex_local',adapterConfig:{model:'fixture'}}));
 if(runtimeAllocation)for(const a of agents)a.metadata.jarvisClientId=clientId;
 const path=join(storage.recordsRoot,'library/skills/protocol');await mkdir(join(path,'roles'),{recursive:true});await writeFile(join(path,'SKILL.md'),'Fixture protocol');for(const role of roleIds)await writeFile(join(path,'roles',role+'.md'),'Only '+role+' fixture method');
 const plan={paperclipCompanyId:'fixture-company',roles,executives:[],departmentQaEnabled:agency,focusDepartments:team.departments,supportDepartments:team.sharedDepartments,storage,skillLibrary:[{id:'protocol',repo:'fixture',ref:'fixture',license:'Fixture',kind:'protocol',roleReferences:true,roles:roleIds}]};
 const issues=new Map(),runs=new Map();const api=async(path,body,method)=>{if(path.endsWith('/agents')&&!body)return agents;if(path.endsWith('/issues')){const issue={...body,id:randomUUID()};issues.set(issue.id,issue);return issue;}if(path.endsWith('/heartbeat/invoke')){const issue=issues.get(body.payload.issueId);let output='Completed fictional caption.';if(issue.title.startsWith('COO ·'))output=JSON.stringify({summary:'Scoped team',parallelism,parallelismRationale:'Confirmed client capacity',tasks:Array.from({length:parallelism},(_,n)=>({id:specialistId??'part-'+n,roleId:assignedRole,assignment:'Distinct fictional caption '+n,dependsOn:[]}))});if(issue.description.includes('Criteria: [')){const criteria=JSON.parse(issue.description.match(/Criteria: (\[[^\n]+\])\. Client task:/)[1]);output=JSON.stringify({pass:qaPass,checks:criteria.map(criterion=>({criterion,pass:qaPass,evidence:qaPass?'Fixture meets criterion':'Fixture fails brand criterion'})),note:'Mock department review'});}if(issue.title.startsWith('Independent QA'))output=JSON.stringify({pass:finalQaPass,checks:request.criteria.map(criterion=>({criterion,pass:finalQaPass,evidence:'Fixture complete'})),note:'Mock final review'});if(envelope&&issue.description.includes('Response transport:'))output=invalidEnvelope?'Legacy plain text must not auto-pass.':JSON.stringify({artifact:output,internalNotes:'OPTIONAL INTERNAL SELF CHECK, NOT CLIENT COPY'});const runId=randomUUID();runs.set(runId,{id:runId,status:'succeeded',resultJson:{summary:output},usageJson:{billingType:'subscription_included'}});return{id:runId,status:'queued'};}if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);if(method==='PATCH')return body;throw new Error('Unexpected mock path '+path);};
 let reads=0;const result=await executeJob(id,plan,{directory,api,pollMs:1,modelPolicy:()=>true,clientStateReader:async()=>({id:clientId,clientId,status:'ready',brandConfirmed:true,team,revision:changeAfter&&++reads>=changeAfter?'changed':'fixture-revision'})});return{result,directory,issues,plan,approveQa:()=>{qaPass=true;},approveFinalQa:()=>{finalQaPass=true;},resume:()=>executeJob(id,plan,{directory,api,pollMs:1,modelPolicy:()=>true,clientStateReader:async()=>({id:clientId,clientId,status:'ready',brandConfirmed:true,team,revision:'fixture-revision'})})};
}
test('client work requires department QA before the head, COO and final QA',async t=>{const {result,directory}=await run(t);assert.equal(result.status,'needs_review');assert.equal(result.version,4);assert.deepEqual(result.calls.map(c=>c.stage),['planning','specialist:part-0','department-qa:social','department:social','synthesis','qa']);assert.equal(result.departmentReports[0].qa.result.pass,true);assert.equal(result.departmentReports[0].qa.roleId,'social-qa');assert.equal(result.steps[0].roleId,'copy');result.departmentReports[0].qa.result.pass=false;await writeFile(join(directory,result.id+'.json'),JSON.stringify(result));await assert.rejects(reviewJob(result.id,'Review',directory),/complete/);});
test('department QA failure preserves evidence and blocks head/synthesis without reruns',async t=>{const {result}=await run(t,{qaPass:false});assert.equal(result.status,'failed');assert.equal(result.departmentReports[0].qa.status,'failed');assert.ok(!result.calls.some(c=>c.stage==='department:social'||c.stage==='synthesis'));assert.ok(result.departmentReports[0].qa.result.checks.every(c=>!c.pass));});
test('unpaid services and excess client concurrency are rejected after planning',async t=>{for(const options of [{assignedRole:'bookkeeping'},{parallelism:2}]){const {result}=await run(t,options);assert.equal(result.status,'failed');assert.deepEqual(result.calls.map(c=>c.stage),['planning']);assert.equal(result.steps.length,0);}});
test('changed client setup stops the next model stage and releases the execution lock',async t=>{const {result,directory}=await run(t,{changeAfter:4});assert.equal(result.status,'failed');assert.match(result.error,/client team or onboarding changed/);assert.ok(!result.calls.some(c=>c.stage.startsWith('department-qa')));await assert.rejects(readFile(join(directory,'active-team.lock')),e=>e.code==='ENOENT');});

test('agency teams use the department gate even without client-specific context',async t=>{const {result}=await run(t,{agency:true});assert.equal(result.status,'needs_review');assert.equal(result.version,4);assert.deepEqual(result.calls.map(c=>c.stage),['planning','specialist:part-0','department-qa:social','department:social','synthesis','qa']);assert.notEqual(result.departmentReports[0].qa.agentId,result.steps[0].agentId);});
test('agency department rejection blocks head and COO assembly',async t=>{const {result}=await run(t,{agency:true,qaPass:false});assert.equal(result.status,'failed');assert.equal(result.departmentReports[0].qa.status,'failed');assert.ok(!result.calls.some(c=>c.stage==='synthesis'));});
test('a client competitor task receives its allocated shared research head and QA',async t=>{const {result}=await run(t,{assignedRole:'competitors'});assert.equal(result.status,'needs_review');assert.equal(result.departmentReports[0].departmentId,'knowledge');assert.equal(result.departmentReports[0].roleId,'knowledge');assert.equal(result.departmentReports[0].qa.roleId,'research-qa');});

test('a grounded department revision preserves evidence and resumes review without replanning or replacing other parts',async t=>{const f=await run(t,{qaPass:false});const old=f.result;await assert.rejects(prepareDepartmentRevision(old.id,{departmentId:'social',note:'Correct the fictional claim.',expectedUpdatedAt:'stale'},f.directory),/exact/);const revised=await prepareDepartmentRevision(old.id,{departmentId:'social',note:'Correct the fictional claim from supplied facts only.',expectedUpdatedAt:old.updatedAt},f.directory);assert.equal(revised.status,'queued');assert.equal(revised.revisionHistory[0].qa.result.pass,false);f.approveQa();const result=await f.resume();assert.equal(result.status,'needs_review');assert.equal(result.calls.filter(c=>c.stage==='planning').length,1);assert.equal(result.calls.filter(c=>c.stage==='specialist:part-0').length,2);assert.equal(result.revisionHistory[0].qa.result.pass,false);assert.equal(result.departmentReports[0].qa.result.pass,true);const titles=[...f.issues.values()].map(i=>i.title);assert.equal(new Set(titles).size,titles.length);assert.ok(titles.some(t=>t.includes('revision-1')));});

test('a small coordinator patch retains original provenance and still requires independent QA',async t=>{const f=await run(t,{qaPass:false}),s=f.result.steps[0],hash=createHash('sha256').update(s.output).digest('hex');await assert.rejects(prepareDepartmentRevision(f.result.id,{departmentId:'social',note:'Exact evidence correction.',expectedUpdatedAt:f.result.updatedAt,corrections:[{partId:s.id,expectedOutputSha256:'wrong',replacements:[{from:'fictional',to:'verified fictional'}]}]},f.directory),/exact/);const job=await prepareDepartmentRevision(f.result.id,{departmentId:'social',note:'Exact fictional evidence correction.',expectedUpdatedAt:f.result.updatedAt,corrections:[{partId:s.id,expectedOutputSha256:hash,replacements:[{from:'fictional',to:'verified fictional'}]}]},f.directory);assert.equal(job.steps[0].requiresRevision,false);assert.equal(job.steps[0].coordinatorCorrection.sourceSha256,hash);assert.match(job.steps[0].output,/Coordinator correction/);f.approveQa();const done=await f.resume();assert.equal(done.status,'needs_review');assert.equal(done.calls.filter(c=>c.stage.startsWith('specialist:')).length,1);assert.equal(done.departmentReports[0].qa.result.pass,true);});

test('revised evidence reaches department QA, head, COO and final QA without replacing original input or waiving checks',async t=>{
 const f=await run(t,{qaPass:false}),note='Supplemental fictional source: the missing appendix is now supplied, dated today.';
 const priorContext=f.result.context,priorCriteria=[...f.result.criteria];
 await prepareDepartmentRevision(f.result.id,{departmentId:'social',note,expectedUpdatedAt:f.result.updatedAt},f.directory);
 f.approveQa();const done=await f.resume();assert.equal(done.status,'needs_review');assert.equal(done.context,priorContext);assert.deepEqual(done.criteria,priorCriteria);
 const revised=[...f.issues.values()].filter(i=>i.title.includes('revision-1'));
 for(const title of ['Social Media QA','Social Media head report','COO synthesis','Independent QA']){
  const issue=revised.find(i=>i.title.startsWith(title));assert.ok(issue,'Missing revised stage '+title);
  assert.ok(issue.description.includes('supplementalRevision'));assert.ok(issue.description.includes(note));
  assert.ok(issue.description.includes(createHash('sha256').update(note).digest('hex')));
  assert.ok(issue.description.includes('not owner approval or an execution grant'));assert.ok(issue.description.includes(priorContext));
 }
});

test('revision invalidates downstream parts but retains an unaffected passed department',async t=>{const directory=await mkdtemp(join(tmpdir(),'office-revision-graph-'));t.after(()=>rm(directory,{recursive:true,force:true}));const id=randomUUID(),job={id,status:'failed',updatedAt:'saved',issueId:'saved-parent',plan:{summary:'Saved graph'},calls:[{stage:'department-qa:design',status:'succeeded',runId:'saved-run'}],steps:[{id:'social',status:'completed',output:'Unchanged social evidence',dependsOn:[]},{id:'design',status:'completed',output:'Rejected design evidence',dependsOn:[]},{id:'content',status:'completed',output:'Dependent evidence',dependsOn:['design']}],departmentReports:[{departmentId:'social',stepIds:['social'],status:'completed',output:'Passed head report',qa:{result:{pass:true},status:'completed'}},{departmentId:'design',stepIds:['design'],status:'failed',qa:{result:{pass:false},status:'failed'}},{departmentId:'content',stepIds:['content'],status:'cancelled',qa:{result:null,status:'queued'}}]};await writeFile(join(directory,id+'.json'),JSON.stringify(job));const next=await prepareDepartmentRevision(id,{departmentId:'design',note:'Correct exact design evidence.',expectedUpdatedAt:'saved'},directory);assert.equal(next.steps[0].output,'Unchanged social evidence');assert.deepEqual(next.steps.filter(s=>s.requiresRevision).map(s=>s.id),['design','content']);assert.equal(next.departmentReports[0].output,'Passed head report');assert.equal(next.departmentReports[0].qa.result.pass,true);assert.equal(next.departmentReports[1].status,'queued');});


test('successive exact corrections preserve one provenance footer without growing the deliverable',async t=>{
 const f=await run(t,{qaPass:false}),first=f.result.steps[0],digest=s=>createHash('sha256').update(s).digest('hex');
 await prepareDepartmentRevision(f.result.id,{departmentId:'social',expectedUpdatedAt:f.result.updatedAt,note:'First fictional correction.',corrections:[{partId:first.id,expectedOutputSha256:digest(first.output),replacements:[{from:'fictional',to:'verified fictional'}]}]},f.directory);
 const rejected=await f.resume();assert.equal(rejected.status,'failed');const part=rejected.steps[0];
 await prepareDepartmentRevision(rejected.id,{departmentId:'social',expectedUpdatedAt:rejected.updatedAt,note:'Second exact correction; prior evidence remains.',corrections:[{partId:part.id,expectedOutputSha256:digest(part.output),replacements:[{from:'verified fictional',to:'corrected fictional'}]}]},f.directory);
 f.approveQa();const done=await f.resume();assert.equal(done.status,'needs_review');assert.equal(done.steps[0].output.split('Coordinator correction:').length-1,1);assert.equal(done.revisionHistory.length,2);assert.equal(done.calls.filter(c=>c.stage.startsWith('specialist:')).length,1);
});


test('department review receives measured whole-artifact length, not a specialist self-reported count',async t=>{
 const f=await run(t);const issue=[...f.issues.values()].find(i=>i.title.startsWith('Social Media QA'));
 const marker='Department parts (computed word counts include headings and provenance; Unicode lexical words; punctuation-only tokens excluded): ';
 const parts=JSON.parse(issue.description.split(marker)[1].split('\n')[0]);assert.equal(parts[0].output,'Completed fictional caption.');assert.equal(parts[0].wordCount,3);
});


test('explicit recovery preserves required failures and a surplus passed advisory check without another model run',async t=>{
 const f=await run(t,{qaPass:false}),job=f.result,report=job.departmentReports[0],base=report.qa.result,call=job.calls.at(-1);
 const extra={criterion:'Additional fictional craft observation',pass:true,evidence:'Preserved advisory evidence, not an acceptance override.'};
 const raw=JSON.stringify({...base,checks:[...base.checks,extra]});job.error='QA evidence is incomplete.';report.qa.result=null;await writeFile(join(f.directory,job.id+'.json'),JSON.stringify(job));
 const api=async path=>{assert.equal(path,'/heartbeat-runs/'+call.runId);return{status:'succeeded',usageJson:{billingType:'subscription_included'},resultJson:{summary:raw}}};
 const restored=await recoverDepartmentQa(job.id,job.updatedAt,f.plan,{directory:f.directory,api});assert.equal(restored.status,'failed');assert.equal(restored.departmentReports[0].qa.result.pass,false);assert.deepEqual(restored.departmentReports[0].qa.result.checks,base.checks);assert.deepEqual(restored.recoveredQa.additionalChecks,[extra]);assert.equal(restored.calls.length,job.calls.length);
});

test('recovery rejects surplus failed or duplicate checks instead of dropping evidence',async t=>{
 for(const extra of [{criterion:'Additional failure',pass:false,evidence:'Must stay blocked'},{criterion:'Every assigned department part is complete and useful.',pass:true,evidence:'Duplicate is ambiguous'}]){
  const f=await run(t,{qaPass:false}),job=f.result,base=job.departmentReports[0].qa.result;job.error='QA evidence is incomplete.';job.departmentReports[0].qa.result=null;await writeFile(join(f.directory,job.id+'.json'),JSON.stringify(job));
  const api=async()=>({status:'succeeded',usageJson:{billingType:'subscription_included'},resultJson:{summary:JSON.stringify({...base,checks:[...base.checks,extra]})}});
  await assert.rejects(recoverDepartmentQa(job.id,job.updatedAt,f.plan,{directory:f.directory,api}),/Additional QA evidence/);
 }
});


test('exact final correction retains failed assembly and reruns only independent QA',async t=>{
 const f=await run(t,{finalQaPass:false}),old=f.result,parts=JSON.stringify(old.steps),reports=JSON.stringify(old.departmentReports);
 assert.equal(old.status,'failed');assert.equal(old.qa.pass,false);
 const correction={partId:'final',expectedOutputSha256:createHash('sha256').update(old.output).digest('hex'),replacements:[{from:'Completed fictional caption.',to:'Corrected fictional caption.'}]};
 await assert.rejects(prepareFinalRevision(old.id,{note:'Small source correction',expectedUpdatedAt:'stale',corrections:[correction]},f.directory),/exact/);
 const queued=await prepareFinalRevision(old.id,{note:'Small source correction',expectedUpdatedAt:old.updatedAt,corrections:[correction]},f.directory);
 assert.equal(queued.qa,null);assert.equal(queued.finalRevisionHistory[0].qa.pass,false);assert.equal(JSON.stringify(queued.steps),parts);assert.equal(JSON.stringify(queued.departmentReports),reports);
 f.approveFinalQa();const done=await f.resume();assert.equal(done.status,'needs_review');assert.equal(done.calls.length,old.calls.length+1);assert.equal(done.calls.at(-1).stage,'qa');assert.equal(done.calls.filter(c=>c.stage==='synthesis').length,1);assert.equal(done.finalRevisionHistory[0].output,old.output);assert.deepEqual(done.criteria,old.criteria);assert.equal(done.finalRevisionHistory[0].qa.pass,false);
});

test('final correction refuses passed or incomplete work and mismatched artifact hashes',async t=>{
 const passed=await run(t);await assert.rejects(prepareFinalRevision(passed.result.id,{note:'No rejection',expectedUpdatedAt:passed.result.updatedAt,corrections:[]},passed.directory),/exact/);
 const f=await run(t,{finalQaPass:false});await assert.rejects(prepareFinalRevision(f.result.id,{note:'Wrong source',expectedUpdatedAt:f.result.updatedAt,corrections:[{partId:'final',expectedOutputSha256:'wrong',replacements:[{from:'Completed',to:'Changed'}]}]},f.directory),/exact/);
 const bad={...f.result,departmentReports:f.result.departmentReports.map(r=>({...r,status:'failed'}))};await writeFile(join(f.directory,bad.id+'.json'),JSON.stringify(bad));await assert.rejects(prepareFinalRevision(bad.id,{note:'Cannot bypass department',expectedUpdatedAt:bad.updatedAt,corrections:[]},f.directory),/exact/);
});

test('every native stage receives the grounding boundary: a planner directive is not evidence of a product feature',async t=>{
 const {issues,result}=await run(t,{agency:true});assert.equal(result.status,'needs_review');
 for(const issue of issues.values()){
  if(issue.title.startsWith('Team ·'))continue;
  assert.ok(issue.description.includes('Planner assignments and head reports define requested work; they are not independent evidence of product behaviour'),issue.title);
  assert.ok(issue.description.includes('even if the planner instructed the specialist to say it'),issue.title);
  assert.ok(issue.description.includes('Do not invent a negative finding to fill a category'),issue.title);
  assert.ok(issue.description.includes('A planner or generic method cannot strengthen the owner brief'),issue.title);
 }
});


test('new specialist transport keeps optional internal notes out of the artifact, counts and head/COO inputs',async t=>{
 const {result,issues}=await run(t,{agency:true,envelope:true});assert.equal(result.status,'needs_review');
 const step=result.steps[0];assert.equal(step.output,'Completed fictional caption.');assert.equal(step.internalNotes,'OPTIONAL INTERNAL SELF CHECK, NOT CLIENT COPY');assert.equal(step.responseReceipt.schemaVersion,1);
 const review=[...issues.values()].find(i=>i.title.startsWith('Social Media QA'));assert.ok(review.description.includes(step.internalNotes));
 for(const issue of [...issues.values()].filter(i=>i.title.startsWith('Social Media head')||i.title.startsWith('COO synthesis')))assert.equal(issue.description.includes(step.internalNotes),false,issue.title);
 assert.equal(result.output.includes(step.internalNotes),false);assert.equal(result.output,step.output);assert.equal(result.assembly.kind,'preserved-single-reviewed-artifact');assert.equal(result.calls.some(c=>c.stage==='synthesis'),false);
});
test('a new envelope task rejects plain text after the acknowledged specialist run and starts no downstream reviews',async t=>{
 const {result}=await run(t,{agency:true,envelope:true,invalidEnvelope:true});assert.equal(result.status,'failed');assert.match(result.error,/exact artifact/);assert.equal(result.steps[0].output,null);assert.deepEqual(result.calls.map(c=>c.stage),['planning','specialist:part-0']);assert.equal(result.calls[1].status,'succeeded');
});


test('hash-bound supplemental evidence reruns independent department QA and reporting without regenerating the artifact',async t=>{
 const f=await run(t,{qaPass:false,envelope:true}),before=f.result,part=before.steps[0],hash=createHash('sha256').update(part.output).digest('hex');
 await assert.rejects(prepareDepartmentEvidenceReview(before.id,{departmentId:'social',note:'Synthetic coordinator fixture observations.',expectedUpdatedAt:before.updatedAt,partHashes:{[part.id]:'wrong'}},f.directory),/exact unchanged/);
 await assert.rejects(prepareDepartmentEvidenceReview(before.id,{departmentId:'social',note:'Synthetic fixture.',expectedUpdatedAt:'stale',partHashes:{[part.id]:hash}},f.directory),/exact saved/);
 const queued=await prepareDepartmentEvidenceReview(before.id,{departmentId:'social',note:'Synthetic coordinator fixture observations; no real browser claim.',expectedUpdatedAt:before.updatedAt,partHashes:{[part.id]:hash}},f.directory);
 assert.equal(queued.steps[0].output,part.output);assert.equal(queued.steps[0].requiresRevision,false);assert.equal(queued.departmentEvidenceHistory[0].priorQa.result.pass,false);f.approveQa();const done=await f.resume();
 assert.equal(done.status,'needs_review');assert.equal(done.calls.filter(c=>c.stage.startsWith('specialist:')).length,1);assert.equal(done.calls.filter(c=>c.stage==='department-qa:social').length,2);assert.deepEqual(done.steps[0].responseReceipt,part.responseReceipt);
});


test('a specialist ID matching a reserved reviewer stage has separate issue identity and receives only its own transport',async t=>{
 const {result,issues}=await run(t,{agency:true,envelope:true,specialistId:'qa'});assert.equal(result.status,'needs_review');
 const specialist=[...issues.values()].find(i=>i.title.startsWith('copy ·'));const review=[...issues.values()].find(i=>i.title.startsWith('Independent QA'));
 assert.notEqual(specialist.idempotencyKey,review.idempotencyKey);assert.ok(specialist.description.includes('Response transport:'));assert.equal(review.description.includes('Response transport:'),false);
});


test('scope correction preserves the original plan/owner criteria and artifact while correcting a planner-only requirement',async t=>{
 const f=await run(t,{qaPass:false,envelope:true}),before=f.result,part=before.steps[0],hash=x=>createHash('sha256').update(x).digest('hex');
 const input={departmentId:'social',note:'Synthetic scope correction to the planner only; not an acceptance or grant.',expectedUpdatedAt:before.updatedAt,partHashes:{[part.id]:hash(part.output)},assignmentCorrections:[{partId:part.id,expectedAssignmentSha256:hash(part.assignment),replacements:[{from:part.assignment,to:'Return the same complete fictional caption, without additional planner-only scope.'}]}]};
 const invalid=structuredClone(input);invalid.assignmentCorrections[0].expectedAssignmentSha256='stale';await assert.rejects(prepareDepartmentEvidenceReview(before.id,invalid,f.directory),/exact current assignment/);
 const queued=await prepareDepartmentEvidenceReview(before.id,input,f.directory);assert.deepEqual(queued.criteria,before.criteria);assert.deepEqual(queued.plan,before.plan);assert.equal(queued.steps[0].output,part.output);assert.equal(queued.steps[0].roleId,part.roleId);assert.deepEqual(queued.steps[0].dependsOn,part.dependsOn);assert.equal(queued.departmentEvidenceHistory[0].assignmentCorrections[0].priorAssignment,part.assignment);
 f.approveQa();const done=await f.resume();assert.equal(done.status,'needs_review');assert.equal(done.output,part.output);assert.equal(done.calls.filter(c=>c.stage.startsWith('specialist:')).length,1);
});


test('a small correction to a structured artifact records provenance without corrupting its requested format with a footer',async t=>{
 const f=await run(t,{qaPass:false,envelope:true}),part=f.result.steps[0],hash=x=>createHash('sha256').update(x).digest('hex');
 await prepareDepartmentRevision(f.result.id,{departmentId:'social',note:'Synthetic exact correction.',expectedUpdatedAt:f.result.updatedAt,corrections:[{partId:part.id,expectedOutputSha256:hash(part.output),replacements:[{from:'fictional',to:'source-backed fictional'}]}]},f.directory);f.approveQa();const done=await f.resume();
 assert.equal(done.status,'needs_review');assert.equal(done.output,'Completed source-backed fictional caption.');assert.equal(done.output.includes('Coordinator correction:'),false);assert.ok(done.steps[0].coordinatorCorrection.sourceSha256);assert.equal(done.assembly.sourceArtifactSha256,hash(done.output));assert.equal(done.calls.some(c=>c.stage==='synthesis'),false);
});


test('native stage prompts exclude runtime control-plane maps while saved scoped folders preserve full dispatch evidence',async t=>{
 const {result,issues,plan}=await run(t,{runtimeAllocation:true});assert.equal(result.status,'needs_review');
 const modelIssues=[...issues.values()].filter(i=>!i.title.startsWith('Team ·'));assert.ok(modelIssues.length>3);
 for(const i of modelIssues){assert.ok(!i.description.includes('PRIVATE_COORDINATOR_ONLY'),i.title);assert.ok(!i.description.includes('roleAgents'),i.title);}
 const call=result.calls.find(c=>c.stage.startsWith('specialist:')),full=JSON.parse(await readFile(join(plan.storage.recordsRoot,call.workspace.relativeRoot,'foundation-and-lessons.json'),'utf8'));
 assert.equal(full.clientBrain.officeTeam.runtime.privateOperationalMarker,'PRIVATE_COORDINATOR_ONLY');assert.deepEqual(full.clientBrain.officeTeam.permissions,buildClientTeam(['social'],1).permissions);assert.equal(full.foundation.fields.facts,'Fixture source');
});

import{test}from'node:test';import assert from'node:assert/strict';
import{readFile,writeFile,mkdir,mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{randomUUID,createHash}from'node:crypto';
import{createJob,executeJob,reviewJob,reportsComplete,prepareDepartmentHeadRevision,prepareDepartmentRevision,prepareDepartmentEvidenceReview,prepareFinalRevision,retryDepartmentQa,recoverDepartmentQa,departmentRawPartsReviewPacket}from'./lib/office-team-engine.mjs';
import{departmentReviewCurrent,departmentPartsReviewCurrent,departmentPackageEvidence,departmentPartsEvidence}from'./lib/office-department-review.mjs';
import{taskProgress}from'../src/lib/office-observations.mjs';
import{cooReleaseReviewCurrent}from'./lib/office-coo-release-review.mjs';
const base=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
async function setup(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'office-package-review-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const storage={testing:true,recordsVolume:dir,recordsRoot:join(dir,'SSD')},ids=['coo','cfo','test','pricing','finance-qa'],root=join(storage.recordsRoot,'library/skills/protocol');await mkdir(join(root,'roles'),{recursive:true});await writeFile(join(root,'SKILL.md'),'# Isolated methodology');for(const id of ids)await writeFile(join(root,'roles',id+'.md'),'# '+id);
 const plan={...base,...(options.disableLegacyQa?{departmentQaEnabled:false}:{}),storage,toolBridge:{enabled:false},roles:base.roles.filter(r=>['pricing','finance-qa'].includes(r.id)),skillLibrary:[{id:'protocol',repo:'fixture',ref:'fixture',kind:'protocol',roleReferences:true,roles:ids}]};
 const id=randomUUID(),input={id,departmentId:'finance',brief:'Prepare one pricing note from supplied evidence.',context:'Purchase status is unknown, not absent. Synthetic isolated fixture.',criteria:['Keeps unsupported purchase status unknown.']};
 const created=await createJob(input,dir,{departmentPackageReview:options.legacy?false:true,specialistArtifacts:options.envelope??false});if(options.historicalPackage){delete created.job.departmentPartsReviewVersion;await writeFile(join(dir,id+'.json'),JSON.stringify(created.job));}
 const agents=ids.map(id=>({id,status:'idle',metadata:{jarvisBlueprintRoleId:id,modelBilling:'subscription_only'},adapterType:'codex_local',adapterConfig:{model:'gpt-5.6-sol'}})),issues=new Map(),runs=new Map(),invocations=[];
 const state={bad:options.bad??false,badParts:options.badParts??false,malformedParts:options.malformedParts??false,malformed:options.malformed??false,extra:options.extra??false,finalQaPass:options.finalQaPass??true};
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents')&&!body)return agents;
  if(path.endsWith('/issues')){const row={...body,id:randomUUID(),companyId:plan.paperclipCompanyId};issues.set(row.id,row);return row;}
  if(path.endsWith('/heartbeat/invoke')){
   const issue=issues.get(body.payload.issueId),role=issue.assigneeAgentId;invocations.push({role,title:issue.title,description:issue.description});let output='Purchase status remains unknown.';
   if(issue.title.startsWith('Finance head ·'))output=JSON.stringify({summary:'One pricing note',parallelism:1,parallelismRationale:'One useful author',tasks:[{id:'price',roleId:'pricing',assignment:'Write one concise note preserving unknown purchase status.',dependsOn:[]}]});
   else if(issue.title.startsWith('Finance head report')){output=state.bad?'Tool candidates remain unpurchased and unallocated.':'Tool purchase and allocation remain unknown.';if(options.stopAfterHead)await writeFile(join(dir,id+'.stop'),'Owner stopped');}
   else if(issue.title.startsWith('COO release review')){output=options.releaseMalformed?'malformed COO verdict':JSON.stringify({pass:options.releasePass!==false,checks:input.criteria.map(criterion=>({criterion,pass:options.releasePass!==false,evidence:'Synthetic COO release evidence for the exact artifact.'})),note:'Owner approval remains pending.'});}
   else if(issue.title.startsWith('Finance QA')||issue.title.startsWith('Finance parts QA')||issue.title.startsWith('Independent QA')){
    const parts=issue.title.startsWith('Finance parts QA'),dept=parts||issue.title.startsWith('Finance QA'),checks=dept?JSON.parse(issue.description.match(/Criteria: (\[.*?\])\. Client task:/)[1]):input.criteria;
    const wrong=!dept?!state.finalQaPass:parts?state.badParts:dept&&issue.description.includes('Head draft (not yet QA-passed')&&issue.description.includes('remain unpurchased');
    output=JSON.stringify({pass:!wrong,checks:checks.map((criterion,i)=>({criterion,pass:!dept||parts?!wrong:i===0||!wrong,evidence:wrong&&(!dept||parts||i>0)?'Synthetic fixture review failure.':'The provided evidence remains accurately scoped.'})),note:'Synthetic review.'});
    if(dept&&!parts&&state.extra){const v=JSON.parse(output);v.checks.push({criterion:'Additional passed advisory.',pass:true,evidence:'Separate observation.'});output=JSON.stringify(v);}
    if(dept&&(parts?state.malformedParts:state.malformed))output='not JSON';
   }else if(role==='pricing'&&options.envelope)output=JSON.stringify({artifact:output,internalNotes:''});
   const runId=randomUUID();runs.set(runId,{id:runId,agentId:role,companyId:plan.paperclipCompanyId,contextSnapshot:{issueId:issue.id},status:'succeeded',resultJson:{summary:output},usageJson:{billingType:'subscription_included',model:'gpt-5.6-sol'}});return{id:runId,status:'queued'};
  }
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(path.startsWith('/issues/')&&!body)return issues.get(path.split('/')[2]);
  if(method==='PATCH'){
   const row=issues.get(path.split('/')[2]);
   if(body.assigneeAgentId===null&&body.status==='backlog'&&options.rejectParentRelease)throw Error('Unacknowledged parent release');
   if(body.status==='done'){assert.equal(body.assigneeAgentId,null,'Completed stages must not queue a status-change wake');if(row?.parentId)assert.equal(issues.get(row.parentId).assigneeAgentId,null,'Child completion must not wake an assigned parent');}
   if(row)Object.assign(row,body);return row??body;
  }throw Error('Unexpected fixture API '+path);
 };
 const run=(modelPolicy=()=>true)=>executeJob(id,plan,{directory:dir,api,pollMs:1,modelPolicy});return{dir,id,input,plan,api,issues,runs,invocations,state,run};
}
test('new review sees raw parts AND saved head before synthesis; old jobs retain their original ordering',async t=>{
 for(const options of [{},{historicalPackage:true},{legacy:true}]){const {legacy=false,historicalPackage=false}=options,f=await setup(t,options),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(reportsComplete(j),true);assert.deepEqual(f.invocations.map(x=>x.role),legacy?['cfo','pricing','finance-qa','cfo','coo','test']:historicalPackage?['cfo','pricing','cfo','finance-qa','coo','test']:['cfo','pricing','finance-qa','cfo','finance-qa','coo','test']);const review=f.invocations.find(x=>x.title.startsWith('Finance QA'));assert.equal(review.description.includes('Head draft (not yet QA-passed'),!legacy);if(!legacy){assert.ok(review.description.includes('Tool purchase and allocation remain unknown.'));assert.deepEqual(j.departmentReports[0].qa.evidence,departmentPackageEvidence(j,j.departmentReports[0]));const m=JSON.parse(await readFile(join(f.plan.storage.recordsRoot,'tasks',f.id,'manifest.json'),'utf8'));assert.equal(m.departmentPackageReviewVersion,1);}}
});
test('new raw-parts QC is distinct from package QC and both gates are durably ordered around the head',async t=>{
 const f=await setup(t),j=await f.run(),r=j.departmentReports[0];assert.equal(j.departmentPartsReviewVersion,1);assert.equal(departmentPartsReviewCurrent(j,r),true);assert.equal(departmentReviewCurrent(j,r),true);
 assert.deepEqual(r.partsQa.evidence,departmentPartsEvidence(j,r));assert.notEqual(r.partsQa.runId,r.qa.runId);assert.notEqual(r.partsQa.issueId,r.qa.issueId);
 const raw=f.issues.get(r.partsQa.issueId),pkg=f.issues.get(r.qa.issueId),head=f.issues.get(r.issueId);assert.notEqual(raw.idempotencyKey,pkg.idempotencyKey);assert.match(raw.idempotencyKey,/department-parts-qa-finance/);assert.match(pkg.idempotencyKey,/department-qa-finance/);assert.match(head.description,/rawParts/);
 const order=j.calls.map(c=>c.stage);assert.ok(order.indexOf('department-parts-qa:finance')<order.indexOf('department:finance'));assert.ok(order.indexOf('department:finance')<order.indexOf('department-qa:finance'));
 const manifest=JSON.parse(await readFile(join(f.plan.storage.recordsRoot,'tasks',f.id,'manifest.json'),'utf8'));assert.deepEqual(manifest.departmentReports[0].partsQa,r.partsQa);
});
test('actual package-review issue receives the prior verdict and native pins without approving the head or package',async t=>{
 const f=await setup(t),j=await f.run(),r=j.departmentReports[0];assert.equal(j.status,'needs_review',j.error);
 const prompt=f.issues.get(r.qa.issueId).description,match=prompt.match(/Completed independent raw-parts QA [^\n]*: (\{[^\n]*\})\nAssess raw parts/);assert.ok(match,'The actual native review request must carry the completed raw-parts review, not only hash references.');
 const packet=JSON.parse(match[1]);assert.deepEqual(packet.result,r.partsQa.result);assert.equal(packet.result.pass,true);assert.equal(packet.status,'completed');
 for(const key of ['agentId','issueId','runId','rawSha256','resultSha256'])assert.equal(packet[key],r.partsQa[key],key);assert.deepEqual(packet.evidence,departmentPartsEvidence(j,r));
 assert.match(packet.scope,/raw specialist parts only/);assert.match(packet.scope,/does not approve the head, package/);assert.notEqual(packet.runId,r.qa.runId);assert.notEqual(packet.issueId,r.qa.issueId);
 assert.match(f.issues.get(r.issueId).description,/General role or skill methodology is operating guidance, not a task source/);
 packet.result.checks[0].evidence='Caller mutation';assert.notEqual(r.partsQa.result.checks[0].evidence,'Caller mutation');
});
test('missing, stale, dependent or re-signed replacement raw-parts verdict cannot enter a package as passed evidence',async t=>{
 const f=await setup(t),j=await f.run();assert.equal(departmentRawPartsReviewPacket(j,j.departmentReports[0]).result.pass,true);
 const changes=[x=>delete x.departmentReports[0].partsQa,x=>x.departmentReports[0].partsQa.status='running',x=>x.departmentReports[0].partsQa.runId='foreign',x=>x.departmentReports[0].partsQa.agentId=x.departmentReports[0].agentId,x=>x.steps[0].output+=' changed',x=>x.criteria[0]+=' changed',x=>x.departmentReports[0].partsQa.evidence.partsSha256='0'.repeat(64),x=>{const q=x.departmentReports[0].partsQa;q.result.checks[0].evidence='A replacement verdict not returned by the native reviewer.';q.resultSha256=createHash('sha256').update(JSON.stringify(q.result)).digest('hex');}];
 for(const change of changes){const altered=structuredClone(j);change(altered);assert.throws(()=>departmentRawPartsReviewPacket(altered,altered.departmentReports[0]),/raw-parts QC/);}
 const historical=structuredClone(j);delete historical.departmentPartsReviewVersion;assert.equal(departmentRawPartsReviewPacket(historical,historical.departmentReports[0]),null,'Historical tasks must not receive an invented earlier gate.');
});
test('actual planner and specialist requests separate evolving QA metadata while retaining factual unknowns in the artifact',async t=>{
 const f=await setup(t,{envelope:true}),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.output,'Purchase status remains unknown.');assert.equal(j.qa.pass,true);
 const planner=f.invocations.find(i=>i.title.startsWith('Finance head ·')),author=f.invocations.find(i=>i.role==='pricing');
 assert.match(planner.description,/Keep evolving execution, QA and approval status in coordinator status or specialist internalNotes/);
 assert.match(author.description,/evolving execution, QA and approval state there unless the owner explicitly requests it in the artifact/);
 assert.match(author.description,/Never hide a material uncertainty, source condition or required evidence there/);
});
test('independent raw-parts rejection blocks the head and all later gates; explicit correction reruns raw QC first',async t=>{
 const f=await setup(t,{badParts:true}),first=await f.run(),r=first.departmentReports[0];assert.equal(first.status,'failed');assert.equal(r.partsQa.result.pass,false);assert.equal(r.output,null);assert.equal(r.qa.result,null);assert.deepEqual(f.invocations.map(i=>i.role),['cfo','pricing','finance-qa']);
 const patch={partId:'price',expectedOutputSha256:(await import('node:crypto')).createHash('sha256').update(first.steps[0].output).digest('hex'),replacements:[{from:'Purchase status remains unknown.',to:'Purchase and allocation status remain unknown.'}]};
 const queued=await prepareDepartmentRevision(f.id,{departmentId:'finance',expectedUpdatedAt:first.updatedAt,note:'Retain unknown allocation status.',corrections:[patch]},f.dir);assert.equal(queued.departmentReports[0].partsQa.status,'queued');assert.equal(queued.departmentReports[0].partsQaHistory.length,1);f.state.badParts=false;
 const before=f.invocations.length,j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.deepEqual(f.invocations.slice(before).map(i=>i.role),['finance-qa','cfo','finance-qa','coo','test']);assert.equal(departmentPartsReviewCurrent(j,j.departmentReports[0]),true);
});
test('raw-parts receipt cannot survive source, reviewer, verdict, run, criteria or chronology tampering',async t=>{
 const f=await setup(t),j=await f.run();
 for(const change of [x=>delete x.departmentReports[0].partsQa,x=>x.departmentReports[0].qa.rawOutput='unrelated raw output',x=>x.departmentReports[0].qa.result.checks[0].evidence='replaced package evidence',x=>x.departmentReports[0].partsQa.agentId='cfo',x=>x.departmentReports[0].partsQa.evidence.criteriaSha256='changed',x=>x.departmentReports[0].partsQa.result.checks[0].evidence='changed',x=>x.calls.find(c=>c.stage==='specialist:price').status='failed',x=>x.calls.find(c=>c.stage==='department-parts-qa:finance').runId='foreign',x=>x.steps[0].output+=' changed',x=>{const i=x.calls.findIndex(c=>c.stage==='department-parts-qa:finance');x.calls.push(...x.calls.splice(i,1));},x=>{const i=x.calls.findIndex(c=>c.stage==='specialist:price');x.calls.push(...x.calls.splice(i,1));},x=>x.calls.find(c=>c.stage==='department:finance').runId=x.departmentReports[0].partsQa.runId]){const altered=structuredClone(j);change(altered);assert.equal(reportsComplete(altered),false);}
});
test('supplemental evidence invalidates even unchanged raw parts; no previous raw pass is silently retained',async t=>{
 const f=await setup(t,{bad:true}),first=await f.run(),prior=first.departmentReports[0].partsQa.runId;const sha=(await import('node:crypto')).createHash('sha256').update(first.steps[0].output).digest('hex');
 const queued=await prepareDepartmentEvidenceReview(f.id,{departmentId:'finance',expectedUpdatedAt:first.updatedAt,note:'Reassess the same unknown status without inferring purchase absence.',partHashes:{price:sha}},f.dir);assert.equal(queued.departmentReports[0].partsQa.status,'queued');f.state.bad=false;
 const start=f.invocations.length,j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.notEqual(j.departmentReports[0].partsQa.runId,prior);assert.deepEqual(f.invocations.slice(start).map(i=>i.role),['finance-qa','cfo','finance-qa','coo','test']);
});
test('raw QC formatting retry shares the existing one-per-department transport retry allowance',async t=>{
 const f=await setup(t,{malformedParts:true}),first=await f.run();assert.equal(first.status,'failed');assert.equal(first.calls.at(-1).stage,'department-parts-qa:finance');assert.equal(first.departmentReports[0].output,null);
 await retryDepartmentQa(f.id,first.updatedAt,f.plan,{api:f.api,directory:f.dir});f.state.malformedParts=false;f.state.malformed=true;
 const failedPackage=await f.run();assert.equal(failedPackage.status,'failed');assert.equal(failedPackage.departmentReports[0].partsQa.status,'completed');assert.equal(failedPackage.qaTransportHistory.length,1);assert.equal(failedPackage.qaTransportHistory[0].gate,'parts');
 await assert.rejects(retryDepartmentQa(f.id,failedPackage.updatedAt,f.plan,{api:f.api,directory:f.dir}),/retried once/);
});
test('root coordination releases the planner before any child can finish and stops on an unacknowledged release',async t=>{
 const f=await setup(t),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.parentCoordination.issueId,j.issueId);assert.equal(j.parentCoordination.assigneeAgentId,null);assert.equal(f.issues.get(j.issueId).assigneeAgentId,null);
 const rejected=await setup(t,{rejectParentRelease:true}),stopped=await rejected.run();assert.equal(stopped.status,'failed');assert.match(stopped.error,/Unacknowledged parent release/);assert.deepEqual(rejected.invocations.map(i=>i.role),['cfo']);
});
test('a false head claim stops before COO/final review, then explicit head-only correction preserves authors and reviewer history',async t=>{
 const f=await setup(t,{bad:true}),first=await f.run();assert.equal(first.status,'failed');assert.equal(first.departmentReports[0].qa.result.pass,false);assert.ok(!f.invocations.some(x=>x.role==='coo'||x.role==='test'));const author=first.steps[0].output;
 await assert.rejects(prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:'stale',note:'Preserve unknown state.'},f.dir));
 const revised=await prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:first.updatedAt,note:'Preserve unknown purchase and allocation rather than asserting their absence.'},f.dir);assert.equal(revised.steps[0].output,author);assert.equal(revised.headRevisionHistory[0].output,'Tool candidates remain unpurchased and unallocated.');f.state.bad=false;const start=f.invocations.length,j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.steps[0].output,author);assert.deepEqual(f.invocations.slice(start).map(x=>x.role),['cfo','finance-qa','coo','test']);assert.equal(j.departmentReports[0].qa.result.pass,true);
});
test('current review rejects head, author, assignment, scope, reviewer and run tampering; stale acceptance cannot be marked reviewed',async t=>{
 const f=await setup(t),j=await f.run(),r=j.departmentReports[0];assert.equal(departmentReviewCurrent(j,r),true);
 for(const change of[j=>j.departmentReports[0].output+=' Changed',j=>j.steps[0].output+=' Changed',j=>j.steps[0].assignment+=' Changed',j=>j.context+=' Changed',j=>j.departmentReports[0].qa.agentId=j.departmentReports[0].agentId,j=>j.calls.find(c=>c.stage==='department-qa:finance').status='failed']){const changed=structuredClone(j);change(changed);assert.equal(reportsComplete(changed),false);}
 j.departmentReports[0].output+=' Changed';await writeFile(join(f.dir,f.id+'.json'),JSON.stringify(j));await assert.rejects(reviewJob(f.id,'Accept',f.dir),/complete/);
});
test('a single preserved author artifact still requires the full package gate',async t=>{
 const f=await setup(t,{envelope:true}),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.output,j.steps[0].output);assert.equal(j.assembly.kind,'preserved-single-reviewed-artifact');assert.deepEqual(f.invocations.map(x=>x.role),['cfo','pricing','finance-qa','cfo','finance-qa','coo','test']);assert.equal(departmentReviewCurrent(j,j.departmentReports[0]),true);
});
test('new preserved artifact gets actual COO release review without rewriting bytes; historical optimization remains unchanged',async t=>{
 for(const historicalPackage of [false,true]){const f=await setup(t,{envelope:true,historicalPackage}),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.output,j.steps[0].output);assert.equal(j.reviewedAt,null);const releases=j.calls.filter(c=>c.stage==='coo-release');assert.equal(releases.length,historicalPackage?0:1);
  if(!historicalPackage){assert.equal(cooReleaseReviewCurrent(j),true);assert.equal(j.cooReleaseReview.agentId,'coo');assert.equal(j.cooReleaseReview.result.pass,true);assert.match(f.issues.get(j.cooReleaseReview.issueId).description,/Do not rewrite/);const m=JSON.parse(await readFile(join(f.plan.storage.recordsRoot,'tasks',f.id,'manifest.json'),'utf8'));assert.equal(m.calls.find(c=>c.stage==='coo-release').returnedOutput,j.cooReleaseReview.rawOutput);assert.deepEqual(m.cooReleaseReview,j.cooReleaseReview);}
 }
});
test('COO release semantic rejection or malformed verdict blocks final QA and retains original artifact',async t=>{
 for(const options of [{releasePass:false},{releaseMalformed:true}]){const f=await setup(t,{envelope:true,...options}),j=await f.run();assert.equal(j.status,'failed');assert.equal(j.output,j.steps[0].output);assert.equal(j.cooReleaseReview.status,'failed');assert.equal(j.qa,null);assert.ok(!j.calls.some(c=>c.stage==='qa'));assert.equal(j.calls.at(-1).stage,'coo-release');}
});
test('subscription policy can deny COO release without invoking it or final QA',async t=>{
 const f=await setup(t,{envelope:true}),j=await f.run(({stage})=>stage!=='coo-release');assert.equal(j.status,'failed');assert.equal(j.output,j.steps[0].output);assert.equal(j.calls.at(-1).status,'rejected_before_authorization');assert.equal(j.calls.at(-1).stage,'coo-release');assert.ok(!f.invocations.some(i=>i.title.startsWith('COO release review')||i.title.startsWith('Independent QA')));
});
test('COO release receipt binds artifact, department evidence, criteria, result and exact native response',async t=>{
 const f=await setup(t,{envelope:true}),j=await f.run();assert.equal(cooReleaseReviewCurrent(j),true);
 for(const mutate of [x=>x.output+=' changed',x=>x.departmentReports[0].output+=' changed',x=>x.criteria[0]+=' changed',x=>x.cooReleaseReview.rawOutput='replacement',x=>x.cooReleaseReview.result.checks[0].evidence='replacement',x=>x.calls.find(c=>c.stage==='coo-release').returnedOutput='replacement']){const changed=structuredClone(j);mutate(changed);assert.equal(cooReleaseReviewCurrent(changed),false);await writeFile(join(f.dir,f.id+'.json'),JSON.stringify(changed));await assert.rejects(reviewJob(f.id,'Synthetic owner review',f.dir),/complete/);}
});
test('explicit final artifact correction gets fresh COO release review before final QA without repeating department work',async t=>{
 const f=await setup(t,{envelope:true,finalQaPass:false}),first=await f.run();assert.equal(first.status,'failed');assert.equal(first.qa.pass,false);assert.equal(cooReleaseReviewCurrent(first),true);const original=first.output,prior=first.cooReleaseReview.runId,sha=(await import('node:crypto')).createHash('sha256').update(original).digest('hex');
 const queued=await prepareFinalRevision(f.id,{note:'Add an explicit allocation unknown.',expectedUpdatedAt:first.updatedAt,corrections:[{partId:'final',expectedOutputSha256:sha,replacements:[{from:'Purchase status remains unknown.',to:'Purchase and allocation status remain unknown.'}]}]},f.dir);assert.equal(cooReleaseReviewCurrent(queued),false);f.state.finalQaPass=true;
 const count=f.invocations.length,j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.notEqual(j.cooReleaseReview.runId,prior);assert.equal(j.cooReleaseReviewHistory[0].runId,prior);assert.equal(j.output,queued.output);assert.equal(j.steps[0].output,original);assert.deepEqual(f.invocations.slice(count).map(i=>i.role),['coo','test']);assert.equal(cooReleaseReviewCurrent(j),true);
});
test('owner stop between head and QA starts no reviewer, and head-only revision respects stop and two-attempt limits',async t=>{
 const stopped=await setup(t,{stopAfterHead:true}),s=await stopped.run();assert.equal(s.status,'cancelled');assert.equal(stopped.invocations.filter(x=>x.role==='finance-qa').length,1);assert.ok(!stopped.invocations.some(x=>x.title.startsWith('Finance QA')));
 const f=await setup(t,{bad:true});let j=await f.run();await writeFile(join(f.dir,f.id+'.stop'),'Owner stopped');await assert.rejects(prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:j.updatedAt,note:'Fix.'},f.dir),/owner stopped/);await rm(join(f.dir,f.id+'.stop'));
 for(let n=0;n<2;n++){await prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:j.updatedAt,note:'Preserve unknown.'},f.dir);j=await f.run();assert.equal(j.status,'failed');}
 await assert.rejects(prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:j.updatedAt,note:'Again.'},f.dir),/two attempts/);
});
test('read-only terminal protocol retry preserves the original head and author, and cannot repeat',async t=>{
 const f=await setup(t,{malformed:true}),j=await f.run();assert.equal(j.status,'failed');const head=j.departmentReports[0].output,author=j.steps[0].output,start=f.invocations.length;
 await retryDepartmentQa(f.id,j.updatedAt,f.plan,{api:f.api,directory:f.dir});f.state.malformed=false;const done=await f.run();assert.equal(done.status,'needs_review',done.error);assert.equal(done.departmentReports[0].output,head);assert.equal(done.steps[0].output,author);assert.deepEqual(f.invocations.slice(start).map(x=>x.role),['finance-qa','coo','test']);await assert.rejects(retryDepartmentQa(f.id,done.updatedAt,f.plan,{api:f.api,directory:f.dir}));
});
test('exact saved surplus-pass framing recovery continues explicitly without a second head or reviewer run',async t=>{
 const f=await setup(t,{extra:true}),j=await f.run();assert.equal(j.status,'failed');const recovered=await recoverDepartmentQa(f.id,j.updatedAt,f.plan,{api:f.api,directory:f.dir});assert.equal(departmentReviewCurrent(recovered,recovered.departmentReports[0]),true);const count=f.invocations.length;
 await prepareDepartmentHeadRevision(f.id,{departmentId:'finance',expectedUpdatedAt:recovered.updatedAt,continueOnly:true},f.dir);const done=await f.run();assert.equal(done.status,'needs_review',done.error);assert.deepEqual(f.invocations.slice(count).map(x=>x.role),['coo','test']);assert.ok(done.recoveredQa.continuedAt);
});
test('new package framing recovery rejects changed native reread under the same run identity',async t=>{
 const f=await setup(t,{extra:true}),j=await f.run(),call=j.calls.at(-1),run=f.runs.get(call.runId),old=run.resultJson.summary;assert.equal(j.status,'failed');const changed=JSON.parse(old);changed.checks[0].evidence='Replacement native reread evidence';run.resultJson.summary=JSON.stringify(changed);
 await assert.rejects(recoverDepartmentQa(f.id,j.updatedAt,f.plan,{api:f.api,directory:f.dir}),/reread native QA response changed/);
 run.resultJson.summary=old;const recovered=await recoverDepartmentQa(f.id,j.updatedAt,f.plan,{api:f.api,directory:f.dir});assert.equal(departmentReviewCurrent(recovered,recovered.departmentReports[0]),true);assert.equal(recovered.departmentReports[0].qa.rawOutput,old);
});
test('new saved head drafts count as a milestone before their QA pass, not as completed quality',async t=>{
 const f=await setup(t,{bad:true}),j=await f.run(),p=taskProgress(j);assert.equal(p.done,3);assert.equal(reportsComplete(j),false);assert.equal(j.qa,null);assert.equal(j.reviewedAt,null);
});

test('a coordinator model-budget refusal starts no denied model and is a known failure, not an uncertain replay',async t=>{
 const f=await setup(t),j=await f.run(({stage})=>stage!=='synthesis');assert.equal(j.status,'failed');assert.match(j.error,/safety policy refused/);assert.ok(!f.invocations.some(c=>c.role==='coo'||c.role==='test'));assert.ok(j.calls.slice(0,-1).every(c=>c.status==='succeeded'));assert.equal(j.calls.at(-1).stage,'synthesis');assert.equal(j.calls.at(-1).status,'rejected_before_authorization');assert.equal(j.calls.at(-1).runId,null);
});

test('unacknowledged board delivery keeps its cause and handoff receipt in the SSD archive',async t=>{
 const f=await setup(t);let failed=false;const api=async(path,body,method)=>{if(!failed&&method==='PATCH'&&body?.status==='in_review'){failed=true;throw Error('Controlled board acknowledgement failure');}return f.api(path,body,method);};
 const j=await executeJob(f.id,f.plan,{directory:f.dir,api,pollMs:1,modelPolicy:()=>true});assert.equal(j.status,'recovery_required');assert.equal(j.qa.pass,true);assert.equal(j.deliveryHandoff.failure.message,'Controlled board acknowledgement failure');const m=JSON.parse(await readFile(join(f.plan.storage.recordsRoot,'tasks',f.id,'manifest.json'),'utf8'));assert.equal(m.deliveryHandoff.state,'pending');assert.equal(m.deliveryHandoff.failure.message,j.deliveryHandoff.failure.message);assert.match(m.deliveryEvidence.checkpoint.nextAction,/do not rerun/);
});

test('a pinned package-review policy cannot be disabled by legacy plan switches or a downgraded saved version',async t=>{
 const f=await setup(t,{disableLegacyQa:true}),j=await f.run();assert.equal(j.status,'needs_review',j.error);assert.equal(j.version,4);assert.equal(departmentReviewCurrent(j,j.departmentReports[0]),true);j.version=3;assert.equal(reportsComplete(j),false);assert.equal(departmentReviewCurrent(j,j.departmentReports[0]),false);
});

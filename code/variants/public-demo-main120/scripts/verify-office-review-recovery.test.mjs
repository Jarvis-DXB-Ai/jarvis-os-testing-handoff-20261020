import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {createJob,executeJob,retryDepartmentQa,readJob,departmentReviewParts,specialistOutputContract} from './lib/office-team-engine.mjs';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'office-qa-transport-'));t.after(()=>rm(directory,{recursive:true,force:true}));const id=randomUUID(),criteria=['One fixture caption.'];await createJob({id,brief:'Write one fixture caption',context:'Synthetic fixture',criteria},directory);
 const roles=['coo','copy','cmo','social-qa','test'],agents=roles.map(role=>({id:randomUUID(),status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}})),plan={paperclipCompanyId:'company-fixture',roles:[{id:'copy',name:'Copy',rosterStatus:'active',model:'fixture',output:'Caption'}],executives:[],departmentQaEnabled:true,focusDepartments:[{id:'social',name:'Social',headRoleId:'cmo',qaRoleId:'social-qa',roles:['copy']}],skillLibrary:[]};
 const issues=new Map(),runs=new Map();let fail=true,sequence=0;const paths=[];
 const api=async(path,body,method)=>{paths.push({path,method:method??(body?'POST':'GET')});
  if(path.endsWith('/agents'))return agents;
  if(path.endsWith('/issues')&&body){const issue={...body,id:randomUUID(),identifier:'FIX-'+(++sequence),companyId:plan.paperclipCompanyId};issues.set(issue.id,issue);return issue;}
  if(path.startsWith('/issues/')&&!body)return issues.get(path.split('/')[2]);
  if(path.endsWith('/heartbeat/invoke')){const issue=issues.get(body.payload.issueId),agentId=path.split('/')[2],runId=randomUUID(),args=issue.assigneeAdapterOverrides.adapterConfig.extraArgs??[],schemaAt=args.indexOf('--json-schema');
   let resultJson={summary:issue.title.startsWith('COO ·')?JSON.stringify({summary:'One writer',tasks:[{id:'caption',roleId:'copy',assignment:'Return the caption only.',dependsOn:[]}]}):'Finished fixture caption.'},status='succeeded';
   if(schemaAt>=0){const schema=JSON.parse(args[schemaAt+1]),labels=schema.properties.checks.items.properties.criterion.enum;if(fail&&issue.title.startsWith('Social QA')){fail=false;status='failed';resultJson={subtype:'error_max_structured_output_retries',errors:['Fixture terminal formatting failure']};}else resultJson={structured_output:{pass:true,checks:labels.map(criterion=>({criterion,pass:true,evidence:'Current fixture output matches.'})),note:'Fixture review'}};}
   runs.set(runId,{id:runId,agentId,companyId:plan.paperclipCompanyId,status,contextSnapshot:{issueId:issue.id},resultJson,error:status==='failed'?'Fixture structured failure':null,usageJson:{billingType:'subscription_included'}});return {id:runId,status:'queued'};
  }
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);if(method==='PATCH')return body;throw new Error('Unexpected fixture path '+path);
 };
 const result=await executeJob(id,plan,{api,directory,pollMs:1,modelPolicy:()=>true});return {id,directory,plan,api,result,issues,runs,paths};
}
test('an exact acknowledged formatting failure retries QA only and preserves original drafts and native failure',async t=>{
 const f=await fixture(t);assert.equal(f.result.status,'failed');assert.equal(f.result.steps.length,1);assert.equal(f.result.calls.at(-1).status,'failed');const output=f.result.steps[0].output,authorId=f.result.steps[0].issueIdentifier;
 // Historical jobs need the source identifier resolved from their own issue.
 delete f.result.steps[0].issueIdentifier;await writeFile(join(f.directory,f.id+'.json'),JSON.stringify(f.result));
 const queued=await retryDepartmentQa(f.id,f.result.updatedAt,f.plan,{api:f.api,directory:f.directory});assert.equal(queued.steps[0].issueIdentifier,authorId);assert.equal(queued.qaTransportHistory.length,1);assert.equal(queued.steps[0].output,output);assert.equal(queued.calls.length,f.result.calls.length);
 const done=await executeJob(f.id,f.plan,{api:f.api,directory:f.directory,pollMs:1,modelPolicy:()=>true});assert.equal(done.status,'needs_review');assert.equal(done.calls.filter(c=>c.stage==='planning').length,1);assert.equal(done.calls.filter(c=>c.stage.startsWith('specialist:')).length,1);assert.equal(done.calls.filter(c=>c.stage==='department-qa:social').length,2);assert.equal(done.qaTransportHistory[0].runId,f.result.calls.at(-1).runId);assert.equal(done.steps[0].output,output);
 const review=[...f.issues.values()].filter(i=>i.title.startsWith('Social QA')).at(-1);assert.ok(review.description.includes(authorId));assert.equal(review.assigneeAdapterOverrides.adapterConfig.env.MAX_STRUCTURED_OUTPUT_RETRIES,'2');
});
test('read-only retry rejects changed, running, foreign, paid, ordinary failure and semantic rejection outcomes',async t=>{
 const f=await fixture(t),call=f.result.calls.at(-1),originalRun=structuredClone(f.runs.get(call.runId)),originalJob=structuredClone(f.result),path=join(f.directory,f.id+'.json');
 await assert.rejects(retryDepartmentQa(f.id,'stale',f.plan,{api:f.api,directory:f.directory}),/exact terminal/);
 for(const mutate of [r=>r.status='running',r=>r.scheduledRetryAt=new Date(Date.now()+60000).toISOString(),r=>r.agentId='foreign',r=>r.companyId='foreign',r=>r.contextSnapshot.issueId='foreign',r=>r.usageJson.billingType='api',r=>r.resultJson.subtype='other']){const run=structuredClone(originalRun);mutate(run);f.runs.set(call.runId,run);await assert.rejects(retryDepartmentQa(f.id,originalJob.updatedAt,f.plan,{api:f.api,directory:f.directory}),/native run/);}
 f.runs.set(call.runId,originalRun);
 for(const mutate of [j=>j.calls.at(-1).tools=['publish'],j=>j.departmentReports[0].qa.result={pass:false},j=>j.qaTransportHistory=[{departmentId:'social'}]]){const job=structuredClone(originalJob);mutate(job);await writeFile(path,JSON.stringify(job));await assert.rejects(retryDepartmentQa(f.id,job.updatedAt,f.plan,{api:f.api,directory:f.directory}));}
 await writeFile(path,JSON.stringify(originalJob));await writeFile(join(f.directory,f.id+'.stop'),'Owner stopped');await assert.rejects(retryDepartmentQa(f.id,originalJob.updatedAt,f.plan,{api:f.api,directory:f.directory}),/owner stopped/);assert.equal((await readJob(f.id,f.directory)).status,'failed');
});
test('review provenance carries the author native identity and specialist contract excludes project-wide duplication',()=>{
 const part={id:'audit',roleId:'audit',agentId:'author',issueId:'source-uuid',issueIdentifier:'JARA-249',assignment:'Return only the website findings.',output:'Source-backed findings',dependsOn:[]};const review=departmentReviewParts([part])[0];assert.equal(review.authorIssueIdentifier,'JARA-249');assert.equal(review.authorIssueId,'source-uuid');assert.equal(review.authorAgentId,'author');
 const contract=specialistOutputContract({criteria:['The entire response is maximum 600 words.'],steps:[part,{id:'other'}]},part);assert.match(contract,/ONLY the assigned part/);assert.match(contract,/300 words per specialist/);assert.match(contract,/not an additional acceptance criterion/);assert.match(contract,/Your exact part: Return only the website findings/);
});

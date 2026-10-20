import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import plan from '../src/lib/office-stack-plan.json' with {type:'json'};
import {officeBrainStructure,brainRolePolicy,brainTaskProfile} from '../src/lib/office-brain-policy.mjs';
import {initialiseBrainStructure,readBrainStructure,brainStorageLocations,brainStructureRevision} from './lib/office-brain.mjs';
import {initialiseFoundations,readFoundation,updateFoundation,buildTaskContext,roleContext,candidateLessons,updateLesson,recordOwnerFeedback,persistTaskContext,readTaskContext} from './lib/office-foundations.mjs';
import {archiveJob} from './lib/office-archive.mjs';
import {createJob,executeJob} from './lib/office-team-engine.mjs';
import {departmentQaMethods} from '../src/lib/office-client-team.mjs';
const fields={positioning:'Fictional business.',facts:'Only fictional facts.',voice:'VOICE_FIXTURE',visual:'VISUAL_FIXTURE',production:'Text specification.',restrictions:'No external actions.'};
const scope={kind:'internal',id:'brain-fixture',clientId:null};
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'office-brain-fixture-'));t.after(()=>rm(directory,{recursive:true,force:true}));const config={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};await initialiseFoundations(config,[{id:'brain-fixture',title:'Brain fixture',scope,fields,gaps:[],sources:[],assets:[],tokens:{type:'fixture'}}]);return {directory,config};}
async function approve(config,id='brain-fixture'){const f=await readFoundation(config,id);return updateFoundation(config,{id,expectedRevision:f.revision,action:'approve',note:'Isolated fixture approval.'});}
function job(override={}){return {id:randomUUID(),status:'failed',brief:'Isolated fictional assignment.',context:'',criteria:['Complete fixture.'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),steps:[],calls:[],departmentReports:[],output:null,qa:null,knowledgeContext:{scope},...override};}
test('structure installation is idempotent, creates the existing archive spine and detects changed records',async t=>{
 const {config}=await setup(t),before=await readdir(join(config.recordsRoot,'knowledge'));
 assert.equal(await readBrainStructure(config),null);assert.deepEqual(await readdir(join(config.recordsRoot,'knowledge')),before);
 const installed=await initialiseBrainStructure(config);assert.equal(installed.matchesCurrent,true);assert.equal((await initialiseBrainStructure(config)).revision,installed.revision);assert.ok((await brainStorageLocations(config)).every(s=>s.available));
 const path=join(config.recordsRoot,'knowledge/structure/versions',installed.revision+'.json');const record=JSON.parse(await readFile(path));record.structure.title='Unreviewed replacement';await writeFile(path,JSON.stringify(record));await assert.rejects(readBrainStructure(config),/integrity/);
});
test('every active desk has the correct explicit section projection and unknown roles fail closed',()=>{
 const active=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active');assert.equal(active.length,65);assert.deepEqual(new Set(Object.keys(officeBrainStructure.rolePolicies)),new Set(active.map(r=>r.id)));
 for(const role of active){const p=brainRolePolicy(role.id);assert.equal(p.department,role.departmentId);assert.ok(p.sections.includes('facts')&&p.sections.includes('restrictions'));}
 for(const role of ['instagram','linkedin','facebook','social-qa','videographer','email-qa','web-designer','meta-ads'])assert.ok(brainRolePolicy(role).sections.includes('voice'),role);
 for(const role of ['videographer','email-design','web-qa','tiktok-ads','content-qa'])assert.ok(brainRolePolicy(role).sections.includes('visual'),role);
 assert.equal(brainRolePolicy('finance-qa').assetAccess,'none');assert.ok(!brainRolePolicy('finance-qa').sections.includes('voice'));assert.throws(()=>brainRolePolicy('__proto__'),/Unknown/);
});
test('all 13 task profiles can pin exact structure and role context retains required voice while excluding unrelated artwork',async t=>{
 const {config}=await setup(t);await approve(config);
 const types=Object.keys(officeBrainStructure.retrievalProfiles);assert.equal(types.length,13);
 for(const type of types){assert.ok(brainTaskProfile(type).clientBrainTaskType);const bundle=await buildTaskContext(config,{foundationId:'brain-fixture',taskType:type,mode:'approved'});assert.equal(bundle.brain.revision,brainStructureRevision);assert.equal(roleContext(bundle,'instagram').foundation.fields.voice,'VOICE_FIXTURE');assert.equal(roleContext(bundle,'bookkeeping').foundation.fields.visual,undefined);assert.equal(roleContext(bundle,'design-system').foundation.fields.voice,undefined);}
 assert.throws(()=>brainTaskProfile('made-up'),/Unknown/);
});
test('department QA failures produce intact candidates and role/task-scoped reviewed lessons',async t=>{
 const {config}=await setup(t);await approve(config);
 const output=job({departmentReports:[{id:'email',departmentId:'email',departmentName:'Email',roleId:'email-lead',stepIds:[],status:'failed',output:null,qa:{roleId:'email-qa',status:'failed',result:{pass:false,checks:[{criterion:'Suppression prevents duplicate sends.',pass:false,evidence:'The supplied flow has no conversion exit.'}],note:''}}}]});
 await archiveJob(output,config);const c=(await candidateLessons(config))[0];assert.equal(c.sourceKind,'qa');assert.equal(c.reviewStages[0].departmentId,'email');
 const l=await updateLesson(config,{action:'save',id:'email-exit',scope,candidateId:c.id,title:'Exit after conversion',rule:'Exit acquisition messages after a recorded conversion.',trigger:'When authoring acquisition sequences.',counterexample:'A separately consented retention sequence has its own goal.',roles:['email','email-qa'],taskTypes:['email']});
 assert.equal(l.status,'draft');await updateLesson(config,{action:'approve',id:l.id,expectedRevision:l.revision,note:'Fixture review of evidence and scope.'});
 const bundle=await buildTaskContext(config,{foundationId:'brain-fixture',taskType:'email',mode:'approved'});assert.equal(roleContext(bundle,'email-qa').lessons.length,1);assert.equal(roleContext(bundle,'test').lessons.length,0);assert.equal((await buildTaskContext(config,{foundationId:'brain-fixture',taskType:'finance',mode:'approved'})).lessons.length,0);
 await writeFile(join(config.recordsRoot,'tasks',c.sourceJobId,'versions',c.sourceVersion+'.json'),'{}');await assert.rejects(candidateLessons(config),/intact/);
});
test('owner feedback binds to saved evidence, retries idempotently and never automatically approves a rule',async t=>{
 const {config}=await setup(t);const output=job({status:'needs_review',output:'Fictional approved draft.',qa:{pass:true,checks:[{criterion:'Complete fixture.',pass:true,evidence:'Fixture output present.'}],note:''}}),archive=await archiveJob(output,config);
 const input={id:randomUUID(),jobId:output.id,expectedVersion:archive.version,departmentId:'social',comment:'The opening promises a comparison but the supplied draft has none.'};
 const note=await recordOwnerFeedback(config,input);assert.equal((await recordOwnerFeedback(config,input)).revision,note.revision);await assert.rejects(recordOwnerFeedback(config,{...input,comment:'Different correction'}),/already used/);
 assert.equal((await readdir(join(config.recordsRoot,'tasks',output.id,'learning/feedback'))).length,1);
 const c=(await candidateLessons(config))[0];assert.equal(c.sourceKind,'owner-feedback');assert.equal(c.scope.id,scope.id);assert.equal(c.sourceVersion,archive.version);
 const l=await updateLesson(config,{action:'save',id:'owner-hook',scope,candidateId:c.id,title:'Fulfil the opening',rule:'Include the promised comparison or repair the hook.',trigger:'When a hook promises a comparison.',counterexample:'A short factual announcement may not need a comparison.',roles:['copy'],taskTypes:['caption']});assert.equal(l.status,'draft');
 await assert.rejects(recordOwnerFeedback(config,{...input,id:randomUUID(),expectedVersion:'a'.repeat(64)}),/version changed/);
 const path=join(config.recordsRoot,'tasks',output.id,'learning/feedback',note.id+'.json'),changed=JSON.parse(await readFile(path));changed.comment='Unreviewed replacement';await writeFile(path,JSON.stringify(changed));await assert.rejects(candidateLessons(config),/feedback integrity/);
});
test('feedback cannot become a rule for a different client and retired/unknown roles cannot be silently targeted',async t=>{
 const {config}=await setup(t),clientScope={kind:'client',id:'client-fixture',clientId:randomUUID()};await initialiseFoundations(config,[{id:'client-fixture',title:'Client fixture',scope:clientScope,fields,gaps:[],assets:[],sources:[]}]);
 const output=job(),archive=await archiveJob(output,config);await recordOwnerFeedback(config,{jobId:output.id,expectedVersion:archive.version,comment:'Fixture defect.'});const c=(await candidateLessons(config))[0];
 const input={action:'save',id:'wrong-feedback-scope',candidateId:c.id,title:'Wrong scope',rule:'Rule',trigger:'Trigger',counterexample:'Exception',taskTypes:['caption'],roles:['copy']};await assert.rejects(updateLesson(config,{...input,scope:clientScope}),/another scope/);await assert.rejects(updateLesson(config,{...input,scope,roles:['retired-role']}),/valid active/);
});
test('approved source artwork is hash-checked before work and a changed file invalidates pinned context',async t=>{
 const {directory,config}=await setup(t),path=join(directory,'artwork.png');await writeFile(path,'fictional bytes');
 const sha256=createHash('sha256').update('fictional bytes').digest('hex');await initialiseFoundations(config,[{id:'asset-fixture',title:'Asset fixture',scope,fields,gaps:[],sources:[],assets:[{id:'mark',name:'Fixture mark',path,sha256,approvalStatus:'approved',rightsStatus:'verified',role:'official-mark'},{id:'concept',name:'Draft concept',path,sha256,approvalStatus:'draft',rightsStatus:'verified',role:'generated'}]}]);await approve(config,'asset-fixture');
 const bundle=await buildTaskContext(config,{foundationId:'asset-fixture',taskType:'design',mode:'approved'});assert.deepEqual(roleContext(bundle,'design-system').assets.map(a=>a.id),['mark']);assert.deepEqual(roleContext(bundle,'billing').assets,[]);
 const id=randomUUID(),receipt=await persistTaskContext(config,id,bundle);await writeFile(path,'changed');await assert.rejects(readTaskContext(config,id,receipt),/Approved asset changed/);await assert.rejects(buildTaskContext(config,{foundationId:'asset-fixture',taskType:'design',mode:'approved'}),/Approved asset changed/);
});
test('actual executor uses the client department QA skill identity for lesson retrieval and saves that identity in receipts',async t=>{
 const {directory,config}=await setup(t);await approve(config);
 const failed=job({qa:{pass:false,checks:[{criterion:'Follow email exit rules.',pass:false,evidence:'Fixture misses an exit rule.'}],note:''}});await archiveJob(failed,config);const c=(await candidateLessons(config))[0];
 let lesson=await updateLesson(config,{action:'save',id:'qa-identity',scope,candidateId:c.id,title:'Email-only QA rule',rule:'EMAIL_QA_ONLY_RULE: check conversion exits.',trigger:'Email review.',counterexample:'Finance reconciliation.',roles:['email-qa'],taskTypes:['email']});lesson=await updateLesson(config,{action:'approve',id:lesson.id,expectedRevision:lesson.revision,note:'Fixture-only review.'});
 const selected=plan.skillLibrary.filter(s=>departmentQaMethods.email.includes(s.id));for(const method of selected){await mkdir(join(config.recordsRoot,'library/skills'),{recursive:true});await cp(join(plan.storage.recordsRoot,'library/skills',method.id),join(config.recordsRoot,'library/skills',method.id),{recursive:true});}
 const id=randomUUID(),agentId=randomUUID(),contextRequest={foundationId:'brain-fixture',taskType:'email',mode:'approved'},bundle=await buildTaskContext(config,contextRequest),receipt=await persistTaskContext(config,id,bundle);await createJob({id,kind:'conversation',targetAgentId:agentId,brief:'Review fictional email logic.',context:'No external actions.',criteria:['Follow supplied facts.'],contextRequest},directory,{knowledgeContext:receipt});
 const agent={id:agentId,name:'Fixture Email QA',status:'idle',metadata:{jarvisBlueprintRoleId:'test',jarvisClientSlot:'qa:email',modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}};let issue;const runs=new Map();
 const api=async(path,body,method)=>{if(path.endsWith('/agents'))return[agent];if(path.endsWith('/issues')){issue={...body,id:randomUUID()};return issue;}if(path.endsWith('/heartbeat/invoke')){const rid=randomUUID();runs.set(rid,{id:rid,status:'succeeded',resultJson:{summary:'Fixture response.'},usageJson:{model:'fixture',billingType:'subscription_included'}});return{id:rid,status:'queued'};}if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);if(method==='PATCH')return body;throw new Error('Unexpected mock operation.');};
 const result=await executeJob(id,{...plan,storage:config,skillLibrary:selected,toolBridge:{enabled:false}},{directory,api,pollMs:1,modelPolicy:()=>true});assert.equal(result.status,'answered');assert.match(issue.description,/EMAIL_QA_ONLY_RULE/);assert.equal(result.calls[0].knowledge.roleId,'email-qa');assert.deepEqual(result.calls[0].knowledge.lessonIds,[lesson.id]);
});

test('later departmental reviews retain previous failure evidence and legacy lesson approvals stay version-bound',async t=>{const {config}=await setup(t);const j=job({qa:{pass:false,checks:[{criterion:'Original specific check',pass:false,evidence:'Original observed failure'}]}});const first=await archiveJob(j,config);const c=(await candidateLessons(config)).find(c=>c.sourceVersion===first.version);let lesson=await updateLesson(config,{action:'save',id:'retained-failure',scope,candidateId:c.id,title:'Retain evidence',rule:'Check the exact source.',trigger:'When revising.',counterexample:'Unrelated source.',roles:['audit'],taskTypes:['web']});j.qa={pass:false,checks:[{criterion:'Later different check',pass:false,evidence:'Later observed failure'}]};await archiveJob(j,config);const all=await candidateLessons(config);assert.ok(all.some(c=>c.sourceVersion===first.version));assert.equal(all.length,2);lesson=await updateLesson(config,{id:lesson.id,expectedRevision:lesson.revision,action:'approve',note:'Synthetic fixture approval of original exact evidence.'});assert.equal(lesson.status,'approved');assert.equal(lesson.sourceVersion,first.version);const path=join(config.recordsRoot,'tasks',j.id,'versions',first.version+'.json');await writeFile(path,'{}');await assert.rejects(candidateLessons(config),/evidence/);});

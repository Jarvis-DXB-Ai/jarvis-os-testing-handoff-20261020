import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {initialiseFoundations,readFoundation,updateFoundation,knowledgeCatalog,updateLesson,candidateLessons,buildTaskContext,roleContext,persistTaskContext,readTaskContext} from './lib/office-foundations.mjs';
import {archiveJob} from './lib/office-archive.mjs';
import {createJob,executeJob,readJob} from './lib/office-team-engine.mjs';

const fields={positioning:'Fictional fixture audience.',facts:'Fixture facts only.',voice:'Specific copy.',visual:'Fixture palette and type.',production:'Editable source with verified exports.',restrictions:'No publication or unsupported claims.'};
const company={kind:'company',id:'fixture-company',clientId:null};
async function setup(fn){
 const directory=await mkdtemp(join(tmpdir(),'office-foundations-'));const config={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};
 try{await initialiseFoundations(config,[{id:'fixture-company',title:'Fixture company',scope:company,fields,gaps:[],sources:[],assets:[],tokens:{font:'fixture-only'}},{id:'fixture-client',title:'Different fixture client',scope:{kind:'client',id:'fixture-client',clientId:randomUUID()},fields,gaps:[],sources:[],assets:[],tokens:{}}]);await fn({directory,config});}finally{await rm(directory,{recursive:true,force:true});}
}
async function approve(config,id='fixture-company'){const f=await readFoundation(config,id);return updateFoundation(config,{id,expectedRevision:f.revision,action:'approve',note:'Fixture-only approval in an isolated temporary directory.'});}
async function candidate(config,scope=company){
 const id=randomUUID(),job={id,status:'failed',updatedAt:new Date().toISOString(),createdAt:new Date().toISOString(),brief:'Fictional fixture output failed a factual requirement.',context:'',criteria:['Source every process claim.'],steps:[],calls:[],plan:null,output:'Fixture rejected output.',qa:{pass:false,checks:[{criterion:'Source every process claim.',pass:false,evidence:'The fixture contains an unsupported process claim.'}],note:''},...(scope?{knowledgeContext:{scope}}:{})};
 await archiveJob(job,config);return (await candidateLessons(config)).find(c=>c.sourceJobId===id);
}
async function lesson(config,{roles=['copy','test'],scope=company,taskTypes=['caption'],approved=true}={}){
 const c=await candidate(config,scope),saved=await updateLesson(config,{action:'save',id:'fixture-lesson-'+randomUUID(),scope,candidateId:c.id,title:'Source process claims',rule:'Use source evidence for process claims; flag missing evidence.',trigger:'When writing about a real design process.',counterexample:'Explicitly requested fictional storytelling may invent a fictional process.',roles,taskTypes});
 return approved?updateLesson(config,{action:'approve',id:saved.id,expectedRevision:saved.revision,note:'Fixture correction and exception independently checked.'}):saved;
}
test('read-only catalog does not create folders and initialization preserves existing drafts',async()=>setup(async({config})=>{
 const before=await readdir(config.recordsRoot);await knowledgeCatalog(config);assert.deepEqual(await readdir(config.recordsRoot),before);
 const f=await readFoundation(config,'fixture-company');assert.equal(f.status,'draft');
 await initialiseFoundations(config,[{id:f.id,title:'Overwrite attempt',scope:company,fields,gaps:[]}]);assert.equal((await readFoundation(config,f.id)).revision,f.revision);
 await assert.rejects(buildTaskContext(config,{foundationId:f.id,taskType:'caption',mode:'approved'}),/Approve/);
 const draft=await buildTaskContext(config,{foundationId:f.id,taskType:'caption',mode:'draft'});assert.ok(draft.gaps.some(g=>g.includes('draft')));
}));
test('approval requires complete sections and no gaps; edits preserve history and clear approval',async()=>setup(async({config})=>{
 const f=await approve(config),edited=await updateFoundation(config,{id:f.id,action:'save',expectedRevision:f.revision,fields:{...fields,voice:''},tokens:{},gaps:['Review voice.']});
 assert.equal(edited.status,'draft');assert.equal(edited.approvedAt,null);assert.notEqual(edited.revision,f.revision);
 const prior=JSON.parse(await readFile(join(config.recordsRoot,'knowledge/foundations',f.id,'versions',f.revision+'.json')));assert.equal(prior.status,'approved');
 await assert.rejects(updateFoundation(config,{id:f.id,action:'approve',expectedRevision:edited.revision,note:'bad'}),/Complete/);
 await assert.rejects(updateFoundation(config,{id:f.id,action:'save',expectedRevision:f.revision,fields,gaps:[]}),/changed/);
}));
test('lessons enter context only after review and only for exact scope task type and role',async()=>setup(async({config})=>{
 await approve(config);await lesson(config,{approved:false});const active=await lesson(config);
 const bundle=await buildTaskContext(config,{foundationId:'fixture-company',taskType:'caption',mode:'approved'});
 assert.deepEqual(bundle.lessons.map(l=>l.id),[active.id]);assert.equal(roleContext(bundle,'copy').lessons.length,1);assert.equal(roleContext(bundle,'analytics').lessons.length,0);
 assert.equal(roleContext(bundle,'copy').foundation.fields.visual,undefined);assert.equal(roleContext(bundle,'design-system').foundation.fields.voice,undefined);
 assert.equal((await buildTaskContext(config,{foundationId:'fixture-client',taskType:'caption',mode:'draft'})).lessons.length,0);
 assert.equal((await buildTaskContext(config,{foundationId:'fixture-company',taskType:'report',mode:'approved'})).lessons.length,0);
}));
test('client evidence and unscoped historical evidence cannot be promoted into another client',async()=>setup(async({config})=>{
 const client=(await readFoundation(config,'fixture-client')).scope,c=await candidate(config,client),historical=await candidate(config,null);
 const input={action:'save',id:'wrong-scope',scope:company,candidateId:c.id,title:'Wrong scope',rule:'Rule',trigger:'Trigger',counterexample:'Exception',taskTypes:['caption'],roles:[]};
 await assert.rejects(updateLesson(config,input),/another scope/);
 await assert.rejects(updateLesson(config,{...input,scope:client,candidateId:historical.id}),/Unscoped/);
}));
test('tampered candidate source evidence is rejected',async()=>setup(async({config})=>{
 const c=await candidate(config);const path=join(config.recordsRoot,'tasks',c.sourceJobId,'versions',c.sourceVersion+'.json');await writeFile(path,'{}');
 await assert.rejects(candidateLessons(config),/intact/);
}));
test('pinned context cannot cross job scope or survive changed approved revisions',async()=>setup(async({config})=>{
 await approve(config);const bundle=await buildTaskContext(config,{foundationId:'fixture-company',taskType:'caption',mode:'approved'}),id=randomUUID(),receipt=await persistTaskContext(config,id,bundle);
 assert.equal((await readTaskContext(config,id,receipt)).revision,bundle.revision);
 await assert.rejects(readTaskContext(config,randomUUID(),receipt),/receipt/);
 await assert.rejects(readTaskContext(config,id,{...receipt,scope:{kind:'client',id:'other',clientId:null}}),/integrity/);
 const f=await readFoundation(config,'fixture-company');await updateFoundation(config,{id:f.id,action:'save',expectedRevision:f.revision,fields:{...fields,voice:'Changed voice'},tokens:{},gaps:[]});
 await assert.rejects(readTaskContext(config,id,receipt),/Foundation changed/);
}));
test('retired lesson invalidates a pinned context before any new stage',async()=>setup(async({config})=>{
 await approve(config);const l=await lesson(config),bundle=await buildTaskContext(config,{foundationId:'fixture-company',taskType:'caption',mode:'approved'}),id=randomUUID(),receipt=await persistTaskContext(config,id,bundle);
 await updateLesson(config,{id:l.id,action:'retire',expectedRevision:l.revision});
 await assert.rejects(readTaskContext(config,id,receipt),/lesson changed/);
 assert.equal((await buildTaskContext(config,{foundationId:'fixture-company',taskType:'caption',mode:'approved'})).lessons.length,0);
}));
test('registered source changes and filesystem escapes fail closed',async()=>setup(async({directory,config})=>{
 const p=join(directory,'source.txt');await writeFile(p,'original');
 await initialiseFoundations(config,[{id:'source-fixture',title:'Source fixture',scope:{kind:'internal',id:'source-fixture'},fields,gaps:[],sources:[{id:'source',title:'source',path:p,sha256:createHash('sha256').update('original').digest('hex')}],assets:[]}]);
 const bundle=await buildTaskContext(config,{foundationId:'source-fixture',taskType:'internal',mode:'draft'}),id=randomUUID(),receipt=await persistTaskContext(config,id,bundle);await writeFile(p,'changed');
 await assert.rejects(readTaskContext(config,id,receipt),/source changed/);
 await assert.rejects(readFoundation(config,'../source-fixture'),/identifier/);
 const pointer=join(config.recordsRoot,'knowledge/foundations/fixture-company/current.json');await rm(pointer);await symlink(p,pointer);await assert.rejects(readFoundation(config,'fixture-company'),/symlink/);
}));
test('mock team consumes role-specific foundation and lessons across planner specialist department report synthesis and QA',async()=>setup(async({directory,config})=>{
 await approve(config);const l=await lesson(config),input={id:randomUUID(),brief:'Write a short sourced fictional-fixture caption.',context:'Fixture-only supplied content.',criteria:['Source every process claim.'],contextRequest:{foundationId:'fixture-company',taskType:'caption',mode:'approved'}};
 const bundle=await buildTaskContext(config,input.contextRequest),receipt=await persistTaskContext(config,input.id,bundle);
 await createJob(input,directory,{knowledgeContext:receipt});const issues=new Map(),runs=new Map();let calls=0;
 const agents=['coo','copy','test'].map(role=>({id:randomUUID(),name:role,status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture-model'}}));
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents'))return agents;
  if(path.endsWith('/issues')){const issue={...body,id:randomUUID()};issues.set(issue.id,issue);return issue;}
  if(path.endsWith('/heartbeat/invoke')){calls++;const issue=issues.get(body.payload.issueId),id=randomUUID();const stage=issue.title;
   const text=stage.startsWith('COO ·')?JSON.stringify({summary:'One fictional fixture part.',tasks:[{id:'copy',roleId:'copy',assignment:'Use supplied fixture facts.',dependsOn:[]}]}):stage.startsWith('Independent QA')?JSON.stringify({pass:true,checks:[{criterion:input.criteria[0],pass:true,evidence:'Fixture output uses supplied facts only.'}],note:'Mock only.'}):'Fixture output grounded in the supplied facts.';
   runs.set(id,{id,status:'succeeded',usageJson:{model:'fixture-model',billingType:'subscription_included'},resultJson:{summary:text}});return {id,status:'queued'};}
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(method==='PATCH')return body;throw new Error('Unexpected fixture request.');
 };
 const result=await executeJob(input.id,{paperclipCompanyId:'fixture',roles:[{id:'copy',name:'Copy',model:'fixture-model'},{id:'test',name:'QA',model:'fixture-model'}],storage:config},{api,directory,pollMs:1,modelPolicy:()=>true});
 assert.equal(result.status,'needs_review');assert.equal(calls,5);assert.ok(result.calls.every(c=>c.knowledge?.revision===bundle.revision));assert.ok(result.calls.filter(c=>['copy','test'].includes(c.roleId)).every(c=>c.knowledge.lessonIds.includes(l.id)));
 for(const issue of issues.values())assert.ok(issue.description.includes('Pinned foundation and relevant approved lessons'));
 assert.equal((await createJob(input,directory)).created,false);assert.equal((await readJob(input.id,directory)).knowledgeContext.revision,receipt.revision);
 await assert.rejects(createJob({...input,contextRequest:{...input.contextRequest,foundationId:'fixture-client'}},directory),/different task/);
 const manifest=JSON.parse(await readFile(join(config.recordsRoot,'tasks',input.id,'manifest.json')));assert.equal(manifest.knowledgeContext.revision,receipt.revision);
}));
test('changed foundations block model dispatch entirely; forged client payload receipts are ignored',async()=>setup(async({directory,config})=>{
 const f=await approve(config),input={id:randomUUID(),brief:'Verify that a revoked brand blocks execution.',context:'',criteria:['Block revoked foundation'],contextRequest:{foundationId:f.id,taskType:'internal',mode:'approved'}};
 const bundle=await buildTaskContext(config,input.contextRequest),receipt=await persistTaskContext(config,input.id,bundle);await createJob(input,directory,{knowledgeContext:receipt});
 await updateFoundation(config,{id:f.id,action:'retire',expectedRevision:f.revision});let calls=0;
 const result=await executeJob(input.id,{storage:config},{api:async()=>{calls++;throw new Error('Must not reach Paperclip');},directory});assert.equal(result.status,'blocked');assert.equal(calls,0);
 const raw=await createJob({...input,id:randomUUID(),knowledgeContext:receipt},directory);assert.equal(raw.job.knowledgeContext,undefined);
}));

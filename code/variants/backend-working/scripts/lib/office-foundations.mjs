import {readFile,writeFile,rename,readdir,open,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {foundationFields,contextTaskTypes} from '../../src/lib/office-foundation-schema.mjs';
import {officeBrainStructure,brainRolePolicy,brainTaskProfile} from '../../src/lib/office-brain-policy.mjs';
import {learningFailureStages} from './office-learning-evidence.mjs';

const slug=/^[a-z0-9][a-z0-9-]{0,80}$/,hash=/^[a-f0-9]{64}$/;
export {foundationFields,contextTaskTypes};
const digest=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const revision=v=>digest(canonical(v));
const brainRevision=revision(officeBrainStructure);
const withoutRevision=v=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='revision'));
function validId(id){if(!slug.test(id??''))throw new Error('Invalid knowledge identifier.');return id;}
function cleanText(value,max=8000){if(typeof value!=='string'||value.length>max)throw new Error('Invalid or oversized foundation text.');return value.trim();}
function scope(value){if(!value||!['company','internal','client'].includes(value.kind)||!slug.test(value.id??''))throw new Error('Invalid foundation scope.');if(value.clientId!==null&&value.clientId!==undefined&&!/^[0-9a-f-]{36}$/i.test(value.clientId))throw new Error('Invalid client binding.');return {kind:value.kind,id:value.id,clientId:value.clientId??null};}
async function file(config,path){await ensureStore(config,{create:false});return officeStorePath(config.recordsRoot,path);}
async function json(config,path){return JSON.parse(await readFile(await file(config,path),'utf8'));}
async function put(config,path,value,{exclusive=false}={}){
 const target=await officeStorePath(config.recordsRoot,path,true),text=JSON.stringify(value,null,2)+'\n';
 if(exclusive){try{await writeFile(target,text,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;const prior=await readFile(target,'utf8');if(prior!==text)throw new Error('Immutable knowledge record changed.');}return;}
 const temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,text,{mode:0o600});await rename(temp,target);
}
async function mutation(config,fn){
 await ensureStore(config);const path=await officeStorePath(config.recordsRoot,'knowledge/mutation.lock',true);
 const lock=await open(path,'wx',0o600).catch(()=>{throw new Error('Another knowledge edit is saving. Refresh and try again.');});
 try{return await fn();}finally{await lock.close();await unlink(path);}
}
async function save(config,kind,data){
 const value={...data,revision:revision(data)};const base=(kind==='foundations'?'knowledge/':'learning/')+kind+'/'+validId(data.id);
 await put(config,base+'/versions/'+value.revision+'.json',value,{exclusive:true});
 await put(config,base+'/current.json',{revision:value.revision});return value;
}
async function current(config,kind,id){
 const base=(kind==='foundations'?'knowledge/':'learning/')+kind+'/'+validId(id),pointer=await json(config,base+'/current.json');
 if(!hash.test(pointer.revision??''))throw new Error('Invalid knowledge revision.');
 const value=await json(config,base+'/versions/'+pointer.revision+'.json'),{revision:stored,...body}=value;
 if(stored!==pointer.revision||revision(body)!==stored||body.id!==id)throw new Error('Knowledge integrity failed.');
 return value;
}
export const readFoundation=(config,id)=>current(config,'foundations',id);
export const readLesson=(config,id)=>current(config,'lessons',id);
async function list(config,kind){
 const dir=(kind==='foundations'?'knowledge/':'learning/')+kind;let entries;
 try{entries=await readdir(await file(config,dir));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 return Promise.all(entries.filter(x=>slug.test(x)).map(id=>current(config,kind,id)));
}
export async function knowledgeCatalog(config){
 const [foundations,lessons]=await Promise.all([list(config,'foundations'),list(config,'lessons')]);
 return {foundations,lessons,checkedAt:new Date().toISOString()};
}
export async function initialiseFoundations(config,seeds){
 return mutation(config,async()=>{
  const saved=[];
  for(const seed of seeds){
   try{saved.push(await readFoundation(config,seed.id));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
   const fields=Object.fromEntries(foundationFields.map(k=>[k,cleanText(seed.fields?.[k]??'')]));
   saved.push(await save(config,'foundations',{id:validId(seed.id),title:cleanText(seed.title,160),scope:scope(seed.scope),fields,tokens:seed.tokens??{},sources:seed.sources??[],assets:seed.assets??[],gaps:seed.gaps??[],status:'draft',approvedAt:null,approvalNote:'',updatedAt:new Date().toISOString()}));
  }
  return saved;
 });
}
export async function updateFoundation(config,input){
 return mutation(config,async()=>{
  const old=await readFoundation(config,validId(input.id));if(old.revision!==input.expectedRevision)throw new Error('This foundation changed. Refresh before saving.');
  const body=withoutRevision(old);
  if(input.action==='save'){
   const fields=Object.fromEntries(foundationFields.map(k=>[k,cleanText(input.fields?.[k]??'')]));
   const gaps=(input.gaps??[]).map(x=>cleanText(x,400));if(gaps.length>20)throw new Error('Too many foundation gaps.');
   const tokens=input.tokens??{};if(canonical(tokens).length>6000||Array.isArray(tokens)||typeof tokens!=='object'||!tokens)throw new Error('Invalid token document.');
   return save(config,'foundations',{...body,fields,tokens,gaps,status:'draft',approvedAt:null,approvalNote:'',updatedAt:new Date().toISOString()});
  }
  if(input.action==='approve'){
   if(old.gaps.length||foundationFields.some(k=>!old.fields[k]))throw new Error('Complete all foundation sections and resolve recorded gaps before approval.');
   const note=cleanText(input.note??'',1500);if(!note)throw new Error('Record the scope of your foundation approval.');
   return save(config,'foundations',{...body,status:'approved',approvedAt:new Date().toISOString(),approvalNote:note,updatedAt:new Date().toISOString()});
  }
  if(input.action==='retire')return save(config,'foundations',{...body,status:'retired',updatedAt:new Date().toISOString()});
  if(input.action==='reconcile'){
   const sources=[];for(const s of old.sources){const bytes=await readFile(s.path);sources.push({...s,sha256:digest(bytes)});}
   return save(config,'foundations',{...body,sources,status:'draft',approvedAt:null,approvalNote:'',gaps:[...new Set([...old.gaps,'Review registered source changes against the curated foundation.'])],updatedAt:new Date().toISOString()});
  }
  throw new Error('Unknown foundation action.');
 });
}
export async function candidateLessons(config){
 let entries;try{entries=await readdir(await file(config,'tasks'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const found=[];
 for(const id of entries.filter(x=>slug.test(x))){
  let current;try{current=await json(config,'tasks/'+id+'/learning/candidate.json');}catch(e){if(e.code!=='ENOENT')throw e;}
  const candidates=current?[{candidate:current,legacy:true}]:[];let history=[];try{history=await readdir(await file(config,'tasks/'+id+'/learning/candidates'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of history.filter(n=>/^[a-f0-9]{64}\.json$/.test(n))){if(name===current?.sourceVersion+'.json')continue;const candidate=await json(config,'tasks/'+id+'/learning/candidates/'+name);if(name!==candidate.sourceVersion+'.json')throw new Error('Candidate history version mismatch.');candidates.push({candidate,legacy:false});}
  for(const {candidate,legacy} of candidates){
   if(candidate.sourceJobId!==id||!hash.test(candidate.sourceVersion??''))throw new Error('Candidate evidence does not match its task.');
   const evidenceBytes=await readFile(await file(config,'tasks/'+id+'/versions/'+candidate.sourceVersion+'.json'),'utf8'),evidence=JSON.parse(evidenceBytes),stages=learningFailureStages(evidence);
   if(digest(evidenceBytes)!==candidate.sourceVersion||evidence.id!==id||!stages.length||canonical(candidate.evidence)!==canonical(stages.flatMap(s=>s.evidence))||(candidate.reviewStages&&canonical(candidate.reviewStages)!==canonical(stages)))throw new Error('Candidate has no intact failed QA evidence.');
   const context=evidence.knowledgeContext;
   found.push({id:'qa-'+id+(legacy?'':'-'+candidate.sourceVersion.slice(0,12)),sourceJobId:id,sourceVersion:candidate.sourceVersion,evidence:candidate.evidence,reviewStages:stages,sourceKind:'qa',scope:context?.scope??null,scopeLabel:context?.scope?.id??'Unassigned historical task',status:'candidate'});
  }
  let feedback=[];try{feedback=await readdir(await file(config,'tasks/'+id+'/learning/feedback'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of feedback.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
   const note=await json(config,'tasks/'+id+'/learning/feedback/'+name),{revision:stored,...body}=note;
   if(revision(body)!==stored||note.sourceJobId!==id||note.id+'.json'!==name||!hash.test(note.sourceVersion??''))throw new Error('Owner feedback integrity failed.');
   const bytes=await readFile(await file(config,'tasks/'+id+'/versions/'+note.sourceVersion+'.json'),'utf8'),evidence=JSON.parse(bytes);
   if(digest(bytes)!==note.sourceVersion||evidence.id!==id||canonical(note.scope)!==canonical(evidence.knowledgeContext?.scope??null))throw new Error('Owner feedback source changed.');
   found.push({id:'feedback-'+note.id,sourceJobId:id,sourceVersion:note.sourceVersion,evidence:[{criterion:'Owner feedback on saved work',pass:false,evidence:note.comment}],sourceKind:'owner-feedback',feedbackRevision:stored,departmentId:note.departmentId,scope:note.scope,scopeLabel:note.scope?.id??'Unassigned historical task',status:'candidate'});
  }
 }
 return found;
}
export async function recordOwnerFeedback(config,input){
 return mutation(config,async()=>{
  if(!/^[0-9a-f-]{36}$/i.test(input.jobId??''))throw new Error('Choose a saved Office task.');
  const comment=cleanText(input.comment,2000);if(!comment)throw new Error('Describe the observed issue or correction.');
  const feedbackId=input.id??randomUUID();if(!/^[0-9a-f-]{36}$/i.test(feedbackId))throw new Error('Invalid feedback request.');
  const feedbackPath='tasks/'+input.jobId+'/learning/feedback/'+feedbackId+'.json';
  let prior;try{prior=await json(config,feedbackPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(prior){const {revision:stored,...body}=prior;if(revision(body)!==stored||prior.comment!==comment||prior.departmentId!==(input.departmentId??null)||prior.sourceJobId!==input.jobId||(input.expectedVersion&&prior.sourceVersion!==input.expectedVersion))throw new Error('This feedback request was already used for another correction.');return prior;}
  const current=await json(config,'tasks/'+input.jobId+'/manifest.json');
  if(!hash.test(current.version??''))throw new Error('The task has no preserved version.');
  if(input.expectedVersion&&input.expectedVersion!==current.version)throw new Error('Task version changed. Review the current saved output before recording feedback.');
  const bytes=await readFile(await file(config,'tasks/'+input.jobId+'/versions/'+current.version+'.json'),'utf8'),source=JSON.parse(bytes);
  if(digest(bytes)!==current.version||source.id!==input.jobId)throw new Error('Task evidence integrity failed.');
  const departmentId=input.departmentId??null;
  if(departmentId&&!Object.values(officeBrainStructure.rolePolicies).some(p=>p.department===departmentId))throw new Error('Choose a valid department.');
  const body={id:feedbackId,sourceJobId:input.jobId,sourceVersion:current.version,scope:source.knowledgeContext?.scope??null,departmentId,comment,createdAt:new Date().toISOString(),status:'candidate',sourceKind:'owner-feedback'};
  const note={...body,revision:revision(body)};
  await put(config,feedbackPath,note,{exclusive:true});return note;
 });
}
export async function updateLesson(config,input){
 return mutation(config,async()=>{
  const id=validId(input.id);let old=null;try{old=await readLesson(config,id);}catch(e){if(e.code!=='ENOENT')throw e;}
  if((old?.revision??null)!==(input.expectedRevision??null))throw new Error('This lesson changed. Refresh before saving.');
  if(input.action==='save'){
   const s=scope(input.scope),foundation=(await list(config,'foundations')).find(f=>f.scope.id===s.id&&f.scope.kind===s.kind&&f.scope.clientId===s.clientId);
   if(!foundation)throw new Error('Choose a registered foundation scope.');
   const taskTypes=input.taskTypes;if(!Array.isArray(taskTypes)||!taskTypes.length||taskTypes.some(x=>!contextTaskTypes.includes(x)))throw new Error('Choose applicable task types.');
   const roles=input.roles??[];if(!Array.isArray(roles)||roles.some(x=>!slug.test(x)||!Object.hasOwn(officeBrainStructure.rolePolicies,x)))throw new Error('Choose valid active lesson roles.');
   const candidate=(await candidateLessons(config)).find(c=>c.id===input.candidateId);
   if(!candidate)throw new Error('A preserved QA candidate is required.');
   if(candidate.scope&&(canonical(candidate.scope)!==canonical(s)))throw new Error('Candidate belongs to another scope.');
   if(!candidate.scope&&s.kind==='client')throw new Error('Unscoped historical evidence cannot become a client rule.');
   const previous=old?withoutRevision(old):{};
   return save(config,'lessons',{...previous,id,title:cleanText(input.title,160),rule:cleanText(input.rule,2000),trigger:cleanText(input.trigger,600),counterexample:cleanText(input.counterexample,1200),scope:s,taskTypes:[...new Set(taskTypes)],roles:[...new Set(roles)],candidateId:candidate.id,sourceJobId:candidate.sourceJobId,sourceVersion:candidate.sourceVersion,evidence:candidate.evidence,...(candidate.feedbackRevision?{feedbackRevision:candidate.feedbackRevision}:{}),status:'draft',approvedAt:null,approvalNote:'',updatedAt:new Date().toISOString()});
  }
  if(!old)throw new Error('Lesson not found.');
  const body=withoutRevision(old);
  if(input.action==='approve'){
   if(!old.rule||!old.trigger||!old.counterexample)throw new Error('A lesson needs a correction, trigger and counterexample.');
   let intact=(await candidateLessons(config)).some(c=>c.id===old.candidateId&&c.sourceVersion===old.sourceVersion&&canonical(c.evidence)===canonical(old.evidence)&&c.feedbackRevision===old.feedbackRevision);
   // Legacy IDs pointed at a mutable latest-candidate record. Approval remains
   // bound to the exact immutable failed source even after a later review.
   if(!intact&&old.candidateId==='qa-'+old.sourceJobId&&!old.feedbackRevision){const bytes=await readFile(await file(config,'tasks/'+old.sourceJobId+'/versions/'+old.sourceVersion+'.json'),'utf8'),evidence=JSON.parse(bytes),stages=learningFailureStages(evidence);intact=digest(bytes)===old.sourceVersion&&evidence.id===old.sourceJobId&&canonical(evidence.knowledgeContext?.scope??null)===canonical(old.scope)&&stages.length>0&&canonical(stages.flatMap(s=>s.evidence))===canonical(old.evidence);}
   if(!intact)throw new Error('Lesson evidence changed or is unavailable.');
   const note=cleanText(input.note??'',1500);if(!note)throw new Error('Record why this lesson applies.');
   return save(config,'lessons',{...body,status:'approved',approvalNote:note,approvedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  if(input.action==='retire')return save(config,'lessons',{...body,status:'retired',updatedAt:new Date().toISOString()});
  throw new Error('Unknown lesson action.');
 });
}
export function validateContextRequest(value){
 if(!value||!slug.test(value.foundationId??'')||!contextTaskTypes.includes(value.taskType)||!['draft','approved'].includes(value.mode))throw new Error('Choose a foundation, task type and draft/approved use.');
 return {foundationId:value.foundationId,taskType:value.taskType,mode:value.mode};
}
export function roleContext(bundle,role){
 if(!bundle)return null;
 const policy=brainRolePolicy(role),fields=Object.fromEntries(policy.sections.map(k=>[k,bundle.foundation.fields[k]]));
 let clientBrain=bundle.clientBrain;
 if(clientBrain){
  clientBrain={...clientBrain,
   ...(clientBrain.registeredNotes?{registeredNotes:clientBrain.registeredNotes.filter(n=>n.kind==='facts'||policy.sections.includes('visual')||role==='copy')}:{ }),
   ...(clientBrain.brand_assets?{brand_assets:policy.assetAccess==='none'?[]:clientBrain.brand_assets}:{}),
   ...(clientBrain.brand_guidelines?{brand_guidelines:clientBrain.brand_guidelines.filter(g=>g.subsection==='copy_language_system'?policy.sections.includes('voice'):policy.sections.includes('visual'))}:{})};
 }
 return {scope:bundle.scope,taskType:bundle.taskType,mode:bundle.mode,brain:bundle.brain,roleId:role,foundation:{id:bundle.foundation.id,revision:bundle.foundation.revision,status:bundle.foundation.status,fields,...(policy.sections.includes('visual')?{tokens:bundle.foundation.tokens}:{} )},sources:bundle.foundation.sources,assets:policy.assetAccess==='none'?[]:bundle.foundation.assets.filter(a=>a.approvalStatus==='approved'&&a.rightsStatus==='verified'),lessons:bundle.lessons.filter(l=>!l.roles.length||l.roles.includes(role)).map(l=>({id:l.id,revision:l.revision,rule:l.rule,trigger:l.trigger,counterexample:l.counterexample})),clientBrain,gaps:bundle.gaps,warning:bundle.mode==='draft'?'Internal draft context; unapproved brand rules are proposals. Do not claim client approval or external delivery.':null};
}
export async function buildTaskContext(config,request,{clientBrain=null}={}){
 const selected=validateContextRequest(request),foundation=await readFoundation(config,selected.foundationId);
 if(foundation.status==='retired')throw new Error('This foundation was retired.');
 if(selected.mode==='approved'&&foundation.status!=='approved')throw new Error('Approve the selected foundation before approved-brand work.');
 await checkSources(foundation);
 const lessons=(await list(config,'lessons')).filter(l=>l.status==='approved'&&canonical(l.scope)===canonical(foundation.scope)&&l.taskTypes.includes(selected.taskType));
 const gaps=[...foundation.gaps];if(foundation.status!=='approved')gaps.push('Foundation is a draft; approved production is blocked.');
 if(foundation.scope.kind==='client'&&!foundation.scope.clientId)gaps.push('No live Client Brain binding; only the registered local source index is available.');
 const body={scope:foundation.scope,taskType:selected.taskType,mode:selected.mode,foundation,lessons,clientBrain,gaps,brain:{version:officeBrainStructure.version,revision:brainRevision,profile:brainTaskProfile(selected.taskType).label}};
 return {...body,revision:revision(body)};
}
export async function persistTaskContext(config,jobId,bundle){
 if(!/^[0-9a-f-]{36}$/i.test(jobId))throw new Error('Invalid context task ID.');
 const {revision:stored,...body}=bundle;if(!hash.test(stored??'')||revision(body)!==stored)throw new Error('Context integrity failed.');
 await ensureStore(config);
 await put(config,'contexts/'+jobId+'/'+stored+'.json',bundle,{exclusive:true});
 return {revision:stored,path:'contexts/'+jobId+'/'+stored+'.json',scope:bundle.scope,taskType:bundle.taskType,mode:bundle.mode,foundationId:bundle.foundation.id,foundationRevision:bundle.foundation.revision,lessonIds:bundle.lessons.map(l=>l.id)};
}
export async function readTaskContext(config,jobId,receipt,{checkCurrent=true}={}){
 if(!/^[0-9a-f-]{36}$/i.test(jobId)||!hash.test(receipt?.revision??'')||receipt.path!=='contexts/'+jobId+'/'+receipt.revision+'.json')throw new Error('Invalid task context receipt.');
 const bundle=await json(config,receipt.path),{revision:stored,...body}=bundle;
 if(stored!==receipt.revision||revision(body)!==stored||canonical(receipt.scope)!==canonical(bundle.scope)||receipt.foundationId!==bundle.foundation.id||receipt.foundationRevision!==bundle.foundation.revision||receipt.taskType!==bundle.taskType||receipt.mode!==bundle.mode)throw new Error('Task context integrity failed.');
 if(checkCurrent){
  if(bundle.brain&&bundle.brain.revision!==brainRevision)throw new Error('Brain operating structure changed after context was pinned. Review before another stage.');
  const foundation=await readFoundation(config,bundle.foundation.id);
  if(foundation.revision!==bundle.foundation.revision||foundation.status==='retired')throw new Error('Foundation changed after context was pinned. Inspect before starting another model stage.');
  await checkSources(foundation);
  for(const l of bundle.lessons){const active=await readLesson(config,l.id);if(active.revision!==l.revision||active.status!=='approved')throw new Error('An applied lesson changed or was retired. Inspect before starting another model stage.');}
 }
 return bundle;
}
async function checkSources(foundation){
 for(const source of foundation.sources){
  if(!hash.test(source.sha256??''))throw new Error('Invalid source hash.');
  const bytes=await readFile(source.path);if(digest(bytes)!==source.sha256)throw new Error('Registered source changed: '+source.title+'. Reconcile the foundation before work.');
 }
 for(const asset of foundation.assets.filter(a=>a.approvalStatus==='approved'&&a.rightsStatus==='verified')){
  if(!hash.test(asset.sha256??''))throw new Error('Invalid approved asset hash.');
  if(digest(await readFile(asset.path))!==asset.sha256)throw new Error('Approved asset changed: '+asset.name+'. Review its exact version before work.');
 }
}

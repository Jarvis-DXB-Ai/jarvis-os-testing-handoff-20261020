import {deliveryEvidence} from './office-delivery-evidence.mjs';
import {mkdir,lstat,stat,realpath,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join,relative,isAbsolute,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const slug=/^[a-zA-Z0-9][a-zA-Z0-9-]{0,90}$/;
const digest=text=>createHash('sha256').update(text).digest('hex');
function id(value){if(typeof value!=='string'||!slug.test(value))throw new Error('Invalid scoped identifier.');return value;}
export async function storageReadiness(config){
 if(!config)return {status:'not_configured',message:'SSD archive is not configured.'};
 try{await ensureStore(config,{create:false});return {status:'connected',message:'SSD records available. Broker grants scope each task; folder permissions are not an OS sandbox.',recordsRoot:config.recordsRoot,mediaRoot:config.mediaRoot};}
 catch{return {status:'unavailable',message:'SSD records are unavailable. New team work is blocked until the configured drive is mounted.'};}
}
export async function ensureStore(config,{create=true}={}){
 const volume=config.recordsVolume;
 if(!config.testing){
  if(!['/ABSOLUTE/TEST/WORKSPACES','/Volumes/MAC SSD'].includes(volume))throw new Error('Unapproved archive volume.');
  const mount=await stat(volume);if(!mount.isDirectory()||await realpath(volume)!==volume||(await stat('/')).dev===mount.dev)throw new Error('Configured SSD is not mounted.');
 }
 const rel=relative(volume,config.recordsRoot);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Archive must live inside its configured volume.');
 await safePath(volume,rel,create);if(create)await mkdir(config.recordsRoot,{recursive:true,mode:0o700});
 const info=await lstat(config.recordsRoot);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('Archive root must be a real directory.');
}
async function safePath(root,path,create=false){
 const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..')||isAbsolute(path))throw new Error('Unsafe archive path.');
 let cursor=root;
 for(let i=0;i<parts.length;i++){
  cursor=join(cursor,parts[i]);
  try{const s=await lstat(cursor);if(s.isSymbolicLink())throw new Error('Archive symlinks are forbidden.');if(i<parts.length-1&&!s.isDirectory())throw new Error('Archive parent is not a directory.');}
  catch(e){if(e.code!=='ENOENT')throw e;if(create&&i<parts.length-1)await mkdir(cursor,{mode:0o700});}
 }
 return cursor;
}
export {safePath as officeStorePath};
async function put(root,path,text){
 const target=await safePath(root,path,true);
 try{if(await readFile(target,'utf8')===text)return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=join(dirname(target),`.${randomUUID()}.tmp`);await writeFile(temp,text,{mode:0o600});await rename(temp,target);
}
async function object(root,text){const hash=digest(text),path=`objects/${hash.slice(0,2)}/${hash}.txt`;await put(root,path,text);return {id:hash,path,sha256:hash,bytes:Buffer.byteLength(text)};}
const json=value=>JSON.stringify(value,null,2)+'\n';
const withoutOutput=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='output'));
export async function prepareAgentWorkspace(config,job,agentId,partId){
 await ensureStore(config);id(job.id);id(agentId);id(partId);
 const path=`agents/${agentId}/tasks/${job.id}/${partId}/workspace`;
 await safePath(config.recordsRoot,path+'/placeholder',true);
 return join(config.recordsRoot,path);
}
export async function archiveJob(job,config){
 await ensureStore(config);id(job.id);
 const root=config.recordsRoot,base=`tasks/${job.id}`;
 const outputs={};for(const step of job.steps??[])if(step.output)outputs[step.id]=await object(root,step.output);
 const reports=(job.departmentReports??[]);const reportArtifacts={};for(const report of reports)if(report.output)reportArtifacts[report.id]=await object(root,report.output);
 const final=job.output?await object(root,job.output):null;
 await put(root,base+'/brief.json',json({id:job.id,createdAt:job.createdAt,brief:job.brief,context:job.context,criteria:job.criteria,concurrency:job.concurrency,clientScope:job.knowledgeContext?.scope??'owner-provided-task-context',...(job.knowledgeContext?{knowledgeContext:job.knowledgeContext,contextRequest:job.contextRequest}:{})}));
 const inputIds={};
 for(const step of job.steps??[]){
  id(step.id);id(step.agentId);id(step.roleId);
  const folder=`agents/${step.agentId}/tasks/${job.id}/${step.id}`;
  const allowed=Object.fromEntries([step.id,...step.dependsOn].filter(x=>outputs[x]).map(x=>[outputs[x].id,outputs[x]]));
  const input=await object(root,json({brief:job.brief,...(job.knowledgeContext?{ownerNotes:job.context,pinnedContext:job.knowledgeContext}:{approvedContext:job.context}),criteria:job.criteria,assignment:step.assignment,dependencies:step.dependsOn.map(x=>({partId:x,artifact:outputs[x]??null}))}));
  allowed[input.id]=input;inputIds[step.id]=input.id;
  await put(root,folder+'/access.json',json({version:1,agentId:step.agentId,roleId:step.roleId,jobId:job.id,partId:step.id,ownInput:input.id,readArtifacts:allowed,writePolicy:'Coordinator persists versioned outputs; no arbitrary filesystem writes',permissionsAre:'Office broker capability, not operating-system isolation'}));
  await put(root,folder+'/assignment.json',json({partId:step.id,role:step.roleId,assignment:step.assignment,status:step.status,skills:step.skills??[],output:outputs[step.id]??null}));
  await put(root,`agents/${step.agentId}/profile.json`,json({agentId:step.agentId,roleId:step.roleId,name:step.name,model:step.model,taskScoped:Boolean(step.spawnedFromAgentId),sourceParent:step.spawnedFromAgentId??null}));
 }
 const verifiedTools=[];
 try{const folder=await safePath(root,'tool-artifacts/'+job.id);for(const entry of await readdir(folder)){
  if(!/^[a-f0-9]{32}$/.test(entry))continue;
  try{const receipt=JSON.parse(await readFile(await safePath(root,`tool-artifacts/${job.id}/${entry}/receipt.json`),'utf8'));
   if(receipt.id!==entry||receipt.jobId!==job.id||receipt.fixture||receipt.status!=='completed'||!(job.calls??[]).some(c=>c.runId===receipt.runId&&c.agentId===receipt.agentId))continue;
   for(const file of receipt.files??[]){if(!/^[a-z0-9.-]+$/.test(file.name))throw new Error('Invalid export file.');const bytes=await readFile(await safePath(root,`tool-artifacts/${job.id}/${entry}/${file.name}`));if(digest(bytes)!==file.sha256||bytes.length!==file.bytes)throw new Error('Export integrity changed.');}
   verifiedTools.push(receipt);
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }}catch(error){if(error.code!=='ENOENT')throw error;}
 const evidence=deliveryEvidence(job,verifiedTools);
 const manifest={deliveryEvidence:evidence,...(job.terminalSpecialistRecovery?{terminalSpecialistRecovery:job.terminalSpecialistRecovery,resumeTerminalSpecialist:job.resumeTerminalSpecialist===true}:{}),...(job.undispatchedRecovery?{undispatchedRecovery:job.undispatchedRecovery,resumeUndispatchedStage:job.resumeUndispatchedStage===true}:{}),...(job.cooReleaseReview?{cooReleaseReview:job.cooReleaseReview,cooReleaseReviewHistory:job.cooReleaseReviewHistory??[]}:{}),...(job.departmentPartsReviewVersion===1?{departmentPartsReviewVersion:1}:{}),...(job.parentCoordination?{parentCoordination:job.parentCoordination}:{}),...(job.deliveryHandoff?{deliveryHandoff:job.deliveryHandoff}:{}),...(job.departmentPackageReviewVersion?{departmentPackageReviewVersion:job.departmentPackageReviewVersion,headRevisionHistory:job.headRevisionHistory??[]}:{}),...(job.qaTransportHistory?{qaTransportHistory:job.qaTransportHistory}:{}),...(job.researchContext?{researchContext:job.researchContext}:{}),...(job.finalQaRawOutput?{finalQaRawOutput:job.finalQaRawOutput}:{}),id:job.id,...(job.selectedArtifacts?{selectedArtifacts:job.selectedArtifacts,selectedTaskId:job.selectedTaskId}:{}),kind:job.kind??'team',targetAgentId:job.targetAgentId,historyIds:job.historyIds,...(job.knowledgeContext?{knowledgeContext:job.knowledgeContext,contextRequest:job.contextRequest}:{}),concurrency:job.concurrency,parallelismMode:job.parallelismMode,requestedConcurrency:job.requestedConcurrency,status:job.status,updatedAt:job.updatedAt,criteria:job.criteria,plan:job.plan,steps:(job.steps??[]).map(s=>({...withoutOutput(s),artifact:outputs[s.id]??null})),departmentReports:reports.map(r=>({...withoutOutput(r),artifact:reportArtifacts[r.id]??null})),calls:job.calls,output:final,qa:job.qa,error:job.error,reviewedAt:job.reviewedAt,reviewNote:job.reviewNote,...(job.planningNormalization?{planningNormalization:job.planningNormalization}:{}),...(job.recoveredQa?{recoveredQa:job.recoveredQa}:{}),...(job.revisionHistory?{revisionAttempt:job.revisionAttempt,revisionHistory:job.revisionHistory}: {})};
 const version=digest(json(manifest));await put(root,base+`/versions/${version}.json`,json(manifest));await put(root,base+'/manifest.json',json({...manifest,version}));
 await put(root,base+'/review/qa.json',json(job.qa??{status:'not_assessed'}));
 await put(root,base+'/delivery-evidence.json',json(evidence));
 await put(root,base+'/checkpoints/'+version+'.json',json(evidence.checkpoint));
 await put(root,base+'/checkpoint.json',json({...evidence.checkpoint,archiveVersion:version}));
 const failureStages=learningFailureStages(job);
 if(failureStages.length&&job.status==='failed'){
  try{const prior=JSON.parse(await readFile(await safePath(root,base+'/learning/candidate.json'),'utf8'));await put(root,base+'/learning/candidates/'+prior.sourceVersion+'.json',json(prior));}catch(error){if(error.code!=='ENOENT')throw error;}
  const candidate={status:'candidate',sourceJobId:job.id,sourceVersion:version,evidence:failureStages.flatMap(s=>s.evidence),reviewStages:failureStages,scope:'This task only; do not promote to a client or company-wide rule automatically',approvedAt:null};
  await put(root,base+'/learning/candidates/'+version+'.json',json(candidate));await put(root,base+'/learning/candidate.json',json(candidate));
 }
 const eventPath=await safePath(root,base+`/events/${version}.json`,true);try{await writeFile(eventPath,json({at:job.updatedAt,status:job.status,version,callCount:job.calls?.length??0}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 return {status:'synced',taskPath:join(root,base),version,inputIds};
}
export async function readScopedArtifact(config,{agentId,jobId,partId,artifactId}){
 await ensureStore(config,{create:false});id(agentId);id(jobId);id(partId);if(!/^[a-f0-9]{64}$/.test(artifactId))throw new Error('Invalid artifact ID.');
 const grantPath=await safePath(config.recordsRoot,`agents/${agentId}/tasks/${jobId}/${partId}/access.json`);
 const grant=JSON.parse(await readFile(grantPath,'utf8'));
 if(grant.agentId!==agentId||grant.jobId!==jobId||grant.partId!==partId||!grant.readArtifacts[artifactId])throw new Error('This agent/task has no grant for that artifact.');
 const artifact=grant.readArtifacts[artifactId],path=await safePath(config.recordsRoot,artifact.path);
 const value=await readFile(path,'utf8');if(digest(value)!==artifact.sha256)throw new Error('Scoped artifact integrity failed.');return value;
}
export async function archiveSummary(config){
 try{
  await ensureStore(config,{create:false});const entries=await readdir(join(config.recordsRoot,'tasks'));
  const jobs=await Promise.all(entries.filter(x=>slug.test(x)).slice(0,200).map(async x=>JSON.parse(await readFile(await safePath(config.recordsRoot,`tasks/${x}/manifest.json`),'utf8'))));
  const deliveries=jobs.filter(j=>(j.kind??'team')==='team');
  const {knowledgeCatalog}=await import('./office-foundations.mjs');
  const knowledge=await knowledgeCatalog(config);
  return {status:'connected',tasks:deliveries.length,conversations:jobs.filter(j=>j.kind==='conversation').length,reviewReady:deliveries.filter(j=>j.status==='needs_review').length,rejected:deliveries.filter(j=>j.qa&&!j.qa.pass).length,learningCandidates:deliveries.filter(j=>learningFailureStages(j).length).length,approvedLessons:knowledge.lessons.filter(l=>l.status==='approved').length,message:'Candidate lessons retain exact QA evidence. Only explicitly reviewed, scope-matching lesson revisions enter new task context. Comparable-task trends are not established yet.'};
 }catch{return {status:'unavailable',message:'Archive history could not be read; counts remain unknown.'};}
}
import {learningFailureStages} from './office-learning-evidence.mjs';

import {createHash} from 'node:crypto';
import {access,open} from 'node:fs/promises';
import {modelRunOutput} from './office-review-schema.mjs';
import {parseSpecialistResponse} from './office-specialist-response.mjs';
import {departmentReviewCurrent} from './office-department-review.mjs';

export const workflowProofVersion=1;
export const coordinatingThreadId='6d2134e7-569a-5fd6-a067-767f1dc89d86';
export const workflowStopFile='/ABSOLUTE/TEST/OWNER/Documents/Jarvis OS/reports/office-goal-execution-2026-10-15/resume-project-chats/STOP.json';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
const active=new Set(['queued','planning','working','reporting','synthesising','checking','stopping','recovery_required']);
const liveGrants=new WeakMap();
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const workflowDigest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
function requireThat(condition,message){if(!condition)throw new Error(message);}
function exact(value,keys){requireThat(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),'Unexpected proof fields.');}

/** Presence is the stop signal, including empty/malformed STOP.json. Never remove it. */
export async function checkWorkflowStop(path=workflowStopFile){
 try{await access(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
 throw new Error('Shared STOP.json is present; checkpoint without further requests.');
}

/** No defaults for live client/actor/request IDs. The coordinator supplies every identity. */
export function validateWorkflowManifest(value){
 exact(value,['version','runId','baseUrl','companyId','expiresAt','clients','jobs','steps','retention']);
 requireThat(value.version===1&&uuid.test(value.runId??'')&&uuid.test(value.companyId??''),'Exact run/company UUIDs required.');
 requireThat(['http://127.0.0.1:3101','http://127.0.0.1:3103','http://127.0.0.1:3105'].includes(value.baseUrl),'Only assigned loopback Office origins allowed.');
 requireThat(Number.isFinite(Date.parse(value.expiresAt)),'Manifest expiry required.');
 requireThat(typeof value.retention==='string'&&value.retention.length>15,'Root cleanup/retention disposition required.');
 requireThat(Array.isArray(value.clients)&&value.clients.length===2,'Declare exactly two isolated client scopes.');
 const clients=new Map();const actors=new Set();const foundations=new Set();
 for(const client of value.clients){
  exact(client,['clientId','foundationId','contextRevision','actorIds','ownMarker','forbiddenMarkers','synthetic']);
  requireThat(uuid.test(client.clientId??'')&&!clients.has(client.clientId),'Distinct exact client UUIDs required.');
  requireThat(typeof client.foundationId==='string'&&client.foundationId.length>0&&!foundations.has(client.foundationId)&&hash.test(client.contextRevision??''),'Distinct pinned foundation/context revisions required.');
  requireThat(Array.isArray(client.actorIds)&&client.actorIds.length>0&&client.actorIds.every(id=>uuid.test(id)&&!actors.has(id))&&new Set(client.actorIds).size===client.actorIds.length,'Each client requires distinct exact allocated actors.');
  requireThat(typeof client.synthetic==='boolean'&&typeof client.ownMarker==='string'&&client.ownMarker.length>=8&&Array.isArray(client.forbiddenMarkers)&&client.forbiddenMarkers.length>0&&client.forbiddenMarkers.every(m=>typeof m==='string'&&m.length>=8&&m!==client.ownMarker),'Declare distinct context canaries; no client facts invented.');
  client.actorIds.forEach(id=>actors.add(id));foundations.add(client.foundationId);clients.set(client.clientId,client);
 }
 requireThat(value.clients.some(c=>c.synthetic),'The second scope must be explicitly synthetic.');
 requireThat(value.clients[0].ownMarker!==value.clients[1].ownMarker&&value.clients.every(c=>c.forbiddenMarkers.includes(value.clients.find(other=>other!==c).ownMarker)),'Both client canaries must be mutually excluded.');
 requireThat(Array.isArray(value.jobs)&&value.jobs.length>0&&value.jobs.length<=12,'Declare 1–12 exact task identities.');
 const jobs=new Map();
 for(const job of value.jobs){
  exact(job,['id','clientId','kind','actorId']);
  requireThat(uuid.test(job.id??'')&&!jobs.has(job.id)&&clients.has(job.clientId)&&['team','conversation'].includes(job.kind),'Invalid task identity/scope.');
  requireThat(job.kind==='conversation'?clients.get(job.clientId).actorIds.includes(job.actorId):job.actorId===null,'Conversation actor must belong to its declared client.');
  jobs.set(job.id,job);
 }
 requireThat(Array.isArray(value.steps)&&value.steps.length>0&&value.steps.length<=30,'Declare 1–30 exact HTTP steps.');
 const names=new Set();
 for(const step of value.steps){
  exact(step,['name','path','body','bodySha256','expectedStatus','expect']);
  requireThat(typeof step.name==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(step.name)&&!names.has(step.name),'Unique bounded step names required.');names.add(step.name);
  requireThat(['/api/office/teams','/api/office/conversations','/api/office/knowledge'].includes(step.path),'Only current native Office routes allowed.');
  requireThat(step.body&&workflowDigest(step.body)===step.bodySha256,'Exact request body hash required.');
  requireThat([200,201,400,403,409].includes(step.expectedStatus),'Explicit expected HTTP outcome required.');
  requireThat(step.expect&&typeof step.expect==='object'&&!Array.isArray(step.expect)&&Object.keys(step.expect).length>0,'Expected response fields required.');
  if(step.path==='/api/office/knowledge'){
   requireThat(step.body.action==='preview'&&value.clients.some(c=>c.foundationId===step.body.request?.foundationId),'Only declared foundation previews allowed.');
  }else{
   const job=jobs.get(step.body.id);requireThat(job,'Request ID was not declared.');const client=clients.get(job.clientId);
   if(step.body.action){
    requireThat(['stop','reconcile','recoverDepartmentQa','retryDepartmentQa','reviseDepartmentHead','continueDepartmentPackage','reviseDepartment','reviseFinal','reviewDepartmentEvidence','recoverPlanning'].includes(step.body.action),'No approval, provisioning, global resume or release operation allowed.');
   }else if(step.path==='/api/office/conversations'){
    requireThat(job.kind==='conversation'&&step.body.clientId===job.clientId&&step.body.agentId===job.actorId&&step.body.historyMode==='fresh','Conversation must pin its exact client/actor and fresh history.');
   }else{
    requireThat(job.kind==='team'&&step.body.contextRequest?.foundationId===client.foundationId&&step.body.contextRevision===client.contextRevision&&step.body.autoContext!==true,'Team task must use its explicitly previewed current context.');
   }
  }
 }
 return structuredClone(value);
}

/** A coordination interlock, not an authentication mechanism. Keep existing server/native guards. */
export async function consumeWorkflowGo(manifest,go,{consumedPath,now=new Date().toISOString(),stopFile=workflowStopFile}={}){
 validateWorkflowManifest(manifest);await checkWorkflowStop(stopFile);
 exact(go,['version','rootThreadId','runId','manifestSha256','expiresAt','maxPostRequests','authorization']);
 requireThat(go.version===1&&go.rootThreadId===coordinatingThreadId&&go.runId===manifest.runId&&go.manifestSha256===workflowDigest(manifest),'Root go does not bind this exact manifest.');
 requireThat(go.authorization==='Exact one-use HTTP workflow proof; existing per-call native policy remains mandatory.','Explicit bounded root go required.');
 requireThat(Date.parse(go.expiresAt)>Date.parse(now)&&Date.parse(manifest.expiresAt)>Date.parse(now)&&Date.parse(go.expiresAt)<=Date.parse(manifest.expiresAt),'Expired or unbounded root go.');
 requireThat(go.maxPostRequests===manifest.steps.length,'Root go must cover exactly the declared request count.');
 requireThat(typeof consumedPath==='string'&&consumedPath.endsWith('.consumed.json'),'One-use consumption receipt path required.');
 const handle=await open(consumedPath,'wx',0o600);
 try{await handle.writeFile(JSON.stringify({version:1,runId:manifest.runId,manifestSha256:workflowDigest(manifest),consumedAt:now,scope:'Consumed before first HTTP mutation. Unknown outcome requires inspection; never replay this go.'},null,2)+'\n');await handle.sync();}finally{await handle.close();}
 const grant=Object.freeze({runId:manifest.runId,consumed:true});
 liveGrants.set(grant,{manifestSha256:workflowDigest(manifest),expiresAt:go.expiresAt,used:false});return grant;
}

function field(object,path){return path.split('.').reduce((v,key)=>v?.[key],object);}
/** No HTTP retry, model execution, policy bypass, provisioning or automatic cleanup here. */
export async function executeWorkflowHttp(manifest,{grant,fetchImpl=fetch,checkpoint,stopFile=workflowStopFile,now=()=>new Date().toISOString()}={}){
 validateWorkflowManifest(manifest);
 requireThat(typeof checkpoint==='function','Durable checkpoint callback required.');
 const authorization=liveGrants.get(grant);
 requireThat(authorization&&!authorization.used&&authorization.manifestSha256===workflowDigest(manifest),'A consumed, in-process exact root grant is required.');
 authorization.used=true;
 const events=[];
 for(const [index,step] of manifest.steps.entries()){
  await checkWorkflowStop(stopFile);requireThat(Date.parse(manifest.expiresAt)>Date.parse(now())&&Date.parse(authorization.expiresAt)>Date.parse(now()),'Manifest/go expired before next HTTP request.');
  const pending={index,name:step.name,path:step.path,bodySha256:step.bodySha256,at:now(),outcome:'request_pending'};
  events.push(pending);await checkpoint(events);
  try{
   const response=await fetchImpl(manifest.baseUrl+step.path,{method:'POST',headers:{origin:manifest.baseUrl,'content-type':'application/json'},body:JSON.stringify(step.body),redirect:'error',signal:AbortSignal.timeout(30000)});
   const data=await response.json();pending.status=response.status;pending.responseSha256=workflowDigest(data);
   requireThat(response.status===step.expectedStatus,`Step ${step.name}: expected HTTP ${step.expectedStatus}, received ${response.status}.`);
   for(const [path,expected] of Object.entries(step.expect))requireThat(canonical(field(data,path))===canonical(expected),`Step ${step.name}: response field ${path} differs.`);
   pending.outcome='matched';await checkpoint(events);
  }catch(error){pending.outcome='failed_or_unknown';pending.error=error.message;await checkpoint(events);throw error;}
 }
 return events;
}

/** Assess only what the actual captured records establish. Status alone cannot prove delivery. */
export function assessWorkflowJob(job,client,{bundle,runs=[],actors=[],companyId,evidenceKind='native'}={}){
 const checks=[];const add=(id,pass,detail)=>checks.push({id,pass:pass===true,detail});
 add('exact-client',job.knowledgeContext?.scope?.clientId===client.clientId,'Saved context receipt must bind declared client.');
 add('exact-foundation',job.knowledgeContext?.foundationId===client.foundationId&&job.knowledgeContext?.revision===client.contextRevision,'Saved receipt must bind exact preview revision.');
 add('snapshot-client',bundle?.scope?.clientId===client.clientId&&bundle?.foundation?.id===client.foundationId&&bundle?.revision===client.contextRevision,'Integrity-checked saved context must match its receipt.');
 const text=canonical(bundle??null);
 add('own-context-canary',text.includes(client.ownMarker),'Own canary is present in saved context.');
 add('foreign-context-excluded',client.forbiddenMarkers.every(marker=>!text.includes(marker)),'All declared other-client canaries are absent.');
 if(job.kind==='conversation')add('fresh-history',job.historyIds?.length===0,'Fresh conversation saved no prior history IDs.');
 const calls=job.calls??[],ids=calls.map(c=>c.runId).filter(Boolean);
 add('terminal',!active.has(job.status),'Queued, active and uncertain jobs are incomplete.');
 add('unique-native-receipts',ids.length===calls.length&&new Set(ids).size===ids.length&&ids.length>0,'Every recorded call needs a distinct native run receipt.');
 add('allocated-actors',calls.length>0&&calls.every(c=>{
  if(client.actorIds.includes(c.agentId))return true;
  const step=job.steps?.find(s=>s.agentId===c.agentId),actor=actors.find(a=>a.id===c.agentId);
  return !!step&&client.actorIds.includes(step.spawnedFromAgentId)&&actor?.metadata?.jarvisClientId===client.clientId&&actor.metadata.jarvisSpawnedForTask===job.id&&actor.metadata.jarvisTaskPartId===step.id;
 }),'Each actor is allocated directly or a native-verified helper of an allocated desk for this exact task/client/part.');
 add('native-run-bindings',calls.length>0&&runs.length===calls.length&&calls.every(c=>{
  const run=runs.find(r=>r.id===c.runId);return run&&run.agentId===c.agentId&&run.companyId===companyId&&run.contextSnapshot?.issueId===c.issueId&&run.usageJson?.billingType==='subscription_included'&&run.status==='succeeded'&&c.status==='succeeded'&&!(Date.parse(run.scheduledRetryAt)>Date.now());
 }),'Read native receipts must bind company, actor, issue and subscription billing.');
 add('native-returned-bytes',calls.length>0&&calls.every(c=>{
  try{const run=runs.find(r=>r.id===c.runId);const returned=modelRunOutput(run,{structured:c.returnedOutputKind==='structured_output_projection'});return typeof returned==='string'&&returned===c.returnedOutput&&c.outputContract?.status!=='rejected'&&c.outputContract?.outputSha256===workflowDigest(returned);}catch{return false;}
 }),'Every saved returned response matches its actual native result and exact output receipt.');
 const delivered=job.kind==='conversation'?job.status==='answered':job.status==='needs_review';
 add('saved-delivery',delivered&&typeof job.output==='string'&&job.output.trim().length>0,'Answered desk or needs_review team has saved output; no owner approval inferred.');
 if(job.kind==='conversation')add('native-delivery-bytes',calls.length===1&&job.output===calls[0].returnedOutput&&job.steps?.length===1&&job.steps[0].output===job.output,'Conversation output equals the exact native response.');
 else{
  add('independent-final-review',job.qa?.pass===true&&(job.steps??[]).length>0&&job.steps.every(s=>s.status==='completed'&&s.output?.trim()),'Team has explicit passing final QA and complete parts.');
  add('current-department-packages',job.departmentReports?.length>0&&job.departmentReports.every(r=>r.status==='completed'&&departmentReviewCurrent(job,r))&&job.steps.every(s=>job.departmentReports.filter(r=>r.stepIds.includes(s.id)).length===1),'Each part belongs to one currently reviewed department package.');
  const qaCall=calls.at(-1);let qa;try{qa=JSON.parse(job.finalQaRawOutput);}catch{}
  add('native-final-verdict',qaCall?.stage==='qa'&&!job.steps?.some(s=>s.agentId===qaCall.agentId)&&!job.departmentReports?.some(r=>r.agentId===qaCall.agentId)&&qaCall.returnedOutput===job.finalQaRawOutput&&qa?.pass===true&&qa.checks?.length===job.criteria?.length&&job.criteria?.every((criterion,i)=>qa.checks[i]?.criterion===criterion&&qa.checks[i]?.pass===true),'Exact independent native final QA passes every declared criterion in order.');
  const outputCall=calls.findLast(c=>c.stage==='synthesis')??(job.assembly?calls.findLast(c=>c.stage==='specialist:'+job.steps?.[0]?.id):null);let nativeArtifact=outputCall?.returnedOutput;
  if(job.assembly&&job.specialistResponseVersion===1){try{const parsed=parseSpecialistResponse(nativeArtifact);nativeArtifact=parsed.artifact;if(parsed.receipt.artifactSha256!==job.steps[0]?.responseReceipt?.artifactSha256)nativeArtifact=null;}catch{nativeArtifact=null;}}
  add('native-delivery-bytes',!!outputCall&&job.output===nativeArtifact,'Final output equals native synthesis or the receipt-matched preserved specialist artifact. Coordinator-corrected finals require separate correction-history proof.');
 }
 return {jobId:job.id,clientId:client.clientId,status:job.status,evidenceKind,pass:checks.every(c=>c.pass),checks,outputSha256:typeof job.output==='string'?workflowDigest(job.output):null,runIds:ids,ownerApproval:job.reviewedAt??null};
}

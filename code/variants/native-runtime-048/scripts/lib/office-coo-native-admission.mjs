/** Exact-task or finite future-owner native grant. No global goal policy is modified or consulted
 * as an alternative allowance. No HTTP/model/env object can create authority. */
import {open,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {readReactivePrivateJson,readOfficeCooReactiveGrant,assertReactivePrivateDirectory,canonical,sha} from './office-coo-reactive-grant.mjs';
import {readOfficeCooCapturedInputs} from './office-coo-captured-input.mjs';
import {officeCooReactiveTaskRequest} from './office-coo-reactive.mjs';
import {validateOfficeCooOperationalGrant,claimOfficeCooOperationalTask,readOfficeCooOperationalTask,officeCooOperationalStageCount,officeCooOperationalActor} from './office-coo-operational-grant.mjs';
import {officeCooRepairForStage,assertOfficeCooRepairStage} from './office-coo-native-repair.mjs';
export const officeCooPrivateDirectory=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel');
const fail=()=>{throw Error('Exact owner WhatsApp native admission requires review.');};
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const token=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const stage=x=>['planning','synthesis','coo-release','qa'].includes(x)||/^(specialist|department|department-parts-qa|department-qa):[a-z0-9-]{1,80}$/.test(x);
export function officeCooTaskLineage(request){const scope=request.scope?.kind==='client'?{kind:'client',clientId:request.scope.clientId}:{kind:'agency'};return 'Owner WhatsApp task lineage v1 '+JSON.stringify({jobId:request.jobId,requestSha256:request.requestSha256,eventId:request.eventId,messageId:request.messageId,nativeMessageSha256:request.rawSha256,scope})+'\nOwner-channel delivery is separate from client scope, brand, access, QC and publication approval. No client sending, publishing, spending or credential changes are authorised by this turn.';}
export function officeCooNativeGrantRevision(value){const body={...value};delete body.revision;return sha(body);}
export function readOfficeCooNativeRequest(directory=officeCooPrivateDirectory,jobId){const grant=readReactivePrivateJson(directory,'reactive-native-grant.json',262144);if(grant.version===1)return grant.request;if(grant.version!==2||!uuid(jobId))fail();const claim=readReactivePrivateJson(directory,'coo-native-task.'+jobId+'.json',65536);if(claim.grantRevision!==grant.revision||claim.jobId!==jobId)fail();return readOfficeCooOperationalTask(directory,claim.request,grant).request;}
async function sync(directory){const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}}
async function once(directory,name,value){const h=await open(join(directory,name),'wx',0o600);try{await h.writeFile(canonical(value)+'\n');await h.sync();}finally{await h.close();}await sync(directory);if(canonical(readReactivePrivateJson(directory,name))!==canonical(value))fail();}
/** All overrides are trusted source/test construction dependencies, never CLI or
 * JSON options. `readJob` must be the existing engine reader for stage admission. */
export function createOfficeCooNativeAdmission({config,request,directory=officeCooPrivateDirectory,now=Date.now,readJob,readActors}={}){
 const binding={...config.binding,senderPhone:config.binding.senderPhone.replace(/^\+/,''),ownerParticipantId:config.binding.ownerParticipantId.replace(/^\+/,'')};
 let pinned;
 function current(){
  const at=now(),{grant:reply,policy}=readOfficeCooReactiveGrant({runtimeDirectory:directory,binding},new Date(at).toISOString()),g=readReactivePrivateJson(directory,'reactive-native-grant.json',262144);
  if(g.enabled!==true||g.authority?.kind!=='owner-instruction'||!token(g.authority.principal)||typeof g.authority.reference!=='string'||!g.authority.reference.trim()||g.replyGrantRevision!==reply.revision||g.policySha256!==reply.policySha256||!digest(g.revision)||officeCooNativeGrantRevision(g)!==g.revision||pinned&&g.revision!==pinned||!uuid(request.jobId)||!digest(request.requestSha256)||request.policySha256!==g.policySha256||!Number.isFinite(at)||!Number.isFinite(Date.parse(g.issuedAt))||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.issuedAt)>at||Date.parse(g.expiresAt)<=at||Date.parse(g.expiresAt)<=Date.parse(g.issuedAt)||Date.parse(g.expiresAt)>Date.parse(reply.expiresAt)||!Array.isArray(g.actors)||!g.actors.length||g.actors.length>512||g.actors.some(a=>!uuid(a.agentId)||!['codex_local','claude_local'].includes(a.adapterType)||!token(a.model)||Object.keys(a).sort().join(',')!=='adapterType,agentId,model')||new Set(g.actors.map(a=>a.agentId)).size!==g.actors.length)fail();
  if(g.version===2)validateOfficeCooOperationalGrant(g,reply,request,at);
  else if(g.version!==1||g.purpose!=='exact-owner-whatsapp-native-task'||canonical(g.request)!==canonical(request)||Date.parse(g.expiresAt)-Date.parse(g.issuedAt)>3600000||!Number.isSafeInteger(g.maxStages)||g.maxStages<1||g.maxStages>128||Object.keys(g).sort().join(',')!=='actors,authority,enabled,expiresAt,issuedAt,maxStages,policySha256,purpose,replyGrantRevision,request,revision,version')fail();
  pinned??=g.revision;return {grant:g,policy};
 }
 async function authentic(){
  const {grant,policy}=current(),captures=await readOfficeCooCapturedInputs({config,policy,resolveScope:async()=>request.scope,now}),event=captures.events.find(e=>e.eventId===request.eventId);
  if(!event||canonical(officeCooReactiveTaskRequest(policy,event,now()))!==canonical(request))fail();current();return grant;
 }
 function taskMatches(task){if(task?.id!==request.jobId||task.brief!==request.text.trim()||task.context!==officeCooTaskLineage(request)||(task.kind??'team')!=='team'||(task.departmentId??null)!==null)fail();}
 function savedMatches(job){taskMatches(job);if(job.queueManaged===true||(job.knowledgeContext?.scope.clientId??null)!==(request.scope.kind==='client'?request.scope.clientId:null))fail();}
 async function assertJob(job){await authentic();savedMatches(job);return true;}
 async function admit(task){taskMatches(task);if(task.autoContext!==true)fail();const grant=await authentic(),name='coo-native-task.'+request.jobId+'.json',body={version:1,jobId:request.jobId,requestSha256:request.requestSha256,grantRevision:grant.revision};
  if(grant.version===2){await claimOfficeCooOperationalTask(directory,request,grant,new Date(now()).toISOString());current();return {canDispatch:true,reason:'finite_owner_whatsapp_grant'};}
  try{if(canonical(readReactivePrivateJson(directory,name))!==canonical(body))fail();}catch(e){if(e.code!=='ENOENT')throw e;await once(directory,name,body);}current();return {canDispatch:true,reason:'exact_owner_whatsapp_grant'};
 }
 async function modelPolicy(context){
  let lock;const lockPath=join(directory,'coo-native-stage.lock');
  try{
   if(typeof readJob!=='function')fail();assertReactivePrivateDirectory(directory);
   // Serialize only local immutable receipt allocation, including parallel engine
   // stages. A retained lock is never stolen; no external operation is retried.
   const deadline=Date.now()+5000;while(!lock){try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code!=='EEXIST'||Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,20));}}
   const grant=await authentic(),job=await readJob(request.jobId);savedMatches(job);
   const repair=grant.version===1?officeCooRepairForStage({directory,config,request,nativeGrant:grant,job,at:now()}):null;
   if(repair&&!repair.allowedStages.includes(context?.stage))fail();
   if(grant.version===2){readOfficeCooOperationalTask(directory,request,grant);if(await officeCooOperationalStageCount(directory,grant)>=grant.maxTotalStages)fail();}
   else{const admission=readReactivePrivateJson(directory,'coo-native-task.'+request.jobId+'.json');if(canonical(admission)!==canonical({version:1,jobId:request.jobId,requestSha256:request.requestSha256,grantRevision:grant.revision}))fail();}
   const actorAllowed=context&&(grant.version===2?await officeCooOperationalActor(grant,request,job,context,readActors):grant.actors.some(a=>a.agentId===context.agentId&&a.adapterType===context.adapterType&&a.model===context.model));
   if(!context||!stage(context.stage)||!actorAllowed||job.calls?.filter(c=>c.stage===context.stage&&c.agentId===context.agentId&&c.model===context.model&&c.status==='dispatching'&&c.runId===null).length!==1)fail();
   const prefix='coo-native-stage.'+request.jobId+'.',names=(await readdir(directory)).filter(n=>n.startsWith(prefix)).sort();if(names.length>=(grant.version===2?grant.maxStagesPerTask:grant.maxStages))fail();
   if(repair)assertOfficeCooRepairStage(job,repair,context,names.length);
   let previous=null;for(const [i,name] of names.entries()){
    if(name!==prefix+String(i+1).padStart(4,'0')+'.json')fail();const receipt=readReactivePrivateJson(directory,name),{revision,...body}=receipt;
    if(receipt.version!==1||receipt.ordinal!==i+1||receipt.jobId!==request.jobId||receipt.requestSha256!==request.requestSha256||receipt.grantRevision!==grant.revision||receipt.previousRevision!==previous||sha(body)!==revision)fail();
    if(i<(repair?.failure.priorStageCount??0)){if(Object.hasOwn(receipt,'repairRevision')||Object.hasOwn(receipt,'operatorGrantRevision'))fail();}
    else if(repair){if(receipt.repairRevision!==repair.repairRevision||receipt.operatorGrantRevision!==repair.revision)fail();}
    else if(Object.hasOwn(receipt,'repairRevision')||Object.hasOwn(receipt,'operatorGrantRevision'))fail();
    if(receipt.stage===context.stage&&(!repair||i>=repair.failure.priorStageCount))fail();previous=revision;
   }
   if(repair&&names.length-repair.failure.priorStageCount>=repair.maxAdditionalStages)fail();
   const body={version:1,ordinal:names.length+1,jobId:request.jobId,requestSha256:request.requestSha256,grantRevision:grant.revision,previousRevision:previous,stage:context.stage,agentId:context.agentId,adapterType:context.adapterType,model:context.model,at:new Date(now()).toISOString(),...(repair?{repairRevision:repair.repairRevision,operatorGrantRevision:repair.revision}:{})},receipt={...body,revision:sha(body)};
   await once(directory,prefix+String(body.ordinal).padStart(4,'0')+'.json',receipt);
   // Consumed before invocation; revocation here does not restore a credit.
   current();if(repair){const latest=await readJob(request.jobId);officeCooRepairForStage({directory,config,request,nativeGrant:grant,job:latest,at:now()});assertOfficeCooRepairStage(latest,repair,context,names.length);}return true;
  }catch{return false;}finally{if(lock){await lock.close();await unlink(lockPath);await sync(directory);}}
 }
 current();return Object.freeze({admit,assertJob,modelPolicy,request:JSON.parse(JSON.stringify(request))});
}

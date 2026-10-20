import 'server-only';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {localOfficeEnabled,coordinatorWorkerEnvironment} from './office-runtime.mjs';
import {loadOfficeCooCapture} from '../../scripts/start-office-coo-capture.mjs';
import {readOfficeCooPrivateJson,verifyOfficeCooServiceRequest,OFFICE_COO_SERVICE_BODY_LIMIT} from '../../scripts/lib/office-coo-service-auth.mjs';
import {readOfficeCooCapturedInputs} from '../../scripts/lib/office-coo-captured-input.mjs';
import {officeCooReactiveTaskRequest,type CooReactiveTaskRequest,type CooReactiveScope,type CooReactivePolicy} from '../../scripts/lib/office-coo-reactive.mjs';
import {officeCurrentRoutingFoundations} from './office-current-routing-server';
import {resolveCooFoundation,cooMessageInput} from './office-coo-message.mjs';
import {submitOfficeTeamTask} from './office-paperclip-team-server';
import {readJob} from '../../scripts/lib/office-team-engine.mjs';
import {readOfficeCooServiceResponse,saveOfficeCooServiceResponse,type OfficeCooServiceResponse} from '../../scripts/lib/office-coo-service-receipts.mjs';
import {createOfficeCooNativeAdmission,officeCooTaskLineage} from '../../scripts/lib/office-coo-native-admission.mjs';
import {canonical} from '../../scripts/lib/office-coo-reactive-grant.mjs';

export {OFFICE_COO_SERVICE_BODY_LIMIT};

const directory=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);

/** Narrow service capability, never a borrowed owner JWT or public identity.
 * No config enables itself. The capture-only receiver and external Access stay intact. */
export async function officeCooServiceCall(body:string,headers:{at:string;signature:string}){
 if(!localOfficeEnabled()||Buffer.byteLength(body)>OFFICE_COO_SERVICE_BODY_LIMIT)throw Error('COO service unavailable.');
 const secret=await readOfficeCooPrivateJson(directory,'reactive-service-secret.json',256);
 if(secret.version!==1||Object.keys(secret).sort().join(',')!=='secret,version'||!verifyOfficeCooServiceRequest(secret.secret,{...headers,body}))throw Error('COO service authentication failed.');
 const input=JSON.parse(body) as {version:number;action:string;request?:CooReactiveTaskRequest};
 if(input.version!==1||!['events','submit','read'].includes(input.action)||Object.keys(input).some(k=>!['version','action','request'].includes(k)))throw Error('Invalid COO service request.');
 const {config}=await loadOfficeCooCapture(directory);
 const policy=await readOfficeCooPrivateJson(directory,'reactive-policy.json') as CooReactivePolicy;
 const owner=config.binding.ownerParticipantId.replace(/^\+/,'');
 if(policy.enabled!==true||policy.channelId!==config.binding.channelId||policy.accountId!==config.binding.accountId||policy.profileId!==config.binding.profileId||policy.ownerSenderId!==owner||policy.ownerRecipientId!==owner||Date.parse(policy.expiresAt)<=Date.now())throw Error('COO routing policy unavailable.');
 const foundations=await officeCurrentRoutingFoundations();
 const resolution=(text:string)=>{
  let selected;
  try{selected=resolveCooFoundation(text,{foundationId:'agency-company',taskType:'internal',mode:'draft'},foundations);}
  catch{return {scope:{kind:'agency'} as CooReactiveScope,clarify:true} as const;}
  const foundation=foundations.find(f=>f.id===selected.foundationId);
  if(!foundation)return {scope:{kind:'agency'} as CooReactiveScope,clarify:true} as const;
  return {scope:foundation.scope.clientId?{kind:'client',clientId:foundation.scope.clientId} as CooReactiveScope:{kind:'agency'} as CooReactiveScope,selected,foundation,clarify:false} as const;
 };
 const captured=await readOfficeCooCapturedInputs({config,policy,resolveScope:input.action==='read'&&input.request?async()=>input.request!.scope:async text=>resolution(text).scope});
 if(input.action==='events')return {policySha256:digest(policy),...captured};
 const request=input.request;if(!request)throw Error('An exact captured task request is required.');
 const event=captured.events.find(e=>e.eventId===request.eventId);
 if(!event)throw Error('The exact future captured owner event is unavailable.');
 const expected=officeCooReactiveTaskRequest(policy,event);
 if(!expected||!same(expected,request))throw Error('COO captured task identity changed.');
 const lineage=officeCooTaskLineage(request);
 const serviceTask=(r:OfficeCooServiceResponse)=>({task:{jobId:r.jobId,requestSha256:r.requestSha256,scope:r.scope,status:'service_response',output:r.output}});
 const priorResponse=await readOfficeCooServiceResponse(directory,request);
 if(priorResponse)return serviceTask(priorResponse);
 const readExact=async()=>{
  let job;try{job=await readJob(request.jobId);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
  const expectedClient=request.scope.kind==='client'?request.scope.clientId:null;
  if(job.id!==request.jobId||job.brief!==request.text.trim()||job.context!==lineage||(job.knowledgeContext?.scope.clientId??null)!==expectedClient)throw Error('Saved COO task belongs to a different event or client.');
  return job;
 };
 if(input.action==='submit'){
  const prior=await readExact();if(prior)return {jobId:prior.id,status:prior.status};
  if(/^(?:(?:hi|hello|hey)(?:[ ,]+(?:jarvis|coo))?|good (?:morning|afternoon|evening)|help|\/help|who are you|what can you do|thanks|thank you|received|ok|okay)[.!?,]*$/i.test(request.text.trim()))return serviceTask(await saveOfficeCooServiceResponse(directory,request,'owner_help'));
  const clientId=request.scope.kind==='client'?request.scope.clientId:null;
  const resolved=resolution(request.text);
  if(resolved.clarify)return serviceTask(await saveOfficeCooServiceResponse(directory,request,'scope_clarification'));
  const {selected,foundation}=resolved;
  if(!foundation||(foundation.scope.clientId??null)!==clientId)throw Error('The selected current client Office is unavailable.');
  const task=cooMessageInput({id:request.jobId,brief:request.text,context:lineage,contextRequest:selected});
  try{
   const capability=createOfficeCooNativeAdmission({directory,config,request});
   const job=await submitOfficeTeamTask(task,{cooExecution:{admit:capability.admit,launch:id=>{
    if(id!==request.jobId)throw Error('COO worker task identity changed.');
    const child=spawn(process.execPath,[resolve(process.cwd(),'scripts/office-coo-task-worker.mjs'),id],{cwd:process.cwd(),env:coordinatorWorkerEnvironment() as NodeJS.ProcessEnv,detached:true,stdio:'ignore'});
    child.on('error',()=>console.error('Exact COO worker launch requires saved-task recovery. No automatic retry.'));child.unref();
   }}});
   return {jobId:job.id,status:job.status};
  }
  catch{
   // The call may have created the exact job before losing its acknowledgement.
   // Never submit it again or turn an uncertain outcome into a success claim.
   const saved=await readExact();if(saved)return {jobId:saved.id,status:saved.status};
   return serviceTask(await saveOfficeCooServiceResponse(directory,request,'admission_unconfirmed'));
  }
 }
 const job=await readExact();if(!job)return {task:null};
 // Mirror the existing saved-task launch timeout without mutating or relaunching.
 const stalled=job.status==='queued'&&!job.queueManaged&&!job.ownerPid&&Date.now()-Date.parse(job.queuedAt??job.createdAt)>60000;
 return {task:{jobId:job.id,requestSha256:request.requestSha256,scope:request.scope,status:stalled?'recovery_required':job.status==='needs_review'?'awaiting_review':job.status,...(typeof job.output==='string'?{output:job.output}:{})}};
}

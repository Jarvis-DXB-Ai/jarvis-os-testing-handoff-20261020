/** Explicit one-shot corrected-result followup. Never rewinds the reactive journal.
 * A retained attempt is read/reconciled by an operator, never automatically retried. */
import {readFileSync,lstatSync,realpathSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {join,dirname} from 'node:path';
import {jobDirectory,paperclipClient,reportsComplete,parseObject,validateQa} from './office-team-engine.mjs';
import {enforceOutputChecks} from '../../src/lib/office-output-checks.mjs';
import {modelRunOutput} from './office-review-schema.mjs';
import {cooReleaseReviewCurrent} from './office-coo-release-review.mjs';
import {officeCooRepairForStage,writeOfficeCooRepairOnce} from './office-coo-native-repair.mjs';
import {readReactivePrivateJson,readReactivePrivateBytes,readOfficeCooReactiveGrant,canonical,sha,assertReactivePrivateDirectory} from './office-coo-reactive-grant.mjs';
import {readOfficeCooCapturedInputs,createOfficeCooCapturedEnvelopeReader} from './office-coo-captured-input.mjs';
import {officeCooReactiveTaskRequest} from './office-coo-reactive.mjs';
import {officeCooProviderPhoneNumberIdFromConnection} from './office-coo-message-origin.mjs';
import {createOfficeCooZernioAdapter} from './office-coo-zernio.mjs';
import {readOfficeCooState,officeCooRequestDigest,createOfficeCooApprovalCapability,sendOfficeCooReply} from './office-coo-whatsapp.mjs';
import {officeCooReactiveAuthorityRevision,verifyReactiveApproval,claimCurrentReactiveAuthority} from './office-coo-reactive-authority.mjs';
import {mkdir,open} from 'node:fs/promises';
const DISABLED=['publishing','engagement','contacts','analytics','ads','telephony','billing','webhooks','commerce'];
const fail=()=>{throw Error('Operator correction completion requires review; retained attempts are never retried.');};
const phone=x=>x.replace(/^\+/,'');
const profiles=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x?._id):[];
export function officeCooOutboxStableSha(outbox){const stable={...outbox};delete stable.status;delete stable.observations;return sha(stable);}
export function assertOfficeCooPriorFailure(state,g,binding){
 const p=g.failure.priorFailure,o=state.outbox[p.requestId];
 if(!o||!['delivered','read'].includes(o.status)||o.providerMessageId!==p.providerMessageId||o.requestHash!==p.requestHash||o.bodySha256!==p.bodySha256||o.conversationBinding.id!==p.conversationId||o.conversationBinding.platformConversationId!==p.platformConversationId||officeCooOutboxStableSha(o)!==p.outboxStableSha256||o.observations.length<p.observationsPrefixLength||sha(o.observations.slice(0,p.observationsPrefixLength))!==p.observationsPrefixSha256||o.request.participantId!==binding.ownerParticipantId||o.request.accountId!==binding.accountId||o.request.profileId!==binding.profileId)fail();return o;
}
function readJobSync(id){
 const path=join(jobDirectory,id+'.json');for(let p=dirname(path);;p=dirname(p)){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())fail();if(dirname(p)===p)break;}
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const a=fstatSync(fd);if(!a.isFile()||a.uid!==process.getuid()||(a.mode&0o7777)!==0o600||a.nlink!==1||a.size>16*1024*1024)fail();const raw=readFileSync(fd),b=fstatSync(fd),c=lstatSync(path);if([b,c].some(s=>s.dev!==a.dev||s.ino!==a.ino||s.size!==a.size||s.mtimeMs!==a.mtimeMs||s.ctimeMs!==a.ctimeMs)||realpathSync(path)!==path||raw.length!==a.size)fail();return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}finally{closeSync(fd);}
}
export function createOfficeCooOperatorCompletion({directory,config,companyId,jobId,readTaskSync=readJobSync,api=paperclipClient(),fetchImpl=globalThis.fetch,adapterFactory=createOfficeCooZernioAdapter,send=sendOfficeCooReply,now=()=>new Date().toISOString()}={}){
 if(!/^[a-f0-9-]{36}$/.test(jobId??'')||typeof companyId!=='string'||!companyId)fail();
 const normalized={channelId:config.binding.channelId,profileId:config.binding.profileId,accountId:config.binding.accountId,senderPhone:phone(config.binding.senderPhone),ownerParticipantId:phone(config.binding.ownerParticipantId)},grantConfig={runtimeDirectory:directory,binding:normalized};let wireConfig;
 function current(){
  const {grant,policy}=readOfficeCooReactiveGrant(grantConfig,now()),native=readReactivePrivateJson(directory,'reactive-native-grant.json',262144),request=native.request,job=readTaskSync(jobId);
  if(request?.jobId!==jobId)fail();const repair=officeCooRepairForStage({directory,config,request,nativeGrant:native,job,at:Date.parse(now())});
  if(!repair||job.status!=='needs_review'||job.qa?.pass!==true||!reportsComplete(job)||!cooReleaseReviewCurrent(job)||job.calls.length!==10||job.calls.some(c=>c.status!=='succeeded'||!c.runId)||typeof job.output!=='string'||!job.output.trim()||job.output.length>4000||sha(job.output)!==repair.correction.correctedArtifactSha256)fail();
  const final=job.calls.at(-1);if(final.stage!=='qa'||final.returnedOutput!==job.finalQaRawOutput||canonical(enforceOutputChecks(validateQa(parseObject(job.finalQaRawOutput),job.criteria),job.output))!==canonical(job.qa))fail();
  let previous=null;for(const [i,call]of job.calls.entries()){
   const receipt=readReactivePrivateJson(directory,'coo-native-stage.'+jobId+'.'+String(i+1).padStart(4,'0')+'.json'),{revision,...body}=receipt;
   if(sha(body)!==revision||receipt.ordinal!==i+1||receipt.previousRevision!==previous||receipt.jobId!==jobId||receipt.requestSha256!==request.requestSha256||receipt.grantRevision!==native.revision||receipt.stage!==call.stage||receipt.agentId!==call.agentId||receipt.model!==call.model||!native.actors.some(a=>a.agentId===receipt.agentId&&a.adapterType===receipt.adapterType&&a.model===receipt.model))fail();
   if(i>=5&&(receipt.repairRevision!==repair.repairRevision||receipt.operatorGrantRevision!==repair.revision))fail();previous=revision;
  }
  return {grant,policy,native,request,job,repair,jobSha256:sha(job)};
 }
 function key(){
  const {grant}=current(),k=readReactivePrivateJson(directory,'runtime-key.json'),proof=readReactivePrivateJson(directory,'runtime-key-grant.json'),raw=readReactivePrivateBytes(directory,'runtime-key-grant-source.json'),g=proof.grant;
  if(!grant.credential||sha(k.key)!==grant.credential.keySha256||sha(proof)!==grant.credential.grantSha256||sha(raw)!==grant.credential.sourceSha256||proof.version!==1||sha(raw)!==proof.sourceSha256||sha(k.key)!==proof.keySha256||k.active!==false||k.id!==proof.keyId||g?._id!==k.id||g.isActive!==true||!Number.isFinite(Date.parse(proof.observedAt))||Date.parse(proof.observedAt)>Date.parse(grant.issuedAt)||[k,g].some(x=>x.scope!=='profiles'||x.permission!=='read-write'||canonical(profiles(x.profileIds))!==canonical([normalized.profileId])||canonical([...x.disabledResourceGroups??[]].sort())!==canonical([...DISABLED].sort())||x.expiresAt!==k.expiresAt)||k.expiresAt!==grant.keyExpiresAt||Date.parse(k.expiresAt)<=Date.parse(now())||proof.adminProbe?.status!==403||proof.adminProbe.path!=='/api-keys'||proof.adminProbe.code!=='insufficient_permissions'||proof.commerceProbe?.status!==403||proof.commerceProbe.path!=='/commerce/store?accountId='+normalized.accountId||proof.commerceProbe.code!=='insufficient_permissions')fail();
  return {secret:k.key,scope:'profiles',profileIds:[normalized.profileId],permission:'read-write',enabledResourceGroups:['accounts','messages'],adminAccess:'denied',expiresAt:k.expiresAt};
 }
 function provenance(){
  const {grant}=current(),p=grant.provenance,root=join(directory,'provenance'),raw=readReactivePrivateBytes(root,'FRESH-CLOUD-API-PROVENANCE.json',1048576);
  if(sha(raw)!==p.manifestSha256)fail();const manifest=JSON.parse(raw);if(manifest.sources?.length!==7||canonical(Object.fromEntries(manifest.sources.map(e=>[e.source,e.sha256])))!==canonical(p.receiptPins))fail();for(const [name,digest]of Object.entries(p.receiptPins))if(sha(readReactivePrivateBytes(root,name,1048576))!==digest)fail();
  const connection=readReactivePrivateBytes(root,'ZERNIO-CONNECTION-READBACK.json',1048576);wireConfig={storage:config.storage,binding:config.binding,providerPhoneNumberId:officeCooProviderPhoneNumberIdFromConnection(config,JSON.parse(connection))};return grant;
 }
 async function capture(){
  const c=current(),captured=await readOfficeCooCapturedInputs({config,policy:c.policy,resolveScope:async()=>c.request.scope,now:()=>Date.parse(now())}),event=captured.events.find(e=>e.eventId===c.request.eventId);
  if(!event||canonical(officeCooReactiveTaskRequest(c.policy,event,Date.parse(now())))!==canonical(c.request))fail();
  const state=await readOfficeCooState(config),prior=assertOfficeCooPriorFailure(state.state,c.repair,normalized),aliases=[prior.conversationBinding.id,prior.conversationBinding.platformConversationId];
  const incoming=state.state.events.map((e,i)=>({...e.value,eventId:e.id,index:i})).filter(e=>e.event==='message.received'&&[e.conversationId,e.platformConversationId].some(a=>aliases.includes(a))).sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt)||b.index-a.index)[0],signed=captured.events.find(e=>e.eventId===incoming?.eventId);
  if(state.state.disconnected||!incoming||incoming.standby||!signed||Date.parse(now())-Date.parse(incoming.sentAt)>=86400000)fail();
  return {c,state,prior,incoming,deliveryWindow:{eventId:signed.eventId,messageId:signed.messageId,rawSha256:signed.rawSha256,signedRawSha256:signed.signedRawSha256,sentAt:signed.sentAt,conversationId:incoming.conversationId,platformConversationId:incoming.platformConversationId}};
 }
 async function nativeProof(c){
  const receipts=[];
  for(const call of c.job.calls){const run=await api('/heartbeat-runs/'+call.runId),structured=call.stage==='qa'||call.stage==='coo-release'||call.stage.startsWith('department-qa:')||call.stage.startsWith('department-parts-qa:')||call.stage.startsWith('specialist:')&&c.job.specialistResponseVersion===1;if(run.id!==call.runId||run.agentId!==call.agentId||run.companyId!==companyId||run.contextSnapshot?.issueId!==call.issueId||run.status!=='succeeded'||run.scheduledRetryAt||run.usageJson?.billingType!=='subscription_included'||modelRunOutput(run,{structured})!==call.returnedOutput)fail();receipts.push({runId:run.id,agentId:run.agentId,issueId:call.issueId,status:run.status,billingType:run.usageJson.billingType,sourceSha256:sha(run)});}return receipts;
 }
 async function status(){const state=await readOfficeCooState(config),attemptName='operator-repair-send-attempt.'+jobId+'.json';let attempt;try{attempt=readReactivePrivateJson(directory,attemptName,65536);}catch(e){if(e.code!=='ENOENT')throw e;}if(attempt){const {revision,...body}=attempt;if(sha(body)!==revision||attempt.jobId!==jobId||!/^operator-repair-[a-f0-9-]{36}-0$/.test(attempt.requestId))fail();}const outbox=attempt?state.state.outbox[attempt.requestId]:null;if(outbox&&(outbox.requestHash!==attempt.requestHash||outbox.bodySha256!==attempt.outputSha256||outbox.request.participantId!==normalized.ownerParticipantId))fail();return {jobId,repairRevision:attempt?.repairRevision??null,attemptRetained:!!attempt,status:outbox?.status??(attempt?'uncertain_no_retry':'not_attempted'),providerMessageId:outbox?.providerMessageId??null,sent:false};}
 async function sendCompletion(){
  // Exclusive immutable claim later serialises concurrent invocations before any HTTP.
  const initial=await capture(),c=initial.c;provenance();key();const nativeRuns=await nativeProof(c);
  if(current().jobSha256!==c.jobSha256)fail();
  const intentBody={version:1,purpose:'operator-repair-completion',jobId,requestSha256:c.request.requestSha256,operatorGrantRevision:c.repair.revision,repairRevision:c.repair.repairRevision,replyGrantRevision:c.grant.revision,policySha256:c.grant.policySha256,jobSha256:c.jobSha256,outputSha256:sha(c.job.output),priorFailure:c.repair.failure.priorFailure,nativeRuns};
  const idHash=sha(intentBody),intentId=idHash.slice(0,8)+'-'+idHash.slice(8,12)+'-5'+idHash.slice(13,16)+'-8'+idHash.slice(17,20)+'-'+idHash.slice(20,32),request={requestId:'operator-repair-'+intentId+'-0',profileId:normalized.profileId,accountId:normalized.accountId,senderPhone:normalized.senderPhone,participantId:normalized.ownerParticipantId,conversationId:initial.incoming.conversationId,message:c.job.output},requestHash=officeCooRequestDigest(wireConfig,request);
  const attemptBody={...intentBody,intentId,requestId:request.requestId,requestHash,claimedAt:now()},attempt={...attemptBody,revision:sha(attemptBody)};
  await writeOfficeCooRepairOnce(directory,'operator-repair-send-attempt.'+jobId+'.json',attempt);
  const turnRoot=join(directory,'operator-repair-completions');await mkdir(turnRoot,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});assertReactivePrivateDirectory(turnRoot);const turn=join(turnRoot,intentId);await mkdir(turn,{mode:0o700});assertReactivePrivateDirectory(turn);for(const path of [turnRoot,directory]){const d=await open(path,'r');try{await d.sync();}finally{await d.close();}}
  const at=now(),expiresAt=new Date(Math.min(Date.parse(at)+900000,Date.parse(c.repair.expiresAt),Date.parse(c.grant.expiresAt))).toISOString(),record={version:1,sequence:0,previousRevision:null,binding:normalized,approval:{id:'repair-'+intentId,principal:c.grant.principal,requestHash,issuedAt:at,expiresAt},status:'pending',privacy:{cloudApiEventSharing:false,marketingOptimization:false,observedAt:c.grant.privacy.observedAt,evidenceSha256:c.grant.privacy.evidenceSha256},operatorReview:{principal:c.grant.principal,issuedAt:at,expiresAt,evidenceSha256:c.grant.revision},claim:null};record.revision=officeCooReactiveAuthorityRevision(record);
  await writeOfficeCooRepairOnce(turn,'send-authority.json',record);await writeOfficeCooRepairOnce(turn,'intent.json',{...intentBody,intentId,request,deliveryWindow:initial.deliveryWindow});
  const authority={privateDirectory:turn,...grantConfig,now};
  function unchanged(){const latest=current(),saved=readReactivePrivateJson(directory,'operator-repair-send-attempt.'+jobId+'.json',65536);if(latest.jobSha256!==c.jobSha256||latest.repair.revision!==c.repair.revision||canonical(saved)!==canonical(attempt))fail();return latest;}
  const adapter=adapterFactory(wireConfig,{now,fetchImpl,getApiKey:async()=>{unchanged();return key();},verifyPrivacy:async()=>{try{unchanged();return true;}catch{return false;}},verifyCurrentSendAuthority:async ctx=>{
   unchanged();const latest=await capture();if(canonical(latest.deliveryWindow)!==canonical(initial.deliveryWindow)||ctx.signedInbound.messageId!==initial.deliveryWindow.messageId||Date.parse(ctx.signedInbound.sentAt)!==Date.parse(initial.deliveryWindow.sentAt)||ctx.requestHash!==requestHash)fail();
   const verdict=await claimCurrentReactiveAuthority(authority,ctx);unchanged();return verdict;
  },verifyDefaultControlProvenance:async ctx=>{
   try{unchanged();provenance();if(ctx.mode!==c.grant.provenance.mode||ctx.requestHash!==requestHash||ctx.signedInbound.messageId!==initial.deliveryWindow.messageId||Date.parse(ctx.signedInbound.sentAt)!==Date.parse(initial.deliveryWindow.sentAt)||ctx.conversation.threadControl!==undefined||ctx.messagePages.at(-1)?.response?.pagination?.hasMore!==false||ctx.messagePages.at(-1)?.response?.pagination?.nextCursor!==null)fail();const reader=await createOfficeCooCapturedEnvelopeReader(wireConfig);if(reader.events.some(e=>e.value.event==='conversation.control_changed'||e.value.standby))fail();for(const event of reader.events){const body=await reader.read(event);if(body.metadata?.standby===true||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.source)||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.metadata?.source))fail();}return true;}catch{return false;}
  }});
  const verify=async(a,r)=>{try{unchanged();return await verifyReactiveApproval(authority,a,r);}catch{return false;}},cap=await createOfficeCooApprovalCapability(wireConfig,request,{now,approval:record.approval,verifyApproval:verify});
  const result=await send(wireConfig,request,cap,{now,...adapter});
  if(!['accepted','sent','delivered','read'].includes(result.outbox.status)||!result.outbox.providerMessageId)fail();
  unchanged();assertOfficeCooPriorFailure((await readOfficeCooState(config)).state,c.repair,normalized);
  const receipt={version:1,jobId,repairRevision:c.repair.repairRevision,intentId,requestId:request.requestId,bodySha256:sha(c.job.output),providerMessageId:result.outbox.providerMessageId,status:result.outbox.status,at:now()};
  await writeOfficeCooRepairOnce(directory,'operator-repair-completion-receipt.'+jobId+'.json',receipt);return receipt;
 }
 return Object.freeze({sendCompletion,status});
}

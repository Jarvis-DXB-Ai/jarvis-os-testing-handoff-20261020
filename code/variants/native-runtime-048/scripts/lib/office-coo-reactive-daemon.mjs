/** Durable owner-channel runtime. Trusted injection seams are for synthetic tests;
 * CLI uses fixed private files, loopback service and the existing checked adapter.
 * Import does not read files, start timers, contact providers or grant authority.
 */
import {mkdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOfficeCooReactive,recoverOfficeCooReactiveLease} from './office-coo-reactive.mjs';
import {readOfficeCooCapturedInputs,createOfficeCooCapturedEnvelopeReader} from './office-coo-captured-input.mjs';
import {createOfficeCooZernioAdapter} from './office-coo-zernio.mjs';
import {officeCooProviderPhoneNumberIdFromConnection} from './office-coo-message-origin.mjs';
import {readOfficeCooState,officeCooRequestDigest,createOfficeCooApprovalCapability,sendOfficeCooReply} from './office-coo-whatsapp.mjs';
import {verifyReactiveApproval,claimCurrentReactiveAuthority,officeCooReactiveAuthorityRevision} from './office-coo-reactive-authority.mjs';
import {readOfficeCooReactiveGrant,readReactivePrivateJson,readReactivePrivateBytes,canonical,sha,policyHash,assertReactivePrivateDirectory} from './office-coo-reactive-grant.mjs';
import {signOfficeCooServiceRequest} from './office-coo-service-auth.mjs';
const DISABLED=['publishing','engagement','contacts','analytics','ads','telephony','billing','webhooks','commerce'];
const fail=()=>{throw Error('Private COO reactive runtime requires review; no automatic retry.');};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const phone=v=>typeof v==='string'?v.replace(/^\+/,''):'';
const profiles=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x?._id):[];
const textHash=v=>createHash('sha256').update(v,'utf8').digest('hex');
async function sync(directory){const h=await open(directory,'r');try{await h.sync();}finally{await h.close();}}
async function writeOnce(directory,name,value){const h=await open(join(directory,name),'wx',0o600);try{await h.writeFile(canonical(value)+'\n');await h.sync();}finally{await h.close();}await sync(directory);}
/** Deterministic lossless UTF16-safe split. The exact raw output is also retained
 * by the reactive journal; per-part wire hashes and authority claims are separate.
 */
export function officeCooReplyParts(intent){
 if(typeof intent.body!=='string'||textHash(intent.body)!==intent.bodySha256||!intent.body.trim()||intent.body.length>256*1024||!uuid(intent.id)||!uuid(intent.jobId))fail();
 if(intent.body.length<=4000)return [intent.body];const chunks=[];let start=0;while(start<intent.body.length){let end=Math.min(start+3800,intent.body.length);if(end<intent.body.length&&/[\uD800-\uDBFF]/.test(intent.body[end-1]))end--;chunks.push(intent.body.slice(start,end));start=end;}
 return chunks.map((body,i)=>`Office task ${intent.jobId} (${i+1}/${chunks.length})\n${body}`);
}
/** Bounded authenticated service client. No owner JWT, raw provider read fallback,
 * alternate host, redirects, implicit retries or model access.
 */
export function createOfficeCooReactiveService({directory,fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()}){
 return async(action,request)=>{
  if(!['events','submit','read'].includes(action))fail();const body=JSON.stringify({version:1,action,...(request?{request}:{})}),secret=readReactivePrivateJson(directory,'reactive-service-secret.json',256),at=now();
  if(secret.version!==1||Object.keys(secret).sort().join(',')!=='secret,version')fail();const signature=signOfficeCooServiceRequest(secret.secret,at,body),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetchImpl('http://127.0.0.1:3103/api/office/internal/coo',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','x-jarvis-coo-at':at,'x-jarvis-coo-signature':signature},body});if(response.status!==200||response.redirected||!response.headers.get('content-type')?.includes('application/json')||!response.body?.getReader)fail();const reader=response.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)fail();parts.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}finally{await reader.cancel().catch(()=>{});}}finally{clearTimeout(timer);}
 };
}
/** No automatic lock removal. A retained lock or uncertain send is operator-visible
 * and fails closed; recoveryStatus returns exact persisted evidence without sending.
 */
export function createOfficeCooReactiveDaemon({directory,config,fetchImpl=globalThis.fetch,now=()=>new Date().toISOString(),serviceCall,adapterFactory=createOfficeCooZernioAdapter,send=sendOfficeCooReply}={}){
 const normalized={channelId:config.binding.channelId,profileId:config.binding.profileId,accountId:config.binding.accountId,senderPhone:phone(config.binding.senderPhone),ownerParticipantId:phone(config.binding.ownerParticipantId)};
 const initial=readOfficeCooReactiveGrant({runtimeDirectory:directory,binding:normalized},now()),expectedGrantRevision=initial.grant.revision;
 const grantConfig={runtimeDirectory:directory,binding:normalized,expectedGrantRevision};
 const current=()=>readOfficeCooReactiveGrant(grantConfig,now());
 const call=serviceCall??createOfficeCooReactiveService({directory,fetchImpl,now});
 const turnRoot=join(directory,'reactive-turn-authorities');
 let wireConfig;
 function key(){
  const {grant}=current(),k=readReactivePrivateJson(directory,'runtime-key.json'),proof=readReactivePrivateJson(directory,'runtime-key-grant.json'),raw=readReactivePrivateBytes(directory,'runtime-key-grant-source.json'),g=proof.grant;
  if(!grant.credential||sha(k.key)!==grant.credential.keySha256||sha(proof)!==grant.credential.grantSha256||sha(raw)!==grant.credential.sourceSha256||proof.version!==1||sha(raw)!==proof.sourceSha256||sha(k.key)!==proof.keySha256||k.active!==false||k.id!==proof.keyId||g?._id!==k.id||g.isActive!==true||!Number.isFinite(Date.parse(proof.observedAt))||Date.parse(proof.observedAt)>Date.parse(grant.issuedAt)||[k,g].some(x=>x.scope!=='profiles'||x.permission!=='read-write'||canonical(profiles(x.profileIds))!==canonical([normalized.profileId])||canonical([...x.disabledResourceGroups??[]].sort())!==canonical([...DISABLED].sort())||x.expiresAt!==k.expiresAt)||k.expiresAt!==grant.keyExpiresAt||Date.parse(k.expiresAt)<=Date.parse(now())||proof.adminProbe?.status!==403||proof.adminProbe.path!=='/api-keys'||proof.adminProbe.code!=='insufficient_permissions'||proof.commerceProbe?.status!==403||proof.commerceProbe.path!=='/commerce/store?accountId='+normalized.accountId||proof.commerceProbe.code!=='insufficient_permissions')fail();
  return {secret:k.key,scope:'profiles',profileIds:[normalized.profileId],permission:'read-write',enabledResourceGroups:['accounts','messages'],adminAccess:'denied',expiresAt:k.expiresAt};
 }
 function provenance(){
  const {grant}=current(),p=grant.provenance,root=join(directory,'provenance'),manifestRaw=readReactivePrivateBytes(root,'FRESH-CLOUD-API-PROVENANCE.json',1024*1024);
  if(sha(manifestRaw)!==p.manifestSha256)fail();const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestRaw));if(!Array.isArray(manifest.sources)||manifest.sources.length!==7||canonical(Object.fromEntries(manifest.sources.map(e=>[e.source,e.sha256])))!==canonical(p.receiptPins))fail();for(const [name,digest]of Object.entries(p.receiptPins))if(sha(readReactivePrivateBytes(root,name,1024*1024))!==digest)fail();
  const connection=readReactivePrivateBytes(root,'ZERNIO-CONNECTION-READBACK.json',1024*1024);if(sha(connection)!==p.receiptPins['ZERNIO-CONNECTION-READBACK.json'])fail();const providerPhoneNumberId=officeCooProviderPhoneNumberIdFromConnection(config,JSON.parse(connection));wireConfig={storage:config.storage,binding:config.binding,providerPhoneNumberId};return grant;
 }
 async function capture(intent){
  const {policy}=current();if(intent.policySha256!==policyHash(policy))fail();const captured=await readOfficeCooCapturedInputs({config,policy,now:()=>Date.parse(now()),resolveScope:async()=>intent.scope});const event=captured.events.find(e=>e.eventId===intent.eventId);
  if(!event||event.messageId!==intent.messageId||event.rawSha256!==intent.rawSha256||event.sentAt!==intent.sentAt||event.capturedAt!==intent.capturedAt||event.channelId!==intent.channelId||event.accountId!==intent.accountId||event.profileId!==intent.profileId||event.senderId!==intent.ownerSenderId||intent.ownerRecipientId!==normalized.ownerParticipantId||intent.channelId!==normalized.channelId||intent.accountId!==normalized.accountId||intent.profileId!==normalized.profileId||!event.aliases.every(id=>intent.aliases.includes(id)))fail();
  const full=readReactivePrivateJson(directory,'coo-reactive-state.json',16*1024*1024).records?.[intent.jobId];
  if(!full||canonical(full.replyIntent)!==canonical(intent)||!['reply_prepared','sending','reply_uncertain','replied'].includes(full.phase))fail();
  const request=full.request,task=(await call('read',request)).task;
  if(!task||task.jobId!==intent.jobId||task.requestSha256!==intent.requestSha256||canonical(task.scope)!==canonical(intent.scope)||task.status!==intent.taskStatus)fail();
  const body=['blocked','failed','cancelled','recovery_required'].includes(task.status)?`Office task ${intent.jobId} is ${task.status}.`:task.output;
  if(body!==intent.body||textHash(body)!==intent.bodySha256||(typeof task.output==='string'?textHash(task.output):sha(null))!==intent.outputSha256)fail();
  const state=await readOfficeCooState(config),original=state.state.events.find(e=>e.id===intent.eventId)?.value;if(!original||original.messageId!==intent.messageId)fail();const aliases=[original.conversationId,original.platformConversationId],inbound=state.state.events.map((e,i)=>({...e.value,i,eventId:e.id})).filter(e=>e.event==='message.received'&&[e.conversationId,e.platformConversationId].some(id=>aliases.includes(id))).sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt)||b.i-a.i)[0];
  if(state.state.disconnected||!inbound||inbound.standby||Date.parse(now())-Date.parse(inbound.sentAt)>=86400000)fail();const delivery=captured.events.find(e=>e.eventId===inbound.eventId&&e.messageId===inbound.messageId);if(!delivery)fail();return {...inbound,deliveryWindow:{eventId:delivery.eventId,messageId:delivery.messageId,rawSha256:delivery.rawSha256,signedRawSha256:delivery.signedRawSha256,sentAt:delivery.sentAt,conversationId:inbound.conversationId,platformConversationId:inbound.platformConversationId}};
 }
 async function prepare(intent,index,body,inbound){
  const grant=current().grant;if(!uuid(intent.id))fail();assertReactivePrivateDirectory(directory);await mkdir(turnRoot,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});assertReactivePrivateDirectory(turnRoot);const d=join(turnRoot,intent.id+'-'+index);await mkdir(d,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});assertReactivePrivateDirectory(d);await sync(turnRoot);await sync(directory);
  const request={requestId:'reactive-'+intent.id+'-'+index,profileId:normalized.profileId,accountId:normalized.accountId,senderPhone:normalized.senderPhone,participantId:normalized.ownerParticipantId,conversationId:inbound.conversationId,message:body};
  const requestHash=officeCooRequestDigest(wireConfig,request),authority={privateDirectory:d,...grantConfig,now};
  let record;try{record=readReactivePrivateJson(d,'send-authority.json');}catch(e){if(e.code!=='ENOENT')throw e;const at=now(),expiresAt=new Date(Math.min(Date.parse(at)+900000,Date.parse(grant.expiresAt))).toISOString();record={version:1,sequence:0,previousRevision:null,binding:normalized,approval:{id:'turn-'+intent.id+'-'+index,principal:grant.principal,requestHash,issuedAt:at,expiresAt},status:'pending',privacy:{cloudApiEventSharing:false,marketingOptimization:false,observedAt:grant.privacy.observedAt,evidenceSha256:grant.privacy.evidenceSha256},operatorReview:{principal:grant.principal,issuedAt:at,expiresAt,evidenceSha256:grant.revision},claim:null};record.revision=officeCooReactiveAuthorityRevision(record);await writeOnce(d,'send-authority.json',record);await writeOnce(d,'intent.json',{version:1,grantRevision:grant.revision,intent,index,request,deliveryWindow:inbound.deliveryWindow});}
  const saved=readReactivePrivateJson(d,'intent.json',1024*1024);if(saved.grantRevision!==grant.revision||canonical(saved.intent)!==canonical(intent)||saved.index!==index||canonical(saved.request)!==canonical(request)||record.approval.requestHash!==requestHash)fail();
  if(!saved.deliveryWindow||saved.deliveryWindow.conversationId!==request.conversationId)fail();return {directory:d,authority,approval:record.approval,request,deliveryWindow:saved.deliveryWindow};
 }
 async function sendTurn(intent){
  provenance();key();await capture(intent);const parts=officeCooReplyParts(intent);let providerMessageId;
  for(let i=0;i<parts.length;i++){
   const inbound=await capture(intent),turn=await prepare(intent,i,parts[i],inbound),loaded=await readOfficeCooState(wireConfig),existing=loaded.state.outbox[turn.request.requestId];
   if(existing){if(existing.requestHash!==officeCooRequestDigest(wireConfig,turn.request)||!['accepted','sent','delivered','read'].includes(existing.status)||!existing.providerMessageId)fail();providerMessageId=existing.providerMessageId;continue;}
   const verify=async(a,r)=>{try{current();return await verifyReactiveApproval(turn.authority,a,r);}catch{return false;}};
   const adapter=adapterFactory(wireConfig,{now,fetchImpl,getApiKey:async()=>key(),verifyPrivacy:async()=>{try{current();return true;}catch{return false;}},verifyCurrentSendAuthority:async ctx=>{const latest=await capture(intent);if(canonical(latest.deliveryWindow)!==canonical(turn.deliveryWindow)||ctx.signedInbound.messageId!==turn.deliveryWindow.messageId||Date.parse(ctx.signedInbound.sentAt)!==Date.parse(turn.deliveryWindow.sentAt))fail();return claimCurrentReactiveAuthority(turn.authority,ctx);},verifyDefaultControlProvenance:async ctx=>{
    try{provenance();if(ctx.mode!==current().grant.provenance.mode||ctx.requestHash!==officeCooRequestDigest(wireConfig,turn.request)||ctx.signedInbound.messageId!==turn.deliveryWindow.messageId||Date.parse(ctx.signedInbound.sentAt)!==Date.parse(turn.deliveryWindow.sentAt)||ctx.conversation.threadControl!==undefined||ctx.messagePages.at(-1)?.response?.pagination?.hasMore!==false||ctx.messagePages.at(-1)?.response?.pagination?.nextCursor!==null)fail();const captured=await createOfficeCooCapturedEnvelopeReader(wireConfig);if(captured.events.some(e=>e.value.event==='conversation.control_changed'||e.value.standby))fail();for(const event of captured.events){const body=await captured.read(event);if(body.metadata?.standby===true||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.source)||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.metadata?.source))fail();}return true;}catch{return false;}
   }});
   const cap=await createOfficeCooApprovalCapability(wireConfig,turn.request,{now,approval:turn.approval,verifyApproval:verify}),result=await send(wireConfig,turn.request,cap,{now,...adapter});
   if(!['accepted','sent','delivered','read'].includes(result.outbox.status)||!result.outbox.providerMessageId)fail();providerMessageId=result.outbox.providerMessageId;
  }
  return {accepted:true,providerMessageId};
 }
 async function reconcileReply(intent){
  current();provenance();const inbound=await capture(intent),parts=officeCooReplyParts(intent),outbox=(await readOfficeCooState(wireConfig)).state.outbox;let last;
  for(let i=0;i<parts.length;i++){const d=join(turnRoot,intent.id+'-'+i);let saved;try{saved=readReactivePrivateJson(d,'intent.json',1024*1024);}catch(e){if(e.code==='ENOENT')return null;throw e;}const request=saved.request,o=outbox[request.requestId];if(saved.grantRevision!==expectedGrantRevision||canonical(saved.intent)!==canonical(intent)||saved.index!==i||request.message!==parts[i]||request.conversationId!==inbound.conversationId||request.requestId!=='reactive-'+intent.id+'-'+i)fail();if(!o||!['accepted','sent','delivered','read'].includes(o.status)||!o.providerMessageId)return null;if(o.requestHash!==officeCooRequestDigest(wireConfig,request))fail();last=o.providerMessageId;}
  return {accepted:true,intentId:intent.id,jobId:intent.jobId,requestSha256:intent.requestSha256,bodySha256:intent.bodySha256,providerMessageId:last};
 }
 const reactive=createOfficeCooReactive({directory,serialTasks:true,now:()=>Date.parse(now()),policy:async()=>current().policy,readCaptured:async()=>{current();const response=await call('events');if(response.policySha256!==current().grant.policySha256)fail();return response.events;},submitTask:async request=>{current();return call('submit',request);},readTask:async query=>{current();const request=readReactivePrivateJson(directory,'coo-reactive-state.json',16*1024*1024).records?.[query.jobId]?.request;if(!request||request.requestSha256!==query.requestSha256||canonical(request.scope)!==canonical(query.scope))fail();return (await call('read',request)).task;},authorizeReply:async intent=>{try{provenance();key();await capture(intent);officeCooReplyParts(intent);return true;}catch{return false;}},sendReply:sendTurn,reconcileReply});
 return Object.freeze({tick:async()=>{current();let result=await reactive.tick();if(result.status==='busy'&&result.reason==='lease_held'){const recovery=await recoverOfficeCooReactiveLease(directory);if(recovery.recovered)result=await reactive.tick();}return result;},check:async()=>{const grant=provenance();key();const health=adapterFactory(wireConfig,{now,fetchImpl,getApiKey:async()=>key(),verifyPrivacy:async()=>{current();return true;},verifyCurrentSendAuthority:async()=>fail()});if(await health.verifyChannel(normalized)!==true)fail();const response=await call('events');if(response.policySha256!==grant.policySha256)fail();return {ready:true,mode:'check',grantExpiresAt:grant.expiresAt,privacyObservedAt:grant.privacy.observedAt,events:response.events.length,sent:false};},recoveryStatus:async()=>{current();const state=readReactivePrivateJson(directory,'coo-reactive-state.json',16*1024*1024),outbox=(await readOfficeCooState(config)).state.outbox;return {sequence:state.sequence,records:Object.values(state.records).map(r=>({jobId:r.jobId,phase:r.phase,parts:Object.values(outbox).filter(o=>o.request.requestId.startsWith('reactive-'+r.replyIntent?.id+'-')).map(o=>({requestId:o.request.requestId,status:o.status,providerMessageId:o.providerMessageId,requestHash:o.requestHash}))})),sent:false};}});
}

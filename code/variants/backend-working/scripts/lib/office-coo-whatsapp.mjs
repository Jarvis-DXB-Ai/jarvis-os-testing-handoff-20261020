import {open,rename,unlink,realpath,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname} from 'node:path';
import {hostname} from 'node:os';
import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {officeCooOutgoingSenderMatches} from './office-coo-message-origin.mjs';

// All configuration, clocks and callbacks are SERVER-owned, never HTTP JSON.
// The module has no network client, provider key, model, timer/cron or send default.
const capabilities=new WeakMap(),reads=new WeakMap(),conversations=new WeakMap(),coverages=new WeakMap();
const sha=/^[a-f0-9]{64}$/, safe=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const fail=m=>{throw Error(m);};
function token(x){if(typeof x!=='string'||!safe.test(x))fail('Invalid bounded identifier.');return x;}
function opaque(x){if(typeof x!=='string'||!x.length||x.length>500||/[\x00-\x1f\x7f]/.test(x))fail('Invalid bounded provider identifier.');return x;}
function phone(x){if(typeof x!=='string'||!/^\+?[1-9]\d{6,14}$/.test(x))fail('Invalid exact international phone.');return x.replace(/^\+/,'');}
function time(x){if(typeof x!=='string'||!Number.isFinite(Date.parse(x))||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x))fail('Invalid timestamp.');return Date.parse(x);}
function now(context){const value=context?.now?.()??new Date().toISOString();time(value);return value;}
function exact(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('Unexpected structured fields.');}
function scope(config){
 const x=config?.binding;exact(x,['channelId','profileId','accountId','senderPhone','ownerParticipantId']);
 const result={channelId:token(x.channelId),profileId:token(x.profileId),accountId:token(x.accountId),senderPhone:phone(x.senderPhone),ownerParticipantId:phone(x.ownerParticipantId)};
 if(result.senderPhone===result.ownerParticipantId)fail('Sender and private owner recipient must differ.');return result;
}
function base(config){return 'coo-whatsapp/'+digest(scope(config));}
function text(x){if(typeof x!=='string'||!x.trim()||x.length>4000||/[\x00-\x08\x0b-\x1f\x7f]/.test(x))fail('Invalid bounded message text.');return x;}
function request(config,x){
 exact(x,['requestId','profileId','accountId','senderPhone','participantId','conversationId','message']);const s=scope(config);
 const r={requestId:token(x.requestId),profileId:token(x.profileId),accountId:token(x.accountId),senderPhone:phone(x.senderPhone),participantId:phone(x.participantId),conversationId:opaque(x.conversationId),message:text(x.message)};
 if(r.profileId!==s.profileId||r.accountId!==s.accountId||r.senderPhone!==s.senderPhone||r.participantId!==s.ownerParticipantId)fail('Reply is outside the exact owner channel.');return r;
}
export function officeCooRequestDigest(config,value){return digest({version:1,scope:scope(config),request:request(config,value)});}
function approval(config,r,x,at){
 exact(x,['id','principal','requestHash','issuedAt','expiresAt']);token(x.id);token(x.principal);
 if(x.requestHash!==officeCooRequestDigest(config,r)||time(x.issuedAt)>time(at)||time(x.expiresAt)<=time(at)||time(x.expiresAt)<=time(x.issuedAt)||time(x.expiresAt)-time(x.issuedAt)>15*60*1000)fail('Approval is stale, future, expired or not exact.');return freeze({...x});
}
export async function createOfficeCooApprovalCapability(config,value,context){
 const r=freeze(request(config,value)),a=approval(config,r,context?.approval,now(context));
 if(typeof context?.verifyApproval!=='function'||await context.verifyApproval(a,r)!==true)fail('Trusted server approval verification failed.');
 const capability=Object.freeze({});capabilities.set(capability,{scope:digest(scope(config)),requestHash:officeCooRequestDigest(config,r),approval:a,verify:context.verifyApproval,used:false});return capability;
}

async function syncParents(config,path){for(let p=dirname(path);;p=dirname(p)){const h=await open(p,'r');try{await h.sync();}finally{await h.close();}if(p===config.storage.recordsRoot)break;}}
async function bytes(config,path,max=4*1024*1024){
 const p=await officeStorePath(config.storage.recordsRoot,path),h=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await h.stat();if(!s.isFile()||s.size>max)fail('Oversized/non-file channel record.');const b=await h.readFile();if(b.length>max||await realpath(p)!==join(await realpath(config.storage.recordsRoot),path))fail('Channel record path integrity failed.');return b;}finally{await h.close();}
}
async function immutable(config,path,value){
 const b=Buffer.isBuffer(value)?value:Buffer.from(canonical(value)+'\n'),p=await officeStorePath(config.storage.recordsRoot,path,true);let h;
 try{h=await open(p,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await h.writeFile(b);await h.sync();}catch(e){if(e.code!=='EEXIST')throw e;}finally{if(h)await h.close();}
 if(!(await bytes(config,path)).equals(b))fail('Immutable channel record collision.');await syncParents(config,p);
}
async function pointer(config,value){
 const path=base(config)+'/current.json',p=await officeStorePath(config.storage.recordsRoot,path,true),temp=path+'.'+randomUUID()+'.tmp',t=await officeStorePath(config.storage.recordsRoot,temp,true);
 const h=await open(t,'wx',0o600);try{await h.writeFile(canonical(value)+'\n');await h.sync();}finally{await h.close();}
 await officeStorePath(config.storage.recordsRoot,path);await rename(t,p);await syncParents(config,p);
 if(canonical(JSON.parse(await bytes(config,path,1000)))!==canonical(value))fail('Channel pointer readback differs.');
}
const empty=config=>({version:1,scope:scope(config),sequence:0,previousRevision:null,events:[],outbox:{},disconnected:false});
async function load(config){
 await ensureStore(config.storage,{create:false});let p;try{p=JSON.parse(await bytes(config,base(config)+'/current.json',1000));}catch(e){if(e.code==='ENOENT')return {revision:null,state:empty(config)};throw e;}
 exact(p,['revision']);if(!sha.test(p.revision??''))fail('Invalid channel pointer.');const b=await bytes(config,base(config)+'/versions/'+p.revision+'.json'),state=JSON.parse(b);
 if(digest(b.subarray(0,-1))!==p.revision||canonical(state.scope)!==canonical(scope(config))||state.version!==1||!Number.isSafeInteger(state.sequence)||!Array.isArray(state.events)||state.events.length>2000||!state.outbox||Object.keys(state.outbox).length>1000)fail('Channel ledger integrity failed.');
 const ids=new Set();for(const e of state.events){if(ids.has(e.id)||!sha.test(e.rawSha256??''))fail('Duplicate/corrupt event record.');ids.add(e.id);const raw=await bytes(config,base(config)+'/events/'+e.rawSha256+'.json',65536);if(digest(raw)!==e.rawSha256||canonical(normalize(config,JSON.parse(raw)))!==canonical(e.value))fail('Event readback integrity failed.');}
 for(const [id,o]of Object.entries(state.outbox)){if(id!==o.request.requestId||officeCooRequestDigest(config,o.request)!==o.requestHash||digest(o.request.message)!==o.bodySha256||!o.conversationBinding||!['prepared','attempting','ambiguous','accepted','sent','delivered','read','failed','conflicted'].includes(o.status)||!safe.test(o.idempotencyKey??'')||!Array.isArray(o.observations))fail('Outbox integrity failed.');opaque(o.conversationBinding.id);opaque(o.conversationBinding.platformConversationId);}
 return {revision:p.revision,state};
}
async function commit(config,loaded){
 loaded.state.sequence++;loaded.state.previousRevision=loaded.revision;if(Buffer.byteLength(canonical(loaded.state))+1>4*1024*1024)fail('Channel ledger byte limit reached.');const revision=digest(loaded.state);await immutable(config,base(config)+'/versions/'+revision+'.json',loaded.state);await pointer(config,{revision});loaded.revision=revision;return revision;
}
async function locked(config,fn){
 scope(config);await ensureStore(config.storage);const path=base(config)+'/mutation.lock',p=await officeStorePath(config.storage.recordsRoot,path,true);let h;
 try{h=await open(p,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(e){if(e.code==='EEXIST')fail('Channel is busy or interrupted; reconcile its lock explicitly.');throw e;}
 const identity={id:randomUUID(),pid:process.pid,host:hostname()};await h.writeFile(canonical(identity)+'\n');await h.sync();await syncParents(config,p);
 try{return await fn(await load(config));}finally{await h.close();if(canonical(JSON.parse(await bytes(config,path,1000)))!==canonical(identity))fail('Channel lock changed.');await unlink(p);await syncParents(config,p);}
}
export async function readOfficeCooState(config){const x=await load(config);return freeze(structuredClone(x));}
/** Capture startup probe only; never creates a store, recovers a lease or sends.
 * Readiness is a point-in-time observation, not a dispatch/mutation capability.
 */
export async function assertOfficeCooCaptureReady(config){
 await ensureStore(config.storage,{create:false});
 const assertUnlocked=async()=>{for(const name of ['mutation.lock','recovery.lock']){
  const path=await officeStorePath(config.storage.recordsRoot,base(config)+'/'+name);
  try{await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  fail('Channel capture requires explicit lock reconciliation.');
 }};
 await assertUnlocked();const {revision}=await load(config);await assertUnlocked();return freeze({revision});
}

export async function recoverOfficeCooLock(config,{expectedLockSha256}){
 if(!sha.test(expectedLockSha256??''))fail('Exact interrupted lock hash required.');await ensureStore(config.storage,{create:false});const path=base(config)+'/mutation.lock',b=await bytes(config,path,1000);if(digest(b)!==expectedLockSha256)fail('Interrupted lock differs.');const lock=JSON.parse(b);
 if(lock.host!==hostname()||!Number.isSafeInteger(lock.pid)||lock.pid<=0)fail('Cannot prove lock owner liveness.');try{process.kill(lock.pid,0);fail('Lock owner is still live.');}catch(e){if(e.code!=='ESRCH')throw e;}
 // All cooperating writers refuse an existing mutation lock. Recovery never sends.
 const guard=await officeStorePath(config.storage.recordsRoot,base(config)+'/recovery.lock',true),g=await open(guard,'wx',0o600);
 try{if(!(await bytes(config,path,1000)).equals(b))fail('Interrupted lock changed.');await load(config);const p=await officeStorePath(config.storage.recordsRoot,path);await unlink(p);await syncParents(config,p);return {recovered:true,sendReplayed:false};}finally{await g.close();await unlink(guard);}
}

function account(config,a){const s=scope(config);if(!a||a.accountId!==s.accountId||a.id!==s.accountId||a.profileId!==s.profileId||a.platform!=='whatsapp'||phone(a.username.replace(/[ ()-]/g,''))!==s.senderPhone)fail('Foreign or incomplete account binding.');}
function normalize(config,p){
 const s=scope(config);token(p.id);time(p.timestamp);if(p.test!==undefined)fail('Test events cannot authorize owner actions.');account(config,p.account);
 if(p.profiles!==undefined&&(!Array.isArray(p.profiles)||p.profiles.length!==1||p.profiles[0].id!==s.profileId))fail('Foreign profile attribution.');
 if(p.event==='account.disconnected')return {id:p.id,event:p.event,timestamp:p.timestamp};
 if(p.event==='conversation.control_changed'){
  const c=p.conversation,control=p.control;if(!c||c.platform!=='whatsapp'||c.id!==c.platformConversationId||phone(c.participantId)!==s.ownerParticipantId||!control||!['app','ai_agent','other'].includes(control.owner)||![null,'app','ai_agent','other'].includes(control.previousOwner))fail('Invalid scoped conversation control event.');
  opaque(c.id);time(p.changedAt);if(control.ownerAppId!==undefined)opaque(control.ownerAppId);
  return {id:p.id,event:p.event,timestamp:p.timestamp,platformConversationId:c.platformConversationId,participantId:s.ownerParticipantId,changedAt:p.changedAt,owner:control.owner,previousOwner:control.previousOwner,ownerAppId:control.ownerAppId??null};
 }
 if(!['message.received','message.sent','message.delivered','message.read','message.failed'].includes(p.event))fail('Unsupported owner-channel event.');
 const m=p.message,c=p.conversation;if(!m||!c||m.platform!=='whatsapp'||m.conversationId!==c.id||phone(c.participantId)!==s.ownerParticipantId)fail('Foreign owner conversation.');opaque(c.id);opaque(c.platformConversationId);opaque(m.id);opaque(m.platformMessageId);time(m.sentAt);
 const incoming=p.event==='message.received';if(m.direction!==(incoming?'incoming':'outgoing')||incoming&&phone(m.sender?.id)!==s.ownerParticipantId||!incoming&&m.sender?.id!==s.accountId)fail('Message sender/direction mismatch.');
 if(m.text!==null&&(typeof m.text!=='string'||m.text.length>16000)||!Array.isArray(m.attachments)||m.attachments.length>20)fail('Oversized message content.');
 if(p.statusAt!==undefined)time(p.statusAt);
 if(p.metadata?.standby!==undefined&&typeof p.metadata.standby!=='boolean')fail('Invalid standby indication.');
 return {id:p.id,event:p.event,timestamp:p.timestamp,conversationId:c.id,platformConversationId:c.platformConversationId,participantId:s.ownerParticipantId,messageId:m.platformMessageId,sentAt:m.sentAt,statusAt:p.statusAt??m.sentAt,bodyKnown:m.text!==null,bodySha256:m.text===null?null:digest(m.text),standby:p.metadata?.standby===true};
}
function status(outbox,status,evidence){
 outbox.observations.push(evidence);if(outbox.observations.length>200)fail('Outbox observation limit reached.');
 if(status==='conflicted'){outbox.status='conflicted';return;}
 if(status==='failed'&&['delivered','read'].includes(outbox.status)||['delivered','read'].includes(status)&&outbox.status==='failed'){outbox.status='conflicted';return;}
 if(outbox.status==='conflicted')return;
 const ranks={prepared:0,attempting:0,ambiguous:0,accepted:1,sent:2,delivered:3,read:4,failed:5};if(ranks[status]>ranks[outbox.status])outbox.status=status;
}
export async function ingestOfficeCooWebhook(config,input,context){
 const raw=input?.rawBody instanceof Uint8Array||typeof input?.rawBody==='string'?Buffer.from(input.rawBody):null;
 if(!raw||raw.length>65536||!raw.length||typeof context?.secret!=='string'||Buffer.byteLength(context.secret)<32||!sha.test(input.signature??''))fail('Invalid bounded signed webhook.');
 const expected=createHmac('sha256',context.secret).update(raw).digest();if(!timingSafeEqual(expected,Buffer.from(input.signature,'hex')))fail('Webhook signature mismatch.');
 const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),e=normalize(config,p),rawSha256=digest(raw);if(input.eventId!==e.id)fail('Webhook header/body event identity mismatch.');
 return locked(config,async loaded=>{
  const previous=loaded.state.events.find(x=>x.id===e.id);if(previous){if(previous.rawSha256!==rawSha256)fail('Event ID replay has different bytes.');return {duplicate:true,revision:loaded.revision};}
  const at=time(now(context));if(time(e.timestamp)>at||at-time(e.timestamp)>72*60*60*1000||e.sentAt&&time(e.sentAt)>at||e.statusAt&&time(e.statusAt)>at||e.changedAt&&time(e.changedAt)>at)fail('Webhook is future or outside the retained delivery window.');
  if(loaded.state.events.length>=2000)fail('Channel event limit reached; review retention without deleting evidence.');
  await immutable(config,base(config)+'/events/'+rawSha256+'.json',raw);
  const stored=await bytes(config,base(config)+'/events/'+rawSha256+'.json');
  if(!stored.equals(raw))fail('Webhook raw bytes must be stored exactly.');
  loaded.state.events.push({id:e.id,rawSha256,value:e});if(e.event==='account.disconnected')loaded.state.disconnected=true;
  if(e.event.startsWith('message.')&&e.event!=='message.received')for(const o of Object.values(loaded.state.outbox))if(o.providerMessageId===e.messageId&&o.conversationBinding.id===e.conversationId&&o.conversationBinding.platformConversationId===e.platformConversationId){
   if(e.bodyKnown&&e.bodySha256!==o.bodySha256)status(o,'conflicted',{eventId:e.id,source:'known-body-mismatch',expectedSha256:o.bodySha256,observedSha256:e.bodySha256});
   else status(o,e.event.slice(8),{eventId:e.id,statusAt:e.statusAt,source:'signed-webhook',bodyKnown:e.bodyKnown});
  }
  await commit(config,loaded);return {duplicate:false,revision:loaded.revision,event:e};
 });
}

function handover(state,inbound){
 const values=state.events.map((x,index)=>({...x.value,index})).filter(x=>x.event==='conversation.control_changed');
 const known=values.filter(x=>x.platformConversationId===inbound.platformConversationId).sort((a,b)=>time(b.changedAt)-time(a.changedAt)||b.index-a.index);
 if(known[0]&&known[0].owner!=='app'||values.some(x=>x.platformConversationId!==inbound.platformConversationId&&x.owner!=='app'))fail('Conversation control is held elsewhere or its alias is unresolved.');return known;
}
function pagination(payload){
 const p=payload?.pagination;if(!p||typeof p.hasMore!=='boolean')fail('Provider pagination coverage is unavailable.');
 const nextCursor=p.nextCursor??null;if(p.hasMore)opaque(nextCursor);else if(nextCursor!==null)fail('Inconsistent provider pagination.');return {hasMore:p.hasMore,nextCursor};
}
function messageRow(config,m,ids){
 const s=scope(config);if(!m||m.platform!=='whatsapp'||!ids.includes(m.conversationId)||m.accountId!==s.accountId||!['incoming','outgoing'].includes(m.direction)||m.direction==='incoming'&&phone(m.senderId)!==s.ownerParticipantId||m.direction==='outgoing'&&!officeCooOutgoingSenderMatches(config,m.senderId))fail('Foreign message in scoped read.');opaque(m.id);
}
function freshConversation(config,r,inbound,state,proof,at,defaultVerified){
 const s=scope(config);if(!proof||Buffer.byteLength(canonical(proof))>1024*1024||proof.profileId!==s.profileId||time(proof.checkedAt)>time(at)||time(at)-time(proof.checkedAt)>5000)fail('Current conversation verification is stale, missing or foreign.');
 const c=proof.conversation,known=handover(state,inbound);if(!c||![inbound.conversationId,inbound.platformConversationId].includes(c.id)||c.accountId!==s.accountId||c.platform!=='whatsapp'||phone(c.participantId)!==s.ownerParticipantId)fail('Current conversation aliases/owner differ.');
 if(c.threadControl!==undefined&&c.threadControl!=='app')fail('Current conversation control is not app-owned.');
 if(c.threadControl===undefined&&(known.length||defaultVerified!==true))fail('No reported handover needs distinct trusted default-control verification.');
 const pages=proof.messagePages;if(!Array.isArray(pages)||!pages.length||pages.length>10)fail('Latest incoming message coverage is unavailable.');let cursor=null,latest;
 for(const page of pages){
  if(page.cursor!==cursor||page.response?.sortOrderApplied!=='desc'||!Array.isArray(page.response.messages)||page.response.messages.length>100)fail('Latest incoming message pages are not an exact DESC cursor chain.');
  const coverage=pagination(page.response);for(const m of page.response.messages){messageRow(config,m,[inbound.conversationId,inbound.platformConversationId]);if(!latest&&m.direction==='incoming')latest=m;}
  if(latest)break;if(!coverage.hasMore)fail('No current incoming owner message.');cursor=coverage.nextCursor;
 }
 if(!latest||latest.id!==inbound.messageId||latest.metadata?.standby===true||inbound.standby)fail('Current latest incoming message does not match signed owner evidence.');
 // GET.createdAt has no documented equivalence to native webhook.sentAt.
 // Keep its timestamp separate; the authenticated native sentAt owns the24h gate.
 if(latest.createdAt!==undefined&&time(latest.createdAt)>time(at))fail('Future observed incoming timestamp.');
 if(time(inbound.sentAt)>time(at)||time(at)-time(inbound.sentAt)>=24*60*60*1000)fail('Current owner service window is closed.');
 return {checkedAt:proof.checkedAt,proofSha256:digest(proof),control:c.threadControl??'no-reported-handover',inboundMessageId:inbound.messageId};
}

export async function sendOfficeCooReply(config,value,capability,context){
 const r=freeze(request(config,value)),requestHash=officeCooRequestDigest(config,r),cap=capabilities.get(capability);
 if(!cap||cap.scope!==digest(scope(config))||cap.requestHash!==requestHash)fail('No exact trusted approval capability.');
 return locked(config,async loaded=>{
  approval(config,r,cap.approval,now(context));const existing=Object.hasOwn(loaded.state.outbox,r.requestId)?loaded.state.outbox[r.requestId]:null;if(existing){if(existing.requestHash!==requestHash)fail('Request ID reused with different body.');return {replayed:true,outbox:freeze(structuredClone(existing))};}
  if(cap.used||Object.values(loaded.state.outbox).some(o=>o.approval.id===cap.approval.id))fail('Approval capability was already consumed.');
  if(typeof context?.transport!=='function'||typeof context.verifyChannel!=='function'||typeof context.verifyConversation!=='function'||await context.verifyChannel(freeze(scope(config)))!==true||await cap.verify(cap.approval,r)!==true)fail('Trusted channel/conversation/approval verification failed.');
  const at=now(context);approval(config,r,cap.approval,at);if(loaded.state.disconnected)fail('Channel disconnected; no automatic recovery send.');
  const inbound=loaded.state.events.map((x,index)=>({...x.value,index})).filter(x=>x.event==='message.received'&&(x.conversationId===r.conversationId||x.platformConversationId===r.conversationId)).sort((a,b)=>time(b.sentAt)-time(a.sentAt)||b.index-a.index)[0];
  if(!inbound||inbound.standby||time(inbound.sentAt)>time(at)||time(at)-time(inbound.sentAt)>=24*60*60*1000)fail('No trusted open owner service window.');
  handover(loaded.state,inbound);
  if(Object.keys(loaded.state.outbox).length>=1000)fail('Outbox limit reached.');
  const o={request:r,requestHash,bodySha256:digest(r.message),conversationBinding:{id:inbound.conversationId,platformConversationId:inbound.platformConversationId},approval:cap.approval,idempotencyKey:'coo-'+randomUUID(),createdAt:at,status:'prepared',providerMessageId:null,observations:[]};loaded.state.outbox[r.requestId]=o;await commit(config,loaded);cap.used=true;
  await context.checkpoint?.('prepared');o.status='attempting';await commit(config,loaded);await context.checkpoint?.('attempting');
  const wire=freeze({method:'POST',path:'/v1/inbox/conversations/'+encodeURIComponent(r.conversationId)+'/messages',headers:{'Idempotency-Key':o.idempotencyKey},body:{accountId:r.accountId,message:r.message}});
  let invoked=false;
  try{
   if(await cap.verify(cap.approval,r)!==true)fail('Approval revoked before transport.');
   const proof=await context.verifyConversation(r,freeze(scope(config)),freeze({id:inbound.conversationId,platformConversationId:inbound.platformConversationId,messageId:inbound.messageId,sentAt:inbound.sentAt}));
   let defaultVerified=false;if(proof?.conversation?.threadControl===undefined&&typeof context.verifyDefaultControl==='function')defaultVerified=await context.verifyDefaultControl(proof.defaultControlEvidence,freeze({request:r,binding:scope(config),conversation:proof.conversation,checkedAt:proof.checkedAt,signedInbound:inbound}))===true;
   freshConversation(config,r,inbound,loaded.state,proof,now(context),defaultVerified);
   if(await context.verifyChannel(freeze(scope(config)))!==true)fail('Channel readiness changed before transport.');
   // Approval is the final asynchronous authority check: provider reads may revoke it.
   // Check freshness/expiry synchronously after this await; never replay an attempted send.
   if(await cap.verify(cap.approval,r)!==true)fail('Approval revoked after provider verification.');
   const beforeSend=now(context);approval(config,r,cap.approval,beforeSend);o.observations.push({source:'fresh-conversation-check',...freshConversation(config,r,inbound,loaded.state,proof,beforeSend,defaultVerified)});
   const timeoutMs=config.transportTimeoutMs??10000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('Invalid bounded transport timeout.');
   const controller=new AbortController();let timer;let ack;
   try{ack=await Promise.race([Promise.resolve().then(()=>{invoked=true;return context.transport(wire,{signal:controller.signal});}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Unknown transport outcome.'));},timeoutMs);})]);}finally{clearTimeout(timer);}
   await context.checkpoint?.('transport-returned');
   if(ack?.success!==true||!ack.data||ack.data.conversationId!==r.conversationId||ack.data.partialFailure||ack.warnings?.length)fail('Ambiguous or partial transport acknowledgement.');
   opaque(ack.data.messageId);if(Object.values(loaded.state.outbox).some(other=>other!==o&&other.providerMessageId===ack.data.messageId))fail('Provider message ID already belongs to another send.');o.providerMessageId=ack.data.messageId;o.status='accepted';o.observations.push({source:'transport-ack',at:now(context)});
  }catch{o.status='ambiguous';o.observations.push({source:invoked?'transport-uncertain':'halted-before-transport',at:now(context)});}
  await commit(config,loaded);return {replayed:false,outbox:freeze(structuredClone(o))};
 });
}
export async function reconcileOfficeCooOutbox(config,{requestId},context){
 token(requestId);if(typeof context?.observe!=='function')fail('Trusted provider observation callback required.');
 return locked(config,async loaded=>{
  const o=Object.hasOwn(loaded.state.outbox,requestId)?loaded.state.outbox[requestId]:null;if(!o)fail('Unknown outbox request.');
  const e=await context.observe(freeze(structuredClone(o)));exact(e,['evidenceId','accountId','profileId','participantId','conversationId','bodySha256','messageId','status','observedAt']);
  if(!e||e.accountId!==o.request.accountId||e.profileId!==o.request.profileId||phone(e.participantId)!==o.request.participantId||e.conversationId!==o.request.conversationId||e.bodySha256!==o.bodySha256||!['sent','delivered','read','failed'].includes(e.status)||time(e.observedAt)>time(now(context))||time(e.observedAt)<time(o.createdAt))fail('Observation is not exact provider evidence.');
  token(e.evidenceId);opaque(e.messageId);if(o.providerMessageId&&o.providerMessageId!==e.messageId||Object.values(loaded.state.outbox).some(other=>other!==o&&other.providerMessageId===e.messageId))fail('Observation conflicts with provider message ID.');o.providerMessageId=e.messageId;status(o,e.status,{...e,source:'trusted-provider-observation'});await commit(config,loaded);return freeze(structuredClone(o));
 });
}

/** Read request/response capabilities prevent unvalidated conversation IDs becoming reads. */
export function officeCooScopedReadRequest(config,{resource,conversation,cursor}){
 const s=scope(config);let path,query={};if(resource==='health')path='/v1/accounts/'+s.accountId+'/health';
 else if(resource==='conversations'){path='/v1/inbox/conversations';query={profileId:s.profileId,accountId:s.accountId,platform:'whatsapp',limit:100,sortOrder:'desc'};}
 else if(resource==='messages'){const c=conversations.get(conversation);if(!c||c.scope!==digest(s))fail('Trusted owner conversation read capability required.');path='/v1/inbox/conversations/'+encodeURIComponent(c.id)+'/messages';query={accountId:s.accountId,limit:100,sortOrder:'desc'};}
 else fail('Unsupported scoped read.');if(cursor!==undefined){if(resource==='health')fail('Health has no cursor.');query.cursor=opaque(cursor);}const value=freeze({method:'GET',path,query});reads.set(value,{scope:digest(s),resource});return value;
}
export function validateOfficeCooScopedReadResponse(config,read,payload){
 const b=reads.get(read),s=scope(config);if(!b||b.scope!==digest(s))fail('Untrusted scoped read request.');
 if(b.resource==='health'){if(payload?.accountId!==s.accountId||payload.platform!=='whatsapp'||payload.tokenStatus?.valid!==true||payload.platformConnection?.status!=='connected'||payload.platformConnection?.inboundWebhookSubscribed!==true)fail('Exact channel health not verified.');return freeze(structuredClone(payload));}
 if(b.resource==='conversations'){
  if(!Array.isArray(payload?.data)||payload.data.length>100||Buffer.byteLength(canonical(payload))>1024*1024)fail('Invalid bounded conversation listing.');
  const coverage=pagination(payload),result=Object.freeze(payload.data.map(c=>{if(c.accountId!==s.accountId||c.platform!=='whatsapp'||phone(c.participantId)!==s.ownerParticipantId||c.profileId!==undefined&&c.profileId!==s.profileId)fail('Foreign conversation in scoped read.');opaque(c.id);const value=freeze(structuredClone(c));conversations.set(value,{scope:digest(s),id:c.id});return value;}));coverages.set(result,{scope:digest(s),resource:b.resource,firstPage:read.query.cursor===undefined,...coverage,complete:read.query.cursor===undefined&&!coverage.hasMore&&payload.meta?.accountsFailed===0&&Array.isArray(payload.meta?.accountsSkipped)&&payload.meta.accountsSkipped.length===0,latestIncomingProven:false});return result;
 }
 if(!Array.isArray(payload?.messages)||payload.messages.length>100||Buffer.byteLength(canonical(payload))>1024*1024)fail('Invalid bounded message listing.');
 if(payload.sortOrderApplied!=='desc')fail('Provider did not prove DESC message order.');const coverage=pagination(payload),id=decodeURIComponent(read.path.split('/')[4]);for(const m of payload.messages)messageRow(config,m,[id]);const result=freeze(structuredClone(payload.messages));coverages.set(result,{scope:digest(s),resource:b.resource,firstPage:read.query.cursor===undefined,...coverage,complete:read.query.cursor===undefined&&!coverage.hasMore,latestIncomingProven:read.query.cursor===undefined&&result.some(m=>m.direction==='incoming'),sortOrderApplied:'desc'});return result;
}
export function officeCooReadCoverage(config,result){const value=coverages.get(result);if(!value||value.scope!==digest(scope(config)))fail('Untrusted read coverage.');const {scope:_,...coverage}=value;return freeze({...coverage});}

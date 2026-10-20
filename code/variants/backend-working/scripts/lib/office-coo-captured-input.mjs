import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readOfficeCooState} from './office-coo-whatsapp.mjs';
import {officeStorePath} from './office-archive.mjs';

const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
function scope(value){
 if(value?.kind==='agency'&&Object.keys(value).join(',')==='kind')return {kind:'agency'};
 if(value?.kind==='client'&&Object.keys(value).sort().join(',')==='clientId,kind'&&typeof value.clientId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.clientId))return {kind:'client',clientId:value.clientId};
 throw new Error('captured_scope_invalid');
}
async function parents(directory){
 if(typeof directory!=='string'||directory.includes('\0')||resolve(directory)!==directory)throw new Error('captured_path_invalid');
 for(let p=directory;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('captured_symlink_or_parent');if(dirname(p)===p)break;}
 if(await realpath(directory)!==directory)throw new Error('captured_path_invalid');
}
async function rawEnvelope(config,base,event){
 const relative=base+'/events/'+event.rawSha256+'.json',path=await officeStorePath(config.storage.recordsRoot,relative);
 await parents(dirname(path));const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const a=await f.stat();if(!a.isFile()||a.nlink!==1||a.size<1||a.size>65536)throw new Error('captured_raw_bound');
  const bytes=await f.readFile(),b=await f.stat(),c=await lstat(path);
  if(bytes.length!==a.size||[b,c].some(s=>s.dev!==a.dev||s.ino!==a.ino||s.size!==a.size||s.mtimeMs!==a.mtimeMs||s.ctimeMs!==a.ctimeMs)||hash(bytes)!==event.rawSha256)throw new Error('captured_raw_changed');
  await parents(dirname(path));if(await officeStorePath(config.storage.recordsRoot,relative)!==path)throw new Error('captured_path_changed');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{await f.close();}
}
/** Read only an exact ledger-pinned signed archive envelope. Archive volumes may
 * synthesize file modes (ExFAT); private credentials never use this reader.
 * The existing storage boundary, no-symlink/single-link checks, bounded stable
 * descriptor and immutable raw digest remain the authority for these captures.
 */
export async function readOfficeCooCapturedEnvelope(config,event){
 return (await createOfficeCooCapturedEnvelopeReader(config)).read(event);
}
/** One already-validated immutable snapshot for a linear provenance scan. Each
 * actual envelope read still enforces descriptor/path identity and raw digest.
 * Newly appended events need a fresh reader; caller-supplied IDs grant nothing. */
export async function createOfficeCooCapturedEnvelopeReader(config){
 const loaded=await readOfficeCooState(config),events=loaded.state.events.map(e=>structuredClone(e)),pins=new Map(events.map(e=>[e.id,e])),base='coo-whatsapp/'+hash(loaded.state.scope);
 return Object.freeze({revision:loaded.revision,events:structuredClone(events),read:async event=>{
  const saved=pins.get(event.id);if(!saved||saved.rawSha256!==event.rawSha256)throw new Error('captured_event_unavailable');
  return rawEnvelope(config,base,saved);
 }});
}
/** Trusted server-only read. Authentication derives solely from the existing
 * HMAC-ingested immutable capture ledger, never from caller-supplied events.
 * No capture mutation, current-time substitution, model or transport occurs.
 */
export async function readOfficeCooCapturedInputs({config,policy,resolveScope,now=Date.now}){
 if(typeof resolveScope!=='function'||typeof now!=='function')throw new Error('captured_trusted_callbacks');
 const clock=now(),p=JSON.parse(JSON.stringify(policy));
 if(!Number.isFinite(clock)||p?.version!==1||p.enabled!==true||!stamp(p.activationAt)||!stamp(p.expiresAt)||Date.parse(p.activationAt)>clock||Date.parse(p.expiresAt)<=clock||Date.parse(p.activationAt)>=Date.parse(p.expiresAt)||!Array.isArray(p.excludeEventIds)||!p.excludeEventIds.every(nonempty)||new Set(p.excludeEventIds).size!==p.excludeEventIds.length||p.authority?.kind!=='owner-instruction'||!nonempty(p.authority.reference))throw new Error('captured_policy_invalid');
 await parents(config.storage.recordsRoot);
 const loaded=await readOfficeCooState(config),binding=loaded.state.scope;
 if(p.channelId!==binding.channelId||p.accountId!==binding.accountId||p.profileId!==binding.profileId||p.ownerSenderId!==binding.ownerParticipantId)throw new Error('captured_policy_binding');
 const base='coo-whatsapp/'+hash(binding),ignored=[],prepared=[],excludedNative=new Map(),nativePins=new Map(),blockedNative=new Map();
 const ignore=(event,reason)=>ignored.push({eventId:event.id,signedRawSha256:event.rawSha256,...(typeof event.value.messageId==='string'?{messageId:event.value.messageId}:{}),reason});
 // Freeze entire native identities represented by old/excluded signed aliases.
 for(const event of loaded.state.events){const v=event.value;if(v.event!=='message.received')continue;let reason;if(p.excludeEventIds.includes(event.id))reason='frozen_exclusion';else if(!stamp(v.timestamp)||!stamp(v.sentAt))throw new Error('captured_timestamp_invalid');else if(Date.parse(v.timestamp)<=Date.parse(p.activationAt)||Date.parse(v.sentAt)<=Date.parse(p.activationAt))reason='historical';if(reason)excludedNative.set(v.messageId,reason);}
 for(const event of loaded.state.events){
  const v=event.value;
  if(p.excludeEventIds.includes(event.id)){ignore(event,'frozen_exclusion');continue;}
  if(v.event!=='message.received'){ignore(event,'unsupported_event');continue;}
  if(excludedNative.has(v.messageId)){ignore(event,excludedNative.get(v.messageId));continue;}
  if(!stamp(v.timestamp)||!stamp(v.sentAt)||Date.parse(v.timestamp)>clock||Date.parse(v.sentAt)>clock)throw new Error('captured_future_or_invalid_timestamp');
  const raw=await rawEnvelope(config,base,event),m=raw.message,c=raw.conversation;
  if(raw.id!==event.id||raw.event!=='message.received'||raw.timestamp!==v.timestamp||!m||!c||m.direction!=='incoming'||m.platform!=='whatsapp'||raw.account?.accountId!==binding.accountId||raw.account?.profileId!==binding.profileId||m.platformMessageId!==v.messageId||m.sentAt!==v.sentAt||c.id!==v.conversationId||c.platformConversationId!==v.platformConversationId||m.conversationId!==c.id||String(m.sender?.id).replace(/^\+/,'')!==binding.ownerParticipantId||v.participantId!==binding.ownerParticipantId)throw new Error('captured_native_binding');
  const native={accountId:binding.accountId,profileId:binding.profileId,messageId:v.messageId,senderId:binding.ownerParticipantId,conversationAliases:[...new Set([v.conversationId,v.platformConversationId])].sort(),text:m.text,sentAt:new Date(v.sentAt).toISOString()};
  const nativeHash=hash(native);if(nativePins.has(v.messageId)&&nativePins.get(v.messageId)!==nativeHash)throw new Error('captured_native_identity_conflict');nativePins.set(v.messageId,nativeHash);
  const unsupported=reason=>{blockedNative.set(v.messageId,reason);ignore(event,reason);};
  if(c.isGroup===true||c.isGroup==='true'||m.isGroup===true||raw.metadata?.isGroup===true||[c.type,c.kind].some(type=>typeof type==='string'&&['group','broadcast','community'].includes(type.toLowerCase()))||[c.id,c.platformConversationId,m.conversationId].some(id=>typeof id==='string'&&/@(?:g\.us|broadcast)$/i.test(id))){unsupported('unsupported_group');continue;}
  if(v.standby===true){unsupported('standby');continue;}
  if(!Array.isArray(m.attachments)||m.attachments.length){unsupported('unsupported_attachments');continue;}
  if(m.text===null){unsupported('null_text');continue;}
  if(typeof m.text!=='string'||!m.text.trim()){unsupported('empty_text');continue;}
  if(m.text.length>6000){unsupported('oversize_text');continue;}
  if(/[\x00-\x08\x0b-\x1f\x7f]/.test(m.text)){unsupported('unsupported_text_controls');continue;}
  if(v.bodyKnown!==true||v.bodySha256!==hash(m.text))throw new Error('captured_text_hash');
  prepared.push({event,native,rawSha256:hash(native),capturedAt:new Date(v.timestamp).toISOString()});
 }
 const groups=new Map();for(const row of prepared){if(blockedNative.has(row.native.messageId)){ignore(row.event,blockedNative.get(row.native.messageId));continue;}const previous=groups.get(row.native.messageId);if(previous&&previous.rawSha256!==row.rawSha256)throw new Error('captured_native_identity_conflict');if(previous)previous.rows.push(row);else groups.set(row.native.messageId,{rawSha256:row.rawSha256,rows:[row]});}
 // All byte/scope conflicts are checked before invoking any context resolver.
 const events=[];for(const group of groups.values()){
  const resolved=scope(await resolveScope(group.rows[0].native.text));
  const aliases=group.rows.map(row=>row.event.id).sort();
  for(const row of group.rows)events.push({eventId:row.event.id,messageId:row.native.messageId,rawSha256:row.rawSha256,signedRawSha256:row.event.rawSha256,channelId:binding.channelId,accountId:binding.accountId,profileId:binding.profileId,senderId:binding.ownerParticipantId,authenticated:true,direction:'incoming',type:'text',text:row.native.text,sentAt:row.native.sentAt,capturedAt:row.capturedAt,scope:{...resolved},aliases:[...aliases]});
 }
 return {revision:loaded.revision,events,ignored};
}

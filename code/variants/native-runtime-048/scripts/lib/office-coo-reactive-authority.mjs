/** Separate one-use authority minted only under a durable, revocable runtime grant.
 * No initializer, environment reads, provider, approval creation, recovery or send.
 * All writers (including a human operator) must honour send-authority.lock.
 */
import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {constants,openSync,lstatSync,fstatSync,readSync,realpathSync,closeSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {officeCooRequestDigest} from './office-coo-whatsapp.mjs';
import {readOfficeCooReactiveGrant,canonical as grantCanonical} from './office-coo-reactive-grant.mjs';

const FILE='send-authority.json',LOCK='send-authority.lock',MAX_BYTES=32768,WINDOW=15*60*1000;
const idempotency=/^coo-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const fail=message=>{throw Error(message);};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('Unexpected authority fields.');}
function token(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(value))fail('Invalid authority identifier.');return value;}
function opaque(value){if(typeof value!=='string'||!value.length||value.length>500||/[\x00-\x1f\x7f]/.test(value))fail('Invalid provider identifier.');return value;}
function time(value){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail('Invalid authority timestamp.');return Date.parse(value);}
function phone(value){if(typeof value!=='string'||!/^\+?[1-9]\d{6,14}$/.test(value))fail('Invalid authority phone binding.');return value.replace(/^\+/,'');}
function binding(value){
 exact(value,['channelId','profileId','accountId','senderPhone','ownerParticipantId']);
 const b={channelId:token(value.channelId),profileId:token(value.profileId),accountId:token(value.accountId),senderPhone:phone(value.senderPhone),ownerParticipantId:phone(value.ownerParticipantId)};
 if(b.senderPhone===b.ownerParticipantId)fail('Authority sender and owner must differ.');return b;
}
function settings(config){
 if(!config||typeof config.privateDirectory!=='string'||config.privateDirectory.length>4096||!isAbsolute(config.privateDirectory)||resolve(config.privateDirectory)!==config.privateDirectory||config.privateDirectory.includes('\0')||config.now!==undefined&&typeof config.now!=='function'||typeof process.getuid!=='function')fail('Private host authority configuration required.');
 return {directory:config.privateDirectory,binding:binding(config.binding),uid:process.getuid()};
}
function now(config){const value=config.now?.()??new Date().toISOString();time(value);return value;}
/** Pure canonical digest only: this does not initialize a file or grant authority. */
export function officeCooReactiveAuthorityRevision(record){
 if(!record||typeof record!=='object'||Array.isArray(record))fail('Authority record required.');
 const {revision:_,...content}=record;return hash(content);
}
/** Exact full wire hash shared with the private adapter; no transport capability. */
export function officeCooReactiveAuthorityWireDigest(wire){
 exact(wire,['method','path','headers','body']);exact(wire.headers,['Idempotency-Key']);exact(wire.body,['accountId','message']);
 if(wire.method!=='POST'||typeof wire.path!=='string'||!idempotency.test(wire.headers['Idempotency-Key']))fail('Invalid exact setup wire.');
 return hash(wire);
}
function schema(record){
 exact(record,['version','revision','sequence','previousRevision','binding','approval','status','privacy','operatorReview','claim']);
 if(record.version!==1||!digest.test(record.revision??'')||officeCooReactiveAuthorityRevision(record)!==record.revision||!Number.isSafeInteger(record.sequence)||record.sequence<0||record.sequence===0&&record.previousRevision!==null||record.sequence>0&&!digest.test(record.previousRevision??''))fail('Authority revision integrity failed.');
 binding(record.binding);const a=record.approval;exact(a,['id','principal','requestHash','issuedAt','expiresAt']);token(a.id);token(a.principal);if(!digest.test(a.requestHash??''))fail('Invalid exact approval hash.');time(a.issuedAt);time(a.expiresAt);
 const p=record.privacy;exact(p,['cloudApiEventSharing','marketingOptimization','observedAt','evidenceSha256']);if(typeof p.cloudApiEventSharing!=='boolean'||typeof p.marketingOptimization!=='boolean'||!digest.test(p.evidenceSha256??''))fail('Unknown privacy evidence.');time(p.observedAt);
 const review=record.operatorReview;exact(review,['principal','issuedAt','expiresAt','evidenceSha256']);token(review.principal);time(review.issuedAt);time(review.expiresAt);if(!digest.test(review.evidenceSha256??''))fail('Invalid operator review evidence.');
 if(!['pending','claimed','revoked'].includes(record.status)||record.status==='pending'&&record.claim!==null||record.status==='claimed'&&record.claim===null)fail('Invalid authority lifecycle.');
 if(record.claim!==null){const c=record.claim;exact(c,['requestHash','wireHash','idempotencyKey','challenge','claimedAt']);if(!digest.test(c.requestHash??'')||!digest.test(c.wireHash??'')||!uuid.test(c.challenge??'')||!idempotency.test(c.idempotencyKey??''))fail('Invalid retained authority claim.');time(c.claimedAt);}
 return record;
}
function active(config,record,request,at,expectedStatus='pending'){
 schema(record);const s=settings(config),a=record.approval,p=record.privacy,r=record.operatorReview,n=time(at);
 if(canonical(binding(record.binding))!==canonical(s.binding)||record.status!==expectedStatus||(expectedStatus==='pending'?record.claim!==null:record.claim===null)||a.requestHash!==officeCooRequestDigest({binding:s.binding},request))fail('No pending exact setup approval.');
 for(const window of [a,r])if(time(window.issuedAt)>n||time(window.expiresAt)<=n||time(window.expiresAt)<=time(window.issuedAt)||time(window.expiresAt)-time(window.issuedAt)>WINDOW)fail('Approval or operator review is stale/future/expired.');
 const {grant}=readOfficeCooReactiveGrant(config,at);
 if(r.principal!==a.principal||a.principal!==grant.principal||grantCanonical(p)!==grantCanonical({cloudApiEventSharing:false,marketingOptimization:false,observedAt:grant.privacy.observedAt,evidenceSha256:grant.privacy.evidenceSha256})||time(a.expiresAt)>time(grant.expiresAt)||time(r.expiresAt)>time(grant.expiresAt)||r.evidenceSha256!==grant.revision)fail('Current runtime grant or reviewed privacy is unavailable.');
}
async function directDirectory(config,expected){
 const s=settings(config);let cursor='/';
 for(const part of s.directory.split('/').filter(Boolean)){cursor=join(cursor,part);const stat=await lstat(cursor);if(!stat.isDirectory()||stat.isSymbolicLink())fail('Authority ancestor must be a direct directory.');}
 const stat=await lstat(s.directory);if(stat.uid!==s.uid||(stat.mode&0o7777)!==0o700||await realpath(s.directory)!==s.directory||expected&&(stat.dev!==expected.dev||stat.ino!==expected.ino))fail('Private authority directory owner, permissions or inode differs.');
 return stat;
}
async function directoryHandle(config){
 const before=await directDirectory(config),h=await open(config.privateDirectory,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const actual=await h.stat();if(actual.dev!==before.dev||actual.ino!==before.ino)fail('Private authority directory changed.');return {h,identity:before};}catch(e){await h.close();throw e;}
}
function regular(stat,uid){if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o7777)!==0o600||stat.nlink!==1||stat.size>MAX_BYTES)fail('Private authority file owner, permissions, link or size differs.');}
async function readPrivate(config,name,directory){
 await directDirectory(config,directory);const path=join(config.privateDirectory,name),before=await lstat(path);regular(before,settings(config).uid);
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const initial=await h.stat();regular(initial,settings(config).uid);if(initial.dev!==before.dev||initial.ino!==before.ino)fail('Private authority inode changed.');
  const chunks=[];let size=0;
  while(true){const buffer=Buffer.alloc(Math.min(4096,MAX_BYTES-size+1)),{bytesRead}=await h.read(buffer,0,buffer.length,null);if(!bytesRead)break;size+=bytesRead;if(size>MAX_BYTES)fail('Private authority file exceeds byte bound.');chunks.push(buffer.subarray(0,bytesRead));}
  const raw=Buffer.concat(chunks),after=await h.stat(),current=await lstat(path);regular(after,settings(config).uid);regular(current,settings(config).uid);
  if(initial.dev!==current.dev||initial.ino!==current.ino||initial.size!==after.size||initial.size!==current.size||initial.mtimeMs!==after.mtimeMs||initial.mtimeMs!==current.mtimeMs||initial.ctimeMs!==after.ctimeMs||initial.ctimeMs!==current.ctimeMs||raw.length!==initial.size||await realpath(path)!==path)fail('Private authority file changed during read.');
  await directDirectory(config,directory);return {raw,identity:initial};
 }finally{await h.close();}
}
// Final bounded synchronous fence: no Promise gap after the original lease is
// released. A cooperating revoker may have won that gap; an old claim is NOT proof
// that privacy/approval is still current. Fail closed, retaining the consumed state.
function finalCurrentFence(config,expected,context,checkedAt){
 const s=settings(config),directory=()=>{
  let cursor='/';for(const part of s.directory.split('/').filter(Boolean)){cursor=join(cursor,part);const stat=lstatSync(cursor);if(!stat.isDirectory()||stat.isSymbolicLink())fail('Final authority ancestor differs.');}
  const stat=lstatSync(s.directory);if(stat.uid!==s.uid||(stat.mode&0o7777)!==0o700||stat.dev!==expected.directory.dev||stat.ino!==expected.directory.ino||realpathSync(s.directory)!==s.directory)fail('Final authority directory differs.');
 },unlocked=()=>{try{lstatSync(join(s.directory,LOCK));}catch(e){if(e.code==='ENOENT')return;throw e;}fail('Authority changed or is being revoked after claim.');};
 directory();unlocked();const path=join(s.directory,FILE),before=lstatSync(path);regular(before,s.uid);
 if(before.dev!==expected.file.dev||before.ino!==expected.file.ino||before.size!==expected.file.size||before.mtimeMs!==expected.file.mtimeMs||before.ctimeMs!==expected.file.ctimeMs)fail('Current authority inode/revision changed after claim.');
 const h=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let current;
 try{
  const initial=fstatSync(h);regular(initial,s.uid);if(initial.dev!==before.dev||initial.ino!==before.ino)fail('Final authority inode changed.');
  const chunks=[];let size=0;while(true){const buffer=Buffer.alloc(Math.min(4096,MAX_BYTES-size+1)),count=readSync(h,buffer,0,buffer.length,null);if(!count)break;size+=count;if(size>MAX_BYTES)fail('Final authority exceeds byte bound.');chunks.push(buffer.subarray(0,count));}
  const raw=Buffer.concat(chunks),after=fstatSync(h),atPath=lstatSync(path);regular(after,s.uid);regular(atPath,s.uid);
  if(initial.dev!==atPath.dev||initial.ino!==atPath.ino||[after,atPath].some(stat=>stat.size!==initial.size||stat.mtimeMs!==initial.mtimeMs||stat.ctimeMs!==initial.ctimeMs)||raw.length!==initial.size||realpathSync(path)!==path||!raw.equals(Buffer.from(canonical(expected.record)+'\n')))fail('Final current authority differs from persisted claim.');
  current=parse(raw);active(config,current,context.request,checkedAt,'claimed');serviceWindow(context,checkedAt);
 }finally{closeSync(h);}
 directory();unlocked();return current.revision;
}
async function unlocked(config,directory){
 await directDirectory(config,directory);try{await lstat(join(config.privateDirectory,LOCK));}catch(e){if(e.code==='ENOENT')return;throw e;}fail('Retained authority lock requires explicit operator reconciliation.');
}
function parse(raw){try{return schema(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));}catch{fail('Private authority record is invalid.');}}
async function snapshot(config){
 const d=await directoryHandle(config);try{await unlocked(config,d.identity);const value=await readPrivate(config,FILE,d.identity);await unlocked(config,d.identity);return parse(value.raw);}finally{await d.h.close();}
}
/** Fail closed on any inaccessible, stale, altered or previously claimed record. */
export async function verifyReactiveApproval(config,approval,request){
 try{const record=await snapshot(config);exact(approval,['id','principal','requestHash','issuedAt','expiresAt']);if(canonical(approval)!==canonical(record.approval))return false;active(config,record,request,now(config));return true;}catch{return false;}
}
function adapterInput(config,context){
 const required=['binding','request','signedInbound','wire','requestHash','wireHash','challenge'];exact(context,Object.hasOwn(context??{},'defaultControlEvidence')?[...required,'defaultControlEvidence']:required);
 const s=settings(config);if(canonical(binding(context.binding))!==canonical(s.binding))fail('Foreign adapter authority scope.');
 const requestHash=officeCooRequestDigest({binding:s.binding},context.request),wire=context.wire,wireHash=officeCooReactiveAuthorityWireDigest(wire);
 if(context.requestHash!==requestHash||context.wireHash!==wireHash||!uuid.test(context.challenge??'')||wire.path!=='/v1/inbox/conversations/'+encodeURIComponent(context.request.conversationId)+'/messages'||wire.body.accountId!==s.binding.accountId||wire.body.message!==context.request.message)fail('Adapter wire/request/hash differs.');
 const incoming=context.signedInbound;exact(incoming,['id','platformConversationId','messageId','sentAt']);opaque(incoming.id);opaque(incoming.platformConversationId);opaque(incoming.messageId);time(incoming.sentAt);if(![incoming.id,incoming.platformConversationId].includes(context.request.conversationId))fail('Signed incoming alias differs.');
 return {requestHash,wireHash};
}
function serviceWindow(context,at){const n=time(at),sent=time(context.signedInbound.sentAt);if(sent>n||n-sent>=24*60*60*1000)fail('Signed owner service window is closed.');}
async function exclusive(config,fn){
 const d=await directoryHandle(config),path=join(config.privateDirectory,LOCK),identity=Buffer.from(canonical({version:1,id:randomUUID(),pid:process.pid,host:hostname()})+'\n');let h,lockIdentity,result;
 try{
  await directDirectory(config,d.identity);
  try{h=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(e){if(e.code==='EEXIST')fail('Retained authority lock requires explicit operator reconciliation.');throw e;}
  await h.writeFile(identity);await h.sync();lockIdentity=await h.stat();await d.h.sync();await directDirectory(config,d.identity);result=await fn(d);
 }finally{
  try{if(h){
   await h.close();const current=await readPrivate(config,LOCK,d.identity);if(!lockIdentity||!current.raw.equals(identity)||current.identity.dev!==lockIdentity.dev||current.identity.ino!==lockIdentity.ino)fail('Authority lock changed; retained for explicit reconciliation.');await unlink(path);await d.h.sync();await directDirectory(config,d.identity);
  }}finally{await d.h.close();}
 }
 return result;
}
async function replace(config,d,old,record){
 const raw=Buffer.from(canonical(record)+'\n');if(raw.length>MAX_BYTES)fail('Claim record exceeds byte bound.');const name='.send-authority-'+randomUUID()+'.tmp',path=join(config.privateDirectory,name);let h;
 try{
  await directDirectory(config,d.identity);h=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await h.writeFile(raw);await h.sync();await h.close();h=null;
  const current=await readPrivate(config,FILE,d.identity);if(!current.raw.equals(old.raw)||current.identity.dev!==old.identity.dev||current.identity.ino!==old.identity.ino)fail('Authority compare-and-swap differs.');
  await rename(path,join(config.privateDirectory,FILE));await d.h.sync();const readback=await readPrivate(config,FILE,d.identity);if(!readback.raw.equals(raw))fail('Persisted authority claim differs.');parse(readback.raw);return readback.identity;
 }finally{if(h)await h.close();try{await unlink(path);await d.h.sync();}catch(e){if(e.code!=='ENOENT')throw e;}}
}
/** Coherent actual-file privacy + approval verification and one-use durable claim.
 * defaultControlEvidence is NOT authority here: core/adapter's separate trusted
 * provenance callback must qualify that mode. This function grants no provider rights.
 */
export async function claimCurrentReactiveAuthority(config,value){
 const context=freeze(structuredClone(value)),digests=adapterInput(config,context);
 const persisted=await exclusive(config,async d=>{
  const old=await readPrivate(config,FILE,d.identity),current=parse(old.raw),at=now(config);active(config,current,context.request,at);serviceWindow(context,at);
  const next={...current,sequence:current.sequence+1,previousRevision:current.revision,status:'claimed',claim:{requestHash:digests.requestHash,wireHash:digests.wireHash,idempotencyKey:context.wire.headers['Idempotency-Key'],challenge:context.challenge,claimedAt:at}};next.revision=officeCooReactiveAuthorityRevision(next);schema(next);const file=await replace(config,d,old,next);return {record:next,directory:d.identity,file};
 });
 // Every file sync/readback/lease cleanup is complete before this timestamp.
 // A synchronous current-file/lease/revision fence follows the clock; no callback
 // or asynchronous operation occurs after that fence before the verdict.
 const checkedAt=now(config),authorityRevision=finalCurrentFence(config,persisted,context,checkedAt);
 return freeze({approved:true,privacyVerified:true,...digests,challenge:context.challenge,checkedAt,authorityRevision});
}

import {constants} from 'node:fs';
import {lstat,open,rename,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hashText=v=>createHash('sha256').update(v,'utf8').digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const text=(v,max=1024)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function uuid(v){const h=hash(v);return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-'+((parseInt(h[16],16)&3)|8).toString(16)+h.slice(17,20)+'-'+h.slice(20,32);}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function scope(v){if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('scope_invalid');const keys=Object.keys(v).sort().join(',');if(v.kind==='agency'&&keys==='kind')return {kind:'agency'};if(v.kind==='client'&&keys==='clientId,kind'&&typeof v.clientId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.clientId))return {kind:'client',clientId:v.clientId};throw new Error('scope_invalid');}
async function secureDirectory(directory){
 if(typeof directory!=='string'||resolve(directory)!==directory||directory.includes('\0'))throw new Error('private_directory');
 for(let p=directory;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('private_directory');if(p===directory&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))throw new Error('private_permissions');if(dirname(p)===p)break;}
}
async function privateRead(path,max=16*1024*1024){
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const a=await f.stat();if(!a.isFile()||a.uid!==process.getuid()||(a.mode&0o7777)!==0o600||a.nlink!==1||a.size>max)throw new Error('private_permissions');const raw=await f.readFile('utf8'),b=await f.stat(),c=await lstat(path);if([b,c].some(s=>s.ino!==a.ino||s.dev!==a.dev||s.size!==a.size||s.mtimeMs!==a.mtimeMs||s.ctimeMs!==a.ctimeMs))throw new Error('private_changed');return raw;}finally{await f.close();}
}
function payload(v){const {integrity,...body}=v;return body;}
function verify(v){
 if(!v||v.version!==1||!sha(v.policySha256)||!Array.isArray(v.history)||v.sequence!==v.history.length||v.integrity!==hash(payload(v)))throw new Error('reactive_integrity');
 let previous=null;for(const e of v.history){const {hash:digest,...body}=e;if(body.previousHash!==previous||digest!==hash(body))throw new Error('reactive_history');previous=digest;}
}
function policyValue(value,now){
 if(!Number.isFinite(now))throw new Error('policy_clock_invalid');
 const p=clone(value);if(!p||p.version!==1||p.enabled!==true||!['channelId','accountId','profileId','ownerSenderId','ownerRecipientId'].every(k=>text(p[k]))||!stamp(p.activationAt)||!stamp(p.expiresAt)||Date.parse(p.activationAt)>now||Date.parse(p.expiresAt)<=now||Date.parse(p.activationAt)>=Date.parse(p.expiresAt)||!Array.isArray(p.excludeEventIds)||new Set(p.excludeEventIds).size!==p.excludeEventIds.length||!p.excludeEventIds.every(x=>text(x))||p.authority?.kind!=='owner-instruction'||!text(p.authority.reference,4096))throw new Error('policy_inactive_or_invalid');
 return p;
}
function normalizeEvent(e,p){
 if(!e||!text(e.eventId)||!text(e.messageId)||!sha(e.rawSha256)||!stamp(e.capturedAt)||!stamp(e.sentAt))throw new Error('captured_event_invalid');
 if(p.excludeEventIds.includes(e.eventId)||e.aliases?.some(id=>p.excludeEventIds.includes(id)))return {ignored:'frozen_exclusion'};
 if(Date.parse(e.capturedAt)<=Date.parse(p.activationAt)||Date.parse(e.sentAt)<=Date.parse(p.activationAt))return {ignored:'historical'};
 if(e.authenticated!==true||e.direction!=='incoming'||e.type!=='text'||!text(e.text,6000)||e.channelId!==p.channelId||e.accountId!==p.accountId||e.profileId!==p.profileId||e.senderId!==p.ownerSenderId)throw new Error('captured_owner_binding');
 if(e.signedRawSha256!==undefined&&!sha(e.signedRawSha256))throw new Error('signed_raw_invalid');
 if(e.aliases!==undefined&&(!Array.isArray(e.aliases)||!e.aliases.every(id=>text(id))||e.aliases.length>32))throw new Error('captured_aliases_invalid');
 return {eventId:e.eventId,messageId:e.messageId,rawSha256:e.rawSha256,...(e.signedRawSha256?{signedRawSha256:e.signedRawSha256}:{}),channelId:e.channelId,accountId:e.accountId,profileId:e.profileId,senderId:e.senderId,text:e.text,sentAt:new Date(e.sentAt).toISOString(),capturedAt:new Date(e.capturedAt).toISOString(),scope:scope(e.scope),aliases:[...new Set([e.eventId,...(e.aliases??[])])].sort()};
}
function taskRequest(p,e){
 const jobId=uuid([p.channelId,e.messageId]);
 const request={jobId,channelId:p.channelId,policySha256:hash(p),eventId:e.eventId,messageId:e.messageId,rawSha256:e.rawSha256,text:e.text,scope:e.scope,ownerRecipientId:p.ownerRecipientId};
 request.requestSha256=hash(request);return request;
}
/** Pure trusted-service reconstruction. This validates the pinned owner capture
 * contract; it does not authenticate arbitrary HTTP/model-supplied event JSON.
 */
export function officeCooReactiveTaskRequest(policy,event,nowMs=Date.now()){
 const p=policyValue(policy,nowMs),e=normalizeEvent(event,p);
 if(e.ignored)return null;
 if(Date.parse(e.sentAt)>nowMs||Date.parse(e.capturedAt)>nowMs)throw new Error('captured_future');
 return taskRequest(p,e);
}
function identity(e){return {messageId:e.messageId,rawSha256:e.rawSha256,channelId:e.channelId,accountId:e.accountId,profileId:e.profileId,senderId:e.senderId,text:e.text,sentAt:e.sentAt,scope:e.scope};}
/** All dependencies are trusted process-owned callbacks. No model/network/send defaults.
 * `rawSha256` pins native-message bytes; signed alias envelope hashes are separate.
 */
export function createOfficeCooReactive(options){
 const {directory,policy,readCaptured,submitTask,readTask,authorizeReply,sendReply,reconcileReply,serialTasks=false}=options,now=options.now??Date.now;
 if(![policy,readCaptured,submitTask,readTask,authorizeReply,sendReply,now].every(x=>typeof x==='function'))throw new Error('trusted_callbacks_required');
 if(typeof serialTasks!=='boolean')throw new Error('trusted_serial_policy_required');
 if(reconcileReply!==undefined&&typeof reconcileReply!=='function')throw new Error('trusted_reconciliation_required');
 const path=join(directory,'coo-reactive-state.json'),lockPath=join(directory,'coo-reactive.lock'),recoveryPath=join(directory,'coo-reactive-recovery.lock');
 const recovering=async()=>{try{await lstat(recoveryPath);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
 let pinned,recordOffset=0;
 async function currentPolicy(){const p=policyValue(await policy(),now());if(pinned&&hash(p)!==pinned)throw new Error('policy_changed');return p;}
 async function save(state,kind,jobId=null){
  const event={sequence:state.sequence+1,at:new Date(now()).toISOString(),kind,jobId,recordsSha256:hash(state.records),previousHash:state.history.at(-1)?.hash??null};state.history.push({...event,hash:hash(event)});state.sequence++;state.integrity=hash(payload(state));
  await secureDirectory(directory);const raw=JSON.stringify(state,null,2)+'\n',snapshot=join(directory,'coo-reactive-state.'+String(state.sequence).padStart(8,'0')+'.'+state.integrity+'.json');
  const f=await open(snapshot,'wx',0o600);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}
  const temporary=path+'.'+randomUUID()+'.tmp';try{const out=await open(temporary,'wx',0o600);try{await out.writeFile(raw);await out.sync();}finally{await out.close();}await rename(temporary,path);const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}const check=JSON.parse(await privateRead(path));verify(check);if(check.integrity!==state.integrity)throw new Error('reactive_readback');}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 async function tick(){
  await secureDirectory(directory);if(await recovering())return {status:'busy',reason:'recovery_lease_held'};let lock;try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')return {status:'busy',reason:'lease_held'};throw e;}
  try{
   if(await recovering())return {status:'busy',reason:'recovery_lease_held'};
   await lock.writeFile(JSON.stringify({version:1,pid:process.pid,host:hostname(),instanceId:randomUUID(),acquiredAt:new Date(now()).toISOString()})+'\n');await lock.sync();
   const p=await currentPolicy();let state;try{state=JSON.parse(await privateRead(path));verify(state);if(state.policySha256!==hash(p))throw new Error('policy_changed');}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,policySha256:hash(p),createdAt:new Date(now()).toISOString(),sequence:0,records:{},ignored:{},history:[]};}
   pinned=state.policySha256;
   const captured=await readCaptured();if(!Array.isArray(captured)||captured.length>1000)throw new Error('captured_batch_invalid');
   for(const raw of captured){const e=normalizeEvent(raw,p);if(e.ignored){if(!state.ignored[raw.eventId]){state.ignored[raw.eventId]={reason:e.ignored,rawSha256:raw.rawSha256};await save(state,'event_excluded');}continue;}
    if(Date.parse(e.sentAt)>now()||Date.parse(e.capturedAt)>now())throw new Error('captured_future');
    const request=taskRequest(p,e),jobId=request.jobId,previous=state.records[jobId];
    for(const other of Object.values(state.records))if(other.jobId!==jobId&&other.event.aliases.some(id=>e.aliases.includes(id)))throw new Error('signed_event_identity_conflict');
    if(previous){
     if(!equal(identity(previous.event),identity(e)))throw new Error('message_identity_conflict');
     if(previous.receipts.some(r=>r.eventId===e.eventId&&r.signedRawSha256!==(e.signedRawSha256??null)))throw new Error('signed_envelope_identity_conflict');
     const aliases=[...new Set([...previous.event.aliases,...e.aliases])].sort();
     const aliasesChanged=!equal(aliases,previous.event.aliases),newReceipt=!previous.receipts.some(r=>r.eventId===e.eventId);
     if(aliasesChanged)previous.event.aliases=aliases;
     // Alias membership may be declared before that signed envelope is captured.
     // Its first actual body still needs a durable, independently checked pin.
     if(newReceipt)previous.receipts.push({eventId:e.eventId,rawSha256:e.rawSha256,signedRawSha256:e.signedRawSha256??null});
     if(aliasesChanged||newReceipt)await save(state,'event_alias',jobId);
     continue;
    }
    if(Object.keys(state.records).length>=512)throw new Error('reactive_capacity');
    state.records[jobId]={jobId,phase:'prepared',event:e,request,receipts:[{eventId:e.eventId,rawSha256:e.rawSha256,signedRawSha256:e.signedRawSha256??null}]};await save(state,'task_prepared',jobId);
   }
   let pending=null,admissions=0;
   const records=Object.values(state.records),batch=records.slice(recordOffset).concat(records.slice(0,recordOffset)).slice(0,64);recordOffset=records.length?(recordOffset+batch.length)%records.length:0;
   if(records.length>batch.length)pending={status:'waiting',reason:'bounded_record_batch'};
   for(const record of batch){
    if(record.phase==='replied')continue;
    if(['sending','reply_uncertain'].includes(record.phase)&&reconcileReply){
     await currentPolicy();const receipt=await reconcileReply(clone(record.replyIntent));await currentPolicy();
     if(receipt!==null){const intent=record.replyIntent;if(!receipt||receipt.accepted!==true||receipt.intentId!==intent.id||receipt.jobId!==record.jobId||receipt.requestSha256!==intent.requestSha256||receipt.bodySha256!==intent.bodySha256||!text(receipt.providerMessageId))throw new Error('reply_reconciliation_identity');record.replyReceipt={providerMessageId:receipt.providerMessageId,accepted:true,at:new Date(now()).toISOString(),reconciled:true};record.phase='replied';await save(state,'reply_reconciled',record.jobId);continue;}
    }
    if(record.phase==='reply_uncertain'){pending={status:'uncertain',reason:'reply_transport_uncertain_no_retry',jobId:record.jobId};continue;}
    const {jobId,request}=record;await currentPolicy();
    if(record.phase==='prepared'){
     if(serialTasks&&records.some(r=>r.jobId!==jobId&&r.phase==='submitted')){pending??={status:'waiting',reason:'prior_owner_task_active',jobId};continue;}
     if(admissions>=4){pending??={status:'waiting',reason:'bounded_admission_batch',jobId};continue;}admissions++;
     record.phase='submitting';await save(state,'submit_intent',jobId);await currentPolicy();
     try{await submitTask(clone(request));record.phase='submitted';await save(state,'submit_ack',jobId);}catch{record.phase='submit_uncertain';await save(state,'submit_uncertain',jobId);pending={status:'uncertain',reason:'submit_requires_exact_reconciliation',jobId};continue;}
    }
    if(['submitting','submit_uncertain','submitted'].includes(record.phase)){
     let task;try{task=await readTask({jobId,requestSha256:request.requestSha256,scope:clone(request.scope)});}catch{pending??={status:'waiting',reason:'task_read_unavailable',jobId};continue;}
     if(task===null){pending??={status:record.phase==='submitted'?'waiting':'uncertain',reason:'exact_task_not_yet_found',jobId};continue;}
     if(!task||task.jobId!==jobId||task.requestSha256!==request.requestSha256||!equal(scope(task.scope),request.scope))throw new Error('task_identity_conflict');
     if(!['answered','awaiting_review','service_response','blocked','failed','cancelled','recovery_required'].includes(task.status)){pending??={status:'waiting',reason:'task_active',jobId};continue;}
     if(['answered','awaiting_review','service_response'].includes(task.status)&&!text(task.output,256*1024)){pending??={status:'waiting',reason:'actual_output_missing',jobId};continue;}
     if(task.output!==undefined&&(typeof task.output!=='string'||task.output.length>256*1024))throw new Error('task_output_invalid');
     const body=['blocked','failed','cancelled','recovery_required'].includes(task.status)?`Office task ${jobId} is ${task.status}.`:task.output;
     record.output={status:task.status,rawOutput:typeof task.output==='string'?task.output:null,outputSha256:typeof task.output==='string'?hashText(task.output):hash(null)};
     const intent={id:uuid([p.channelId,record.event.messageId,jobId,record.output.outputSha256,task.status]),jobId,requestSha256:request.requestSha256,policySha256:pinned,eventId:record.event.eventId,messageId:record.event.messageId,rawSha256:record.event.rawSha256,aliases:[...record.event.aliases],scope:clone(request.scope),ownerRecipientId:p.ownerRecipientId,channelId:p.channelId,accountId:p.accountId,profileId:p.profileId,ownerSenderId:p.ownerSenderId,sentAt:record.event.sentAt,capturedAt:record.event.capturedAt,body,bodySha256:hashText(body),outputSha256:record.output.outputSha256,taskStatus:task.status};
     record.replyIntent=intent;record.phase='reply_prepared';await save(state,'reply_prepared',jobId);
    }
    if(record.phase==='sending'){record.phase='reply_uncertain';await save(state,'reply_uncertain',jobId);return {status:'uncertain',reason:'reply_transport_uncertain_no_retry',jobId};}
    if(record.phase==='reply_prepared'){
     await currentPolicy();if(await authorizeReply(clone(record.replyIntent))!==true)return {status:'stopped',reason:'reply_authority_denied',jobId};await currentPolicy();
     record.phase='sending';await save(state,'reply_send_intent',jobId);await currentPolicy();
     try{const receipt=await sendReply(clone(record.replyIntent));if(!receipt||receipt.accepted!==true||!text(receipt.providerMessageId))throw new Error('send_receipt_uncertain');record.replyReceipt={providerMessageId:receipt.providerMessageId,accepted:true,at:new Date(now()).toISOString()};record.phase='replied';await save(state,'reply_ack',jobId);return {status:'progress',reason:'reply_accepted',jobId};}catch{record.phase='reply_uncertain';await save(state,'reply_uncertain',jobId);return {status:'uncertain',reason:'reply_transport_uncertain_no_retry',jobId};}
    }
   }
   return pending??{status:'idle',reason:'no_actionable_events'};
  }finally{await lock.close();await unlink(lockPath);}
 }
 return Object.freeze({tick});
}

/** Recover only a confirmed-dead SAME-host lease. Recovery serializes against ticks;
 * it changes no task/send phase and never authorizes replay of a provider attempt. */
export async function recoverOfficeCooReactiveLease(directory){
 await secureDirectory(directory);const guardPath=join(directory,'coo-reactive-recovery.lock'),path=join(directory,'coo-reactive.lock');let guard;
 try{guard=await open(guardPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')return {recovered:false,reason:'recovery_lease_held'};throw e;}
 try{await guard.writeFile(JSON.stringify({pid:process.pid,host:hostname()})+'\n');await guard.sync();let before,raw;try{before=await lstat(path);raw=await privateRead(path,1024);}catch(e){if(e.code==='ENOENT')return {recovered:false,reason:'no_lease'};throw e;}const lease=JSON.parse(raw);
  if(lease.version!==1||lease.host!==hostname()||!Number.isSafeInteger(lease.pid)||lease.pid<=0||!stamp(lease.acquiredAt)||!text(lease.instanceId))throw new Error('reactive_lease_uncertain');
  try{process.kill(lease.pid,0);return {recovered:false,reason:'owner_alive'};}catch(e){if(e.code!=='ESRCH')return {recovered:false,reason:'owner_liveness_uncertain'};}
  if(await privateRead(path,1024)!==raw)throw new Error('reactive_lease_changed');const after=await lstat(path);if(after.ino!==before.ino||after.dev!==before.dev||after.ctimeMs!==before.ctimeMs||after.mtimeMs!==before.mtimeMs)throw new Error('reactive_lease_changed');
  await unlink(path);const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}return {recovered:true,reason:'confirmed_dead_local_owner',sendReplayed:false};
 }finally{await guard.close();await unlink(guardPath);const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,chmod,symlink,link,rename,realpath,lstat} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import * as authority from './lib/office-coo-send-authority.mjs';
import * as core from './lib/office-coo-whatsapp.mjs';
import {createOfficeCooZernioAdapter} from './lib/office-coo-zernio.mjs';
// All identities, approvals, provenance, numbers, messages and keys are SYNTHETIC.
// Only isolated actual temporary filesystem state; no runtime file/provider/network.
const stamp='2026-10-15T12:00:00.000Z',clock=()=>stamp,sha=x=>createHash('sha256').update(x).digest('hex');
const binding={channelId:'synthetic-owner-coo',profileId:'synthetic-profile',accountId:'synthetic-account',senderPhone:'12025550101',ownerParticipantId:'12025550102'};
const request={requestId:'synthetic-setup-once',profileId:binding.profileId,accountId:binding.accountId,senderPhone:binding.senderPhone,participantId:binding.ownerParticipantId,conversationId:'internal:/synthetic?conversation',message:'Synthetic approved setup notification'};
const signedInbound={id:request.conversationId,platformConversationId:'platform:/synthetic?conversation',messageId:'wamid.synthetic-inbound==',sentAt:'2026-10-15T11:59:00.000Z'};
function wire(){return {method:'POST',path:'/v1/inbox/conversations/'+encodeURIComponent(request.conversationId)+'/messages',headers:{'Idempotency-Key':'coo-'+randomUUID()},body:{accountId:binding.accountId,message:request.message}};}
function context(){const w=wire();return {binding:{...binding},request:{...request},signedInbound:{...signedInbound},wire:w,requestHash:core.officeCooRequestDigest({binding},request),wireHash:authority.officeCooSendAuthorityWireDigest(w),challenge:randomUUID()};}
async function fixture(t){
 const volume=await realpath(await mkdtemp(join(tmpdir(),'coo-authority-fixture-'))),privateDirectory=join(volume,'private');await mkdir(privateDirectory,{mode:0o700});t.after(()=>rm(volume,{recursive:true,force:true}));
 const config={privateDirectory,binding:{...binding},now:clock},record={version:1,revision:'',sequence:0,previousRevision:null,binding:{...binding},approval:{id:'synthetic-exact-human-decision',principal:'synthetic-owner',requestHash:core.officeCooRequestDigest({binding},request),issuedAt:stamp,expiresAt:'2026-10-15T12:05:00.000Z'},status:'pending',privacy:{cloudApiEventSharing:false,marketingOptimization:false,observedAt:'2026-10-15T11:59:00.000Z',evidenceSha256:sha('SYNTHETIC actual-view fixture only')},operatorReview:{principal:'synthetic-owner',issuedAt:stamp,expiresAt:'2026-10-15T12:05:00.000Z',evidenceSha256:sha('SYNTHETIC operator exact-body review')},claim:null};
 async function save(){record.revision=authority.officeCooSendAuthorityRevision(record);await writeFile(join(privateDirectory,'send-authority.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
 await save();return {volume,privateDirectory,config,record,save,file:join(privateDirectory,'send-authority.json'),lock:join(privateDirectory,'send-authority.lock')};
}
const verify=f=>authority.verifyApproval(f.config,f.record.approval,request);
const claim=(f,c=context())=>authority.claimCurrentSendAuthority(f.config,c);

test('pure digests have no initializer/send and canonical full-wire digest matches adapter challenge semantics',async t=>{
 const f=await fixture(t),before=await readFile(f.file);assert.equal(authority.officeCooSendAuthorityRevision({...f.record,revision:'ignored'}),f.record.revision);assert.equal(authority.officeCooSendAuthorityRevision(Object.fromEntries(Object.entries(f.record).reverse())),f.record.revision);const c=context();assert.equal(authority.officeCooSendAuthorityWireDigest({body:c.wire.body,headers:c.wire.headers,path:c.wire.path,method:c.wire.method}),c.wireHash);assert.equal('initialize' in authority,false);assert.equal('send' in authority,false);assert.deepEqual(await readFile(f.file),before);
});
test('actual existing private record verifies only exact approval/request and writes nothing',async t=>{
 const f=await fixture(t),before=await readFile(f.file);assert.equal(await verify(f),true);for(const patch of [{id:'other'},{principal:'other'},{requestHash:'0'.repeat(64)},{expiresAt:'2026-10-15T12:04:00.000Z'}])assert.equal(await authority.verifyApproval(f.config,{...f.record.approval,...patch},request),false);assert.equal(await authority.verifyApproval(f.config,true,request),false);assert.equal(await authority.verifyApproval(f.config,f.record.approval,{...request,message:'Unapproved'}),false);assert.deepEqual(await readFile(f.file),before);assert.deepEqual(await readdir(f.privateDirectory),['send-authority.json']);
});
test('actual coherent privacy + exact one-use claim fsyncs revision and returns seven exact bound fields',async t=>{
 const f=await fixture(t),c=context(),oldRevision=f.record.revision,oldInode=(await lstat(f.file)).ino,result=await claim(f,c),record=JSON.parse(await readFile(f.file));assert.deepEqual(Object.keys(result).sort(),['approved','privacyVerified','requestHash','wireHash','challenge','checkedAt','authorityRevision'].sort());assert.equal(result.approved,true);assert.equal(result.privacyVerified,true);assert.equal(result.challenge,c.challenge);assert.equal(result.wireHash,c.wireHash);assert.equal(record.status,'claimed');assert.equal(record.sequence,1);assert.equal(record.previousRevision,oldRevision);assert.equal(record.revision,result.authorityRevision);assert.equal(authority.officeCooSendAuthorityRevision(record),record.revision);assert.deepEqual(record.claim,{requestHash:c.requestHash,wireHash:c.wireHash,idempotencyKey:c.wire.headers['Idempotency-Key'],challenge:c.challenge,claimedAt:stamp});assert.notEqual((await lstat(f.file)).ino,oldInode);assert.equal((await lstat(f.file)).mode&0o7777,0o600);assert.deepEqual(await readdir(f.privateDirectory),['send-authority.json']);assert.equal(await verify(f),false);
});
test('actual same/different idempotency or challenge retry cannot consume a setup approval twice',async t=>{
 const f=await fixture(t),c=context();await claim(f,c);const before=await readFile(f.file);for(const retry of [c,context(),{...c,challenge:randomUUID()}])await assert.rejects(claim(f,retry),/pending/);assert.deepEqual(await readFile(f.file),before);
});
test('actual concurrent filesystem claims have one winner and one durable claimed revision',async t=>{
 const f=await fixture(t),contexts=Array.from({length:8},context),results=await Promise.allSettled(contexts.map(c=>claim(f,c))),winners=results.filter(r=>r.status==='fulfilled');assert.equal(winners.length,1);assert.equal(JSON.parse(await readFile(f.file)).revision,winners[0].value.authorityRevision);assert.equal(await verify(f),false);assert.deepEqual(await readdir(f.privateDirectory),['send-authority.json']);
});
test('actual privacy/approval revocation or unknown privacy before claim returns no verdict and no claim',async t=>{
 for(const change of [r=>r.privacy.cloudApiEventSharing=true,r=>r.privacy.marketingOptimization=true,r=>r.privacy.cloudApiEventSharing=null,r=>delete r.privacy.marketingOptimization,r=>r.status='revoked',r=>r.approval.requestHash='0'.repeat(64),r=>r.operatorReview.principal='other-owner']){const f=await fixture(t);change(f.record);await f.save();const before=await readFile(f.file);assert.equal(await verify(f),false);await assert.rejects(claim(f));assert.deepEqual(await readFile(f.file),before);assert.equal(existsSync(f.lock),false);}
});
test('actual approval/operator-review/privacy future, expired and overlong windows fail closed',async t=>{
 for(const change of [r=>r.approval.issuedAt='2026-10-15T12:00:00.001Z',r=>r.approval.expiresAt=stamp,r=>r.approval.expiresAt='2026-10-15T12:15:00.001Z',r=>r.operatorReview.issuedAt='2026-10-15T12:00:00.001Z',r=>r.operatorReview.expiresAt=stamp,r=>r.operatorReview.expiresAt='2026-10-15T12:15:00.001Z',r=>r.privacy.observedAt='2026-10-15T12:00:00.001Z',r=>r.privacy.observedAt='2026-10-15T11:44:59.999Z']){const f=await fixture(t);change(f.record);await f.save();assert.equal(await verify(f),false);await assert.rejects(claim(f));assert.equal(JSON.parse(await readFile(f.file)).claim,null);}
});
test('actual full-wire hash, semantic body, path, method, request, binding and unknown fields cannot forge authority',async t=>{
 for(const change of [c=>c.wireHash='0'.repeat(64),c=>c.requestHash='0'.repeat(64),c=>c.wire.body.message='Changed',c=>c.wire.path='/v1/inbox/conversations/foreign/messages',c=>c.wire.method='GET',c=>c.wire.body.accountId='foreign',c=>c.wire.headers['Idempotency-Key']='coo-'+ '-'.repeat(36),c=>c.wire.body.attachmentUrl='https://example.com/unapproved',c=>c.wire.headers.Authorization='injected',c=>c.request.requestId='other-attempt',c=>c.request.participantId='12025550199',c=>c.binding.profileId='foreign',c=>c.challenge='true',c=>c.approved=true,c=>c.wire.uri='https://foreign.invalid']){const f=await fixture(t),c=context();change(c);await assert.rejects(claim(f,c));assert.equal(JSON.parse(await readFile(f.file)).claim,null);}
 const f=await fixture(t),c=context();c.wire.body.message='Unapproved but fully rehashed';c.request.message=c.wire.body.message;c.requestHash=core.officeCooRequestDigest({binding},c.request);c.wireHash=authority.officeCooSendAuthorityWireDigest(c.wire);await assert.rejects(claim(f,c),/pending/);
});
test('actual signed inbound unknown alias, stale/future timestamp and extra payload claims fail',async t=>{
 for(const change of [s=>s.id='unknown',s=>s.sentAt='2026-10-14T12:00:00.000Z',s=>s.sentAt='2026-10-15T12:00:00.001Z',s=>s.messageId='',s=>s.approved=true]){const f=await fixture(t),c=context();change(c.signedInbound);await assert.rejects(claim(f,c));assert.equal(JSON.parse(await readFile(f.file)).claim,null);}
});
test('actual malformed/hash-corrupt/unknown/status-inconsistent current records never verify or initialize',async t=>{
 for(const change of [r=>r.revision='0'.repeat(64),r=>r.sequence=-1,r=>r.previousRevision='f'.repeat(64),r=>r.approved=true,r=>r.status='claimed',r=>r.binding.profileId='foreign']){const f=await fixture(t);change(f.record);if(f.record.revision==='0'.repeat(64))await writeFile(f.file,JSON.stringify(f.record));else await f.save();assert.equal(await verify(f),false);await assert.rejects(claim(f));}
 const f=await fixture(t);await rm(f.file);assert.equal(await verify(f),false);await assert.rejects(claim(f));assert.equal(existsSync(f.file),false);assert.deepEqual(await readdir(f.privateDirectory),[]);
});
test('actual direct owned directory700 and owned regular single-link file600 are mandatory',async t=>{
 for(const mode of [0o755,0o770,0o1700]){const f=await fixture(t);await chmod(f.privateDirectory,mode);assert.equal(await verify(f),false);await assert.rejects(claim(f));}
 for(const mode of [0o644,0o640,0o400,0o1600]){const f=await fixture(t);await chmod(f.file,mode);assert.equal(await verify(f),false);await assert.rejects(claim(f));}
 const f=await fixture(t);await link(f.file,join(f.volume,'hardlink.json'));assert.equal(await verify(f),false);await assert.rejects(claim(f));
 const g=await fixture(t);await rm(g.file);await mkdir(g.file,{mode:0o600});assert.equal(await verify(g),false);await assert.rejects(claim(g));
});
test('actual symlinked parent/ancestor/leaf and oversized current file are refused',async t=>{
 const f=await fixture(t),alias=join(f.volume,'private-alias');await symlink(f.privateDirectory,alias);const cfg={...f.config,privateDirectory:alias};assert.equal(await authority.verifyApproval(cfg,f.record.approval,request),false);await assert.rejects(authority.claimCurrentSendAuthority(cfg,context()));
 const g=await fixture(t),outside=join(g.volume,'outside.json');await rename(g.file,outside);await symlink(outside,g.file);assert.equal(await verify(g),false);await assert.rejects(claim(g));assert.equal(JSON.parse(await readFile(outside)).status,'pending');
 const h=await fixture(t);await writeFile(h.file,'x'.repeat(32769));assert.equal(await verify(h),false);await assert.rejects(claim(h));
});
test('actual retained malformed/dead/directory/symlink lock refuses both reads and claim without clearing it',async t=>{
 for(const kind of ['dead','malformed','directory','symlink']){const f=await fixture(t);if(kind==='directory')await mkdir(f.lock);else if(kind==='symlink')await symlink(f.file,f.lock);else await writeFile(f.lock,kind==='dead'?JSON.stringify({pid:2147483647,host:'synthetic-dead'}):'corrupt retained lease',{mode:0o600});const before=await lstat(f.lock);assert.equal(await verify(f),false);await assert.rejects(claim(f),/lock/);assert.equal((await lstat(f.lock)).ino,before.ino);assert.equal(JSON.parse(await readFile(f.file)).status,'pending');}
});
test('actual final checkedAt is obtained after all fsync/readback/lock cleanup; expiry during commit burns but does not authorise',async t=>{
 const f=await fixture(t),observations=[];f.config.now=()=>{observations.push({locked:existsSync(f.lock),status:JSON.parse(readFileSync(f.file)).status});return stamp;};const v=await claim(f);assert.deepEqual(observations.at(-1),{locked:false,status:'claimed'});assert.equal(v.checkedAt,stamp);
 const g=await fixture(t);let calls=0;g.config.now=()=>++calls===1?stamp:'2026-10-15T12:05:00.000Z';await assert.rejects(claim(g),/expired/);assert.equal(JSON.parse(await readFile(g.file)).status,'claimed');assert.equal(existsSync(g.lock),false);await assert.rejects(claim(g));
});
test('actual child interruption leaves retained lease; no automatic dead-PID recovery or send',async t=>{
 const f=await fixture(t),child=spawn(process.execPath,['--input-type=module','-e',"import{writeFile}from'node:fs/promises';await writeFile(process.argv[1],JSON.stringify({pid:process.pid}),{mode:0o600,flag:'wx'});process.stdout.write('ready');setInterval(()=>{},1000);",f.lock],{stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');const closed=once(child,'exit');child.kill('SIGKILL');await closed;const retained=await readFile(f.lock);assert.equal(await verify(f),false);await assert.rejects(claim(f),/lock/);assert.deepEqual(await readFile(f.lock),retained);assert.equal(JSON.parse(await readFile(f.file)).status,'pending');
});
test('actual rapid inode/symlink replacement never trusts outside-directory pending authority',async t=>{
 const f=await fixture(t),outside=join(f.volume,'outside-pending.json');await writeFile(outside,await readFile(f.file),{mode:0o600});f.record.status='revoked';await f.save();const revoked=await readFile(f.file);
 let stop=false;const writer=(async()=>{for(let i=0;i<80&&!stop;i++){const temp=join(f.privateDirectory,'replacement-'+i);await symlink(outside,temp);await rename(temp,f.file);const normal=join(f.privateDirectory,'regular-'+i);await writeFile(normal,revoked,{mode:0o600});await rename(normal,f.file);}})();const answers=[];try{for(let i=0;i<30;i++)answers.push(await verify(f));}finally{stop=true;await writer;}assert.ok(answers.every(x=>x===false));assert.equal(JSON.parse(await readFile(outside)).status,'pending');
});
async function pipeline(t,revoke){
 const f=await fixture(t),archive=join(f.volume,'archive');await mkdir(archive,{mode:0o700});const cfg={binding,storage:{recordsRoot:archive,recordsVolume:f.volume,testing:true}},secret='synthetic-authority-e2e-HMAC-secret-0123456789';
 const payload={id:'synthetic-owner-inbound',event:'message.received',timestamp:stamp,profiles:[{id:binding.profileId}],account:{id:binding.accountId,accountId:binding.accountId,profileId:binding.profileId,platform:'whatsapp',username:binding.senderPhone},conversation:{id:signedInbound.id,platformConversationId:signedInbound.platformConversationId,participantId:binding.ownerParticipantId,status:'active'},message:{id:'synthetic-internal-message',conversationId:signedInbound.id,platform:'whatsapp',platformMessageId:signedInbound.messageId,direction:'incoming',text:'Synthetic owner inbound',attachments:[],sender:{id:binding.ownerParticipantId},sentAt:signedInbound.sentAt,isRead:false}};
 const rawBody=Buffer.from(JSON.stringify(payload));await core.ingestOfficeCooWebhook(cfg,{rawBody,eventId:payload.id,signature:createHmac('sha256',secret).update(rawBody).digest('hex')},{secret,now:clock});
 const capability=await core.createOfficeCooApprovalCapability(cfg,request,{now:clock,approval:f.record.approval,verifyApproval:(a,r)=>authority.verifyApproval(f.config,a,r)});let keys=0,posts=0;
 const adapter=createOfficeCooZernioAdapter(cfg,{now:clock,getApiKey:async()=>{if(++keys===6&&revoke){if(revoke==='privacy')f.record.privacy.cloudApiEventSharing=true;else f.record.status='revoked';await f.save();}return {secret:'zrk_synthetic_never_real_0123456789',scope:'profiles',profileIds:[binding.profileId],permission:'read-write',enabledResourceGroups:['accounts','messages'],adminAccess:'denied',expiresAt:'2026-10-16T12:00:00.000Z'};},verifyPrivacy:async()=>true,verifyCurrentSendAuthority:context=>authority.claimCurrentSendAuthority(f.config,context),fetchImpl:async(url,options)=>{
  const u=new URL(url);let data;if(options.method==='POST'){posts++;assert.equal(JSON.parse(await readFile(f.file)).status,'claimed');data={success:true,data:{conversationId:request.conversationId,messageId:'wamid.synthetic-setup-ack=='}};}
  else if(u.pathname.endsWith('/health'))data={accountId:binding.accountId,platform:'whatsapp',username:binding.senderPhone,status:'healthy',tokenStatus:{valid:true},platformConnection:{status:'connected',checkedAt:stamp,phoneStatus:'CONNECTED',inboundWebhookSubscribed:true}};
  else if(u.pathname.endsWith('/messages'))data={sortOrderApplied:'desc',pagination:{hasMore:false,nextCursor:null},messages:[{id:signedInbound.messageId,conversationId:signedInbound.id,accountId:binding.accountId,platform:'whatsapp',direction:'incoming',senderId:binding.ownerParticipantId,createdAt:stamp}]};
  else data={data:[{id:signedInbound.platformConversationId,accountId:binding.accountId,platform:'whatsapp',participantId:binding.ownerParticipantId,threadControl:'app'}],pagination:{hasMore:false,nextCursor:null},meta:{accountsQueried:1,accountsFailed:0,failedAccounts:[],accountsSkipped:[]}};
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 }});
 const result=await core.sendOfficeCooReply(cfg,request,capability,{now:clock,...adapter});return {f,posts,result,cfg,capability,adapter};
}
test('synthetic actual core + adapter + private FS authority claims before ONE injected POST',async t=>{
 const p=await pipeline(t);assert.equal(p.result.outbox.status,'accepted');assert.equal(p.posts,1);assert.equal((await core.sendOfficeCooReply(p.cfg,request,p.capability,{now:clock,...p.adapter})).replayed,true);assert.equal(await verify(p.f),false);
});
for(const kind of ['privacy','approval'])test('synthetic actual FS '+kind+' revoked after core verification/final credential produces zero POSTs',async t=>{
 const p=await pipeline(t,kind);assert.equal(p.posts,0);assert.equal(p.result.outbox.status,'ambiguous');assert.equal(JSON.parse(await readFile(p.f.file)).claim,null);assert.equal(existsSync(p.f.lock),false);
});

for(const kind of ['privacy','approval'])test('independent P1 regression: cooperating worker revokes '+kind+' after unlock before final fence',async t=>{
 const f=await fixture(t),shared=new SharedArrayBuffer(8),flags=new Int32Array(shared);
 const worker=new Worker(`const {workerData}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const flags=new Int32Array(workerData.shared),canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);try{Atomics.wait(flags,0,0,3000);const lock=fs.openSync(workerData.lock,'wx',0o600);try{const r=JSON.parse(fs.readFileSync(workerData.file));if(r.status!=='claimed')throw Error('Expected persisted claimed state.');if(workerData.kind==='privacy')r.privacy.cloudApiEventSharing=true;else r.status='revoked';r.sequence++;r.previousRevision=r.revision;const {revision,...body}=r;r.revision=crypto.createHash('sha256').update(canon(body)).digest('hex');const temp=path.join(workerData.directory,'revoker.tmp'),fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(r));fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(temp,workerData.file);}finally{fs.closeSync(lock);fs.unlinkSync(workerData.lock);const dir=fs.openSync(workerData.directory,'r');fs.fsyncSync(dir);fs.closeSync(dir);}Atomics.store(flags,1,1);}catch{Atomics.store(flags,1,-1);}Atomics.notify(flags,1);`,{eval:true,workerData:{shared,kind,file:f.file,lock:f.lock,directory:f.privateDirectory}});
 t.after(()=>worker.terminate());f.config.now=()=>{if(JSON.parse(readFileSync(f.file)).status==='claimed'&&!existsSync(f.lock)&&Atomics.load(flags,0)===0){Atomics.store(flags,0,1);Atomics.notify(flags,0);Atomics.wait(flags,1,0,3000);assert.equal(Atomics.load(flags,1),1,'Actual cooperating revoker completed after lease cleanup.');}return stamp;};
 await assert.rejects(claim(f),/authority.*(?:changed|differs)|being revoked/i);assert.equal(Atomics.load(flags,1),1);const actual=JSON.parse(await readFile(f.file));assert.notEqual(actual.claim,null);assert.equal(actual.sequence,2);assert.equal(kind==='privacy'?actual.privacy.cloudApiEventSharing:actual.status,kind==='privacy'?true:'revoked');assert.equal(existsSync(f.lock),false);assert.equal(await verify(f),false);await assert.rejects(claim(f));
});

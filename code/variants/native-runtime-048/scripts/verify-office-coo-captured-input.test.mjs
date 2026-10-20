import test from 'node:test';
import {createRequire} from 'node:module';
import {officeStorePath} from './lib/office-archive.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,rm,readFile,writeFile,readdir,symlink,chmod,link} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {ingestOfficeCooWebhook,readOfficeCooState} from './lib/office-coo-whatsapp.mjs';
import {createOfficeCooReactive} from './lib/office-coo-reactive.mjs';
import {readOfficeCooCapturedInputs,readOfficeCooCapturedEnvelope} from './lib/office-coo-captured-input.mjs';
const fixed='2026-10-15T12:10:00.000Z',secret='synthetic-only-captured-input-secret-0123456789';
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function fixture(t){
 const volume=await realpath(await mkdtemp(join(tmpdir(),'coo-captured-input-')));t.after(()=>rm(volume,{recursive:true,force:true}));const binding={channelId:'synthetic-channel',accountId:'synthetic-account',profileId:'synthetic-profile',senderPhone:'+00000000000',ownerParticipantId:'12025550102'},config={storage:{recordsVolume:volume,recordsRoot:join(volume,'archive'),testing:true},binding};await mkdir(config.storage.recordsRoot,{mode:0o700});
 const policy={version:1,enabled:true,channelId:binding.channelId,accountId:binding.accountId,profileId:binding.profileId,ownerSenderId:binding.ownerParticipantId,ownerRecipientId:'private-server-only-recipient',activationAt:'2026-10-15T12:00:00.000Z',expiresAt:'2026-10-15T13:00:00.000Z',excludeEventIds:[],authority:{kind:'owner-instruction',reference:'synthetic owner reactive policy'}};
 const event=(extra={})=>({id:randomUUID(),event:'message.received',timestamp:'2026-10-15T12:05:01.000Z',profiles:[{id:binding.profileId}],account:{id:binding.accountId,accountId:binding.accountId,profileId:binding.profileId,platform:'whatsapp',username:binding.senderPhone},conversation:{id:'internal-conversation',platformConversationId:'platform-conversation',participantId:binding.ownerParticipantId},message:{id:'wrapper-message',platformMessageId:'wamid.native==',conversationId:'internal-conversation',platform:'whatsapp',direction:'incoming',sender:{id:binding.ownerParticipantId},sentAt:'2026-10-15T12:05:00.000Z',text:'Exact owner text\nwith spacing.  ',attachments:[]},...extra});
 const ingest=async p=>{const rawBody=Buffer.from(JSON.stringify(p,null,2)+'\n');await ingestOfficeCooWebhook(config,{eventId:p.id,rawBody,signature:createHmac('sha256',secret).update(rawBody).digest('hex')},{secret,now:()=>fixed});return {rawBody,sha256:hash(rawBody)};};
 const state={scopeReads:[]},options={config,policy,now:()=>Date.parse(fixed),resolveScope:async text=>{state.scopeReads.push(text);return {kind:'agency'};}};
 const base=async()=>join(config.storage.recordsRoot,'coo-whatsapp',(await readdir(join(config.storage.recordsRoot,'coo-whatsapp'))).find(x=>/^[a-f0-9]{64}$/.test(x)));
 return {volume,binding,config,policy,event,ingest,state,options,base,read:()=>readOfficeCooCapturedInputs(options)};
}
test('actual synthetic HMAC capture yields exact signed timestamps/text and native hash, without recipient export',async t=>{
 const f=await fixture(t),p=f.event(),signed=await f.ingest(p),result=await f.read();assert.match(result.revision,/^[a-f0-9]{64}$/);assert.equal(result.events.length,1);assert.deepEqual(result.ignored,[]);const e=result.events[0];assert.equal(e.authenticated,true);assert.equal(e.text,p.message.text);assert.equal(e.sentAt,p.message.sentAt);assert.equal(e.capturedAt,p.timestamp);assert.notEqual(e.capturedAt,fixed);assert.equal(e.signedRawSha256,signed.sha256);assert.equal('ownerRecipientId'in e,false);assert.equal(JSON.stringify(result).includes(f.policy.ownerRecipientId),false);
 assert.equal(e.rawSha256,hash(canonical({accountId:f.binding.accountId,profileId:f.binding.profileId,messageId:p.message.platformMessageId,senderId:f.binding.ownerParticipantId,conversationAliases:['internal-conversation','platform-conversation'],text:p.message.text,sentAt:p.message.sentAt})));assert.deepEqual(f.state.scopeReads,[p.message.text]);
});
test('two signed aliases preserve separate actual envelope receipts and share one native hash/scope resolution',async t=>{
 const f=await fixture(t),a=f.event({id:'signed-alias-1'}),b=f.event({id:'signed-alias-2',timestamp:'2026-10-15T12:05:02.000Z'});b.message.id='different-internal-wrapper';const x=await f.ingest(a),y=await f.ingest(b),result=await f.read();assert.equal(result.events.length,2);assert.equal(result.events[0].rawSha256,result.events[1].rawSha256);assert.notEqual(result.events[0].signedRawSha256,result.events[1].signedRawSha256);assert.deepEqual(result.events.map(e=>e.signedRawSha256),[x.sha256,y.sha256]);for(const e of result.events)assert.deepEqual(e.aliases,['signed-alias-1','signed-alias-2']);assert.equal(f.state.scopeReads.length,1);
});
test('historical native/capture timestamps and any frozen alias exclude the entire native identity before resolving scope',async t=>{
 for(const mode of ['sent','captured','frozen']){const f=await fixture(t),a=f.event({id:'before'}),b=f.event({id:'later'});if(mode==='sent')a.message.sentAt=b.message.sentAt=f.policy.activationAt;if(mode==='captured')a.timestamp=f.policy.activationAt;if(mode==='frozen')f.policy.excludeEventIds=['before'];await f.ingest(a);await f.ingest(b);const r=await f.read();assert.equal(r.events.length,0);assert.equal(r.ignored.length,2);assert.equal(f.state.scopeReads.length,0);assert.equal(r.ignored[0].reason,mode==='frozen'?'frozen_exclusion':'historical');}
});
test('attachments/null/blank/oversize/standby/control characters yield explicit ignored manifests with no fake tasks',async t=>{
 for(const mode of ['attachments','null','blank','oversize','standby','controls']){const f=await fixture(t),p=f.event();if(mode==='attachments')p.message.attachments=[{type:'image',url:'synthetic-no-fetch'}];if(mode==='null')p.message.text=null;if(mode==='blank')p.message.text='  ';if(mode==='oversize')p.message.text='x'.repeat(6001);if(mode==='standby')p.metadata={standby:true};if(mode==='controls')p.message.text='Text\u0001control';await f.ingest(p);const r=await f.read();assert.equal(r.events.length,0,mode);assert.equal(r.ignored.length,1,mode);assert.equal(f.state.scopeReads.length,0,mode);assert.ok(r.ignored[0].reason,mode);}
});
test('nonincoming/control/account events are explicit ignores and never resolve a task',async t=>{
 const f=await fixture(t),p=f.event({event:'account.disconnected'});delete p.message;delete p.conversation;await f.ingest(p);const r=await f.read();assert.equal(r.events.length,0);assert.equal(r.ignored[0].reason,'unsupported_event');assert.equal(f.state.scopeReads.length,0);
});
test('policy channel/account/profile/owner mismatches and revocation/expiry fail before context resolution',async t=>{
 for(const change of [{channelId:'foreign'},{accountId:'foreign'},{profileId:'foreign'},{ownerSenderId:'12025550199'},{enabled:false},{expiresAt:fixed},{activationAt:'invalid'}]){const f=await fixture(t);await f.ingest(f.event());Object.assign(f.policy,change);await assert.rejects(f.read(),/captured_policy/);assert.equal(f.state.scopeReads.length,0);}
});
test('future signed wrapper/native timestamps are rejected without fabricating observation time',async t=>{
 for(const mode of ['wrapper','native']){const f=await fixture(t),p=f.event();if(mode==='wrapper')p.timestamp='2026-10-15T12:09:01.000Z';else p.message.sentAt='2026-10-15T12:09:01.000Z';await f.ingest(p);f.options.now=()=>Date.parse('2026-10-15T12:09:00.000Z');await assert.rejects(f.read(),/future/);assert.equal(f.state.scopeReads.length,0);}
});
test('changed native text/sentAt/conversation under duplicate native ID fails before any scope resolution',async t=>{
 for(const mode of ['text','sentAt','conversation']){const f=await fixture(t),a=f.event(),b=f.event();if(mode==='text')b.message.text='Changed native content';if(mode==='sentAt')b.message.sentAt='2026-10-15T12:05:00.001Z';if(mode==='conversation'){b.conversation.id='other-conversation';b.message.conversationId='other-conversation';}await f.ingest(a);await f.ingest(b);await assert.rejects(f.read(),/native_identity_conflict/);assert.equal(f.state.scopeReads.length,0);}
});
test('ignored attachment alias vetoes matching text alias rather than partly admitting the native message',async t=>{
 const f=await fixture(t),a=f.event(),b=f.event();b.message.attachments=[{type:'image'}];await f.ingest(a);await f.ingest(b);const r=await f.read();assert.equal(r.events.length,0);assert.equal(r.ignored.length,2);assert.equal(f.state.scopeReads.length,0);
});
test('trusted resolver maps exact current client scopes per unique native message and rejects malformed scope',async t=>{
 const f=await fixture(t),a=f.event(),b=f.event();b.message.platformMessageId='wamid.second==';b.message.text='Different client request';await f.ingest(a);await f.ingest(b);let count=0;const ids=['a7604343-92d7-56ec-bf35-b272cac7f8b7','c8aef456-9613-5dd2-9a9e-2207708a7338'];f.options.resolveScope=async()=>({kind:'client',clientId:ids[count++]});const r=await f.read();assert.deepEqual(r.events.map(e=>e.scope.clientId),ids);f.options.resolveScope=async()=>({kind:'agency',clientId:ids[0]});await assert.rejects(f.read(),/scope_invalid/);
});
test('tampered/oversized immutable raw bodies fail closed in the actual capture reader',async t=>{
 for(const mode of ['tamper','oversize']){const f=await fixture(t),p=f.event(),s=await f.ingest(p);await writeFile(join(await f.base(),'events',s.sha256+'.json'),mode==='tamper'?'{}':'x'.repeat(65537));await assert.rejects(f.read());assert.equal(f.state.scopeReads.length,0);}
});
test('raw event symlink and ancestor aliases are refused without context resolution',async t=>{
 for(const mode of ['raw','ancestor']){const f=await fixture(t),s=await f.ingest(f.event());if(mode==='raw'){const path=join(await f.base(),'events',s.sha256+'.json'),other=join(f.volume,'other.json');await writeFile(other,s.rawBody);await rm(path);await symlink(other,path);}else{const alias=join(f.volume,'alias');await symlink(f.config.storage.recordsRoot,alias);f.config.storage.recordsRoot=alias;}await assert.rejects(f.read(),/symlink/);assert.equal(f.state.scopeReads.length,0);}
});
test('unsigned/foreign inputs cannot become authenticated captured tasks; empty verified ledger stays empty',async t=>{
 const f=await fixture(t),p=f.event(),rawBody=Buffer.from(JSON.stringify(p));await assert.rejects(ingestOfficeCooWebhook(f.config,{rawBody,eventId:p.id,signature:'0'.repeat(64)},{secret,now:()=>fixed}),/signature/);p.message.sender.id='12025550199';await assert.rejects(f.ingest(p));const r=await f.read();assert.equal(r.revision,null);assert.deepEqual(r.events,[]);assert.deepEqual(r.ignored,[]);assert.equal(f.state.scopeReads.length,0);assert.equal((await readOfficeCooState(f.config)).state.events.length,0);
});

test('verified signed aliases feed reactive lineage without duplicate jobs/replies across restart',async t=>{
 const f=await fixture(t);await f.ingest(f.event({id:'alias-1'}));await f.ingest(f.event({id:'alias-2',timestamp:'2026-10-15T12:05:02.000Z'}));const directory=join(f.volume,'reactive');await mkdir(directory,{mode:0o700});let submits=0,sends=0,request;
 const options={directory,policy:async()=>f.policy,now:()=>Date.parse(fixed),readCaptured:async()=>(await f.read()).events,submitTask:async r=>{submits++;request=r;},readTask:async()=>({jobId:request.jobId,requestSha256:request.requestSha256,scope:request.scope,status:'answered',output:'Exact actual synthetic Office output'}),authorizeReply:async intent=>{assert.deepEqual(intent.aliases,['alias-1','alias-2']);return true;},sendReply:async intent=>{sends++;assert.equal(intent.body,'Exact actual synthetic Office output');return {accepted:true,providerMessageId:'synthetic-provider-id'};}};
 assert.equal((await createOfficeCooReactive(options).tick()).reason,'reply_accepted');assert.equal((await createOfficeCooReactive(options).tick()).status,'idle');assert.equal(submits,1);assert.equal(sends,1);
});

// ExFAT represents captured archive files with owner0700. This reader is never
// used for credentials or grants; exact immutable ledger bytes remain required.
test('archive envelope uses ledger pins on mode0700 files while rejecting unknown/mismatched/changed data',async t=>{
 const f=await fixture(t),p=f.event();await f.ingest(p);const saved=(await readOfficeCooState(f.config)).state.events[0],path=join(await f.base(),'events',saved.rawSha256+'.json');
 await chmod(path,0o700);assert.deepEqual(await readOfficeCooCapturedEnvelope(f.config,saved),p);
 await assert.rejects(readOfficeCooCapturedEnvelope(f.config,{id:'foreign',rawSha256:saved.rawSha256}),/unavailable/);
 await assert.rejects(readOfficeCooCapturedEnvelope(f.config,{...saved,rawSha256:'0'.repeat(64)}),/unavailable/);
 await writeFile(path,JSON.stringify({...p,id:'changed'}));await assert.rejects(readOfficeCooCapturedEnvelope(f.config,saved),/changed|integrity/);
});
test('archive envelope refuses file links and parent links even with exact ledger digest',async t=>{
 for(const mode of ['symlink','hardlink','parent']){const f=await fixture(t);await f.ingest(f.event());const saved=(await readOfficeCooState(f.config)).state.events[0],base=await f.base(),path=join(base,'events',saved.rawSha256+'.json'),bytes=await readFile(path),target=join(f.volume,'copied.json');await writeFile(target,bytes);await rm(path);
 if(mode==='parent'){await rm(join(base,'events'),{recursive:true});const outside=join(f.volume,'outside');await mkdir(outside);await writeFile(join(outside,saved.rawSha256+'.json'),bytes);await symlink(outside,join(base,'events'));}else await(mode==='symlink'?symlink:link)(target,path);
 await assert.rejects(readOfficeCooCapturedEnvelope(f.config,saved));}
});

test('explicit group contradictions never become owner-native tasks even when signed participant claims owner phone',async t=>{
 for(const mode of ['flag','type','metadata','alias']){const f=await fixture(t),p=f.event();if(mode==='flag')p.conversation.isGroup=true;if(mode==='type')p.conversation.type='group';if(mode==='metadata')p.metadata={isGroup:true};if(mode==='alias')p.conversation.platformConversationId='owner@example.invalid';await f.ingest(p);const result=await f.read();assert.equal(result.events.length,0);assert.equal(result.ignored[0].reason,'unsupported_group');assert.equal(f.state.scopeReads.length,0);}
});

test('validated archive snapshot scans multiple envelopes with one ledger load and refuses IDs outside that snapshot',async t=>{
 const f=await fixture(t);for(let i=0;i<4;i++)await f.ingest(f.event({id:'snapshot-'+i}));let ledgerReads=0;
 const require=createRequire(import.meta.url),ts=require('typescript'),source=await readFile(new URL('./lib/office-coo-captured-input.mjs',import.meta.url),'utf8'),module={exports:{}},stubs={'./office-coo-whatsapp.mjs':{readOfficeCooState:async config=>{ledgerReads++;return readOfficeCooState(config);}},'./office-archive.mjs':{officeStorePath}};
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',compiled)(name=>Object.hasOwn(stubs,name)?stubs[name]:require(name),module,module.exports);
 const snapshot=await module.exports.createOfficeCooCapturedEnvelopeReader(f.config);for(const event of snapshot.events){assert.equal((await snapshot.read(event)).id,event.id);}assert.equal(ledgerReads,1);
 const original={...snapshot.events[0]};await assert.rejects(snapshot.read({...original,rawSha256:'0'.repeat(64)}),/unavailable/);await f.ingest(f.event({id:'after-snapshot'}));const latest=(await readOfficeCooState(f.config)).state.events.at(-1);await assert.rejects(snapshot.read(latest),/unavailable/);assert.equal(ledgerReads,1);
 snapshot.events[0].rawSha256='0'.repeat(64);assert.equal((await snapshot.read(original)).id,original.id);
});

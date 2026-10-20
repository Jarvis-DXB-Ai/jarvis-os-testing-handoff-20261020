import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,writeFile,rm,readdir,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOfficeCooReactive,officeCooReactiveTaskRequest} from './lib/office-coo-reactive.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hashText=v=>createHash('sha256').update(v,'utf8').digest('hex');
async function fixture(t){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'coo-reactive-')));t.after(()=>rm(directory,{recursive:true,force:true}));
 const state={now:Date.parse('2026-10-15T12:10:00Z'),policy:{version:1,enabled:true,channelId:'dedicated-channel',accountId:'account',profileId:'profile',ownerSenderId:'private-owner',ownerRecipientId:'owner-recipient',activationAt:'2026-10-15T12:00:00Z',expiresAt:'2026-10-15T13:00:00Z',excludeEventIds:['historic-setup'],authority:{kind:'owner-instruction',reference:'synthetic owner reactive authority'}},events:[],requests:[],replies:[],auth:[],tasks:new Map()};
 const event=(extra={})=>({eventId:'event-1',messageId:'native-message-1',rawSha256:hash('native-message-1'),signedRawSha256:hash('signed-envelope-1'),channelId:'dedicated-channel',accountId:'account',profileId:'profile',senderId:'private-owner',authenticated:true,direction:'incoming',type:'text',text:'Hello COO',sentAt:'2026-10-15T12:05:00Z',capturedAt:'2026-10-15T12:05:01Z',scope:{kind:'agency'},...extra});
 const path=join(directory,'coo-reactive-state.json'),saved=async()=>JSON.parse(await readFile(path));
 const options={directory,now:()=>state.now,policy:async()=>structuredClone(state.policy),readCaptured:async()=>structuredClone(state.events),submitTask:async request=>{const persisted=await saved();assert.equal(persisted.records[request.jobId].phase,'submitting');state.requests.push(request);state.tasks.set(request.jobId,{jobId:request.jobId,requestSha256:request.requestSha256,scope:request.scope,status:'running'});},readTask:async q=>state.tasks.get(q.jobId)??null,authorizeReply:async intent=>{state.auth.push(intent);return true;},sendReply:async intent=>{const persisted=await saved();assert.equal(persisted.records[intent.jobId].phase,'sending');assert.equal(persisted.records[intent.jobId].replyIntent.bodySha256,hashText(intent.body));state.replies.push(intent);return {accepted:true,providerMessageId:'provider-'+state.replies.length};}};
 return {directory,state,event,options,path,saved,service:()=>createOfficeCooReactive(options)};
}
test('future owner message persists native job intent, polls raw actual output and sends exactly once across alias/restart',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];assert.equal((await f.service().tick()).status,'waiting');assert.equal(f.state.requests.length,1);const request=f.state.requests[0];assert.match(request.jobId,/^[a-f0-9-]{36}$/);const task=f.state.tasks.get(request.jobId);task.status='answered';task.output='Actual output\nwith untouched spacing.  ';
 assert.equal((await f.service().tick()).reason,'reply_accepted');assert.equal(f.state.replies[0].body,task.output);assert.equal(f.state.replies[0].bodySha256,hashText(task.output));assert.equal(f.state.replies[0].outputSha256,hashText(task.output));assert.equal(f.state.auth.length,1);assert.equal(f.state.replies[0].scope.kind,'agency');
 f.state.events.push(f.event({eventId:'signed-alias-2',signedRawSha256:hash('envelope-2')}));assert.equal((await f.service().tick()).status,'idle');assert.equal(f.state.requests.length,1);assert.equal(f.state.replies.length,1);const saved=await f.saved(),record=Object.values(saved.records)[0];assert.equal(record.output.rawOutput,task.output);assert.deepEqual(record.event.aliases,['event-1','signed-alias-2']);assert.equal(record.receipts.length,2);assert.ok((await readdir(f.directory)).filter(x=>/state\.\d+\.[a-f0-9]+\.json$/.test(x)).length>=6);
});
test('frozen exclusions and capture/signed timestamps at or before activation never replay',async t=>{
 const f=await fixture(t);f.state.events=[f.event({eventId:'historic-setup'}),f.event({eventId:'old-capture',capturedAt:f.state.policy.activationAt}),f.event({eventId:'old-signed',sentAt:f.state.policy.activationAt}),f.event({eventId:'alias-excluded',aliases:['historic-setup']})];assert.equal((await f.service().tick()).status,'idle');assert.equal(f.state.requests.length,0);const saved=await f.saved();assert.equal(Object.keys(saved.ignored).length,4);assert.equal(Object.keys(saved.records).length,0);assert.equal((await f.service().tick()).status,'idle');
});
test('unauthenticated, foreign owner/scope or malformed captured events never submit',async t=>{
 for(const extra of [{authenticated:false},{direction:'outgoing'},{senderId:'foreign'},{accountId:'foreign'},{profileId:'foreign'},{channelId:'foreign'},{type:'image'},{scope:{kind:'client',clientId:'bad'}},{scope:{kind:'agency',clientId:'invented'}},{rawSha256:'wrong'},{sentAt:'2026-10-15T12:11:00Z'}]){const f=await fixture(t);f.state.events=[f.event(extra)];await assert.rejects(f.service().tick());assert.equal(f.state.requests.length,0);}
});
test('changed native bytes, text or client scope under existing message id fails closed',async t=>{
 for(const extra of [{rawSha256:hash('changed')},{text:'changed text'},{scope:{kind:'client',clientId:'a7604343-92d7-56ec-bf35-b272cac7f8b7'}}]){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();f.state.events=[f.event({...extra,eventId:'alias-new'})];await assert.rejects(f.service().tick(),/message_identity_conflict/);assert.equal(f.state.requests.length,1);assert.equal(f.state.replies.length,0);}
});
test('uncertain submit is reconciled only via exact stable job read and never blindly submitted again',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];f.options.submitTask=async request=>{f.state.requests.push(request);throw new Error('lost transport ack');};assert.equal((await f.service().tick()).status,'uncertain');for(let i=0;i<3;i++)assert.equal((await f.service().tick()).status,'uncertain');assert.equal(f.state.requests.length,1);const request=f.state.requests[0];f.state.tasks.set(request.jobId,{jobId:request.jobId,requestSha256:request.requestSha256,scope:request.scope,status:'awaiting_review',output:'Actual recovered draft'});assert.equal((await f.service().tick()).reason,'reply_accepted');assert.equal(f.state.requests.length,1);assert.equal(f.state.replies.length,1);
});
test('submit and send crash windows persist intent before effects; uncertain sends never retry',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual output';f.options.sendReply=async intent=>{assert.equal((await f.saved()).records[intent.jobId].phase,'sending');f.state.replies.push(intent);throw new Error('accepted remotely but response lost');};assert.equal((await f.service().tick()).reason,'reply_transport_uncertain_no_retry');await f.service().tick();await f.service().tick();assert.equal(f.state.replies.length,1);assert.equal(Object.values((await f.saved()).records)[0].phase,'reply_uncertain');
});
test('foreign job/request/scope reconciliation cannot produce a reply or a second task',async t=>{
 for(const extra of [{jobId:'different'},{requestSha256:hash('wrong')},{scope:{kind:'client',clientId:'a7604343-92d7-56ec-bf35-b272cac7f8b7'}}]){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();f.options.readTask=async()=>({...f.state.tasks.get(f.state.requests[0].jobId),status:'answered',output:'Foreign data',...extra});await assert.rejects(f.service().tick(),/task_identity_conflict/);assert.equal(f.state.replies.length,0);assert.equal(f.state.requests.length,1);}
});
test('two clients keep independent exact scopes/jobs while active tasks do not block admission',async t=>{
 const f=await fixture(t),a='a7604343-92d7-56ec-bf35-b272cac7f8b7',b='c8aef456-9613-5dd2-9a9e-2207708a7338';f.state.events=[f.event({scope:{kind:'client',clientId:a}}),f.event({eventId:'event-2',messageId:'native-message-2',rawSha256:hash('native-message-2'),scope:{kind:'client',clientId:b}})];await f.service().tick();assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[0].scope.clientId,a);let task=f.state.tasks.get(f.state.requests[0].jobId);task.status='awaiting_review';task.output='Client A draft';await f.service().tick();await f.service().tick();assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[1].scope.clientId,b);assert.notEqual(f.state.requests[0].jobId,f.state.requests[1].jobId);assert.equal(f.state.replies[0].scope.clientId,a);
});
test('blocked/failed statuses send an honest deterministic job status, completed output is never invented',async t=>{
 for(const status of ['blocked','failed','answered']){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status=status;if(status==='answered'){assert.equal((await f.service().tick()).reason,'actual_output_missing');assert.equal(f.state.replies.length,0);}else{await f.service().tick();assert.equal(f.state.replies[0].body,`Office task ${task.jobId} is ${status}.`);}}
});
test('policy revocation/expiry/binding change before submit or after reply authorization prevents effects',async t=>{
 for(const mode of ['disabled','expired','changed','during-read','during-authority']){const f=await fixture(t);f.state.events=[f.event()];if(mode==='disabled')f.state.policy.enabled=false;if(mode==='expired')f.state.now=Date.parse(f.state.policy.expiresAt);if(mode==='during-read')f.options.readCaptured=async()=>{f.state.policy.enabled=false;return f.state.events;};if(mode==='during-authority')f.options.authorizeReply=async()=>{f.state.policy.enabled=false;return true;};if(['changed','during-authority'].includes(mode)){await f.service().tick();if(mode==='changed')f.state.policy.ownerRecipientId='other';else{const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual output';}}await assert.rejects(f.service().tick(),/policy/);assert.equal(f.state.replies.length,0);if(!['changed','during-authority'].includes(mode))assert.equal(f.state.requests.length,0);}
});
test('separate per-turn reply authority denial leaves a durable intent and sends nothing',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual result';f.options.authorizeReply=async()=>false;assert.equal((await f.service().tick()).reason,'reply_authority_denied');assert.equal(f.state.replies.length,0);assert.equal(Object.values((await f.saved()).records)[0].phase,'reply_prepared');
});
test('concurrent ticks serialize the whole captured→task→reply turn with a persistent lease',async t=>{
 const f=await fixture(t);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);f.state.events=[f.event()];const original=f.options.submitTask;f.options.submitTask=async request=>{entered();await gate;return original(request);};const first=f.service().tick();await started;assert.equal((await f.service().tick()).status,'busy');release();await first;assert.equal(f.state.requests.length,1);
});
test('private directory/file symlinks, permissive files and corruption refuse restart',async t=>{
 for(const mode of ['directory','file-mode','symlink','corruption']){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();if(mode==='directory')await chmod(f.directory,0o755);if(mode==='file-mode')await chmod(f.path,0o644);if(mode==='symlink'){const other=join(f.directory,'other.json');await writeFile(other,await readFile(f.path),{mode:0o600});await rm(f.path);await symlink(other,f.path);}if(mode==='corruption'){const v=await f.saved();v.records[Object.keys(v.records)[0]].phase='prepared';await writeFile(f.path,JSON.stringify(v));}await assert.rejects(f.service().tick());assert.equal(f.state.requests.length,1);}
});

test('restart from durable submitting before callback reconciles and never blindly resubmits',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];let reads=0;f.options.policy=async()=>({...f.state.policy,enabled:++reads!==3});await assert.rejects(f.service().tick(),/policy/);assert.equal(Object.values((await f.saved()).records)[0].phase,'submitting');assert.equal(f.state.requests.length,0);f.options.policy=async()=>structuredClone(f.state.policy);assert.equal((await f.service().tick()).status,'uncertain');assert.equal(f.state.requests.length,0);
});
test('restart from durable sending before transport never automatically sends or retries',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual output';let reads=0;f.options.policy=async()=>({...f.state.policy,enabled:++reads!==5});await assert.rejects(f.service().tick(),/policy/);assert.equal(Object.values((await f.saved()).records)[0].phase,'sending');assert.equal(f.state.replies.length,0);f.options.policy=async()=>structuredClone(f.state.policy);assert.equal((await f.service().tick()).status,'uncertain');assert.equal(f.state.replies.length,0);assert.equal(Object.values((await f.saved()).records)[0].phase,'reply_uncertain');
});

test('reused signed event id with changed envelope or native message cannot fork native jobs',async t=>{
 for(const extra of [{signedRawSha256:hash('other envelope')},{messageId:'another-native',rawSha256:hash('another-native')}]){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();f.state.events=[f.event(extra)];await assert.rejects(f.service().tick(),/signed_.*identity_conflict/);assert.equal(f.state.requests.length,1);}
});

test('predeclared aliases acquire independent signed envelope receipts and exact repeats cannot duplicate them',async t=>{
 const f=await fixture(t);f.state.events=[f.event({aliases:['signed-alias-2']})];await f.service().tick();
 f.state.events=[f.event({eventId:'signed-alias-2',signedRawSha256:hash('alias-envelope-A')})];await f.service().tick();
 let row=Object.values((await f.saved()).records)[0];assert.equal(row.receipts.length,2);assert.equal(row.receipts.find(r=>r.eventId==='signed-alias-2').signedRawSha256,hash('alias-envelope-A'));
 await f.service().tick();row=Object.values((await f.saved()).records)[0];assert.equal(row.receipts.length,2);
 f.state.events=[f.event({eventId:'signed-alias-2',signedRawSha256:hash('alias-envelope-B')})];await assert.rejects(f.service().tick(),/signed_envelope_identity_conflict/);assert.equal(f.state.requests.length,1);assert.equal(f.state.replies.length,0);
});

test('pure trusted service reconstruction matches the exact root-shaped prepared request and tick hash',async t=>{
 const f=await fixture(t),event=f.event();f.state.events=[event];const request=officeCooReactiveTaskRequest(f.state.policy,event,f.state.now);
 assert.deepEqual(Object.keys(request),['jobId','channelId','policySha256','eventId','messageId','rawSha256','text','scope','ownerRecipientId','requestSha256']);
 const {requestSha256,...body}=request;assert.equal(requestSha256,hash(body));assert.equal(request.policySha256,hash(f.state.policy));assert.equal(request.ownerRecipientId,f.state.policy.ownerRecipientId);assert.equal(request.eventId,event.eventId);assert.deepEqual(request.scope,{kind:'agency'});
 await f.service().tick();assert.deepEqual(f.state.requests[0],request);assert.deepEqual(Object.values((await f.saved()).records)[0].request,request);
});
test('pure request identity pins exact scope/native hash and repeated captures remain stable',async t=>{
 const f=await fixture(t),event=f.event(),base=officeCooReactiveTaskRequest(f.state.policy,event,f.state.now);assert.deepEqual(officeCooReactiveTaskRequest(structuredClone(f.state.policy),structuredClone(event),f.state.now),base);
 for(const change of [{scope:{kind:'client',clientId:'a7604343-92d7-56ec-bf35-b272cac7f8b7'}},{rawSha256:hash('changed-native')}]){const altered=officeCooReactiveTaskRequest(f.state.policy,{...event,...change},f.state.now);assert.equal(altered.jobId,base.jobId);assert.notEqual(altered.requestSha256,base.requestSha256);}
 const alias=officeCooReactiveTaskRequest(f.state.policy,{...event,eventId:'signed-alias'},f.state.now);assert.equal(alias.jobId,base.jobId);assert.notEqual(alias.requestSha256,base.requestSha256);
 for(const change of [{scope:{kind:'client',clientId:'private-owner-phone'}},{scope:{kind:'agency',ownerRecipientId:'private-owner'}},{rawSha256:'malformed'},{senderId:'foreign-owner'},{accountId:'foreign-account'}])assert.throws(()=>officeCooReactiveTaskRequest(f.state.policy,{...event,...change},f.state.now));
});
test('pure request ignores historical/frozen events, rejects future/invalid policy and exports only whitelisted server fields',async t=>{
 const f=await fixture(t),event=f.event();assert.equal(officeCooReactiveTaskRequest(f.state.policy,{...event,sentAt:f.state.policy.activationAt},f.state.now),null);assert.equal(officeCooReactiveTaskRequest({...f.state.policy,excludeEventIds:[event.eventId]},event,f.state.now),null);
 assert.throws(()=>officeCooReactiveTaskRequest(f.state.policy,{...event,capturedAt:'2026-10-15T12:11:00Z'},f.state.now),/future/);assert.throws(()=>officeCooReactiveTaskRequest({...f.state.policy,enabled:false},event,f.state.now),/policy/);assert.throws(()=>officeCooReactiveTaskRequest(f.state.policy,event,NaN),/clock/);
 const request=officeCooReactiveTaskRequest(f.state.policy,{...event,untrustedModelRole:'system',ownerRecipientId:'foreign-private-recipient',profileId:f.state.policy.profileId},f.state.now);assert.equal('untrustedModelRole'in request,false);assert.equal('senderId'in request,false);assert.equal('profileId'in request,false);assert.equal(request.ownerRecipientId,f.state.policy.ownerRecipientId);
});


test('active first task cannot block a second ready task completion',async t=>{
 const f=await fixture(t);f.state.events=[f.event(),f.event({eventId:'event-2',messageId:'native-message-2',rawSha256:hash('native-message-2')})];await f.service().tick();assert.equal(f.state.requests.length,2);const second=f.state.tasks.get(f.state.requests[1].jobId);second.status='answered';second.output='Second task actual output';assert.equal((await f.service().tick()).reason,'reply_accepted');assert.equal(f.state.replies[0].jobId,second.jobId);assert.equal(f.state.tasks.get(f.state.requests[0].jobId).status,'running');
});
test('trusted accepted receipt recovers uncertainty only with exact intent request and body lineage',async t=>{
 for(const changed of [null,'intentId','jobId','requestSha256','bodySha256','providerMessageId']){const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual output';f.options.sendReply=async()=>{throw Error('lost acknowledgement');};await f.service().tick();f.options.reconcileReply=async intent=>{const receipt={accepted:true,intentId:intent.id,jobId:intent.jobId,requestSha256:intent.requestSha256,bodySha256:intent.bodySha256,providerMessageId:'persistent-provider-id'};if(changed)receipt[changed]=changed==='providerMessageId'?'':'foreign';return receipt;};if(changed)await assert.rejects(f.service().tick(),/reply_reconciliation_identity/);else{assert.equal((await f.service().tick()).status,'idle');assert.equal(Object.values((await f.saved()).records)[0].replyReceipt.reconciled,true);}assert.equal(f.state.requests.length,1);}
});
test('null trusted recovery never replays an uncertain send and does not block other owner tasks',async t=>{
 const f=await fixture(t);f.state.events=[f.event()];await f.service().tick();const task=f.state.tasks.get(f.state.requests[0].jobId);task.status='answered';task.output='Actual output';let sends=0;f.options.sendReply=async()=>{sends++;throw Error('uncertain');};await f.service().tick();f.options.reconcileReply=async()=>null;f.state.events.push(f.event({eventId:'event-2',messageId:'message-2',rawSha256:hash('message-2')}));await f.service().tick();assert.equal(sends,1);assert.equal(f.state.requests.length,2);
});

test('new native task admissions are bounded to four per tick while later ticks make progress',async t=>{const f=await fixture(t);f.state.events=Array.from({length:7},(_,i)=>f.event({eventId:'event-'+i,messageId:'native-'+i,rawSha256:hash('native-'+i)}));assert.equal((await f.service().tick()).status,'waiting');assert.equal(f.state.requests.length,4);await f.service().tick();assert.equal(f.state.requests.length,7);assert.equal(new Set(f.state.requests.map(r=>r.jobId)).size,7);});

test('trusted serial channel durably queues later owner tasks across restart without submitting while prior task is active',async t=>{
 const f=await fixture(t);f.options.serialTasks=true;f.state.events=[f.event(),f.event({eventId:'event-2',messageId:'native-2',rawSha256:hash('native-2')})];await f.service().tick();assert.equal(f.state.requests.length,1);assert.equal(Object.values((await f.saved()).records).filter(r=>r.phase==='prepared').length,1);
 await f.service().tick();assert.equal(f.state.requests.length,1);const first=f.state.tasks.get(f.state.requests[0].jobId);first.status='answered';first.output='First raw output';assert.equal((await f.service().tick()).reason,'reply_accepted');assert.equal(f.state.requests.length,1);await f.service().tick();assert.equal(f.state.requests.length,2);assert.equal(new Set(f.state.requests.map(r=>r.jobId)).size,2);
});

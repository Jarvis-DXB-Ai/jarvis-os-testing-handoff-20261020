import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import * as core from './lib/office-coo-whatsapp.mjs';
import {createOfficeCooZernioAdapter} from './lib/office-coo-zernio.mjs';
// SYNTHETIC HTTP contract fixtures only. All identities/numbers/keys reserved/invented.
// Injected fetch never calls any network; these checks do not prove provider delivery.
const stamp='2026-10-15T12:00:00.000Z';
const binding={channelId:'synthetic-coo',profileId:'fixture-profile',accountId:'fixture-account',senderPhone:'12025550101',ownerParticipantId:'12025550102'};
const config={binding};
const request={requestId:'fixture-request',profileId:binding.profileId,accountId:binding.accountId,senderPhone:binding.senderPhone,participantId:binding.ownerParticipantId,conversationId:'internal:/opaque?alias',message:'Synthetic approved setup notification'};
const stored={id:request.conversationId,platformConversationId:'platform:/opaque?alias',messageId:'wamid.fixture-incoming==',sentAt:'2026-10-15T11:59:00.000Z'};
const wire=()=>({method:'POST',path:'/v1/inbox/conversations/'+encodeURIComponent(request.conversationId)+'/messages',headers:{'Idempotency-Key':'coo-89b3e875-4dc6-5553-b586-b4e8c46709a1'},body:{accountId:binding.accountId,message:request.message}});
const health=()=>({accountId:binding.accountId,platform:'whatsapp',username:'+00000000000',status:'healthy',tokenStatus:{valid:true},platformConnection:{status:'connected',phoneStatus:'CONNECTED',inboundWebhookSubscribed:true,checkedAt:stamp}});
const row=()=>({id:stored.platformConversationId,accountId:binding.accountId,platform:'whatsapp',participantId:binding.ownerParticipantId,threadControl:'app',isGroup:false});
const list=()=>({data:[row()],pagination:{hasMore:false,nextCursor:null},meta:{accountsQueried:1,accountsFailed:0,failedAccounts:[],accountsSkipped:[],lastUpdated:stamp}});
const incoming=()=>({id:stored.messageId,conversationId:stored.id,accountId:binding.accountId,platform:'whatsapp',message:'Synthetic owner inbound',senderId:binding.ownerParticipantId,direction:'incoming',createdAt:stamp});
const messages=()=>({status:'success',sortOrderApplied:'desc',messages:[incoming()],pagination:{hasMore:false,nextCursor:null}});
const neverOnboarded=()=>({eligible:null,termsAccepted:false,onboarded:false,enabled:false,agentId:null,settings:null,manualSteps:[],unverifiedSteps:[]});
const credential=()=>({secret:'zrk_synthetic_never_real_private_key',scope:'profiles',permission:'read-write',profileIds:[binding.profileId],enabledResourceGroups:['accounts','messages'],adminAccess:'denied',expiresAt:'2026-11-14T12:00:00.000Z'});
const verdict=(context,state)=>({approved:state.authority,privacyVerified:state.privacy,requestHash:context.requestHash,wireHash:context.wireHash,challenge:context.challenge,checkedAt:state.time,authorityRevision:'synthetic-current-private-authority-1'});
const json=(p,status=200)=>new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json'}});
function fixture(extra={}){
 const state={privacy:true,authority:true,time:stamp,calls:[],health:health(),list:list(),messages:messages(),credential:credential(),businessAgentStatus:neverOnboarded(),provenance:true,provenanceContexts:[],...extra};
 const deps={getApiKey:async()=>state.credential,verifyPrivacy:async()=>state.privacy,...(extra.enableNA?{verifyDefaultControlProvenance:async context=>{state.provenanceContexts.push(context);assert.deepEqual(context.binding,binding);assert.equal(context.source.path,'/v1/accounts/'+binding.accountId+'/business-agent');return state.provenance===true;}}:{}),verifyCurrentSendAuthority:async input=>{assert.deepEqual(input.request,request);assert.deepEqual(input.signedInbound,stored);return verdict(input,state);},now:()=>state.time,fetchImpl:async(url,options)=>{
  const u=new URL(url);state.calls.push({url:u,options});if(state.route)return state.route(u,options,state);
  return json(options.method==='POST'?{success:true,data:{messageId:'wamid.synthetic-outgoing==',conversationId:request.conversationId}}:u.pathname.endsWith('/health')?state.health:u.pathname.endsWith('/messages')?state.messages:u.pathname.endsWith('/business-agent')?state.businessAgentStatus:state.list);
 },...(extra.dependencies??{})};
 const adapter=createOfficeCooZernioAdapter(extra.config??config,deps);return {state,adapter,deps,prepare:()=>adapter.verifyConversation(request,binding,stored),send:()=>adapter.transport(wire())};
}
function posts(f){return f.state.calls.filter(x=>x.options.method==='POST');}

test('synthetic exact scoped GET uses fixed origin, no redirect/retry and private bearer',async()=>{
 const f=fixture();assert.equal(await f.adapter.verifyChannel({...binding}),true);assert.equal(f.state.calls.length,1);const {url,options}=f.state.calls[0];assert.equal(url.href,'https://zernio.com/api/v1/accounts/fixture-account/health');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+f.state.credential.secret);assert.equal(options.method,'GET');assert.ok(options.signal instanceof AbortSignal);
});
test('synthetic creation requires trusted functions and exact dedicated binding',()=>{
 for(const name of ['getApiKey','verifyPrivacy','verifyCurrentSendAuthority']){const f=fixture();assert.throws(()=>createOfficeCooZernioAdapter(config,{...f.deps,[name]:true}),/capabilities/);}
 assert.throws(()=>createOfficeCooZernioAdapter({binding:{...binding,ownerParticipantId:binding.senderPhone}},fixture().deps),/binding/);assert.throws(()=>createOfficeCooZernioAdapter(config,{...fixture().deps,deadlineMs:4001}),/deadline/);
});
test('synthetic extra/unknown groups, Admin, wrong profile/permission/expiry block before fetch',async()=>{
 for(const patch of [{enabledResourceGroups:['accounts','messages','commerce']},{enabledResourceGroups:['accounts','messages','admin']},{enabledResourceGroups:['accounts','accounts']},{adminAccess:'allowed'},{adminAccess:undefined},{scope:'all'},{profileIds:[binding.profileId,'client']},{permission:'read-only'},{expiresAt:stamp},{expiresAt:'tomorrow'},{secret:'synthetic\r\nunsafecredential'}]){const f=fixture();Object.assign(f.state.credential,patch);assert.equal(await f.adapter.verifyChannel(binding),false);assert.equal(f.state.calls.length,0);}
});
test('synthetic persistent privacy missing or foreign binding never performs HTTP',async()=>{
 const f=fixture({privacy:false});assert.equal(await f.adapter.verifyChannel(binding),false);await assert.rejects(f.prepare(),/privacy/);assert.equal(f.state.calls.length,0);const g=fixture();assert.equal(await g.adapter.verifyChannel({...binding,accountId:'client-account'}),false);await assert.rejects(g.adapter.verifyConversation(request,{...binding,profileId:'client'},stored),/Foreign/);assert.equal(g.state.calls.length,0);
});
test('synthetic live health rejects token-only, stale/future, unknown inbound, wrong sender and restriction',async()=>{
 for(const mutate of [p=>p.platformConnection=undefined,p=>p.accountId='foreign',p=>p.platform='instagram',p=>p.username='+00000000000',p=>p.tokenStatus.valid=false,p=>p.platformConnection.phoneStatus='DISCONNECTED',p=>p.platformConnection.inboundWebhookSubscribed=null,p=>p.platformConnection.checkedAt='2026-10-15T11:59:54.000Z',p=>p.platformConnection.checkedAt='2026-10-15T12:00:00.001Z',p=>p.messagingRestriction={code:131042},p=>p.status='error']){const f=fixture();mutate(f.state.health);assert.equal(await f.adapter.verifyChannel(binding),false);}
});
test('synthetic fresh proof retains actual DESC envelopes and authenticated aliases, not timestamp equality',async()=>{
 const f=fixture();const p=await f.prepare();assert.equal(p.conversation.id,stored.platformConversationId);assert.equal(p.messagePages[0].response.messages[0].id,stored.messageId);assert.notEqual(p.messagePages[0].response.messages[0].createdAt,stored.sentAt);assert.equal(p.checkedAt,stamp);assert.equal(f.state.calls.length,2);for(const c of f.state.calls){assert.equal(c.url.origin,'https://zernio.com');assert.equal(c.url.searchParams.get('sortOrder'),'desc');assert.equal(c.url.searchParams.get('limit'),'100');assert.equal(c.url.searchParams.get('accountId'),binding.accountId);assert.equal(c.url.searchParams.has('participantId'),false);}assert.equal(f.state.calls[1].url.searchParams.get('profileId'),binding.profileId);assert.ok(Object.isFrozen(p.messagePages[0].response.messages));
});
test('synthetic same-account unrelated owner conversations are locally filtered, never returned',async()=>{
 const f=fixture();f.state.list.data.unshift({...row(),id:'unrelated-thread',participantId:'12025550199',participantName:'Synthetic unrelated contact'});const p=await f.prepare();assert.equal(p.conversation.participantId,binding.ownerParticipantId);assert.equal(JSON.stringify(p).includes('unrelated'),false);
});
test('synthetic foreign request/recipient and signed aliases/window never become a read',async()=>{
 for(const change of [{profileId:'client'},{participantId:'12025550199'},{message:''},{conversationId:'other'}]){const f=fixture();await assert.rejects(f.adapter.verifyConversation({...request,...change},binding,stored));assert.equal(f.state.calls.length,0);}for(const sentAt of ['2026-10-14T12:00:00.000Z','2026-10-15T12:00:00.001Z']){const f=fixture();await assert.rejects(f.adapter.verifyConversation(request,binding,{...stored,sentAt}));assert.equal(f.state.calls.length,0);}
});
test('synthetic control missing/AI/other, group/foreign owner and incomplete account coverage block',async()=>{
 for(const mutate of [p=>delete p.data[0].threadControl,p=>p.data[0].threadControl='ai_agent',p=>p.data[0].threadControl='other',p=>p.data[0].participantId='12025550199',p=>p.data[0].isGroup=true,p=>p.data[0].accountId='foreign',p=>p.meta.accountsFailed=1,p=>p.meta.accountsQueried=2,p=>p.meta.accountsSkipped=[{accountId:binding.accountId}],p=>p.data.push({...p.data[0]})]){const f=fixture();mutate(f.state.list);await assert.rejects(f.prepare());assert.equal(posts(f).length,0);}
});
test('synthetic message order, foreign owner/account, mismatched wamid, future and standby block',async()=>{
 for(const mutate of [p=>p.sortOrderApplied='asc',p=>p.messages[0].accountId='foreign',p=>p.messages[0].senderId='12025550199',p=>p.messages[0].id='other-wamid',p=>p.messages[0].conversationId='unlinked-alias',p=>p.messages[0].createdAt='2026-10-15T12:00:00.001Z',p=>p.messages[0].metadata={standby:true},p=>p.messages=[]]){const f=fixture();mutate(f.state.messages);await assert.rejects(f.prepare());assert.equal(posts(f).length,0);}
});
test('synthetic DESC cursor chain walks outgoing pages to first actual incoming',async()=>{
 const f=fixture();f.state.route=(u,o)=>{if(!u.pathname.endsWith('/messages'))return json(f.state.list);if(!u.searchParams.has('cursor'))return json({...messages(),messages:[{...incoming(),id:'wamid.outgoing==',senderId:binding.accountId,direction:'outgoing'}],pagination:{hasMore:true,nextCursor:'opaque+/cursor?'}});assert.equal(u.searchParams.get('cursor'),'opaque+/cursor?');return json(messages());};const p=await f.prepare();assert.equal(p.messagePages.length,2);assert.equal(p.messagePages[1].cursor,'opaque+/cursor?');assert.equal(f.state.calls.length,3);
});
test('synthetic missing/looped/ten-page incomplete pagination refuses latest evidence',async()=>{
 for(const mode of ['missing','loop','limit']){const f=fixture();let n=0;f.state.route=()=>json({...messages(),messages:[],...(mode==='missing'?{pagination:undefined}:{pagination:{hasMore:true,nextCursor:mode==='loop'?'same':'cursor'+(++n)}})});await assert.rejects(f.prepare());assert.ok(f.state.calls.length<=10);}
});
test('synthetic exact one-use transport revalidates provider and authority, preserves idempotency and body',async()=>{
 const f=fixture();await f.prepare();assert.equal((await f.send()).success,true);assert.equal(posts(f).length,1);const c=posts(f)[0];assert.equal(c.url.href,'https://zernio.com/api/v1'+wire().path.slice(3));assert.deepEqual(JSON.parse(c.options.body),wire().body);assert.equal(c.options.headers['Idempotency-Key'],wire().headers['Idempotency-Key']);await assert.rejects(f.send(),/matching/);assert.equal(posts(f).length,1);
});
test('synthetic serialized wire is not authority; changed body/path/extra fields cannot POST',async()=>{
 const empty=fixture();await assert.rejects(empty.send(),/matching/);assert.equal(empty.state.calls.length,0);
 for(const mutate of [w=>w.body.message='Changed',w=>w.path='/v1/inbox/conversations/client/messages',w=>w.body.accountId='client',w=>w.body.attachmentUrl='https://example.com/a',w=>w.headers.Authorization='injected',w=>w.method='GET']){const f=fixture();await f.prepare();const w=wire();mutate(w);await assert.rejects(f.adapter.transport(w));assert.equal(posts(f).length,0);}
});
test('synthetic concurrent consumption and expired pair cannot issue two POSTs',async()=>{
 const f=fixture();await f.prepare();const results=await Promise.allSettled([f.send(),f.send()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(posts(f).length,1);const g=fixture();await g.prepare();g.state.time='2026-10-15T12:00:06.000Z';await assert.rejects(g.send(),/expired/);assert.equal(posts(g).length,0);
});
test('synthetic privacy/control/disconnect/authority changes after prepare halt and consume intent',async()=>{
 for(const change of [s=>s.privacy=false,s=>s.list.data[0].threadControl='ai_agent',s=>s.health.platformConnection.status='disconnected',s=>s.authority=false]){const f=fixture();await f.prepare();change(f.state);await assert.rejects(f.send());assert.equal(posts(f).length,0);await assert.rejects(f.send(),/matching/);}
});
test('synthetic final authority check is after credential/provider awaits and before POST',async()=>{
 let allowed=true;const f=fixture({dependencies:{getApiKey:async()=>{allowed=false;return credential();},verifyCurrentSendAuthority:async ctx=>verdict(ctx,{authority:allowed,privacy:true,time:stamp})}});await f.prepare();await assert.rejects(f.send(),/authority/);assert.equal(posts(f).length,0);
});
test('synthetic HTTP errors, redirect, non-JSON, oversized length and broken UTF8 have no retries',async()=>{
 for(const make of [()=>json({},429),()=>json({},500),()=>new Response('{}',{headers:{'Content-Type':'text/html'}}),()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'1048577'}}),()=>new Response(new Uint8Array([255]),{headers:{'Content-Type':'application/json'}}),()=>{const r=json(health());Object.defineProperty(r,'redirected',{value:true});return r;}]){const f=fixture({route:make});assert.equal(await f.adapter.verifyChannel(binding),false);assert.equal(f.state.calls.length,1);}
});
test('synthetic chunked oversized JSON is bounded independently of Content-Length',async()=>{
 const f=fixture({route:()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1048577));c.close();}}),{headers:{'Content-Type':'application/json'}})});assert.equal(await f.adapter.verifyChannel(binding),false);assert.equal(f.state.calls.length,1);
});
test('synthetic hung HTTP/trusted callback deadlines and caller abort do not POST later',async()=>{
 const f=fixture({dependencies:{deadlineMs:15,fetchImpl:()=>new Promise(()=>{})}});const before=Date.now();assert.equal(await f.adapter.verifyChannel(binding),false);assert.ok(Date.now()-before<1000);
 const g=fixture({dependencies:{deadlineMs:15,verifyPrivacy:()=>new Promise(()=>{})}});assert.equal(await g.adapter.verifyChannel(binding),false);assert.equal(g.state.calls.length,0);
 const h=fixture();await h.prepare();const controller=new AbortController();controller.abort();await assert.rejects(h.adapter.transport(wire(),{signal:controller.signal}));assert.equal(posts(h).length,0);
});
test('synthetic lost POST acknowledgement is never retried and key stays consumed',async()=>{
 const f=fixture();await f.prepare();f.state.route=(u,o)=>{if(o.method==='POST')throw Error('Synthetic lost acknowledgement');return json(u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:f.state.list);};await assert.rejects(f.send(),/outcome/);assert.equal(posts(f).length,1);await assert.rejects(f.send(),/matching/);assert.equal(posts(f).length,1);
});

test('synthetic handover during final health is observed by subsequent current-control read',async()=>{
 const f=fixture();await f.prepare();f.state.route=(u,o)=>{if(u.pathname.endsWith('/health')){f.state.list.data[0].threadControl='other';return json(f.state.health);}return json(u.pathname.endsWith('/messages')?f.state.messages:f.state.list);};await assert.rejects(f.send(),/control/);assert.equal(posts(f).length,0);
});
test('synthetic provider/approval time advancing beyond observed health freshness blocks POST',async()=>{
 const f=fixture({dependencies:{verifyCurrentSendAuthority:async ctx=>{f.state.time='2026-10-15T12:00:06.000Z';return verdict(ctx,f.state);}}});await f.prepare();await assert.rejects(f.send(),/Stale/);assert.equal(posts(f).length,0);
});
test('synthetic external HTTP errors never disclose private provider body or credential',async()=>{
 const f=fixture();await f.prepare();f.state.route=(u,o)=>o.method==='POST'?json({private:'Synthetic sensitive error with '+f.state.credential.secret},500):json(u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:f.state.list);await assert.rejects(f.send(),e=>!e.message.includes('zrk_')&&!e.message.includes('sensitive'));assert.equal(posts(f).length,1);
});

test('synthetic actual durable core + adapter preserves one exact approved HTTP send and signed delivery',async t=>{
 const volume=await mkdtemp(join(tmpdir(),'coo-zernio-contract-'));t.after(()=>rm(volume,{recursive:true,force:true}));const cfg={binding,storage:{recordsRoot:join(volume,'archive'),recordsVolume:volume,testing:true}};await mkdir(cfg.storage.recordsRoot);
 const f=fixture(),secret='synthetic-HMAC-secret-never-real-0123456789',incomingEvent={id:'fixture-incoming-event',event:'message.received',timestamp:stamp,profiles:[{id:binding.profileId}],account:{id:binding.accountId,accountId:binding.accountId,profileId:binding.profileId,platform:'whatsapp',username:binding.senderPhone},conversation:{id:stored.id,platformConversationId:stored.platformConversationId,participantId:binding.ownerParticipantId,status:'active'},message:{id:'fixture-internal-message',conversationId:stored.id,platform:'whatsapp',platformMessageId:stored.messageId,direction:'incoming',text:'Synthetic owner inbound',attachments:[],sender:{id:binding.ownerParticipantId},sentAt:stored.sentAt,isRead:false}};
 const ingest=async p=>{const rawBody=Buffer.from(JSON.stringify(p));return core.ingestOfficeCooWebhook(cfg,{rawBody,eventId:p.id,signature:createHmac('sha256',secret).update(rawBody).digest('hex')},{secret,now:()=>stamp});};await ingest(incomingEvent);
 const capability=await core.createOfficeCooApprovalCapability(cfg,request,{now:()=>stamp,approval:{id:'fixture-exact-owner-decision',principal:'synthetic-owner',requestHash:core.officeCooRequestDigest(cfg,request),issuedAt:stamp,expiresAt:'2026-10-15T12:05:00.000Z'},verifyApproval:async()=>true});
 const result=await core.sendOfficeCooReply(cfg,request,capability,{now:()=>stamp,...f.adapter});assert.equal(result.outbox.status,'accepted');assert.equal(posts(f).length,1);assert.equal((await core.sendOfficeCooReply(cfg,request,capability,{now:()=>stamp,...f.adapter})).replayed,true);
 await ingest({...incomingEvent,id:'fixture-delivery-event',event:'message.delivered',statusAt:stamp,message:{...incomingEvent.message,platformMessageId:'wamid.synthetic-outgoing==',direction:'outgoing',sender:{id:binding.accountId},text:request.message,sentAt:stamp}});assert.equal((await core.readOfficeCooState(cfg)).state.outbox[request.requestId].status,'delivered');assert.equal(posts(f).length,1);
});
test('synthetic late trusted callback after deadline cannot start a delayed HTTP request',async()=>{
 let release;const held=new Promise(r=>release=r);const f=fixture({dependencies:{deadlineMs:10,verifyPrivacy:async()=>{await held;return true;}}});assert.equal(await f.adapter.verifyChannel(binding),false);release();await new Promise(r=>setTimeout(r,5));assert.equal(f.state.calls.length,0);
});

for(const phase of ['final-credential','final-authority'])test('independent privacy revocation regression: '+phase+' truthful combined snapshot refuses POST',async()=>{
 let keyReads=0;const f=fixture({dependencies:{getApiKey:async()=>{if(++keyReads===6&&phase==='final-credential')f.state.privacy=false;return credential();},verifyCurrentSendAuthority:async context=>{if(phase==='final-authority')f.state.privacy=false;return verdict(context,f.state);}}});await f.prepare();await assert.rejects(f.send(),/privacy\/send authority/);assert.equal(f.state.privacy,false);assert.equal(posts(f).length,0);await assert.rejects(f.send(),/matching/);
});
test('synthetic combined authority refuses Boolean/old callback and stale, replayed or mismatched verdict',async()=>{
 const f=fixture();const {verifyCurrentSendAuthority,...old}=f.deps;assert.throws(()=>createOfficeCooZernioAdapter(config,{...old,verifySendAuthority:async()=>true}),/capabilities/);
 for(const alter of [()=>true,x=>({...x,approved:false}),x=>({...x,privacyVerified:false}),x=>({...x,requestHash:'wrong'}),x=>({...x,wireHash:'wrong'}),x=>({...x,challenge:'previous-attempt'}),x=>({...x,authorityRevision:''}),x=>({...x,checkedAt:'2026-10-15T11:59:59.999Z'}),x=>({...x,checkedAt:'2026-10-15T12:00:00.001Z'})]){const g=fixture({dependencies:{verifyCurrentSendAuthority:async c=>alter(verdict(c,g.state))}});await g.prepare();await assert.rejects(g.send());assert.equal(posts(g).length,0);}
});

function naFixture(extra={}){const f=fixture({enableNA:true,...extra});delete f.state.list.data[0].threadControl;return f;}
function coreDefaultContext(proof){return {request,binding,conversation:proof.conversation,checkedAt:proof.checkedAt,signedInbound:{id:'synthetic-event-id',conversationId:stored.id,platformConversationId:stored.platformConversationId,messageId:stored.messageId,sentAt:stored.sentAt}};}
const agentReads=f=>f.state.calls.filter(c=>c.url.pathname.endsWith('/business-agent'));
test('synthetic N/A requires fresh raw never-onboarded status + trusted provenance and never emits app ownership',async()=>{
 const f=naFixture(),proof=await f.prepare();assert.equal(proof.conversation.threadControl,undefined);assert.equal(proof.defaultControlEvidence.mode,'whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded');assert.equal(agentReads(f).length,1);assert.equal(f.state.provenanceContexts.length,1);const c=f.state.provenanceContexts[0];assert.deepEqual(c.businessAgentStatus,neverOnboarded());assert.deepEqual(c.signedInbound,stored);assert.equal(c.conversation.id,stored.platformConversationId);assert.equal(c.source.method,'GET');assert.equal(c.source.status,200);assert.equal(c.statusObservedAt,stamp);assert.ok(Object.isFrozen(c.businessAgentStatus));
 assert.equal(await f.adapter.verifyDefaultControl(proof.defaultControlEvidence,coreDefaultContext(proof)),true);assert.equal(agentReads(f).length,2);await f.send();assert.equal(agentReads(f).length,3);assert.equal(posts(f).length,1);
});
test('synthetic N/A provider eligibility is unknown/irrelevant, not evidence of non-coexistence or new creation',async()=>{
 for(const eligible of [null,true,false]){const f=naFixture();f.state.businessAgentStatus.eligible=eligible;const p=await f.prepare();assert.equal(p.conversation.threadControl,undefined);assert.equal(f.state.provenanceContexts[0].businessAgentStatus.eligible,eligible);}
 const g=naFixture({provenance:false});await assert.rejects(g.prepare(),/provenance/);assert.equal(posts(g).length,0);
 const h=fixture();delete h.state.list.data[0].threadControl;h.state.list.data[0].nonCoexistence=true;await assert.rejects(h.prepare(),/control/);assert.equal(agentReads(h).length,0);assert.throws(()=>createOfficeCooZernioAdapter(config,{...h.deps,verifyDefaultControlProvenance:true}),/server function/);
});
test('synthetic N/A incomplete/conflicting/previously-onboarded status and envelopes fail closed',async()=>{
 for(const mutate of [p=>p.enabled=true,p=>p.enabled=null,p=>p.onboarded=true,p=>p.termsAccepted=true,p=>p.agentId='previously-onboarded-agent',p=>p.settings={},p=>delete p.enabled,p=>delete p.settings,p=>delete p.eligible,p=>p.eligible='unknown',p=>p.manualSteps=null,p=>p.unverifiedSteps=null,p=>p.manualSteps=Array(33).fill({})]){const f=naFixture();mutate(f.state.businessAgentStatus);await assert.rejects(f.prepare(),/tuple/);assert.equal(f.state.provenanceContexts.length,0);assert.equal(posts(f).length,0);}
 const f=naFixture();f.state.businessAgentStatus={data:neverOnboarded()};await assert.rejects(f.prepare(),/tuple/);
});
test('synthetic N/A explicit non-app/unknown controls and agent/standby contradictions veto before fallback',async()=>{
 for(const threadControl of ['ai_agent','other',null,'unknown']){const f=naFixture();f.state.list.data[0].threadControl=threadControl;await assert.rejects(f.prepare(),/control/);assert.equal(agentReads(f).length,0);}
 for(const patch of [{metadata:{standby:true}},{source:'meta_business_agent'},{source:'whatsapp_business_app'},{metadata:{source:'coexistence_history'}}]){const f=naFixture();f.state.messages.messages.unshift({...incoming(),id:'wamid.contradictory-outgoing==',senderId:binding.accountId,direction:'outgoing',...patch});await assert.rejects(f.prepare(),/contradiction/);assert.equal(agentReads(f).length,0);}
});
test('synthetic N/A branded proof refuses serialization, foreign adapter, binding/request/row/inbound mismatch',async()=>{
 const f=naFixture(),p=await f.prepare(),e=p.defaultControlEvidence,c=coreDefaultContext(p);assert.equal(await f.adapter.verifyDefaultControl(JSON.parse(JSON.stringify(e)),c),false);assert.equal(await naFixture().adapter.verifyDefaultControl(e,c),false);
 for(const change of [x=>x.binding={...binding,profileId:'foreign'},x=>x.request={...request,message:'changed'},x=>x.conversation={...p.conversation,participantId:'12025550199'},x=>x.signedInbound={...x.signedInbound,messageId:'other'},x=>x.signedInbound={...x.signedInbound,standby:true},x=>x.checkedAt='2026-10-15T11:59:59.000Z']){const v=structuredClone(c);change(v);assert.equal(await f.adapter.verifyDefaultControl(e,v),false);}
 assert.equal(agentReads(f).length,1);
});
test('synthetic N/A core wrapper re-reads status and revalidates revoked provenance rather than trusting old brand',async()=>{
 const f=naFixture(),p=await f.prepare();f.state.businessAgentStatus.enabled=true;assert.equal(await f.adapter.verifyDefaultControl(p.defaultControlEvidence,coreDefaultContext(p)),false);assert.equal(agentReads(f).length,2);
 const g=naFixture(),q=await g.prepare();g.state.provenance=false;assert.equal(await g.adapter.verifyDefaultControl(q.defaultControlEvidence,coreDefaultContext(q)),false);assert.equal(posts(g).length,0);
 const h=naFixture(),v=await h.prepare();h.state.time='2026-10-15T12:00:05.001Z';assert.equal(await h.adapter.verifyDefaultControl(v.defaultControlEvidence,coreDefaultContext(v)),false);
});
for(const phase of ['provider-status','provenance'])test('synthetic N/A '+phase+' revoked during final credential callback halts before POST',async()=>{
 let keys=0;const f=naFixture({dependencies:{getApiKey:async()=>{if(++keys===7){if(phase==='provider-status')f.state.businessAgentStatus.enabled=true;else f.state.provenance=false;}return credential();}}});await f.prepare();await assert.rejects(f.send(),phase==='provider-status'?/tuple/:/provenance/);assert.equal(keys,7);assert.equal(agentReads(f).length,2);assert.equal(posts(f).length,0);await assert.rejects(f.send(),/matching/);
});
test('synthetic N/A current status HTTP error cannot use saved never-onboarded evidence',async()=>{
 const f=naFixture();await f.prepare();f.state.route=(u,o)=>json(u.pathname.endsWith('/business-agent')?{error:'synthetic provider unavailable'}:u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:f.state.list,u.pathname.endsWith('/business-agent')?503:200);await assert.rejects(f.send());assert.equal(posts(f).length,0);assert.equal(agentReads(f).length,2);
});
test('synthetic N/A final combined privacy+exact approval is LAST authority after status/provenance and credential',async()=>{
 const order=[];const f=naFixture({dependencies:{getApiKey:async()=>{order.push('credential');return credential();},verifyDefaultControlProvenance:async ctx=>{order.push('provenance');return f.state.provenance;},verifyCurrentSendAuthority:async ctx=>{order.push('combined-authority');assert.equal(ctx.defaultControlEvidence.mode,'whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded');return verdict(ctx,f.state);}}});await f.prepare();f.state.route=(u,o)=>{order.push(o.method==='POST'?'POST':u.pathname.endsWith('/business-agent')?'status':'provider');return json(o.method==='POST'?{success:true,data:{messageId:'wamid.na==',conversationId:request.conversationId}}:u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:u.pathname.endsWith('/business-agent')?f.state.businessAgentStatus:f.state.list);};await f.send();assert.deepEqual(order.slice(-5),['credential','status','provenance','combined-authority','POST']);assert.equal(posts(f).length,1);
});

test('synthetic durable core accepts distinct N/A evidence only without retained handover history',async t=>{
 for(const retained of [false,true]){
  const volume=await mkdtemp(join(tmpdir(),'coo-na-core-'));t.after(()=>rm(volume,{recursive:true,force:true}));const cfg={binding,storage:{recordsRoot:join(volume,'archive'),recordsVolume:volume,testing:true}};await mkdir(cfg.storage.recordsRoot);const f=naFixture(),secret='synthetic-NA-secret-never-real-0123456789',base={timestamp:stamp,profiles:[{id:binding.profileId}],account:{id:binding.accountId,accountId:binding.accountId,profileId:binding.profileId,platform:'whatsapp',username:binding.senderPhone}};
  const ingest=async p=>{const rawBody=Buffer.from(JSON.stringify(p));await core.ingestOfficeCooWebhook(cfg,{rawBody,eventId:p.id,signature:createHmac('sha256',secret).update(rawBody).digest('hex')},{secret,now:()=>stamp});};
  await ingest({...base,id:'synthetic-NA-incoming',event:'message.received',conversation:{id:stored.id,platformConversationId:stored.platformConversationId,participantId:binding.ownerParticipantId,status:'active'},message:{id:'synthetic-internal-message',conversationId:stored.id,platform:'whatsapp',platformMessageId:stored.messageId,direction:'incoming',text:'Synthetic owner inbound',attachments:[],sender:{id:binding.ownerParticipantId},sentAt:stored.sentAt,isRead:false}});
  if(retained)await ingest({...base,id:'synthetic-retained-handover',event:'conversation.control_changed',changedAt:stamp,conversation:{id:stored.platformConversationId,platform:'whatsapp',platformConversationId:stored.platformConversationId,participantId:binding.ownerParticipantId,participantName:'Synthetic owner',status:'active'},control:{owner:'app',previousOwner:'ai_agent'}});
  const capability=await core.createOfficeCooApprovalCapability(cfg,request,{now:()=>stamp,approval:{id:'synthetic-NA-owner-approval',principal:'synthetic-owner',requestHash:core.officeCooRequestDigest(cfg,request),issuedAt:stamp,expiresAt:'2026-10-15T12:05:00.000Z'},verifyApproval:async()=>true});
  const result=await core.sendOfficeCooReply(cfg,request,capability,{now:()=>stamp,...f.adapter});assert.equal(posts(f).length,retained?0:1);assert.equal(result.outbox.status,retained?'ambiguous':'accepted');if(!retained)assert.equal(result.outbox.observations[0].control,'no-reported-handover');
 }
});
for(const phase of ['final-credential','final-combined-authority'])test('synthetic N/A retains privacy revocation veto at '+phase,async()=>{
 let keys=0;const f=naFixture({dependencies:{getApiKey:async()=>{if(++keys===7&&phase==='final-credential')f.state.privacy=false;return credential();},verifyCurrentSendAuthority:async c=>{if(phase==='final-combined-authority')f.state.privacy=false;return verdict(c,f.state);}}});await f.prepare();await assert.rejects(f.send(),/privacy\/send authority/);assert.equal(posts(f).length,0);assert.equal(f.state.privacy,false);
});

for(const status of [201,206])test('synthetic N/A MBA GET '+status+' cannot become claimed HTTP200 provenance',async()=>{
 const f=naFixture();
 f.state.route=u=>json(u.pathname.endsWith('/business-agent')?f.state.businessAgentStatus:u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:f.state.list,u.pathname.endsWith('/business-agent')?status:200);
 await assert.rejects(f.prepare(),/Provider response/);
 assert.equal(f.state.provenanceContexts.length,0);
 assert.equal(posts(f).length,0);
});

test('synthetic valid POST201 acknowledgement remains supported after exact GET200 guard',async()=>{
 const f=naFixture();
 await f.prepare();
 f.state.route=(u,o)=>json(o.method==='POST'?{success:true,data:{messageId:'wamid.synthetic-created==',conversationId:request.conversationId}}:u.pathname.endsWith('/health')?f.state.health:u.pathname.endsWith('/messages')?f.state.messages:u.pathname.endsWith('/business-agent')?f.state.businessAgentStatus:f.state.list,o.method==='POST'?201:200);
 const result=await f.send();
 assert.equal(result.success,true);
 assert.equal(result.data.messageId,'wamid.synthetic-created==');
 assert.equal(result.data.conversationId,request.conversationId);
 assert.equal(posts(f).length,1);
});

test('actual alias-shape regression: current list internal ID is accepted only from signed alias pair',async()=>{
 for(const useDefault of [false,true]){const f=useDefault?naFixture():fixture();f.state.list.data[0].id=stored.id;const proof=await f.prepare();assert.equal(proof.conversation.id,stored.id);assert.equal(proof.messagePages[0].response.messages[0].id,stored.messageId);if(useDefault){assert.equal(proof.conversation.threadControl,undefined);assert.equal(await f.adapter.verifyDefaultControl(proof.defaultControlEvidence,coreDefaultContext(proof)),true);}assert.equal((await f.send()).success,true);assert.equal(posts(f).length,1);}
});
test('actual alias-shape regression: unrelated alias, foreign owner or both signed alias rows fail closed',async()=>{
 for(const mode of ['unrelated','foreign-owner','duplicate-aliases']){const f=naFixture();f.state.list.data[0].id=stored.id;if(mode==='unrelated')f.state.list.data[0].id='not-one-of-the-signed-aliases';if(mode==='foreign-owner')f.state.list.data[0].participantId='12025550199';if(mode==='duplicate-aliases')f.state.list.data.push({...f.state.list.data[0],id:stored.platformConversationId});await assert.rejects(f.prepare());assert.equal(posts(f).length,0);assert.equal(agentReads(f).length,0);}
});

// Retains the observed 16-digit Meta node shape/value; provider responses and authority are synthetic.
const syntheticMetaPhoneId='1357504417449331';
test('synthetic dedicated provider phone pin accepts outgoing history; absent/wrong pin and foreign sender fail',async()=>{
 for(const mode of ['pinned','no-pin','wrong-pin','foreign-sender','foreign-incoming','account-alias','phone-alias','plus-phone-alias']){
  const cfg={binding:{...binding},...(mode==='no-pin'?{}:{providerPhoneNumberId:mode==='wrong-pin'?'1357504417449332':syntheticMetaPhoneId})},f=fixture({config:cfg});
  const senderId=mode==='foreign-sender'?'1357504417449333':mode==='account-alias'?binding.accountId:mode==='phone-alias'?binding.senderPhone:mode==='plus-phone-alias'?'+'+binding.senderPhone:syntheticMetaPhoneId;
  f.state.messages.messages.unshift({...incoming(),id:'wamid.history-outgoing==',senderId,direction:'outgoing'});if(mode==='foreign-incoming')f.state.messages.messages[1].senderId='12025550199';
  if(['pinned','account-alias','phone-alias','plus-phone-alias'].includes(mode)){const p=await f.prepare();assert.equal(p.messagePages[0].response.messages[0].senderId,senderId);}
  else await assert.rejects(f.prepare(),/participant/);assert.equal(posts(f).length,0);
 }
});
test('synthetic normalized binding and exact pin are snapshotted before outgoing history reads',async()=>{
 const cfg={binding:{...binding,senderPhone:'+00000000000'},providerPhoneNumberId:syntheticMetaPhoneId},f=fixture({config:cfg});
 cfg.providerPhoneNumberId='1357504417449332';cfg.binding.accountId='mutated-account';cfg.binding.senderPhone='+00000000000';
 f.state.messages.messages.unshift({...incoming(),id:'wamid.history-outgoing==',senderId:syntheticMetaPhoneId,direction:'outgoing'});assert.equal((await f.prepare()).messagePages[0].response.messages[0].senderId,syntheticMetaPhoneId);
 const foreign=fixture({config:{binding,providerPhoneNumberId:syntheticMetaPhoneId}});foreign.state.messages.messages.unshift({...incoming(),id:'wamid.foreign-history==',senderId:cfg.providerPhoneNumberId,direction:'outgoing'});await assert.rejects(foreign.prepare(),/participant/);
 for(const pin of [true,'+00000000000','bad'])assert.throws(()=>fixture({config:{binding,providerPhoneNumberId:pin}}),/provenance/);
});

test('explicit group contradictions veto owner-phone rows/history and standard group aliases before any POST',async()=>{
 for(const mode of ['flag','type','upper','kind','metadata','history','address']){const f=fixture();if(mode==='flag')f.state.list.data[0].isGroup=true;if(mode==='type')f.state.list.data[0].type='group';if(mode==='upper')f.state.list.data[0].type='GROUP';if(mode==='kind')f.state.list.data[0].kind='broadcast';if(mode==='metadata')f.state.list.data[0].metadata={isGroup:true};if(mode==='history')f.state.messages.messages[0].isGroup=true;
 if(mode==='address')await assert.rejects(f.adapter.verifyConversation(request,binding,{...stored,platformConversationId:'owner@example.invalid'}));else await assert.rejects(f.prepare());assert.equal(posts(f).length,0,mode);}
 const direct=fixture();await direct.prepare();await direct.send();assert.equal(posts(direct).length,1);
});
test('group marker appearing after proof is rechecked before transport and cannot send',async()=>{
 const f=fixture();await f.prepare();f.state.list.data[0].type='group';await assert.rejects(f.send());assert.equal(posts(f).length,0);
});

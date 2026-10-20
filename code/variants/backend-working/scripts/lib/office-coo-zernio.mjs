/** Server-only Zernio adapter. No startup, environment reads, grant creation or retries.
 * Contract: official OpenAPI v1.283.0. Provider facts remain unproven until live reads.
 * The injected callbacks are trusted server capabilities, never HTTP payload fields.
 * verifyCurrentSendAuthority must atomically inspect current persistent privacy +
 * exact one-use owner approval and claim this wire/idempotency attempt in one server
 * authority snapshot. Its challenged/hash-bound verdict is not a JSON authority API.
 * A callback returning invented true flags violates this trusted server contract.
 * Optional verifyDefaultControlProvenance must inspect server-retained exact creation
 * evidence/history. It never accepts a request Boolean as non-coexistence proof.
 */
import {createHash,randomUUID} from 'node:crypto';
import {officeCooRequestDigest} from './office-coo-whatsapp.mjs';
import {officeCooOutgoingSenderMatches} from './office-coo-message-origin.mjs';
const BASE='https://zernio.com/api/v1',MAX_BYTES=1024*1024;
const DEFAULT_MODE='whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded';
const fail=message=>{throw Error(message);};
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const frozen=x=>freeze(structuredClone(x));
const phone=x=>typeof x==='string'?x.replace(/[+ ()-]/g,''):'';
const grouped=x=>x?.isGroup===true||x?.isGroup==='true'||x?.metadata?.isGroup===true||[x?.type,x?.kind].some(v=>typeof v==='string'&&['group','broadcast','community'].includes(v.toLowerCase()))||[x?.id,x?.platformConversationId,x?.conversationId].some(v=>typeof v==='string'&&/@(?:g\.us|broadcast)$/i.test(v));
function opaque(x){if(typeof x!=='string'||!x.length||x.length>2048||/[\x00-\x1f\x7f]/.test(x))fail('Invalid opaque identifier.');return x;}
function time(x){const n=Date.parse(x);if(typeof x!=='string'||!Number.isFinite(n)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x))fail('Invalid timestamp.');return n;}
function exact(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail('Unexpected request fields.');}
function page(p){const v=p?.pagination;if(typeof v?.hasMore!=='boolean'||(v.hasMore?(typeof v.nextCursor!=='string'||!v.nextCursor.length):v.nextCursor!==null))fail('Unproven pagination.');if(v.nextCursor!==null)opaque(v.nextCursor);return v;}

export function createOfficeCooZernioAdapter(config,dependencies){
 const {getApiKey,verifyPrivacy,verifyCurrentSendAuthority,verifyDefaultControlProvenance,fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()}=dependencies??{};
 if([getApiKey,verifyPrivacy,verifyCurrentSendAuthority,fetchImpl,now].some(f=>typeof f!=='function'))fail('Trusted credential, privacy, send authority and HTTP capabilities required.');
 const raw=config?.binding,b=raw&&{channelId:raw.channelId,profileId:raw.profileId,accountId:raw.accountId,senderPhone:phone(raw.senderPhone),ownerParticipantId:phone(raw.ownerParticipantId)};
 if(!b||!b.channelId||![b.profileId,b.accountId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x))||![b.senderPhone,b.ownerParticipantId].every(x=>/^[1-9][0-9]{7,14}$/.test(x))||b.senderPhone===b.ownerParticipantId)fail('Invalid dedicated channel binding.');
 if(verifyDefaultControlProvenance!==undefined&&typeof verifyDefaultControlProvenance!=='function')fail('Default control provenance must be a trusted server function.');
 // Snapshot the same normalized server binding used by every other scope check.
 const outgoingConfig=Object.freeze({binding:Object.freeze(b),...(config.providerPhoneNumberId!==undefined?{providerPhoneNumberId:config.providerPhoneNumberId}:{})});
 officeCooOutgoingSenderMatches(outgoingConfig,b.accountId); // validate an optional pin before any HTTP
 const pairs=new Map(),defaultEvidence=new WeakMap(),deadlineMs=dependencies.deadlineMs??4000;
 if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>4000)fail('Invalid adapter deadline.');
 const bound=s=>s&&hash({...s,senderPhone:phone(s.senderPhone),ownerParticipantId:phone(s.ownerParticipantId)})===hash(b);
 const at=()=>time(now());
 const fresh=(stamp,max=5000)=>{const delta=at()-time(stamp);if(delta<0||delta>max)fail('Stale or future provider observation.');};
 async function bounded(fn,signal){
  const controller=new AbortController();let timer;const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
  const guard=()=>{if(controller.signal.aborted)fail('Adapter deadline or caller cancellation.');};
  try{return await Promise.race([fn({signal:controller.signal,guard}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Adapter deadline exceeded.'));},deadlineMs);})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
 }
 async function credential(ctx){
  const c=await getApiKey(frozen(b));ctx.guard();
  // This assertion must be derived by the server from an actually reviewed grant.
  // Unknown/new groups (including Commerce/Admin) never inherit permission.
  if(!c||typeof c.secret!=='string'||c.secret.length<16||c.secret.length>4096||/[\r\n]/.test(c.secret)||c.scope!=='profiles'||c.permission!=='read-write'||c.adminAccess!=='denied'||!Array.isArray(c.profileIds)||c.profileIds.length!==1||c.profileIds[0]!==b.profileId||!Array.isArray(c.enabledResourceGroups)||c.enabledResourceGroups.length!==2||new Set(c.enabledResourceGroups).size!==2||!['accounts','messages'].every(x=>c.enabledResourceGroups.includes(x))||time(c.expiresAt)<=at())fail('Exact least-privilege credential is unverified.');
  return frozen(c);
 }
 async function http(ctx,method,path,query={},body,headers={},preparedCredential){
  if(!path.startsWith('/v1/'))fail('Unsupported provider path.');const url=new URL(BASE+path.slice(3));for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
  const c=preparedCredential??await credential(ctx);ctx.guard();if(time(c.expiresAt)<=at())fail('Credential expired before request.');let response;
  try{response=await fetchImpl(url.href,{method,redirect:'error',signal:ctx.signal,headers:{Authorization:'Bearer '+c.secret,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}catch{fail('Provider request failed; outcome must be reconciled.');}
  ctx.guard();if(response.redirected||(response.url&&response.url!==url.href)||!response.ok||method==='GET'&&response.status!==200||!(response.headers.get('content-type')??'').toLowerCase().includes('application/json'))fail('Provider response is unavailable or not exact JSON.');
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))fail('Provider body exceeds bounded size.');
  if(!response.body?.getReader)fail('Bounded provider stream required.');const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){ctx.guard();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)fail('Provider body exceeds bounded size.');chunks.push(value);}ctx.guard();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{fail('Provider JSON could not be read within bounds.');}finally{await reader.cancel().catch(()=>{});}
 }
 async function privacy(ctx){if(await verifyPrivacy(frozen(b))!==true)fail('Persistent privacy opt-out is unverified.');ctx.guard();}
 async function health(ctx){
  await privacy(ctx);const p=await http(ctx,'GET','/v1/accounts/'+b.accountId+'/health');
  if(p.accountId!==b.accountId||p.platform!=='whatsapp'||phone(p.username)!==b.senderPhone||p.tokenStatus?.valid!==true||p.platformConnection?.status!=='connected'||p.platformConnection?.phoneStatus!=='CONNECTED'||p.platformConnection?.inboundWebhookSubscribed!==true||p.status==='error'||p.messagingRestriction)fail('Dedicated WhatsApp channel is not currently ready.');fresh(p.platformConnection.checkedAt);return p.platformConnection.checkedAt;
 }
 function checkedRequest(r,s,stored){
  if(!bound(s))fail('Foreign channel binding.');officeCooRequestDigest({binding:b},r);
  if(!stored||grouped(stored)||stored.standby===true||![stored.id,stored.platformConversationId].includes(r.conversationId)||!stored.messageId)fail('Signed direct-owner conversation linkage required.');opaque(stored.id);opaque(stored.platformConversationId);opaque(stored.messageId);
  if(time(stored.sentAt)>at()||at()-time(stored.sentAt)>=86400000)fail('Signed owner service window is closed.');
 }
 async function conversation(ctx,r,stored,{deferDefault=false}={}){
  await privacy(ctx);const messagePages=[],seen=new Set();let cursor=null,latest;
  for(let n=0;n<10;n++){
   const p=await http(ctx,'GET','/v1/inbox/conversations/'+encodeURIComponent(r.conversationId)+'/messages',{accountId:b.accountId,limit:100,sortOrder:'desc',...(cursor!==null?{cursor}:{})});
   const coverage=page(p);if(p.sortOrderApplied!=='desc'||!Array.isArray(p.messages)||p.messages.length>100)fail('Current DESC message coverage unavailable.');
   for(const m of p.messages){
    if(grouped(m)||m.accountId!==b.accountId||m.platform!=='whatsapp'||![stored.id,stored.platformConversationId].includes(m.conversationId)||!['incoming','outgoing'].includes(m.direction))fail('Foreign or group message scope.');
    opaque(m.id);if(m.direction==='incoming'?phone(m.senderId)!==b.ownerParticipantId:!officeCooOutgoingSenderMatches(outgoingConfig,m.senderId))fail('Foreign message participant.');
    if(time(m.createdAt)>at())fail('Future observed message.');if(!latest&&m.direction==='incoming')latest=m;
   }
   messagePages.push({cursor,response:p});if(latest)break;if(!coverage.hasMore)break;if(seen.has(coverage.nextCursor))fail('Repeated message cursor.');seen.add(coverage.nextCursor);cursor=coverage.nextCursor;
  }
  if(!latest||latest.id!==stored.messageId||latest.metadata?.standby===true)fail('Latest incoming does not match signed owner evidence.');
  // Read list row last: GET /conversations/{id} does not expose threadControl.
  cursor=null;seen.clear();let current;
  for(let n=0;n<10;n++){
   const p=await http(ctx,'GET','/v1/inbox/conversations',{profileId:b.profileId,accountId:b.accountId,platform:'whatsapp',limit:100,sortOrder:'desc',...(cursor!==null?{cursor}:{})});
   const coverage=page(p);if(!Array.isArray(p.data)||p.data.length>100||p.meta?.accountsQueried!==1||p.meta.accountsFailed!==0||!Array.isArray(p.meta.failedAccounts)||p.meta.failedAccounts.length||!Array.isArray(p.meta.accountsSkipped)||p.meta.accountsSkipped.length)fail('Conversation coverage incomplete.');
   for(const c of p.data){if(c.accountId!==b.accountId||c.platform!=='whatsapp'||c.profileId!==undefined&&c.profileId!==b.profileId)fail('Foreign conversation scope.');if([stored.id,stored.platformConversationId].includes(c.id)){if(current)fail('Duplicate conversation identity.');current=c;}}
   if(current)break;if(!coverage.hasMore)break;if(seen.has(coverage.nextCursor))fail('Repeated conversation cursor.');seen.add(coverage.nextCursor);cursor=coverage.nextCursor;
  }
  if(!current||phone(current.participantId)!==b.ownerParticipantId||grouped(current)||current.threadControl!==undefined&&current.threadControl!=='app')fail('Exact owner conversation control is unverified.');
  const proof={checkedAt:now(),profileId:b.profileId,conversation:current,messagePages};if(Buffer.byteLength(JSON.stringify(proof))>MAX_BYTES)fail('Conversation proof too large.');checkedRequest(r,b,stored);
  if(current.threadControl===undefined){
   if(typeof verifyDefaultControlProvenance!=='function')fail('Exact owner conversation app control is unverified.');
   return deferDefault?frozen(proof):defaultProof(ctx,r,stored,frozen(proof));
  }
  return frozen(proof);
 }
 async function defaultProof(ctx,r,stored,proof,preparedCredential){
  // This is a distinct engineering inference, NEVER an app-ownership assertion.
  // A trusted callback must establish actual new/non-coexistence creation evidence
  // and absence of retained handover/agent history; the missing row alone proves none.
  if(proof.conversation.threadControl!==undefined||typeof verifyDefaultControlProvenance!=='function')fail('Default-control inference unavailable.');
  for(const page of proof.messagePages)for(const m of page.response.messages){
   if(m.metadata?.standby===true||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(m.source)||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(m.metadata?.source))fail('Observed agent/coexistence/control contradiction.');
  }
  const path='/v1/accounts/'+b.accountId+'/business-agent',status=await http(ctx,'GET',path,{},undefined,{},preparedCredential),observedAt=now();
  if(!status||status.enabled!==false||status.onboarded!==false||status.termsAccepted!==false||status.agentId!==null||status.settings!==null||!Object.hasOwn(status,'eligible')||status.eligible!==null&&typeof status.eligible!=='boolean'||!Array.isArray(status.manualSteps)||!Array.isArray(status.unverifiedSteps)||status.manualSteps.length>32||status.unverifiedSteps.length>32)fail('Complete never-onboarded provider tuple is unverified.');
  const provenanceContext=frozen({mode:DEFAULT_MODE,binding:b,request:r,requestHash:officeCooRequestDigest({binding:b},r),signedInbound:stored,conversation:proof.conversation,messagePages:proof.messagePages,checkedAt:proof.checkedAt,statusObservedAt:observedAt,businessAgentStatus:status,source:{method:'GET',path,status:200,canonicalJsonSha256:hash(status)}});
  if(await verifyDefaultControlProvenance(provenanceContext)!==true)fail('Current creation/control provenance is unverified.');ctx.guard();fresh(observedAt);fresh(proof.checkedAt);checkedRequest(r,b,stored);
  const evidence=frozen({mode:DEFAULT_MODE,profileId:b.profileId,accountId:b.accountId,requestHash:provenanceContext.requestHash,conversationId:proof.conversation.id,checkedAt:observedAt,providerStatusSha256:hash(status)});
  defaultEvidence.set(evidence,{provenanceContext,stored,proofCheckedAt:proof.checkedAt});return freeze({...proof,defaultControlEvidence:evidence});
 }
 function defaultMatches(evidence,context){
  const record=defaultEvidence.get(evidence);if(!record||!context||!bound(context.binding)||officeCooRequestDigest({binding:b},context.request)!==record.provenanceContext.requestHash||hash(context.conversation)!==hash(record.provenanceContext.conversation)||context.checkedAt!==record.proofCheckedAt)fail('Untrusted or mismatched default-control evidence.');
  const x=context.signedInbound,signed={id:x?.conversationId??x?.id,platformConversationId:x?.platformConversationId,messageId:x?.messageId,sentAt:x?.sentAt};if(hash(signed)!==hash(record.stored)||x?.standby===true)fail('Default-control signed inbound differs.');
  fresh(evidence.checkedAt);fresh(record.proofCheckedAt);checkedRequest(context.request,b,signed);return record;
 }
 const pairKey=r=>hash({path:'/v1/inbox/conversations/'+encodeURIComponent(r.conversationId)+'/messages',body:{accountId:r.accountId,message:r.message}});
 return Object.freeze({
  verifyChannel:async s=>{if(!bound(s))return false;try{await bounded(health);return true;}catch{return false;}},
  // Root passes this wrapper to core; serialized/foreign/old evidence never passes.
  verifyDefaultControl:async(evidence,context)=>{try{return await bounded(async ctx=>{const record=defaultMatches(evidence,context),p=record.provenanceContext;await defaultProof(ctx,p.request,record.stored,{checkedAt:p.checkedAt,profileId:b.profileId,conversation:p.conversation,messagePages:p.messagePages});ctx.guard();defaultMatches(evidence,context);return true;});}catch{return false;}},
  verifyConversation:async(r,s,stored)=>{
   r=frozen(r);stored=frozen(stored);checkedRequest(r,s,stored);const proof=await bounded(ctx=>conversation(ctx,r,stored));for(const [k,v] of pairs)if(at()-v.at>5000)pairs.delete(k);if(pairs.size>=64)fail('Pending verification limit.');const key=pairKey(r);if(pairs.has(key))fail('A pending exact verification already exists.');pairs.set(key,{request:frozen(r),stored:frozen(stored),at:at()});return proof;
  },
  transport:async(wire,{signal}={})=>{
   wire=frozen(wire);exact(wire,['method','path','headers','body']);exact(wire.body,['accountId','message']);exact(wire.headers,['Idempotency-Key']);
   if(wire.method!=='POST'||wire.body.accountId!==b.accountId||!/^coo-[0-9a-f-]{36}$/.test(wire.headers['Idempotency-Key']))fail('Unsupported send wire.');
   const key=hash({path:wire.path,body:wire.body}),pair=pairs.get(key);if(!pair)fail('No matching current verified request.');pairs.delete(key); // consume BEFORE any await; no retry after uncertainty
   if(at()-pair.at<0||at()-pair.at>5000)fail('Prepared verification expired.');
   return bounded(async ctx=>{
    // Health first, then the exact current list row/control: provider state cannot
    // be atomic, but every observation and approval is rechecked within one deadline.
    const healthAt=await health(ctx);let proof=await conversation(ctx,pair.request,pair.stored,{deferDefault:true});const c=await credential(ctx);
    // Status and revocable provenance are checked AFTER final credential retrieval.
    if(proof.conversation.threadControl===undefined)proof=await defaultProof(ctx,pair.request,pair.stored,proof,c);
    // ONE final trusted server transaction/snapshot must revalidate BOTH current
    // persistent privacy and exact one-use approval, and bind/claim this attempt.
    // A separate privacy await after approval would simply invert the race.
    const authorityContext=freeze({...frozen({binding:b,request:pair.request,signedInbound:pair.stored,wire,requestHash:officeCooRequestDigest({binding:b},pair.request),wireHash:hash(wire),challenge:randomUUID()}),...(proof.defaultControlEvidence?{defaultControlEvidence:proof.defaultControlEvidence}:{})}),authorityStarted=at();
    const authority=await verifyCurrentSendAuthority(authorityContext);ctx.guard();
    exact(authority,['approved','privacyVerified','requestHash','wireHash','checkedAt','authorityRevision','challenge']);
    if(authority.approved!==true||authority.privacyVerified!==true||authority.requestHash!==authorityContext.requestHash||authority.wireHash!==authorityContext.wireHash||authority.challenge!==authorityContext.challenge||time(authority.checkedAt)<authorityStarted)fail('Exact current privacy/send authority unavailable.');
    opaque(authority.authorityRevision);fresh(authority.checkedAt,1000);fresh(healthAt);fresh(proof.checkedAt);checkedRequest(pair.request,b,pair.stored);
    // No provider, credential or separate authority awaits occur after the verdict.

    return http(ctx,'POST',wire.path,{},wire.body,wire.headers,c);
   },signal);
  }
 });
}

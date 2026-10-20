/** One-shot private owner setup reply. Import has no I/O; CLI defaults to read-only preflight. */
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {officeStorePath} from './lib/office-archive.mjs';
import {assertOfficeCooCaptureReady,readOfficeCooState,officeCooRequestDigest,createOfficeCooApprovalCapability,sendOfficeCooReply} from './lib/office-coo-whatsapp.mjs';
import {createOfficeCooZernioAdapter} from './lib/office-coo-zernio.mjs';
import {verifyApproval,claimCurrentSendAuthority} from './lib/office-coo-send-authority.mjs';
import {officeCooProviderPhoneNumberIdFromConnection} from './lib/office-coo-message-origin.mjs';
export const SETUP_MESSAGE='Jarvis Office COO connection check: I received your new Hello Jarvis. This is the setup reply you requested. Office and DemoClientA review work is still in progress.';
const PRIVATE_ROOT=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel');
const STORAGE={recordsRoot:'/ABSOLUTE/TEST/OFFICE-DATA',recordsVolume:'/Volumes/MAC SSD'};
const PROFILE='6ad0a1605c9b88c22d6061d2',ACCOUNT='6ad0a6b5a09618fd6392391c',MODE='whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded';
const DISABLED=['publishing','engagement','contacts','analytics','ads','telephony','billing','webhooks','commerce'];
const MANIFEST='18397862cd45bbd14807d02a88c7d5639caa117b2f85cc93621afc9d9e180bb5';
const RECEIPTS={'ZERNIO-US-PURCHASE-READBACK.json':'8281663224ae9239b0a044a6acfd9a6df4f33a6ec0a769032dfe789b44774024','ZERNIO-META-LEGAL-GATE.json':'7126fee7b09ba7d4f5ed7ced5e4bb7e09916b11d46417fc32a3c11720efb23fb','ZERNIO-CONNECTION-READBACK.json':'b215beb03103d008c533d4708a0eba0f3c7a933fed8323303ae03e0685c094b0','ZERNIO-US-BILLING-READBACK.json':'83a2313bc0f07d7195322762284adbae42aee299ead3d62e2ba2bcc439268db3','ZERNIO-POSTCONNECTION-BILLING.json':'9b38d2726d30230fa7fd0f14339fad41baf4f966f372a3f39a0f94d4a8984d9d','ZERNIO-WHATSAPP-SETUP.md':'a9f5386a000a9b9ac3e2f0d0ea808733f9f3eae8408efb9ee4905c15cd3009eb','ZERNIO-DEDICATED-LIVE-AGENT-HEALTH-READBACK.json':'ce1c93ab96d8a850277f25c56a710cc49f91ce014be4f1bd483b4d0d83741394'};
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const fail=()=>{throw Error('Private COO setup prerequisites require review.');};
const phone=x=>typeof x==='string'?x.replace(/^\+/,''):'';
const profiles=x=>Array.isArray(x)?x.map(p=>typeof p==='string'?p:p?._id):[];
function fresh(stamp,at,limit=900000){const n=Date.parse(stamp),d=Date.parse(at)-n;if(!Number.isFinite(n)||d<0||d>limit)fail();}
async function bytes(directory,name,max=1024*1024){
 const root=await lstat(directory);if(!root.isDirectory()||root.isSymbolicLink()||root.uid!==process.getuid()||(root.mode&0o7777)!==0o700||await realpath(directory)!==directory)fail();
 const path=await officeStorePath(directory,name),h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await h.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o7777)!==0o600||s.nlink!==1||s.size>max)fail();const chunks=[];let count=0;while(true){const b=Buffer.alloc(Math.min(4096,max-count+1)),r=await h.read(b,0,b.length,null);if(!r.bytesRead)break;count+=r.bytesRead;if(count>max)fail();chunks.push(b.subarray(0,r.bytesRead));}const raw=Buffer.concat(chunks),after=await h.stat(),current=await lstat(path);if(s.ino!==current.ino||s.dev!==current.dev||s.mtimeMs!==after.mtimeMs||s.ctimeMs!==after.ctimeMs||s.size!==raw.length||current.isSymbolicLink()||await realpath(path)!==path)fail();return raw;}finally{await h.close();}
}
const json=async(root,name,max)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(root,name,max)));
/** Trusted injection seam for isolated tests only; CLI never accepts root/storage/pins/HTTP overrides. */
export function createOfficeCooSetupDriver({privateRoot=PRIVATE_ROOT,storage=STORAGE,receiptPins=RECEIPTS,manifestPin=MANIFEST,fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()}={}){
 async function base(){
  try{await lstat(join(privateRoot,'setup-reply-result.json'));fail();}catch(e){if(e.code!=='ENOENT')throw e;}
  const capture=await json(privateRoot,'config.capture.json',16384),r=await json(privateRoot,'reply-request.json',16384),record=await json(privateRoot,'send-authority.json',32768),b=capture.binding;
  if(capture.version!==1||capture.active!==true||capture.mode!=='capture_only'||capture.outboundDefault!=='disabled_pending_reviewed_credential_and_verified_owner_service_window'||canonical(capture.storage)!==canonical(storage)||b?.channelId!=='jarvis-office-coo'||b.profileId!==PROFILE||b.accountId!==ACCOUNT||b.senderPhone!=='+00000000000'||!/^\+?[1-9][0-9]{7,14}$/.test(b.ownerParticipantId??'')||phone(b.ownerParticipantId)==='14422051538'||r.message!==SETUP_MESSAGE)fail();
  const connectionRaw=await bytes(privateRoot,'provenance/ZERNIO-CONNECTION-READBACK.json');if(sha(connectionRaw)!==receiptPins['ZERNIO-CONNECTION-READBACK.json'])fail();const providerPhoneNumberId=officeCooProviderPhoneNumberIdFromConnection({binding:b},JSON.parse(connectionRaw));const config={storage,binding:b,providerPhoneNumberId},authority={privateDirectory:privateRoot,binding:b,now};officeCooRequestDigest(config,r);if(!await verifyApproval(authority,record.approval,r))fail();return {config,authority,r,approval:record.approval};
 }
 async function key(config){
  const k=await json(privateRoot,'runtime-key.json',16384),proof=await json(privateRoot,'runtime-key-grant.json',16384),raw=await bytes(privateRoot,'runtime-key-grant-source.json'),g=proof.grant;
  fresh(proof.observedAt,now());if(proof.version!==1||sha(raw)!==proof.sourceSha256||sha(k.key)!==proof.keySha256||k.active!==false||k.id!==proof.keyId||g?._id!==k.id||g.isActive!==true||[k,g].some(x=>x.scope!=='profiles'||x.permission!=='read-write'||canonical(profiles(x.profileIds))!==canonical([config.binding.profileId])||canonical([...x.disabledResourceGroups??[]].sort())!==canonical([...DISABLED].sort())||x.expiresAt!==k.expiresAt)||Date.parse(k.expiresAt)<=Date.parse(now())||k.expiresAt!=='2026-11-14T10:47:52.547Z'||proof.adminProbe?.status!==403||proof.adminProbe.path!=='/api-keys'||proof.adminProbe.code!=='insufficient_permissions'||proof.commerceProbe?.status!==403||proof.commerceProbe.path!=='/commerce/store?accountId='+ACCOUNT||proof.commerceProbe.code!=='insufficient_permissions')fail();
  return {secret:k.key,scope:'profiles',profileIds:[PROFILE],permission:'read-write',enabledResourceGroups:['accounts','messages'],adminAccess:'denied',expiresAt:k.expiresAt};
 }
 async function history(config,r,allowAttempt=false){
  if(!allowAttempt)await assertOfficeCooCaptureReady(config);const state=await readOfficeCooState(config),digest=officeCooRequestDigest(config,r),scope=sha(state.state.scope);if(state.state.disconnected||Object.values(state.state.outbox).some(o=>!allowAttempt||o.requestHash!==digest||!['prepared','attempting'].includes(o.status)))fail();
  for(const e of state.state.events){if(e.value.event==='conversation.control_changed'||e.value.standby)fail();const p=await officeStorePath(storage.recordsRoot,'coo-whatsapp/'+scope+'/events/'+e.rawSha256+'.json'),h=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);let raw;try{const s=await h.stat();if(!s.isFile()||s.size>65536)fail();const chunks=[];let size=0;while(true){const buffer=Buffer.alloc(Math.min(4096,65537-size)),part=await h.read(buffer,0,buffer.length,null);if(!part.bytesRead)break;size+=part.bytesRead;if(size>65536)fail();chunks.push(buffer.subarray(0,part.bytesRead));}raw=Buffer.concat(chunks);}finally{await h.close();}if(raw.length>65536||sha(raw)!==e.rawSha256)fail();const body=JSON.parse(raw);if(body.metadata?.standby===true||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.source)||['meta_business_agent','whatsapp_business_app','coexistence_history'].includes(body.message?.metadata?.source))fail();}
  const incoming=state.state.events.map((e,i)=>({...e.value,i})).filter(e=>e.event==='message.received').sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt)||b.i-a.i)[0];if(!incoming||incoming.bodyKnown!==true||incoming.bodySha256!==sha('Hello Jarvis')||![incoming.conversationId,incoming.platformConversationId].includes(r.conversationId))fail();fresh(incoming.sentAt,now(),24*60*60*1000-1);return {id:incoming.conversationId,platformConversationId:incoming.platformConversationId,messageId:incoming.messageId,sentAt:incoming.sentAt};
 }
 async function provenance(base,context){
  try{
   const review=await json(privateRoot,'provenance-review.json',32768),manifestRaw=await bytes(privateRoot,'provenance/FRESH-CLOUD-API-PROVENANCE.json');
   fresh(review.issuedAt,now());if(review.version!==1||review.mode!==MODE||review.status!=='approved-for-one-setup-reply-only'||review.basis!=='manual-reviewed-new-cloud-api-noncoexistence-inference'||canonical(review.binding)!==canonical(base.config.binding)||review.requestHash!==officeCooRequestDigest(base.config,base.r)||review.approvalId!==base.approval.id||review.principal!==base.approval.principal||!Number.isFinite(Date.parse(review.expiresAt))||Date.parse(review.expiresAt)<=Date.parse(review.issuedAt)||Date.parse(review.expiresAt)<=Date.parse(now())||Date.parse(review.expiresAt)-Date.parse(review.issuedAt)>900000||review.ownerInstruction?.chatId!=='dc320a23-b425-55a3-886f-4f1b57438696'||review.ownerInstruction.quote!=='have it send me a message when its setup'||sha(manifestRaw)!==manifestPin||review.manifestSha256!==manifestPin)fail();
   const manifest=JSON.parse(manifestRaw);if(!Array.isArray(manifest.sources)||manifest.sources.length!==7||canonical(Object.fromEntries(manifest.sources.map(e=>[e.source,e.sha256])))!==canonical(receiptPins)||Object.keys(receiptPins).length!==7)fail();for(const [name,digest]of Object.entries(receiptPins))if(sha(await bytes(privateRoot,'provenance/'+name))!==digest)fail();
   const last=context.messagePages?.at(-1)?.response;if(!last||last.pagination?.hasMore!==false||last.pagination.nextCursor!==null||context.conversation?.threadControl!==undefined||context.mode!==MODE||context.businessAgentStatus?.enabled!==false||context.businessAgentStatus.onboarded!==false||context.businessAgentStatus.termsAccepted!==false||context.businessAgentStatus.agentId!==null||context.businessAgentStatus.settings!==null)fail();
   const signed=await history(base.config,base.r,true);if(canonical(signed)!==canonical(context.signedInbound))fail();return true;
  }catch{return false;}
 }
 function adapter(base){return createOfficeCooZernioAdapter(base.config,{now,fetchImpl,getApiKey:()=>key(base.config),verifyPrivacy:()=>verifyApproval(base.authority,base.approval,base.r),verifyCurrentSendAuthority:ctx=>claimCurrentSendAuthority(base.authority,ctx),verifyDefaultControlProvenance:ctx=>provenance(base,ctx)});}
 async function preflight(){const b=await base(),signed=await history(b.config,b.r);await key(b.config);const a=adapter(b);if(!await a.verifyChannel(b.config.binding))fail();const proof=await a.verifyConversation(b.r,b.config.binding,signed);if(proof.conversation.threadControl!==undefined||!await a.verifyDefaultControl(proof.defaultControlEvidence,{request:b.r,binding:b.config.binding,conversation:proof.conversation,checkedAt:proof.checkedAt,signedInbound:signed}))fail();return b;}
 return Object.freeze({run:async(options={})=>{
  if(Object.keys(options).some(k=>k!=='sendOnce')||options.sendOnce!==undefined&&typeof options.sendOnce!=='boolean')fail();const sendOnce=options.sendOnce===true;
  const b=await preflight();if(!sendOnce)return {ready:true,mode:'preflight',sent:false};
  const cap=await createOfficeCooApprovalCapability(b.config,b.r,{now,approval:b.approval,verifyApproval:(a,r)=>verifyApproval(b.authority,a,r)}),result=await sendOfficeCooReply(b.config,b.r,cap,{now,...adapter(b)});
  const file=await officeStorePath(privateRoot,'setup-reply-result.json'),h=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await h.writeFile(JSON.stringify({at:now(),result},null,2)+'\n');await h.sync();}finally{await h.close();}const dir=await open(privateRoot,'r');try{await dir.sync();}finally{await dir.close();}
  return {ready:true,mode:'send-once',status:result.outbox.status};
 }});
}
export async function runOfficeCooSetupOnce(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length>1||args.length===1&&args[0]!=='--send-once')throw Error('Only --send-once is supported.');
 return createOfficeCooSetupDriver().run({sendOnce:args[0]==='--send-once'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runOfficeCooSetupOnce().then(result=>console.log(JSON.stringify(result)),()=>{console.error('COO setup preflight/send halted; review private state. No automatic retry.');process.exitCode=1;});

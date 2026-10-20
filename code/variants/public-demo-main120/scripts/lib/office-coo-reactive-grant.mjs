/** Private, revocable automatic owner-channel grant. Import is pure; no environment or I/O. */
import {constants,openSync,lstatSync,fstatSync,readSync,realpathSync,closeSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
export const policyHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=()=>{throw Error('Reactive runtime grant requires review.');};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
export function assertReactivePrivateDirectory(directory){
 if(typeof directory!=='string'||resolve(directory)!==directory||directory.includes('\0'))fail();
 for(let p=directory;;p=dirname(p)){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())fail();if(p===directory&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))fail();if(dirname(p)===p)break;}
 if(realpathSync(directory)!==directory)fail();
}
export function readReactivePrivateBytes(directory,name,max=32768){
 if(typeof directory!=='string'||resolve(directory)!==directory||directory.includes('\0')||typeof name!=='string'||!/^[-A-Za-z0-9.]+$/.test(name))fail();
 for(let p=directory;;p=dirname(p)){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())fail();if(p===directory&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))fail();if(dirname(p)===p)break;}
 if(realpathSync(directory)!==directory)fail();const path=join(directory,name),h=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 const regular=s=>{if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o7777)!==0o600||s.nlink!==1||s.size>max)fail();};
 try{const a=fstatSync(h);regular(a);let count=0;const parts=[];while(true){const b=Buffer.alloc(Math.min(4096,max-count+1)),n=readSync(h,b,0,b.length,null);if(!n)break;count+=n;if(count>max)fail();parts.push(b.subarray(0,n));}const raw=Buffer.concat(parts),b=fstatSync(h),c=lstatSync(path);regular(b);regular(c);if(raw.length!==a.size||[b,c].some(s=>s.dev!==a.dev||s.ino!==a.ino||s.size!==a.size||s.mtimeMs!==a.mtimeMs||s.ctimeMs!==a.ctimeMs)||realpathSync(path)!==path)fail();return raw;}finally{closeSync(h);}
}
export const readReactivePrivateJson=(directory,name,max)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readReactivePrivateBytes(directory,name,max)));
export function officeCooReactiveGrantRevision(record){const {revision,...body}=record;return sha(body);}
/** Grant is an operator-installed approval, never an inference from message/model JSON.
 * Privacy observedAt stays original; validUntil is an explicit operator validity decision.
 */
export function readOfficeCooReactiveGrant(config,at){
 const root=config.runtimeDirectory,g=readReactivePrivateJson(root,'reactive-runtime-grant.json'),p=readReactivePrivateJson(root,'reactive-policy.json'),n=time(at),issued=time(g.issuedAt),expires=time(g.expiresAt);
 if(g.version!==1||g.enabled!==true||g.purpose!=='future-owner-task-completion'||!token(g.principal)||g.authority?.kind!=='owner-instruction'||typeof g.authority.reference!=='string'||!g.authority.reference.trim()||!digest(g.revision)||officeCooReactiveGrantRevision(g)!==g.revision||config.expectedGrantRevision&&config.expectedGrantRevision!==g.revision||!Number.isFinite(n)||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>n||expires<=n||expires<=issued||expires-issued>30*86400000||expires>time(g.keyExpiresAt)||!Number.isFinite(time(g.keyExpiresAt)))fail();
 if(canonical(g.binding)!==canonical(config.binding)||g.policySha256!==policyHash(p)||p.version!==1||p.enabled!==true||p.channelId!==g.binding.channelId||p.profileId!==g.binding.profileId||p.accountId!==g.binding.accountId||p.ownerSenderId!==g.binding.ownerParticipantId||p.ownerRecipientId!==g.binding.ownerParticipantId||time(p.activationAt)>n||time(p.expiresAt)<=n||!Number.isFinite(time(p.activationAt))||!Number.isFinite(time(p.expiresAt))||issued<time(p.activationAt)||expires>time(p.expiresAt)||p.authority?.kind!=='owner-instruction'||typeof p.authority.reference!=='string'||!p.authority.reference.trim()||!Array.isArray(p.excludeEventIds))fail();
 const privacy=g.privacy;
 if(!privacy||privacy.cloudApiEventSharing!==false||privacy.marketingOptimization!==false||!Number.isFinite(time(privacy.observedAt))||time(privacy.observedAt)>issued||issued-time(privacy.observedAt)>900000||privacy.validUntil!==g.expiresAt||!digest(privacy.evidenceSha256)||sha(readReactivePrivateBytes(root,privacy.evidenceFile,1024*1024))!==privacy.evidenceSha256)fail();
 const provenance=g.provenance;
 if(provenance?.mode!=='whatsapp-cloud-api-handover-not-applicable-mba-never-onboarded'||provenance.basis!=='manual-reviewed-new-cloud-api-noncoexistence-inference'||!digest(provenance.manifestSha256)||!provenance.receiptPins||Object.keys(provenance.receiptPins).length!==7||!Object.values(provenance.receiptPins).every(digest)||provenance.reviewPurpose!=='automatic-future-owner-replies')fail();
 return {grant:g,policy:p};
}

import {open,rename,unlink,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {ensureStore,officeStorePath} from './office-archive.mjs';

// No notes, legacy readiness flags or browser-supplied objects become evidence.
// Only this process's integrity-checked store reads produce trusted receipts.
const trustedReceipts=new WeakSet();
const trustedLedgers=new WeakSet();
const hash=/^[a-f0-9]{64}$/,identifier=/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,199}$/;
const authorityTypes={'owner-approval':'owner','independent-review':'reviewer','tool-access':'tool'};
const decisions={'owner-approval':['approved','rejected'],'independent-review':['passed','rejected'],'tool-access':['verified','not-needed','rejected']};
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
function fail(message){throw new Error(message);}
function text(value,max=200){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail('Invalid bounded receipt text.');return value;}
function token(value){if(!identifier.test(text(value)))fail('Invalid receipt identifier.');return value;}
function exact(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(key=>!keys.includes(key)))fail('Unexpected receipt fields.');}
function scope(value){exact(value,['clientId','foundationKey']);return {clientId:token(value.clientId),foundationKey:token(value.foundationKey)};}
function refs(value){
 if(!Array.isArray(value)||!value.length||value.length>32)fail('Receipts require 1–32 exact source references.');
 const items=value.map(item=>{exact(item,['kind','id','sha256']);if(typeof item.sha256!=='string'||!hash.test(item.sha256))fail('A source reference needs an exact SHA-256.');return {kind:token(item.kind),id:token(item.id),sha256:item.sha256};});
 if(new Set(items.map(item=>canonical([item.kind,item.id]))).size!==items.length)fail('Duplicate receipt source identity.');
 return items.sort((a,b)=>canonical(a).localeCompare(canonical(b)));
}
function authority(value,kind){
 exact(value,['type','subject','provider','verificationId']);
 if(value.type!==authorityTypes[kind])fail('Receipt kind requires the corresponding trusted authority.');
 return {type:value.type,subject:text(value.subject),provider:text(value.provider,100),verificationId:text(value.verificationId)};
}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('Invalid receipt timestamp.');return value;}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function brand(value){trustedReceipts.add(value);return freeze(value);}
function ledgerReceipts(values){const receipts=Object.freeze(values.map(brand));trustedLedgers.add(receipts);return receipts;}
function basePath(value){return 'approval-evidence/'+digest(scope(value));}
function checkedRevision(value){if(value!==null&&(typeof value!=='string'||!hash.test(value)))fail('Invalid expected ledger revision.');return value;}

async function readJson(config,path,maxBytes=1024*1024){
 const target=await officeStorePath(config.recordsRoot,path);
 const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=await handle.stat();if(!info.isFile()||info.size>maxBytes)fail('Invalid or oversized receipt store file.');
  const bytes=await handle.readFile('utf8');
  if(Buffer.byteLength(bytes)>maxBytes||await realpath(target)!==join(await realpath(config.recordsRoot),path))fail('Receipt path integrity failed.');
  return JSON.parse(bytes);
 }finally{await handle.close();}
}
async function putImmutable(config,path,value){
 const target=await officeStorePath(config.recordsRoot,path,true),bytes=canonical(value)+'\n';
 let handle;
 try{handle=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await handle.writeFile(bytes);await handle.sync();}
 catch(error){if(error.code!=='EEXIST')throw error;if(canonical(await readJson(config,path))!==canonical(value))fail('Immutable receipt store collision.');}
 finally{if(handle)await handle.close();}
}
async function putPointer(config,path,value){
 const target=await officeStorePath(config.recordsRoot,path,true),temp=path+'.'+randomUUID()+'.tmp';
 const temporary=await officeStorePath(config.recordsRoot,temp,true);
 try{
  const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(canonical(value)+'\n');await handle.sync();}finally{await handle.close();}
  await officeStorePath(config.recordsRoot,path);await rename(temporary,target);
 }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
function validateStored(receipt,expectedScope,index,entry){
 exact(receipt,['version','id','revision','sequence','event','scope','kind','decision','subjects','evidence','expiresAt','targetReceiptId','authority','createdAt','idempotencyKey','requestHash']);
 const {revision,...body}=receipt;
 if(receipt.version!==1||receipt.id!==entry.id||revision!==entry.revision||digest(body)!==revision||receipt.sequence!==index+1||!hash.test(receipt.requestHash??'')||!/^r-[a-f0-9-]{36}$/.test(receipt.id))fail('Receipt integrity failed.');
 if(canonical(scope(receipt.scope))!==canonical(expectedScope))fail('Receipt scope integrity failed.');
 authority(receipt.authority,receipt.kind);timestamp(receipt.createdAt);token(receipt.idempotencyKey);
 if(receipt.event==='decision'){
  if(!decisions[receipt.kind]?.includes(receipt.decision)||canonical(refs(receipt.subjects))!==canonical(receipt.subjects)||canonical(refs(receipt.evidence))!==canonical(receipt.evidence))fail('Invalid stored receipt decision.');
  if(receipt.expiresAt!==null&&Date.parse(timestamp(receipt.expiresAt))<=Date.parse(receipt.createdAt))fail('Invalid receipt expiry.');
  if(receipt.targetReceiptId!==null)fail('Decision receipt cannot revoke another receipt.');
 }else if(receipt.event==='revocation'){
  if(!/^r-[a-f0-9-]{36}$/.test(receipt.targetReceiptId??'')||receipt.decision!==null||receipt.subjects.length||receipt.expiresAt!==null||canonical(refs(receipt.evidence))!==canonical(receipt.evidence))fail('Invalid stored revocation.');
 }else fail('Unknown receipt event.');
 return receipt;
}

/** Returns immutable, in-process trusted objects. Never migrate legacy status. */
export async function readApprovalReceipts(config,selectedScope){
 const selected=scope(selectedScope);await ensureStore(config,{create:false});const base=basePath(selected);
 let pointer;try{pointer=await readJson(config,base+'/current.json',1000);}catch(error){if(error.code==='ENOENT')return {revision:null,receipts:ledgerReceipts([])};throw error;}
 exact(pointer,['revision']);if(!hash.test(pointer.revision??''))fail('Invalid receipt ledger pointer.');
 const ledger=await readJson(config,base+'/ledgers/'+pointer.revision+'.json');
 exact(ledger,['version','scope','entries','previousRevision']);
 if(digest(ledger)!==pointer.revision||ledger.version!==1||canonical(scope(ledger.scope))!==canonical(selected)||!Array.isArray(ledger.entries)||ledger.entries.length>2000)fail('Receipt ledger integrity failed.');
 checkedRevision(ledger.previousRevision);
 const receipts=[],ids=new Set(),keys=new Set();
 for(const [index,entry] of ledger.entries.entries()){
  exact(entry,['id','revision']);if(!/^r-[a-f0-9-]{36}$/.test(entry.id??'')||!hash.test(entry.revision??''))fail('Invalid receipt ledger entry.');
  if(ids.has(entry.id))fail('Duplicate receipt ledger entry.');ids.add(entry.id);
  const receipt=validateStored(await readJson(config,base+'/receipts/'+entry.id+'/'+entry.revision+'.json',128*1024),selected,index,entry);
  if(keys.has(receipt.idempotencyKey))fail('Duplicate receipt retry key.');keys.add(receipt.idempotencyKey);
  if(receipt.event==='revocation'&&!receipts.some(prior=>prior.id===receipt.targetReceiptId&&prior.kind===receipt.kind&&prior.event==='decision'))fail('Revocation target integrity failed.');
  receipts.push(receipt);
 }
 // Do not expose even partially verified records when a later entry is corrupt.
 return {revision:pointer.revision,receipts:ledgerReceipts(receipts)};
}

function normaliseInput(input,event){
 exact(input,event==='decision'?['scope','kind','decision','subjects','evidence','expiresAt','idempotencyKey','expectedRevision']:['scope','targetReceiptId','evidence','idempotencyKey','expectedRevision']);
 const common={scope:scope(input.scope),evidence:refs(input.evidence),idempotencyKey:token(input.idempotencyKey),expectedRevision:checkedRevision(input.expectedRevision)};
 if(event==='revocation'){if(!/^r-[a-f0-9-]{36}$/.test(input.targetReceiptId??''))fail('Invalid revocation target.');return {...common,targetReceiptId:input.targetReceiptId};}
 if(typeof input.kind!=='string'||!Object.hasOwn(decisions,input.kind)||!decisions[input.kind].includes(input.decision))fail('Invalid decision for receipt kind.');
 return {...common,kind:input.kind,decision:input.decision,subjects:refs(input.subjects),expiresAt:input.expiresAt===undefined||input.expiresAt===null?null:timestamp(input.expiresAt)};
}
async function mutate(config,input,context,event){
 const normal=freeze(normaliseInput(input,event));await ensureStore(config);
 const base=basePath(normal.scope),lockPath=await officeStorePath(config.recordsRoot,base+'/mutation.lock',true);
 let lock;try{lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){if(error.code==='EEXIST')fail('Receipt ledger is busy. Retry with the latest revision.');throw error;}
 try{
  const state=await readApprovalReceipts(config,normal.scope);
  const target=event==='revocation'?state.receipts.find(receipt=>receipt.id===normal.targetReceiptId&&receipt.event==='decision'):null;
  if(event==='revocation'&&!target)fail('Unknown receipt revocation target.');
  const kind=target?.kind??normal.kind,identity=freeze(authority(context?.authority,kind));
  // The verifier belongs to the authenticated server, never to JSON input.
  if(typeof context?.verifyAuthority!=='function'||await context.verifyAuthority(identity,freeze({event,...normal}))!==true)fail('Trusted authority verification failed.');
  const {expectedRevision,...request}=normal;
  // A fresh signed session may retry the same operation for the same principal.
  const principal={type:identity.type,subject:identity.subject,provider:identity.provider},requestHash=digest({event,...request,authority:principal});
  const replay=state.receipts.find(receipt=>receipt.idempotencyKey===normal.idempotencyKey);
  if(replay){if(replay.requestHash!==requestHash)fail('Idempotency key was already used for different evidence.');return {...state,receipt:replay,replayed:true};}
  if(state.revision!==expectedRevision)fail('Receipt ledger changed. Refresh before saving.');
  if(state.receipts.length>=2000)fail('Receipt ledger limit reached; preserve history and review archival policy.');
  const createdAt=new Date().toISOString();if(normal.expiresAt&&Date.parse(normal.expiresAt)<=Date.parse(createdAt))fail('Receipt expiry must be in the future.');
  const body={version:1,id:'r-'+randomUUID(),sequence:state.receipts.length+1,event,scope:normal.scope,kind,decision:normal.decision??null,subjects:normal.subjects??[],evidence:normal.evidence,expiresAt:normal.expiresAt??null,targetReceiptId:normal.targetReceiptId??null,authority:identity,createdAt,idempotencyKey:normal.idempotencyKey,requestHash};
  const receipt={...body,revision:digest(body)};
  await putImmutable(config,base+'/receipts/'+receipt.id+'/'+receipt.revision+'.json',receipt);
  const ledger={version:1,scope:normal.scope,entries:[...state.receipts.map(item=>({id:item.id,revision:item.revision})),{id:receipt.id,revision:receipt.revision}],previousRevision:state.revision},revision=digest(ledger);
  await putImmutable(config,base+'/ledgers/'+revision+'.json',ledger);
  await putPointer(config,base+'/current.json',{revision});
  // Return independently read back bytes, not the just-constructed object.
  const saved=await readApprovalReceipts(config,normal.scope);
  if(saved.revision!==revision)fail('Receipt ledger readback changed.');
  return {...saved,receipt:saved.receipts.at(-1),replayed:false};
 }finally{await lock.close();await unlink(lockPath);}
}
export const appendApprovalReceipt=(config,input,context)=>mutate(config,input,context,'decision');
export const revokeApprovalReceipt=(config,input,context)=>mutate(config,input,context,'revocation');

/** Exact hash-set matching over trusted store objects; no IO or model judgement. */
export function validateApprovalEvidence({receipts,scope:selectedScope,kind,subjects,now}){
 let selected,expected,time;
 try{selected=scope(selectedScope);expected=refs(subjects);time=Date.parse(timestamp(now));if(!Object.hasOwn(decisions,kind))fail('Invalid receipt kind.');}catch{return {valid:false,reason:'invalid-requirement',receiptId:null};}
 if(!Array.isArray(receipts)||!trustedLedgers.has(receipts)||receipts.some(receipt=>!trustedReceipts.has(receipt)))return {valid:false,reason:'untrusted',receiptId:null};
 const identities=new Set(expected.map(item=>canonical([item.kind,item.id])));
 const relevant=receipts.filter(receipt=>receipt.kind===kind&&canonical(receipt.scope)===canonical(selected));
 const candidates=relevant.filter(receipt=>receipt.event==='decision'&&receipt.subjects.some(item=>identities.has(canonical([item.kind,item.id])))).sort((a,b)=>b.sequence-a.sequence);
 const latest=candidates[0];
 if(!latest)return {valid:false,reason:'missing',receiptId:null};
 const result=reason=>({valid:false,reason,receiptId:latest.id});
 if(latest.decision==='rejected')return result('rejected');
 if(relevant.some(receipt=>receipt.event==='revocation'&&receipt.targetReceiptId===latest.id))return result('revoked');
 if(Date.parse(latest.createdAt)>time)return result('future');
 if(latest.expiresAt&&Date.parse(latest.expiresAt)<=time)return result('expired');
 if(canonical(latest.subjects)!==canonical(expected))return result('stale-or-inexact-subjects');
 return {valid:true,reason:'matched',receiptId:latest.id};
}

import {open,lstat,realpath,rename,unlink,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,relative,isAbsolute,resolve,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {pilotDigest} from './office-client-pilot.mjs';
import {readFoundation} from './office-foundations.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/,slug=/^[a-z0-9][a-z0-9-]{0,80}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const same=(a,b)=>canonical(a)===canonical(b);
const fail=message=>{throw Error(message);};
const absolute=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&!p.includes('\0');
const within=(root,p)=>{const r=relative(root,p);return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const base=c=>`clients/${c.clientId}/sources/`;
const journalName=(c,id)=>base(c)+`activations/${id}/journal.json`;
const fenceName=c=>base(c)+'activation-fence.json';

async function storageConfig(c){
 if(!c||!uuid.test(c.clientId??'')||!absolute(c.storage?.recordsRoot))fail('Explicit canonical storage and client identity are required.');
 await ensureStore(c.storage,{create:false});
}
async function config(c,callbacks){
 await storageConfig(c);
 for(const key of ['readAllocation','compareAndSwapAllocation','assertQuiescent'])if(typeof callbacks?.[key]!=='function')fail('Trusted '+key+' callback is required.');
}
async function path(c,name,create=false){return officeStorePath(c.storage.recordsRoot,name,create);}
async function safeRead(p,max=4*1024*1024){
 if(!absolute(p)||await realpath(p)!==p)fail('Activation files and parents must not be symlinks.');
 const f=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();if(!s.isFile()||s.size>max)fail('Activation input is not a bounded regular file.');const b=await f.readFile();if(b.length!==s.size||await realpath(p)!==p)fail('Activation input changed while reading.');return b;}finally{await f.close();}
}
async function exists(c,name){try{await lstat(await path(c,name));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function syncParent(p){const f=await open(dirname(p),'r');try{await f.sync();}finally{await f.close();}}
async function syncParents(c,p){
 let cursor=dirname(p);
 for(;;){
  if(cursor!==c.storage.recordsRoot&&!within(c.storage.recordsRoot,cursor))fail('Activation directory escaped storage.');
  const f=await open(cursor,'r');try{await f.sync();}finally{await f.close();}
  if(cursor===c.storage.recordsRoot)return;cursor=dirname(cursor);
 }
}
async function immutable(c,name,b){
 const p=await path(c,name,true);let f;
 try{f=await open(p,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
 if(f){try{await f.writeFile(b);await f.sync();}finally{await f.close();}}
 await syncParents(c,p);
 if(!(await safeRead(p)).equals(b))fail('Immutable activation record collision or corruption.');return p;
}
async function exclusiveFence(c,j){
 const record={version:1,clientId:c.clientId,id:j.id,journalSha256:hash(bytes(j))};
 // Portable to ExFAT: all fence writers hold activation.lock. Rename a fully
 // durable copy only after checking absence under that lock; never publish a
 // partially-written fence. Noncooperating external writers are unsupported.
 await immutable(c,base(c)+`activations/${j.id}/fence.json`,bytes(record));
 const p=await path(c,fenceName(c),true),temp=await path(c,base(c)+'.fence-'+randomUUID()+'.tmp',true),f=await open(temp,'wx',0o600);
 try{
  await f.writeFile(bytes(record));await f.sync();await f.close();
  if(await exists(c,fenceName(c)))fail('A maintenance fence already exists.');
  await rename(temp,p);await syncParent(p);
  if(!(await safeRead(p)).equals(bytes(record)))fail('Maintenance fence readback failed.');
 }finally{
  await f.close();try{await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return record;
}
async function lock(c,recovery,fn){
 const p=await path(c,base(c)+'activation.lock',true),owner={pid:process.pid,nonce:randomUUID()},body=bytes(owner);let f;
 try{f=await open(p,'wx',0o600);}catch(e){
  if(e.code!=='EEXIST')throw e;
  if(!recovery)fail('Another source activation owns this client; use explicit recovery after a crash.');
  const old=await safeRead(p,1000),record=JSON.parse(old);if(!Number.isSafeInteger(record.pid)||record.pid<1||!uuid.test(record.nonce??''))fail('Malformed activation lock requires manual inspection.');
  try{process.kill(record.pid,0);fail('The activation lock owner is still alive.');}catch(error){if(error.code!=='ESRCH')throw error;}
  if(!(await safeRead(p,1000)).equals(old))fail('Activation lock changed during recovery.');
  await unlink(p);f=await open(p,'wx',0o600);
 }
 try{await f.writeFile(body);await f.sync();await syncParent(p);return await fn();}finally{
  await f.close();if((await safeRead(p,1000)).equals(body)){await unlink(p);await syncParent(p);}
 }
}
function checkedRequest(c,input){
 if(!input||!uuid.test(input.id??'')||!sha.test(input.expectedOldPointerSha256??'')||!sha.test(input.expectedOldAllocationRevision??'')||!sha.test(input.staged?.sha256??'')||input.staged.path!==join(c.storage.recordsRoot,base(c),'versions',input.staged.sha256,'manifest.json')||!slug.test(input.newFoundation?.id??'')||!sha.test(input.newFoundation?.revision??''))fail('An explicit activation ID, exact old revisions, staged version and initialized foundation are required.');
 if(Object.keys(input).some(k=>!['id','expectedOldPointerSha256','expectedOldAllocationRevision','staged','newFoundation'].includes(k)))fail('Unknown activation request field.');
 return JSON.parse(JSON.stringify(input));
}
function allocation(c,value){
 const v=JSON.parse(JSON.stringify(value??null));if(!v||Buffer.byteLength(JSON.stringify(v))>1024*1024)fail('A bounded stored allocation is required.');
 const {revision,...body}=v;
 if(v.id!==c.clientId||v.clientId!==c.clientId||v.status!=='audit_ready'||v.executionMode!=='audit_only'||v.brandConfirmed!==false||v.servicesConfirmed!==false||!sha.test(v.sourceRevision??'')||!slug.test(v.foundationId??'')||!v.team||revision!==pilotDigest(body))fail('Stored allocation does not match this audit client or its content revision.');
 return v;
}
function pointer(c,text){
 const p=JSON.parse(text);if(!sha.test(p.sha256??'')||p.path!==join(c.storage.recordsRoot,base(c),'versions',p.sha256,'manifest.json'))fail('Source pointer escaped its exact client version.');return p;
}
async function pointerText(c){return (await safeRead(await path(c,base(c)+'current.json'),16384)).toString('utf8');}
async function quiescent(c,callbacks){
 if(await countOfficeSourceAdmissions(c)!==0)fail('Client has outstanding source admission tokens; reconcile them explicitly.');
 const state=await callbacks.assertQuiescent(c.clientId);
 if(state?.clientId!==c.clientId||state.activeJobs!==0||state.recoveryJobs!==0||state.admittedDispatches!==0)fail('Client has active, recovery or admitted dispatch work.');
}

/** Presence counts even incomplete/malformed/dead tokens. Never auto-reap a token.
 * An interrupted admission requires explicit PID/job reconciliation by the operator.
 */
export async function countOfficeSourceAdmissions(c){
 await storageConfig(c);let entries;
 try{entries=await readdir(await path(c,base(c)+'admissions'));}catch(e){if(e.code==='ENOENT')return 0;throw e;}
 if(entries.length>10000)fail('Too many source admission records; manual reconciliation required.');
 for(const name of entries)await path(c,base(c)+'admissions/'+name);
 return entries.length;
}
/** Token-before-fence-check closes the dispatch admission race with activation.
 * fn must perform the complete context-preview/create-job admission, not run models.
 */
export async function withOfficeSourceAdmission(c,fn){
 await storageConfig(c);if(typeof fn!=='function')fail('A trusted admission operation is required.');
 const id=randomUUID(),name=base(c)+'admissions/'+id+'.json',record=bytes({version:1,id,clientId:c.clientId,pid:process.pid});
 const p=await path(c,name,true),f=await open(p,'wx',0o600);
 try{
  await f.writeFile(record);await f.sync();await syncParents(c,p);
  if(await exists(c,fenceName(c)))fail('Client source activation is pending; new admission is blocked.');
  return await fn();
 }finally{
  await f.close();if(!(await safeRead(p,1000)).equals(record))fail('Admission record changed; preserve it for explicit reconciliation.');
  await unlink(p);await syncParent(p);
 }
}
async function exactFile(c,p,digest,size,max){
 if(!sha.test(digest??'')||!absolute(p)||within(c.storage.recordsRoot,p)&&!within(join(c.storage.recordsRoot,'clients',c.clientId),p))fail('Source path/hash is outside the activation client scope.');
 const b=await safeRead(p,max);if(hash(b)!==digest||size!==undefined&&size!==b.length)fail('Registered source bytes changed.');return b;
}
async function pack(c,p,{currentSources,uniquePrimary=false}){
 const b=await safeRead(await path(c,relative(c.storage.recordsRoot,p.path)));if(hash(b)!==p.sha256)fail('Source manifest integrity failed.');const m=JSON.parse(b);
 if(m.clientId!==c.clientId||m.executionMode!=='audit_only'||m.brandApproved!==false||m.paidServicesConfirmed!==false||!Array.isArray(m.sources)||m.sources.length>5000||!m.packets||typeof m.packets!=='object'||Array.isArray(m.packets)||Object.keys(m.packets).length>100)fail('Source manifest audit boundary is invalid.');
 let total=0;const checked=new Map(),identities=new Map(),canonicalPaths=new Set();
 async function check(p,digest,size){
  const observed=checked.get(p);
  if(observed){if(observed.sha256!==digest||size!==undefined&&observed.bytes!==size)fail('Shared source reference hash or byte count differs.');return;}
  const b=await exactFile(c,p,digest,size,256*1024*1024);total+=b.length;if(total>1024*1024*1024)fail('Source validation exceeds its one-GiB bound.');checked.set(p,{sha256:hash(b),bytes:b.length});
 }
 function object(p,digest){if(p!==join(c.storage.recordsRoot,base(c),'objects',digest,basename(p)))fail('Source object escaped its client/hash namespace.');}
 for(const packet of Object.values(m.packets)){if(!packet||!sha.test(packet.sha256??''))fail('Invalid packet hash.');object(packet.path,packet.sha256);await check(packet.path,packet.sha256,packet.bytes);}
 let records=0;
 for(const s of m.sources){
  const prior=identities.get(s.id);
  if(prior&&(uniquePrimary||prior.sha256!==s.sha256||prior.bytes!==s.bytes))fail('Duplicate primary source identity or differing full-hash collision.');
  identities.set(s.id,{sha256:s.sha256,bytes:s.bytes});
  if(!Array.isArray(s.canonical_aliases??[])||(s.canonical_aliases??[]).length>5000)fail('Unbounded source aliases.');
  for(const source of [s,...(s.canonical_aliases??[])]){
   records++;if(records>10000||source.id!=='src-'+source.sha256?.slice(0,16)||!sha.test(source.sha256??'')||!Number.isSafeInteger(source.bytes)||source.bytes<0||canonicalPaths.has(source.canonical_path)||!absolute(source.canonical_path))fail('Invalid source/alias identity or size.');canonicalPaths.add(source.canonical_path);
   if(source.clientId!==undefined&&source.clientId!==c.clientId||within(c.storage.recordsRoot,source.canonical_path)&&!within(join(c.storage.recordsRoot,'clients',c.clientId),source.canonical_path))fail('Source metadata belongs to another client namespace.');
   if(source.id!==s.id||source.sha256!==s.sha256||source.bytes!==s.bytes)fail('Alias differs from its content identity.');
   if(source.snapshot_path){object(source.snapshot_path,source.sha256);await check(source.snapshot_path,source.sha256,source.bytes);}
   else if(currentSources)await check(source.canonical_path,source.sha256,source.bytes);
  }
 }
 if(m.sourceRecordCount!==undefined&&m.sourceRecordCount!==records||m.uniqueSourceCount!==undefined&&m.uniqueSourceCount!==identities.size)fail('Source record counts differ.');return m;
}
async function foundation(c,reference,p,{strict=false}={}){
 const f=await readFoundation(c.storage,reference.id);
 if(f.revision!==reference.revision||f.scope.kind!=='client'||f.scope.clientId!==c.clientId||f.scope.id!==f.id||f.status!=='draft'||f.approvedAt!==null||f.approvalNote)fail('Initialized foundation changed, belongs to another client or implies approval.');
 if(!f.sources.some(s=>s.path===p.path&&s.sha256===p.sha256))fail('Foundation does not bind the exact source manifest.');
 if(strict){
  const m=await pack(c,p,{currentSources:true,uniquePrimary:true}),expected=[{id:'audit-register',path:p.path,sha256:p.sha256},...Object.entries(m.packets).map(([name,s])=>({id:'audit-packet-'+name,path:s.path,sha256:s.sha256}))];
  if(f.assets.length||!same(f.sources.map(s=>({id:s.id,path:s.path,sha256:s.sha256})).sort((a,b)=>a.id.localeCompare(b.id)),expected.sort((a,b)=>a.id.localeCompare(b.id))))fail('New audit foundation contains wrong source IDs, unreviewed sources/assets or missing packets.');
 }
 return f;
}
async function prepare(c,request,callbacks){
 const oldText=await pointerText(c);if(hash(oldText)!==request.expectedOldPointerSha256)fail('Current pointer differs from the expected exact bytes.');const oldPointer=pointer(c,oldText);
 const oldAllocation=allocation(c,await callbacks.readAllocation(c.clientId));if(oldAllocation.revision!==request.expectedOldAllocationRevision||oldAllocation.sourceRevision!==oldPointer.sha256)fail('Current allocation differs from the expected source/revision.');
 if(oldPointer.sha256===request.staged.sha256||oldAllocation.foundationId===request.newFoundation.id)fail('Activation requires a new immutable source version and foundation identity.');
 const oldFoundation=await readFoundation(c.storage,oldAllocation.foundationId);
 const {revision:_revision,...oldBody}=oldAllocation;void _revision;
 const body={...oldBody,sourceRevision:request.staged.sha256,foundationId:request.newFoundation.id},nextAllocation={...body,revision:pilotDigest(body)};
 const bodyJournal={version:1,id:request.id,clientId:c.clientId,request,oldPointerText:oldText,newPointerText:bytes({...oldPointer,...request.staged}).toString('utf8'),oldAllocation,newAllocation:nextAllocation,oldFoundation:{id:oldFoundation.id,revision:oldFoundation.revision},newFoundation:request.newFoundation};
 return {...bodyJournal,revision:hash(bytes(bodyJournal))};
}
function validateJournal(c,j,id){
 const {revision,...body}=j;
 if(j.version!==1||j.id!==id||j.clientId!==c.clientId||revision!==hash(bytes(body)))fail('Activation journal integrity failed.');
 const req=checkedRequest(c,j.request);if(req.id!==id||hash(j.oldPointerText)!==req.expectedOldPointerSha256)fail('Journal request/pointer differs.');
 const old=pointer(c,j.oldPointerText),next=pointer(c,j.newPointerText),a=allocation(c,j.oldAllocation),b=allocation(c,j.newAllocation);
 const {revision:_old,...oldBody}=a,{revision:_next,...newBody}=b;void _old;void _next;
 if(a.revision!==req.expectedOldAllocationRevision||a.sourceRevision!==old.sha256||b.sourceRevision!==next.sha256||!same(next, {...old,...req.staged})||!same(newBody,{...oldBody,sourceRevision:next.sha256,foundationId:req.newFoundation.id})||!same(j.newFoundation,req.newFoundation)||j.oldFoundation.id!==a.foundationId||a.foundationId===b.foundationId||old.sha256===next.sha256)fail('Journal changes fields outside the reviewed source/foundation allocation.');
 return j;
}
async function readJournal(c,id){
 const raw=await safeRead(await path(c,journalName(c,id))),j=validateJournal(c,JSON.parse(raw),id);
 if(!raw.equals(bytes(j)))fail('Immutable journal bytes changed.');return j;
}
async function verifyFence(c,j){
 const f=JSON.parse(await safeRead(await path(c,fenceName(c)),1000));
 if(!same(f,{version:1,clientId:c.clientId,id:j.id,journalSha256:hash(bytes(j))}))fail('Maintenance fence does not match the immutable activation journal.');
}
function retainedSources(old,next){
 const expand=m=>m.sources.flatMap(s=>{const {canonical_aliases,...plain}=s;return [plain,...(canonical_aliases??[])];});
 const before=new Map(expand(old).map(s=>[s.canonical_path,s])),after=new Map(expand(next).map(s=>[s.canonical_path,s]));
 if(!Array.isArray(next.sourceChanges)||next.sourceChanges.length>2000)fail('Explicit bounded source changes are required.');
 const sourceChanges=new Map(),packetChanges=new Map();
 for(const change of next.sourceChanges){
  const key=change.packet??change.canonicalPath,map=change.packet?packetChanges:sourceChanges;
  if(typeof key!=='string'||map.has(key))fail('Duplicate or invalid source change identity.');map.set(key,change);
 }
 function reconcile(before,after,changes,label){
  for(const key of before.keys())if(!after.has(key))fail('New pack dropped a retained '+label+'.');
  for(const [key,value]of after){
   const prior=before.get(key),change=changes.get(key);
   if(!change){if(!same(value,prior))fail('Changed or added '+label+' lacks exact supersession evidence.');continue;}
   if(change.mode!==(prior?'refresh':'add')||!same(change.previous,prior??null)||!same(change.next,value))fail('Explicit '+label+' supersession differs from the old/new records.');
  }
  for(const key of changes.keys())if(!after.has(key))fail('Supersession refers to a missing '+label+'.');
 }
 reconcile(before,after,sourceChanges,'canonical source path');
 reconcile(new Map(Object.entries(old.packets)),new Map(Object.entries(next.packets)),packetChanges,'evidence packet');
}
async function validateVersions(c,j,direction){
 const old=pointer(c,j.oldPointerText),next=pointer(c,j.newPointerText),a=await pack(c,old,{currentSources:direction==='rollback'}),b=await pack(c,next,{currentSources:direction==='forward',uniquePrimary:true});
 for(const v of b.sourceVersionHistory??[])if(!sha.test(v.sha256??'')||v.path!==join(c.storage.recordsRoot,base(c),'versions',v.sha256,'manifest.json'))fail('Source lineage escaped the client immutable version namespace.');
 if(!same(a.services,b.services)||!same(a.workerCapacity,b.workerCapacity)||a.name!==b.name||b.staging?.createdAs!=='immutable_staged_candidate'||b.staging.activationManagedSeparately!==true||b.previousVersion?.path!==old.path||b.previousVersion?.sha256!==old.sha256||!b.sourceVersionHistory?.some(v=>v.path===old.path&&v.sha256===old.sha256))fail('New source version changes team scope or lacks exact retained lineage.');
 if(!Number.isSafeInteger(a.version)||!Number.isSafeInteger(b.version)||b.version!==a.version+1||!same(b.sourceVersionHistory,[...(a.sourceVersionHistory??[]),{path:old.path,sha256:old.sha256}]))fail('Source version number/history does not retain the exact preceding lineage.');
 retainedSources(a,b);
 await foundation(c,j.oldFoundation,old);
 await foundation(c,j.newFoundation,next,{strict:direction==='forward'});
}
async function pointerCAS(c,expected,next){
 const p=await path(c,base(c)+'current.json'),temp=await path(c,base(c)+'.activation-'+randomUUID()+'.tmp',true);let f;
 try{
  if(await pointerText(c)!==expected)fail('Source pointer compare-and-swap conflict.');
  f=await open(temp,'wx',0o600);await f.writeFile(next);await f.sync();await f.close();f=null;
  if(await pointerText(c)!==expected)fail('Source pointer changed before replacement.');
  await rename(temp,p);await syncParent(p);if(await pointerText(c)!==next)fail('Source pointer replacement readback failed.');
 }finally{if(f)await f.close();try{await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
async function reconcile(c,j,direction,callbacks){
 await verifyFence(c,j);await quiescent(c,callbacks);await validateVersions(c,j,direction);
 const resultName=base(c)+`activations/${j.id}/result.json`;
 const targetText=direction==='forward'?j.newPointerText:j.oldPointerText,targetAllocation=direction==='forward'?j.newAllocation:j.oldAllocation;
 const result={version:1,id:j.id,clientId:c.clientId,direction,journalRevision:j.revision,pointerSha256:hash(targetText),sourceRevision:targetAllocation.sourceRevision,allocationRevision:targetAllocation.revision,foundationId:targetAllocation.foundationId,modelReplay:false,approvalGranted:false};
 if(await exists(c,resultName)){
  const prior=await safeRead(await path(c,resultName));
  if(!prior.equals(bytes(result)))fail('Durable completion differs or already chose another recovery direction; preserve fence.');
 }
 const currentText=await pointerText(c),current=allocation(c,await callbacks.readAllocation(c.clientId));
 if(![j.oldPointerText,j.newPointerText].includes(currentText)||!same(current,j.oldAllocation)&&!same(current,j.newAllocation))fail('Live state is neither exact journal old nor new; preserve fence for manual reconciliation.');
 // Recovery is based on actual readback, never a claimed last completed step.
 if(!same(current,targetAllocation)){
  const result=await callbacks.compareAndSwapAllocation({clientId:c.clientId,activationId:j.id,expected:structuredClone(current),next:structuredClone(targetAllocation)});
  if(result!==true||!same(allocation(c,await callbacks.readAllocation(c.clientId)),targetAllocation))fail('Allocation compare-and-swap or readback is unconfirmed; recover explicitly.');
 }
 if(currentText!==targetText)await pointerCAS(c,currentText,targetText);
 await verifyFence(c,j);await quiescent(c,callbacks);await validateVersions(c,j,direction);
 if(await pointerText(c)!==targetText||!same(allocation(c,await callbacks.readAllocation(c.clientId)),targetAllocation))fail('Activation final state changed; fence retained.');
 await immutable(c,resultName,bytes(result));
 await verifyFence(c,j);const f=await path(c,fenceName(c));await unlink(f);await syncParent(f);return result;
}

/** Trusted server use only. All dispatch/retrieval paths must honor the persistent fence;
 * assertQuiescent must include requests admitted before the fence was created.
 * All other current-pointer writers must honor this fence/lock; a filesystem rename
 * cannot compare-and-swap against a noncooperating external writer.
 * This never initializes a foundation, invokes a model, grants approval or provisions a team.
 */
export async function activateOfficeSourceVersion(c,input,callbacks){
 await config(c,callbacks);const request=checkedRequest(c,input);
 return lock(c,false,async()=>{
  if(await exists(c,fenceName(c)))fail('Source activation is pending; explicit recovery is required.');
  let j;if(await exists(c,journalName(c,request.id))){j=await readJournal(c,request.id);if(!same(j.request,request))fail('Activation ID was already used for another request.');}
  else{j=await prepare(c,request,callbacks);await immutable(c,journalName(c,j.id),bytes(j));}
  if(await exists(c,base(c)+`activations/${j.id}/result.json`))fail('Activation already completed; do not replay it.');
  await exclusiveFence(c,j);
  // Initial activation requires both old states; only explicit recovery accepts mixed states.
  if(await pointerText(c)!==j.oldPointerText||!same(allocation(c,await callbacks.readAllocation(c.clientId)),j.oldAllocation))fail('Live old state changed after journal preparation; fence retained.');
  return reconcile(c,j,'forward',callbacks);
 });
}
export async function recoverOfficeSourceActivation(c,input,callbacks){
 await config(c,callbacks);
 if(!uuid.test(input?.id??'')||!['forward','rollback'].includes(input.direction))fail('Explicit activation identity and forward/rollback recovery direction are required.');
 return lock(c,true,async()=>reconcile(c,await readJournal(c,input.id),input.direction,callbacks));
}

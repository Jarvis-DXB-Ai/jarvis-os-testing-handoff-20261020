// Synthetic local fixtures only: these tests neither activate a real client nor certify production recovery.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {initialiseFoundations} from './lib/office-foundations.mjs';
import {pilotDigest,readPilotSources} from './lib/office-client-pilot.mjs';
import {activateOfficeSourceVersion,recoverOfficeSourceActivation,withOfficeSourceAdmission,countOfficeSourceAdmissions} from './lib/office-source-activation.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=v=>JSON.stringify(v,null,2)+'\n';
async function fixture(t,shared){
 const root=shared?.root??await realpath(await mkdtemp(join(tmpdir(),'office-activation-synthetic-')));
 if(!shared?.root)t.after(()=>rm(root,{recursive:true,force:true}));
 const storage={testing:true,recordsVolume:root,recordsRoot:join(root,'records')},clientId=randomUUID(),config={storage,clientId},base=join(storage.recordsRoot,'clients',clientId,'sources');
 await mkdir(base,{recursive:true});
 async function makePack(label,old){
  const sourceBytes=Buffer.from('SYNTHETIC '+label),digest=hash(sourceBytes),object=join(base,'objects',digest,label+'.md');await mkdir(join(base,'objects',digest),{recursive:true});await writeFile(object,sourceBytes);
  const canonical=join(root,'canonical-'+clientId+'.md');await writeFile(canonical,sourceBytes);
  const source={id:'src-'+digest.slice(0,16),sha256:digest,bytes:sourceBytes.length,canonical_path:canonical,snapshot_path:object,family:'fixture',status:'Synthetic unapproved fixture'};
  if(shared?.foreignMetadata&&!old)source.canonical_path=join(storage.recordsRoot,'clients',randomUUID(),'foreign.md');
  if(shared?.foreignClientId&&!old)source.clientId=randomUUID();
  const sources=shared?.emptyNew&&old?[]:[shared?.badSize&&old?{...source,bytes:source.bytes+1}:source];
  if(shared?.legacy&&!old){const copy=join(root,'legacy-'+clientId+'.md');await writeFile(copy,sourceBytes);sources.push({...source,canonical_path:copy});}
  if(shared?.collision&&!old)sources.push({...source,sha256:digest.slice(0,16)+(digest[16]==='a'?'b':'a')+digest.slice(17),canonical_path:join(root,'collision-'+clientId+'.md')});
  if(shared?.newDuplicate&&old)sources.push({...source,canonical_path:join(root,'duplicate-'+clientId+'.md')});
  if(shared?.legacy&&old)sources.push(old.manifest.sources[1]);
  const packets={facts:{path:object,sha256:digest,bytes:sourceBytes.length}},prior=old?{path:old.path,sha256:old.sha256}:null;
  const sourceChanges=old?[{mode:'refresh',canonicalPath:canonical,previous:old.manifest.sources[0],next:sources[0]},{packet:'facts',mode:'refresh',previous:old.manifest.packets.facts,next:packets.facts}]:[];
  if(shared?.noChanges&&old)sourceChanges.length=0;
  const manifest={version:old?2:1,clientId,name:'Synthetic Client',executionMode:'audit_only',brandApproved:false,paidServicesConfirmed:false,services:['social'],workerCapacity:2,sourceRecordCount:sources.length,uniqueSourceCount:new Set(sources.map(s=>s.id)).size,sources,packets,...(old?{sourceChanges,staging:{createdAs:'immutable_staged_candidate',activationManagedSeparately:true},previousVersion:prior,sourceVersionHistory:[prior]}:{})};
  const text=json(manifest),sha256=hash(text),path=join(base,'versions',sha256,'manifest.json');await mkdir(join(base,'versions',sha256),{recursive:true});await writeFile(path,text);return {path,sha256,manifest,object};
 }
 const old=await makePack('old'),next=await makePack('new',old),pointerPath=join(base,'current.json'),oldPointer=json({path:old.path,sha256:old.sha256,preservedMetadata:'SYNTHETIC'});await writeFile(pointerPath,oldPointer);
 async function makeFoundation(id,p){return (await initialiseFoundations(storage,[{id,title:'Synthetic audit',scope:{kind:'client',id,clientId},fields:{facts:'Synthetic fixture only'},sources:[{id:shared?.wrongRegister&&p===next?'wrong-register':'audit-register',title:'Synthetic register',path:p.path,sha256:p.sha256,status:'Draft'},...Object.entries(p.manifest.packets).map(([name,s])=>({id:'audit-packet-'+name,title:name,path:s.path,sha256:s.sha256,status:'Draft'}))],assets:[],gaps:['Synthetic; not approved']}]))[0];}
 const oldFoundation=await makeFoundation('old-'+clientId,old),newFoundation=await makeFoundation('new-'+clientId,next),body={id:clientId,clientId,name:'Synthetic Client',status:'audit_ready',executionMode:'audit_only',foundationId:oldFoundation.id,brandConfirmed:false,servicesConfirmed:false,sourceRevision:old.sha256,team:{roles:['synthetic-writer','synthetic-qa'],capacity:2},createdAt:'2026-10-15T00:00:00Z'};
 let saved={...body,revision:pilotDigest(body)},writes=0,readHook=null,casHook=null,quietHook=null;
 const original=structuredClone(saved),input={id:randomUUID(),expectedOldPointerSha256:hash(oldPointer),expectedOldAllocationRevision:saved.revision,staged:{path:next.path,sha256:next.sha256},newFoundation:{id:newFoundation.id,revision:newFoundation.revision}};
 const callbacks={readAllocation:async id=>{assert.equal(id,clientId);if(readHook)await readHook();return structuredClone(saved);},assertQuiescent:async id=>quietHook?quietHook(id):{clientId:id,activeJobs:0,recoveryJobs:0,admittedDispatches:0},compareAndSwapAllocation:async ({clientId:id,expected,next:value})=>{assert.equal(id,clientId);if(casHook)return casHook({expected,next:value});if(JSON.stringify(saved)!==JSON.stringify(expected))return false;saved=structuredClone(value);writes++;return true;}};
 return {root,storage,config,base,old,next,input,pointerPath,oldPointer,callbacks,original,get saved(){return saved;},set saved(v){saved=v;},get writes(){return writes;},set cas(fn){casHook=fn;},set quiet(fn){quietHook=fn;},set read(fn){readHook=fn;},newFoundation,oldFoundation};
}
const fence=f=>join(f.base,'activation-fence.json');
const recover=(f,direction='forward')=>recoverOfficeSourceActivation(f.config,{id:f.input.id,direction},f.callbacks);
test('synthetic success preserves team, audit boundaries, old bytes and a durable exact journal',async t=>{
 const f=await fixture(t),oldBytes=await readFile(f.old.path),result=await activateOfficeSourceVersion(f.config,f.input,f.callbacks);
 assert.equal(result.direction,'forward');assert.equal(result.modelReplay,false);assert.equal(result.approvalGranted,false);assert.equal(f.writes,1);assert.equal(f.saved.sourceRevision,f.next.sha256);assert.equal(f.saved.foundationId,f.newFoundation.id);assert.deepEqual(f.saved.team,f.original.team);assert.equal(f.saved.brandConfirmed,false);assert.equal(f.saved.servicesConfirmed,false);
 assert.deepEqual(await readFile(f.old.path),oldBytes);assert.equal((await readPilotSources(f.storage,f.config.clientId)).sha256,f.next.sha256);await assert.rejects(readFile(fence(f)),{code:'ENOENT'});
 const j=JSON.parse(await readFile(join(f.base,'activations',f.input.id,'journal.json')));assert.equal(j.oldPointerText,f.oldPointer);assert.deepEqual(j.oldAllocation,f.original);assert.deepEqual(j.newAllocation,f.saved);
 await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/already completed/);assert.equal(f.writes,1);
});
test('preflight expected hashes, cross-client staged paths and missing callbacks fail before fence/live writes',async t=>{
 for(const mutate of [x=>x.expectedOldPointerSha256='a'.repeat(64),x=>x.expectedOldAllocationRevision='a'.repeat(64),x=>x.staged.path=x.staged.path.replace(/clients\/[a-f0-9-]+/,'clients/'+randomUUID())]){
  const f=await fixture(t);mutate(f.input);await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks));assert.equal(f.writes,0);assert.equal(await readFile(f.pointerPath,'utf8'),f.oldPointer);await assert.rejects(readFile(fence(f)),{code:'ENOENT'});
 }
 const f=await fixture(t);await assert.rejects(activateOfficeSourceVersion(f.config,f.input,{}),/callback is required/);
});
test('every admitted, active and recovery count plus wrong scope leaves maintenance fence and no live write',async t=>{
 for(const field of ['activeJobs','recoveryJobs','admittedDispatches','clientId']){
  const f=await fixture(t);f.quiet=async id=>({clientId:id,activeJobs:0,recoveryJobs:0,admittedDispatches:0,[field]:field==='clientId'?randomUUID():1});
  await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/active, recovery/);assert.equal(f.writes,0);await readFile(fence(f));await assert.rejects(readPilotSources(f.storage,f.config.clientId),/activation is pending/);
  f.quiet=null;await recover(f,'rollback');assert.equal(f.writes,0);assert.equal(await readFile(f.pointerPath,'utf8'),f.oldPointer);
 }
});
test('lost DB acknowledgement leaves mixed state; explicit forward readback never repeats that CAS',async t=>{
 const f=await fixture(t);let attempts=0;
 f.cas=async ({next})=>{attempts++;f.saved=structuredClone(next);throw Error('SYNTHETIC lost acknowledgement');};
 await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/lost acknowledgement/);assert.equal(await readFile(f.pointerPath,'utf8'),f.oldPointer);assert.equal(f.saved.sourceRevision,f.next.sha256);await readFile(fence(f));
 f.cas=null;const result=await recover(f);assert.equal(result.sourceRevision,f.next.sha256);assert.equal(attempts,1);assert.equal(f.writes,0);
});
test('mixed-state rollback restores exact old allocation and pointer without deleting new version',async t=>{
 const f=await fixture(t);f.cas=async ({next})=>{f.saved=structuredClone(next);return false;};await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/unconfirmed/);
 f.cas=null;const result=await recover(f,'rollback');assert.equal(result.direction,'rollback');assert.deepEqual(f.saved,f.original);assert.equal(await readFile(f.pointerPath,'utf8'),f.oldPointer);assert.equal(hash(await readFile(f.next.path)),f.next.sha256);assert.equal(f.writes,1);
});
test('interruption after pointer write is recovered from exact new/new state without a DB replay',async t=>{
 const f=await fixture(t);let checks=0;f.quiet=async id=>{if(++checks===2)throw Error('SYNTHETIC interruption after pointer write');return {clientId:id,activeJobs:0,recoveryJobs:0,admittedDispatches:0};};
 await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/interruption/);assert.equal(JSON.parse(await readFile(f.pointerPath)).sha256,f.next.sha256);assert.equal(f.writes,1);await readFile(fence(f));
 f.quiet=null;await recover(f);assert.equal(f.writes,1);
});
test('unexpected pointer or allocation states are never overwritten during explicit recovery',async t=>{
 for(const part of ['pointer','allocation']){
  const f=await fixture(t);f.quiet=async()=>{throw Error('SYNTHETIC stop');};await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks));f.quiet=null;
  if(part==='pointer')await writeFile(f.pointerPath,json({...JSON.parse(f.oldPointer),unknown:'third-state'}));
  else{const {revision,...body}=f.original;void revision;body.createdAt='2026-10-14T00:00:00Z';f.saved={...body,revision:pilotDigest(body)};}
  await assert.rejects(recover(f),/neither exact journal old nor new/);assert.equal(f.writes,0);await readFile(fence(f));
 }
});
test('manifest, source object, foundation and journal tampering remain fenced with no fabricated approval',async t=>{
 for(const target of ['manifest','object','foundation','journal']){
  const f=await fixture(t);f.quiet=async()=>{throw Error('SYNTHETIC stop');};await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks));f.quiet=null;
  const p=target==='manifest'?f.next.path:target==='object'?f.next.object:target==='foundation'?join(f.storage.recordsRoot,'knowledge','foundations',f.newFoundation.id,'versions',f.newFoundation.revision+'.json'):join(f.base,'activations',f.input.id,'journal.json');
  await writeFile(p,(await readFile(p,'utf8'))+' ');if(target==='foundation'){const v=JSON.parse(await readFile(p));v.status='approved';await writeFile(p,json(v));}
  await assert.rejects(recover(f));assert.equal(f.writes,0);await readFile(fence(f));
 }
});
test('malformed fence and symlink pointer are preserved and cannot start an activation',async t=>{
 const f=await fixture(t);await writeFile(fence(f),'{not a journal');await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/explicit recovery/);await assert.rejects(recover(f));assert.equal(await readFile(fence(f),'utf8'),'{not a journal');
 const g=await fixture(t),outside=join(g.root,'pointer-copy.json');await writeFile(outside,g.oldPointer);await unlink(g.pointerPath);await symlink(outside,g.pointerPath);await assert.rejects(activateOfficeSourceVersion(g.config,g.input,g.callbacks),/symlink/);assert.equal(g.writes,0);assert.equal(await readFile(outside,'utf8'),g.oldPointer);
});
test('concurrent activation has one owner; separate client namespace can proceed independently',async t=>{
 const f=await fixture(t),g=await fixture(t,{root:f.root});let release,entered;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.quiet=async id=>{entered();await gate;return {clientId:id,activeJobs:0,recoveryJobs:0,admittedDispatches:0};};
 const first=activateOfficeSourceVersion(f.config,f.input,f.callbacks);await enteredPromise;
 await assert.rejects(activateOfficeSourceVersion(f.config,{...f.input,id:randomUUID()},f.callbacks),/owns this client/);
 await activateOfficeSourceVersion(g.config,g.input,g.callbacks);assert.equal(g.saved.sourceRevision,g.next.sha256);assert.equal(f.saved.sourceRevision,f.old.sha256);release();await first;assert.equal(f.writes,1);assert.equal(g.writes,1);
});
test('source refresh keeps legacy old metadata but validates the complete new source set',async t=>{
 const f=await fixture(t);
 // New version source object is exact but changed since staging: no manifest-only pass.
 await writeFile(f.next.object,'SYNTHETIC changed after staged review');await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/source bytes changed/i);assert.equal(f.writes,0);await readFile(fence(f));
});
test('actual synthetic child crash after DB write retains fence/lock and explicit recovery does not replay DB',async t=>{
 const f=await fixture(t),db=join(f.root,'SYNTHETIC-allocation.json');await writeFile(db,json(f.original));
 const source=`import {readFile,writeFile} from 'node:fs/promises'; import {activateOfficeSourceVersion} from ${JSON.stringify(new URL('./lib/office-source-activation.mjs',import.meta.url).href)};
 const config=${JSON.stringify(f.config)},input=${JSON.stringify(f.input)},db=${JSON.stringify(db)};
 await activateOfficeSourceVersion(config,input,{readAllocation:async()=>JSON.parse(await readFile(db,'utf8')),assertQuiescent:async clientId=>({clientId,activeJobs:0,recoveryJobs:0,admittedDispatches:0}),compareAndSwapAllocation:async({next})=>{await writeFile(db,JSON.stringify(next));process.kill(process.pid,'SIGKILL');}});`;
 const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);const [code,signal]=await once(child,'exit');assert.equal(code,null,stderr);assert.equal(signal,'SIGKILL',stderr);
 await readFile(fence(f));await readFile(join(f.base,'activation.lock'));assert.equal(await readFile(f.pointerPath,'utf8'),f.oldPointer);f.saved=JSON.parse(await readFile(db,'utf8'));assert.equal(f.saved.sourceRevision,f.next.sha256);
 await recover(f);assert.equal(f.writes,0);await assert.rejects(readFile(join(f.base,'activation.lock')),{code:'ENOENT'});assert.equal((await readPilotSources(f.storage,f.config.clientId)).sha256,f.next.sha256);
});
test('admission token exists through operation and is cleaned on success/error; malformed fence blocks before fn',async t=>{
 const f=await fixture(t);assert.equal(await countOfficeSourceAdmissions(f.config),0);
 assert.equal(await withOfficeSourceAdmission(f.config,async()=>{assert.ok(await countOfficeSourceAdmissions(f.config)>=1);return 'synthetic admitted';}),'synthetic admitted');assert.equal(await countOfficeSourceAdmissions(f.config),0);
 await assert.rejects(withOfficeSourceAdmission(f.config,async()=>{throw Error('SYNTHETIC admission failure');}),/admission failure/);assert.equal(await countOfficeSourceAdmissions(f.config),0);
 await writeFile(fence(f),'{incomplete');let ran=false;await assert.rejects(withOfficeSourceAdmission(f.config,async()=>{ran=true;}),/activation is pending/);assert.equal(ran,false);assert.equal(await countOfficeSourceAdmissions(f.config),0);
});
test('admission before fence prevents activation commit; later admission cannot enter; dead/malformed tokens still block',async t=>{
 const f=await fixture(t);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const admission=withOfficeSourceAdmission(f.config,async()=>{entered();await gate;});await started;
 await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/outstanding source admission/);assert.equal(f.writes,0);
 await assert.rejects(withOfficeSourceAdmission(f.config,async()=>assert.fail('must not admit')),/activation is pending/);release();await admission;
 const tokens=join(f.base,'admissions');await writeFile(join(tokens,randomUUID()+'.json'),'{SYNTHETIC incomplete dead owner');assert.ok(await countOfficeSourceAdmissions(f.config)>=1);
 await assert.rejects(recover(f),/outstanding source admission/);assert.equal(f.writes,0);await readFile(fence(f));
});
test('legacy old same-content primary duplicates are retained; new duplicate primaries and full-hash collisions fail',async t=>{
 const f=await fixture(t,{legacy:true});const original=await readFile(f.old.path);assert.equal(f.old.manifest.sources.length,2);
 await activateOfficeSourceVersion(f.config,f.input,f.callbacks);assert.deepEqual(await readFile(f.old.path),original);assert.equal(f.saved.sourceRevision,f.next.sha256);
 for(const flag of ['collision','newDuplicate']){const g=await fixture(t,{[flag]:true});await assert.rejects(activateOfficeSourceVersion(g.config,g.input,g.callbacks),/Duplicate primary source identity|full-hash collision/);assert.equal(g.writes,0);await readFile(fence(g));}
});
test('own-client snapshots cannot disguise foreign-client canonical metadata or explicit source bindings',async t=>{
 for(const flag of ['foreignMetadata','foreignClientId']){const f=await fixture(t,{[flag]:true});await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),/metadata belongs to another client/);assert.equal(f.writes,0);await readFile(fence(f));}
});
test('shared packet/source size mismatch, runtime register ID mismatch and implicit source loss are refused',async t=>{
 for(const [flag,error]of [['badSize',/byte count differs/],['wrongRegister',/wrong source IDs/],['emptyNew',/dropped a retained/],['noChanges',/lacks exact supersession/]]){const f=await fixture(t,{[flag]:true});await assert.rejects(activateOfficeSourceVersion(f.config,f.input,f.callbacks),error);assert.equal(f.writes,0);await readFile(fence(f));}
});

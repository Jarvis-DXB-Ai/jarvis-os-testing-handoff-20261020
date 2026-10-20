import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,realpath,symlink,readdir,open,rm} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {stageOfficeSourceVersion,verifyStagedOfficeSourceVersion} from './lib/office-source-versions.mjs';
import {readRegisteredSource} from './lib/office-pinned-sources.mjs';
import {readPilotSources} from './lib/office-client-pilot.mjs';
const client='a7604343-92d7-56ec-bf35-b272cac7f8b7',foreign='c8aef456-9613-5dd2-9a9e-2207708a7338',hash=b=>createHash('sha256').update(b).digest('hex');
const at='2026-10-15T09:20:00Z';
async function fixture(t){
 const base=await realpath(await mkdtemp(join(tmpdir(),'office-source-version-')));t.after(()=>rm(base,{recursive:true,force:true}));
 const source=join(base,'client-a'),other=join(base,'client-b'),recordsRoot=join(base,'records');for(const p of [source,other,recordsRoot])await mkdir(p);
 const storage={recordsRoot,recordsVolume:base,testing:true},config={storage,clientId:client,roots:[{clientId:client,path:source}]},clientSources=join(recordsRoot,'clients',client,'sources');await mkdir(clientSources,{recursive:true});
 const oldBody=Buffer.from('Old client source\n'),oldHash=hash(oldBody),sources=[];
 for(const name of ['alpha.md','beta.md']){const path=join(source,name);await writeFile(path,oldBody);sources.push({id:'src-'+oldHash.slice(0,16),family:'knowledge',canonical_path:path,sha256:oldHash,bytes:oldBody.length,snapshot_path:null,status:'working draft; unapproved'});}
 const packetBody=Buffer.from('Original immutable packet\n'),packetHash=hash(packetBody),packetPath=join(clientSources,'objects',packetHash,'web-evidence.md');await mkdir(dirname(packetPath),{recursive:true});await writeFile(packetPath,packetBody);
 const manifest={version:1,clientId:client,name:'Synthetic client A',createdAt:at,executionMode:'audit_only',brandApproved:false,paidServicesConfirmed:false,sources,packets:{web:{path:packetPath,sha256:packetHash,characters:packetBody.toString().length}},sourceRoot:source,services:[],workerCapacity:1};
 const fx={base,source,other,storage,config,clientSources,oldHash,manifest};await seed(fx,manifest);return fx;
}
async function seed(fx,manifest){const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),sha=hash(bytes),path=join(fx.clientSources,'versions',sha,'manifest.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);const pointer=Buffer.from(JSON.stringify({path,sha256:sha},null,2)+'\n');await writeFile(join(fx.clientSources,'current.json'),pointer);Object.assign(fx,{oldSha:sha,oldPath:path,oldBytes:bytes,oldPointer:pointer});}
async function selection(fx,name='new.md',body='New exact source\n',extra={}){const path=join(fx.source,name),bytes=Buffer.isBuffer(body)?body:Buffer.from(body);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);return {clientId:client,path,sha256:hash(bytes),bytes:bytes.length,family:'context',status:'coordinator evidence; unapproved',mode:'add',...extra};}
function request(fx,inputs,packets=[]){return {clientId:client,expectedOldPackSha256:fx.oldSha,createdAt:at,inputs,packets};}
async function unchanged(fx){assert.deepEqual(await readFile(join(fx.clientSources,'current.json')),fx.oldPointer);assert.deepEqual(await readFile(fx.oldPath),fx.oldBytes);}

test('additive staging preserves old pointer/bytes and duplicate semantic records as unique aliases; runtime can read the snapshot',async t=>{
 const f=await fixture(t),item=await selection(f),r=await stageOfficeSourceVersion(f.config,request(f,[item])),m=JSON.parse(await readFile(r.path));
 assert.equal(r.activated,false);assert.equal(r.oldSourceRecords,2);assert.equal(r.oldUniqueSourceIdentities,1);assert.equal(r.sourceRecords,3);assert.equal(r.uniqueSourceIdentities,2);assert.equal(m.sources[0].canonical_aliases[0].canonical_path,join(f.source,'beta.md'));assert.equal(m.sources[0].canonical_aliases[0].status,'working draft; unapproved');await unchanged(f);
 const s=m.sources.find(s=>s.sha256===item.sha256),read=await readRegisteredSource(f.storage,{clientId:client,roots:[f.source]},s,1024);assert.equal(read.bytes.toString(),'New exact source\n');assert.equal(s.snapshot_path,join(f.clientSources,'objects',item.sha256,'new.md'));
 const second=await stageOfficeSourceVersion(f.config,request(f,[item]));assert.equal(second.sha256,r.sha256);assert.equal((await verifyStagedOfficeSourceVersion(f.config,r)).sourceRecords,3);
 // Synthetic-only pointer swap proves the current runtime loader accepts candidate format.
 await writeFile(join(f.clientSources,'current.json'),JSON.stringify({path:r.path,sha256:r.sha256}));assert.equal((await readPilotSources(f.storage,client)).sha256,r.sha256);await writeFile(join(f.clientSources,'current.json'),f.oldPointer);await unchanged(f);
});
test('explicit refresh snapshots selected changed bytes and preserves the superseded record and unselected duplicate',async t=>{
 const f=await fixture(t),item=await selection(f,'alpha.md','Changed canonical source\n',{mode:'refresh',expectedPreviousSha256:f.oldHash}),r=await stageOfficeSourceVersion(f.config,request(f,[item])),m=JSON.parse(await readFile(r.path));
 assert.equal(r.sourceRecords,2);assert.equal(r.uniqueSourceIdentities,2);assert.equal(m.sourceChanges[0].previous.sha256,f.oldHash);assert.equal(m.sourceChanges[0].next.sha256,item.sha256);assert.equal(m.sources.find(s=>s.canonical_path.endsWith('beta.md')).sha256,f.oldHash);assert.equal(m.previousVersion.sha256,f.oldSha);assert.equal(m.sourceVersionHistory[0].path,f.oldPath);await unchanged(f);
 await writeFile(item.path,'Later canonical mutation\n');const entry=m.sources.find(s=>s.sha256===item.sha256);assert.equal((await readRegisteredSource(f.storage,{clientId:client,roots:[f.source]},entry,1024)).bytes.toString(),'Changed canonical source\n');
});
test('immutable evidence packets are additive/explicitly refreshed and keep runtime packet integrity',async t=>{
 const f=await fixture(t),item=await selection(f,'context.md','Owner context: unknown is not approved.\n'),packet={...item,name:'context'};delete packet.family;delete packet.status;
 const r=await stageOfficeSourceVersion(f.config,request(f,[item],[packet])),m=JSON.parse(await readFile(r.path));assert.equal(m.packets.web.sha256,f.manifest.packets.web.sha256);assert.equal(m.packets.context.sha256,item.sha256);assert.equal(m.packets.context.bytes,item.bytes);assert.equal(m.packets.context.characters,40);assert.equal(r.snapshotObjects,1);await unchanged(f);
 const refreshed=await stageOfficeSourceVersion(f.config,request(f,[],[{...packet,name:'web',mode:'refresh',expectedPreviousSha256:f.manifest.packets.web.sha256}])),refreshedManifest=JSON.parse(await readFile(refreshed.path));assert.equal(refreshedManifest.packets.web.sha256,item.sha256);assert.equal(await readFile(f.manifest.packets.web.path,'utf8'),'Original immutable packet\n');await unchanged(f);
 const binary=await selection(f,'bad.md',Buffer.from([0xff,0xfe]));await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[],[{...binary,name:'bad'}])),/UTF8/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[],[{...packet,name:'web'}])),/Packet add\/refresh/);
});
test('wrong client, unregistered roots, storage tenant escape and traversal are refused before source writes',async t=>{
 const f=await fixture(t),item=await selection(f),outside=join(f.other,'foreign.md');await writeFile(outside,'New exact source\n');
 for(const [config,input]of [[f.config,{...request(f,[item]),clientId:foreign}],[f.config,request(f,[{...item,clientId:foreign}])],[{...f.config,roots:[{clientId:foreign,path:f.source}]},request(f,[item])],[f.config,request(f,[{...item,path:outside}])],[f.config,request(f,[{...item,path:f.source+'/../client-a/new.md'}])]])await assert.rejects(stageOfficeSourceVersion(config,input),/client|roots|traversal/i);
 const otherRoot=join(f.storage.recordsRoot,'clients',foreign);await mkdir(otherRoot,{recursive:true});await writeFile(join(otherRoot,'x.md'),'New exact source\n');await assert.rejects(stageOfficeSourceVersion({...f.config,roots:[{clientId:client,path:otherRoot}]},request(f,[{...item,path:join(otherRoot,'x.md')}])),/client storage/);await unchanged(f);
});
test('leaf, parent and storage-object symlinks cannot cross snapshot boundaries',async t=>{
 const f=await fixture(t),item=await selection(f),target=join(f.other,'foreign.md');await writeFile(target,'New exact source\n');const leaf=join(f.source,'linked.md');await symlink(target,leaf);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[{...item,path:leaf}])),/symlink/);
 const parent=join(f.source,'linked-parent');await symlink(f.other,parent);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[{...item,path:join(parent,'foreign.md')}])),/symlink/);
 const object=join(f.clientSources,'objects',item.sha256);await symlink(f.other,object);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/symlink/);assert.equal((await readdir(f.other)).includes('new.md'),false);await unchanged(f);
});
test('changed bytes, changed size and total/per-file limits fail before creating candidate objects',async t=>{
 const f=await fixture(t),item=await selection(f);await writeFile(item.path,'Bad exact source\n');assert.equal(Buffer.byteLength('Bad exact source\n'),item.bytes);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/bytes changed/);await writeFile(item.path,'x');await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/size changed/);
 const big=await selection(f,'large.md','x'.repeat(20));await assert.rejects(stageOfficeSourceVersion({...f.config,maxSourceBytes:16,maxTotalBytes:32},request(f,[big])),/size.*limit/);
 const a=await selection(f,'a.md','a'.repeat(12)),b=await selection(f,'b.md','b'.repeat(12)),c=await selection(f,'c.md','c'.repeat(12));await assert.rejects(stageOfficeSourceVersion({...f.config,maxSourceBytes:16,maxTotalBytes:32},request(f,[a,b,c])),/total staging limit/);assert.equal((await readdir(join(f.clientSources,'objects'))).length,1);await unchanged(f);
});
test('wrong old hash, stale refresh, repeated canonical selection and false canonical alias fail closed',async t=>{
 const f=await fixture(t),item=await selection(f);await assert.rejects(stageOfficeSourceVersion(f.config,{...request(f,[item]),expectedOldPackSha256:'0'.repeat(64)}),/expected old hash/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[{...item,path:join(f.source,'alpha.md'),sha256:f.oldHash,bytes:f.manifest.sources[0].bytes}])),/explicit refresh/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[{...item,mode:'refresh',expectedPreviousSha256:f.oldHash}])),/previous canonical/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item,item])),/selected more than once/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[{...item,canonicalPath:join(f.source,'alpha.md'),mode:'refresh',expectedPreviousSha256:f.oldHash}])),/size changed|bytes changed/);await unchanged(f);
});
test('same truncated source ID with different full hashes is rejected rather than deduplicated',async t=>{
 const f=await fixture(t),item=await selection(f),fake=item.sha256.slice(0,16)+'0'.repeat(48);assert.notEqual(fake,item.sha256);const m=structuredClone(f.manifest);m.sources=[{...m.sources[0],id:'src-'+fake.slice(0,16),sha256:fake}];await seed(f,m);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/ID collision/);assert.equal((await readdir(join(f.clientSources,'objects'))).length,1);await unchanged(f);
 const conflict=structuredClone(m);conflict.sources.push({...m.sources[0],canonical_path:join(f.source,'beta.md'),sha256:item.sha256});await seed(f,conflict);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/ID collision/);await unchanged(f);
});
test('existing object/version bytes are never overwritten and readback detects corruption',async t=>{
 const f=await fixture(t),item=await selection(f),object=join(f.clientSources,'objects',item.sha256,basename(item.path));await mkdir(dirname(object));await writeFile(object,'preserve collision');await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/Immutable.*collision/);assert.equal(await readFile(object,'utf8'),'preserve collision');await unchanged(f);
 const good=await selection(f,'good.md','a different correct object'),r=await stageOfficeSourceVersion(f.config,request(f,[good]));await writeFile(r.path,'corrupted candidate manifest');await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[good])),/Immutable.*collision/);assert.equal(await readFile(r.path,'utf8'),'corrupted candidate manifest');await assert.rejects(verifyStagedOfficeSourceVersion(f.config,r),/readback hash/);await unchanged(f);
});
test('corrupt inherited packet or staged snapshot is detected; a foreign receipt cannot inspect another client',async t=>{
 const f=await fixture(t),item=await selection(f),r=await stageOfficeSourceVersion(f.config,request(f,[item])),m=JSON.parse(await readFile(r.path)),s=m.sources.find(s=>s.sha256===item.sha256);await writeFile(s.snapshot_path,'tampered snapshot');await assert.rejects(verifyStagedOfficeSourceVersion(f.config,r),/snapshot changed/);await assert.rejects(verifyStagedOfficeSourceVersion(f.config,{...r,clientId:foreign}),/client version/);
 await writeFile(f.manifest.packets.web.path,'tampered old packet');await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/pinned audit packet changed/);await unchanged(f);
});
test('lock contention refuses staging and bad source IDs do not acquire a second identity',async t=>{
 const f=await fixture(t),item=await selection(f),lock=await open(join(f.clientSources,'staging.lock'),'wx');await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/Another staging operation/);await lock.close();await rm(join(f.clientSources,'staging.lock'));
 const m=structuredClone(f.manifest);m.sources[0].id='src-'+'0'.repeat(16);await seed(f,m);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/source identity/);await unchanged(f);
});
test('inherited non-packet snapshots are revalidated, including aliases, before staging reports success',async t=>{
 const f=await fixture(t),old=f.manifest.sources[0],snapshot=join(f.clientSources,'objects',old.sha256,'alpha.md');await mkdir(dirname(snapshot),{recursive:true});await writeFile(snapshot,await readFile(old.canonical_path));
 const prior=structuredClone(f.manifest);prior.sources[0].snapshot_path=snapshot;await seed(f,prior);
 const item=await selection(f),r=await stageOfficeSourceVersion(f.config,request(f,[item]));
 assert.equal((await verifyStagedOfficeSourceVersion(f.config,r)).verifiedSnapshotObjects,3);
 await writeFile(snapshot,Buffer.alloc(old.bytes,65));
 await assert.rejects(verifyStagedOfficeSourceVersion(f.config,r),/snapshot changed/);
 await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/snapshot changed/);
 await unchanged(f);
});
test('packet metadata cannot hide a conflicting declared byte count for the same inherited snapshot',async t=>{
 const f=await fixture(t),prior=structuredClone(f.manifest),packet=prior.packets.web,body=await readFile(packet.path);
 prior.sources[0]={...prior.sources[0],id:'src-'+packet.sha256.slice(0,16),sha256:packet.sha256,bytes:body.length,snapshot_path:packet.path};prior.packets.web.bytes=body.length;await seed(f,prior);
 const item=await selection(f),r=await stageOfficeSourceVersion(f.config,request(f,[item])),m=JSON.parse(await readFile(r.path));m.sources.find(s=>s.sha256===packet.sha256).bytes++;
 const serialized=Buffer.from(JSON.stringify(m,null,2)+'\n'),sha=hash(serialized),path=join(f.clientSources,'versions',sha,'manifest.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,serialized);
 await assert.rejects(verifyStagedOfficeSourceVersion(f.config,{...r,path,sha256:sha}),/Conflicting immutable/);await unchanged(f);
});

test('unselected legacy canonical drift is not scanned or silently rewritten; immutable selection limits remain explicit',async t=>{const f=await fixture(t),item=await selection(f);await writeFile(join(f.source,'alpha.md'),'Unselected changed legacy canonical file');const r=await stageOfficeSourceVersion(f.config,request(f,[item])),m=JSON.parse(await readFile(r.path));assert.equal(r.legacyCanonicalReferences,2);assert.equal(m.staging.runtimeCanonicalReferences,1);assert.equal(m.sources.find(s=>s.id==='src-'+f.oldHash.slice(0,16)).sha256,f.oldHash);await unchanged(f);});
test('packet duplicate names and malformed inherited packet containers fail before writing selected objects',async t=>{const f=await fixture(t),item=await selection(f),p={...item,name:'context'};await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[],[p,p])),/Packet names.*unique/);const m=structuredClone(f.manifest);m.packets=Object.values(m.packets);await seed(f,m);await assert.rejects(stageOfficeSourceVersion(f.config,request(f,[item])),/packet schema/);assert.equal((await readdir(join(f.clientSources,'objects'))).length,1);await unchanged(f);});

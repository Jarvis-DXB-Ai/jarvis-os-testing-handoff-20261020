import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,realpath,symlink,truncate,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {stageOfficeReviewPackage as stage,readOfficeReviewPackageFile as read} from './lib/office-review-package.mjs';
const clientId='325f9e9f-f615-56d8-b2d1-c44632d53d64',foreign='73bccc8d-2d13-5a30-956b-188f41e5553a';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,entries=[{path:'index.html',mime:'text/html',value:'<!doctype html><h1>Private draft</h1>'},{path:'assets/style.css',mime:'text/css',value:'body{color:#222}'},{path:'sources/editable.txt',mime:'text/plain',value:'Editable synthetic source'}]){
 const volume=await realpath(await mkdtemp(join(process.env.OFFICE_REVIEW_TEST_TMP??tmpdir(),'review-package-'))),source=join(volume,'source'),store=join(volume,'archive');await mkdir(source);await mkdir(store);t.after(()=>rm(volume,{recursive:true,force:true}));
 for(const f of entries){await mkdir(dirname(join(source,f.path)),{recursive:true});await writeFile(join(source,f.path),f.value);}
 const manifest={schema:'synthetic-owner-review/v1',revision:'synthetic-r1',entry:'index.html',state:'draft only',artifacts:entries.map(f=>({path:f.path,mime:f.mime,sha256:sha(f.value),bytes:Buffer.byteLength(f.value)}))};
 async function register(){const raw=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(join(source,'package-manifest.json'),raw);const revision=sha(raw),config={storage:{recordsRoot:store,recordsVolume:volume,testing:true},packages:[{clientId,packageRoot:source,manifestSha256:revision}]};return {config,revision};}
 return {volume,source,store,manifest,register,...await register()};
}
const snap=f=>join(f.store,'review-packages',clientId,f.revision);
function zip(names){
 const locals=[],centrals=[];let offset=0;
 for(const name of names){const n=Buffer.from(name),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(n.length,26);locals.push(local,n);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);centrals.push(c,n);offset+=local.length+n.length;}
 const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,central,end]);
}
test('immutable staged revision copies all exact bytes, provenance and owner entry; no current pointer',async t=>{
 const f=await fixture(t),result=await stage(f.config,{clientId,revision:f.revision});assert.equal(result.fileCount,3);assert.equal(result.reused,false);assert.equal(result.sourceManifest.sha256,f.revision);assert.equal(result.entry,'index.html');
 const value=await read(f.config,{clientId,revision:f.revision,path:'index.html'});assert.equal(Buffer.from(value.bytes).toString(),'<!doctype html><h1>Private draft</h1>');assert.equal(value.mime,'text/html');assert.equal(value.sha256,sha(value.bytes));assert.ok(value.bytes instanceof Uint8Array);assert.equal(value.download,false);assert.equal(JSON.stringify({...value,bytes:undefined}).includes(f.source),false);
 assert.deepEqual((await readdir(join(f.store,'review-packages',clientId))).sort(),[f.revision]);assert.deepEqual(await readFile(join(snap(f),'package-manifest.json')),await readFile(join(f.source,'package-manifest.json')));
});
test('idempotent stage verifies existing copy and retains exact provenance without pointer changes',async t=>{const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});const before=await readFile(join(snap(f),'provenance.json'));assert.equal((await stage(f.config,{clientId,revision:f.revision})).reused,true);assert.deepEqual(await readFile(join(snap(f),'provenance.json')),before);});
test('foreign client, unregistered revision and forged source registration never read a package',async t=>{
 const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});for(const input of [{clientId:foreign,revision:f.revision},{clientId,revision:'f'.repeat(64)},{clientId:'../'+clientId,revision:f.revision}])await assert.rejects(read(f.config,{...input,path:'index.html'}),/Unregistered/);
 await assert.rejects(read({...f.config,packages:[{...f.config.packages[0],clientId:foreign}]},{clientId:foreign,revision:f.revision,path:'index.html'}));
 await assert.rejects(read({...f.config,packages:[{...f.config.packages[0],packageRoot:f.source+'/different'}]},{clientId,revision:f.revision,path:'index.html'}),/provenance/);
 const foreignRoot=join(f.store,'review-packages',foreign,f.revision);await mkdir(dirname(foreignRoot),{recursive:true});await cp(snap(f),foreignRoot,{recursive:true});await assert.rejects(read({...f.config,packages:[{...f.config.packages[0],clientId:foreign}]},{clientId:foreign,revision:f.revision,path:'index.html'}),/provenance/);
});
test('unlisted files and metadata are not HTTP file capabilities',async t=>{const f=await fixture(t);await writeFile(join(f.source,'unlisted.txt'),'not selected');await stage(f.config,{clientId,revision:f.revision});for(const path of ['unlisted.txt','package-manifest.json','provenance.json'])await assert.rejects(read(f.config,{clientId,revision:f.revision,path}));});
test('relative paths reject traversal, dot/percent aliases, URL/control/private names before reading',async t=>{
 const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});for(const path of ['../index.html','/index.html','assets/../index.html','./index.html','assets//style.css','index.html?x=1','index.html#x','%2e%2e/index.html','%252e/index.html','assets\\style.css','C:/index.html','.env','private/data.txt','secrets/data.txt','webhook-secret.json','runtime-key.json','src/app.js','scripts/run.js','index.html\0','index.html.','index.html '])await assert.rejects(read(f.config,{clientId,revision:f.revision,path}));
});
test('source changed bytes, missing file and wrong expected manifest SHA fail without published revision',async t=>{
 for(const mode of ['changed','missing','manifest']){const f=await fixture(t);if(mode==='changed')await writeFile(join(f.source,'index.html'),'changed');if(mode==='missing')await rm(join(f.source,'index.html'));if(mode==='manifest')await writeFile(join(f.source,'package-manifest.json'),'{}');await assert.rejects(stage(f.config,{clientId,revision:f.revision}));const parent=join(f.store,'review-packages',clientId);assert.equal((await readdir(parent).catch(()=>[])).includes(f.revision),false);}
});
test('manifest validates selected client, case aliases, entry, safe MIME and both byte budgets',async t=>{
 const changes=[m=>m.clientId=foreign,m=>m.artifacts.push({...m.artifacts[0],path:'INDEX.html'}),m=>m.entry='not-listed.html',m=>m.artifacts[0].mime='image/png',m=>m.artifacts[0].path='secrets/key.txt',m=>m.artifacts[0].path='active.ps1',m=>m.artifacts[0].bytes=64*1024*1024+1,m=>m.artifacts=Array.from({length:5},(_,i)=>({path:i?'files/'+i+'.txt':'index.html',mime:i?'text/plain':'text/html',sha256:'a'.repeat(64),bytes:64*1024*1024}))];
 for(const change of changes){const f=await fixture(t);change(f.manifest);Object.assign(f,await f.register());await assert.rejects(stage(f.config,{clientId,revision:f.revision}));}
});
test('symlinked source root, ancestor and selected leaf never stage',async t=>{
 for(const mode of ['root','ancestor','leaf']){const f=await fixture(t);if(mode==='root'){const alias=join(f.volume,'alias');await symlink(f.source,alias);f.config.packages[0].packageRoot=alias;}else if(mode==='ancestor'){await rm(join(f.source,'assets'),{recursive:true});const elsewhere=join(f.volume,'elsewhere');await mkdir(elsewhere);await writeFile(join(elsewhere,'style.css'),'body{color:#222}');await symlink(elsewhere,join(f.source,'assets'));}else{await rm(join(f.source,'index.html'));await symlink(join(f.source,'sources/editable.txt'),join(f.source,'index.html'));}await assert.rejects(stage(f.config,{clientId,revision:f.revision}));}
});
test('snapshot file replacement/hash drift, symlink and provenance tampering refuse complete buffers',async t=>{
 for(const mode of ['bytes','symlink','provenance','manifest','parent']){const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});const file=join(snap(f),'files/index.html');if(mode==='bytes')await writeFile(file,'unapproved drift');if(mode==='symlink'){await rm(file);await symlink(join(f.source,'index.html'),file);}if(mode==='parent'){await rm(join(snap(f),'files/assets'),{recursive:true});await symlink(join(f.source,'assets'),join(snap(f),'files/assets'));}if(mode==='provenance')await writeFile(join(snap(f),'provenance.json'),'{}');if(mode==='manifest')await writeFile(join(snap(f),'package-manifest.json'),'{}');await assert.rejects(read(f.config,{clientId,revision:f.revision,path:mode==='parent'?'assets/style.css':'index.html'}));}
});
test('immutable reads survive later source mutation/removal; source reuse still detects drift',async t=>{
 const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});await writeFile(join(f.source,'index.html'),'different later draft');await assert.rejects(stage(f.config,{clientId,revision:f.revision}));await rm(f.source,{recursive:true});assert.equal(Buffer.from((await read(f.config,{clientId,revision:f.revision,path:'index.html'})).bytes).toString(),'<!doctype html><h1>Private draft</h1>');
});
test('oversized physical snapshot refuses before returning any buffer',async t=>{const f=await fixture(t);await stage(f.config,{clientId,revision:f.revision});await truncate(join(snap(f),'files/index.html'),64*1024*1024+1);await assert.rejects(read(f.config,{clientId,revision:f.revision,path:'index.html'}),/size/);});
test('oversized physical source refuses before any copied revision is served',async t=>{const f=await fixture(t);await truncate(join(f.source,'index.html'),64*1024*1024+1);await assert.rejects(stage(f.config,{clientId,revision:f.revision}),/size/);await assert.rejects(read(f.config,{clientId,revision:f.revision,path:'index.html'}));});
test('binary MIME/magic and private archive members are checked, not executed/extracted',async t=>{
 for(const name of ['../secret.txt','.env','private/data.txt','scripts/run.sh','folder/a%2etxt']){const f=await fixture(t,[{path:'index.html',mime:'text/html',value:'<h1>Draft</h1>'},{path:'download.zip',mime:'application/zip',value:zip([name])}]);await assert.rejects(stage(f.config,{clientId,revision:f.revision}),/archive/);}
 const bad=await fixture(t,[{path:'index.html',mime:'text/html',value:'draft'},{path:'asset.png',mime:'image/png',value:'not png'}]);await assert.rejects(stage(bad.config,{clientId,revision:bad.revision}),/MIME/);
 const f=await fixture(t,[{path:'index.html',mime:'text/html',value:'draft'},{path:'download.zip',mime:'application/zip',value:zip(['brand/index.html','brand/editable.txt'])},{path:'deck.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',value:zip(['[Content_Types].xml','_rels/.rels','ppt/presentation.xml'])}]);await stage(f.config,{clientId,revision:f.revision});assert.equal((await read(f.config,{clientId,revision:f.revision,path:'deck.pptx'})).download,true);assert.equal((await read(f.config,{clientId,revision:f.revision,path:'download.zip'})).download,true);
});
test('second independent store mirrors exact selected bytes and provenance, without active pointer',async t=>{
 const f=await fixture(t),other=join(f.volume,'mirror');await mkdir(other);const config={...f.config,storage:{...f.config.storage,recordsRoot:other}};await stage(f.config,{clientId,revision:f.revision});await stage(config,{clientId,revision:f.revision});for(const a of f.manifest.artifacts)assert.deepEqual((await read(f.config,{clientId,revision:f.revision,path:a.path})).bytes,(await read(config,{clientId,revision:f.revision,path:a.path})).bytes);assert.deepEqual(await readFile(join(snap(f),'provenance.json')),await readFile(join(other,'review-packages',clientId,f.revision,'provenance.json')));
});
test('concurrent idempotent stage has one complete revision and no partial staging directory',async t=>{const f=await fixture(t);await Promise.all([stage(f.config,{clientId,revision:f.revision}),stage(f.config,{clientId,revision:f.revision})]);assert.deepEqual(await readdir(join(f.store,'review-packages',clientId)),[f.revision]);assert.equal((await read(f.config,{clientId,revision:f.revision,path:'index.html'})).size,f.manifest.artifacts[0].bytes);});

// Actual peer failures retained externally. These variants make local/central
// and effective names explicit; no extraction, user sources or real secrets.
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function extraField(id,value){const h=Buffer.alloc(4);h.writeUInt16LE(id);h.writeUInt16LE(value.length,2);return Buffer.concat([h,value]);}
function unicodePath(name,effective){const prefix=Buffer.alloc(5);prefix[0]=1;prefix.writeUInt32LE(crc32(Buffer.from(name)),1);return extraField(0x7075,Buffer.concat([prefix,Buffer.from(effective)]));}
function variantZip(localName='editable.txt',centralName=localName,options={}){
 const payload=Buffer.from('SYNTHETIC editable source; no real secret\n'),data=options.deflate?deflateRawSync(payload):payload,l=Buffer.from(localName),c=Buffer.from(centralName),method=options.deflate?8:0,flags=options.descriptor?8:0,le=options.localExtra??Buffer.alloc(0),ce=options.centralExtra??Buffer.alloc(0),prefix=options.prefix??Buffer.alloc(0);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);if(!options.descriptor){local.writeUInt32LE(crc32(payload),14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(payload.length,22);}local.writeUInt16LE(l.length,26);local.writeUInt16LE(le.length,28);
 const descriptor=options.descriptor?Buffer.alloc(16):Buffer.alloc(0);if(options.descriptor){descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc32(payload),4);descriptor.writeUInt32LE(data.length,8);descriptor.writeUInt32LE(payload.length,12);}
 const head=Buffer.concat([prefix,local,l,le,data,descriptor]),central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc32(payload),16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(payload.length,24);central.writeUInt16LE(c.length,28);central.writeUInt16LE(ce.length,30);central.writeUInt32LE(prefix.length,42);
 const directory=Buffer.concat([central,c,ce]),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(head.length,16);return Buffer.concat([head,directory,end]);
}
async function archiveFixture(t,value){return fixture(t,[{path:'index.html',mime:'text/html',value:'<h1>Synthetic draft</h1>'},{path:'download.zip',mime:'application/zip',value}]);}
test('peer regression: local private name vs safe central name is refused; real tar sees original hidden name',async t=>{
 const f=await archiveFixture(t,variantZip('.env','editable.txt'));if(process.platform==='darwin'){const result=spawnSync('/usr/bin/tar',['-tf',join(f.source,'download.zip')],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'.env');}await assert.rejects(stage(f.config,{clientId,revision:f.revision}),/local and central/);await assert.rejects(read(f.config,{clientId,revision:f.revision,path:'download.zip'}));
});
test('peer regression: valid Unicode effective private path refuses local, central or both overrides',async t=>{
 for(const side of ['local','central','both']){const extra=unicodePath('editable.txt','.env'),f=await archiveFixture(t,variantZip('editable.txt','editable.txt',{localExtra:side==='central'?undefined:extra,centralExtra:side==='local'?undefined:extra}));if(side==='both'&&process.platform==='darwin'){const result=spawnSync('/usr/bin/tar',['-tf',join(f.source,'download.zip')],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'.env');}await assert.rejects(stage(f.config,{clientId,revision:f.revision}),/effective filename/);}
});
test('safe Unicode path with exact same bytes and normal deflate/data descriptor remain supported',async t=>{
 for(const options of [{localExtra:unicodePath('editable.txt','editable.txt'),centralExtra:unicodePath('editable.txt','editable.txt')},{deflate:true},{deflate:true,descriptor:true},{localExtra:extraField(0x5455,Buffer.from([1,0,0,0,0])),centralExtra:extraField(0x5455,Buffer.from([1,0,0,0,0]))}]){const f=await archiveFixture(t,variantZip('editable.txt','editable.txt',options));await stage(f.config,{clientId,revision:f.revision});assert.deepEqual(Buffer.from((await read(f.config,{clientId,revision:f.revision,path:'download.zip'})).bytes),await readFile(join(f.source,'download.zip')));}
});
test('unknown/link extras, malformed metadata and unindexed hidden local records are refused',async t=>{
 const hidden=variantZip('.env','.env'),centralOffset=hidden.readUInt32LE(hidden.length-6),localOnly=hidden.subarray(0,centralOffset);
 for(const options of [{localExtra:extraField(0x756e,Buffer.from('possible symlink metadata'))},{centralExtra:extraField(0x0001,Buffer.alloc(16))},{localExtra:Buffer.from([0x75,0x70,0xff])},{prefix:localOnly},{localExtra:Buffer.concat([unicodePath('editable.txt','editable.txt'),unicodePath('editable.txt','editable.txt')])}]){const f=await archiveFixture(t,variantZip('editable.txt','editable.txt',options));await assert.rejects(stage(f.config,{clientId,revision:f.revision}),/archive|Archive/);}
});

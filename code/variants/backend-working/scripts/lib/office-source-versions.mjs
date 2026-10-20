import {readFile,open,lstat,realpath,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,relative,isAbsolute,resolve,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {readPilotSources} from './office-client-pilot.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,sha=/^[a-f0-9]{64}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const inside=(root,path)=>{const r=relative(root,path);return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const cleanPath=path=>typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&!path.includes('\0');
function clientPath(config,path){
 if(!cleanPath(path))throw Error('Source paths must be canonical absolute paths without traversal.');
 const clientRoot=join(config.storage.recordsRoot,'clients',config.clientId);
 if(inside(config.storage.recordsRoot,path)&&path!==clientRoot&&!inside(clientRoot,path))throw Error('Source path belongs outside the selected client storage namespace.');
 return path;
}
async function noSymlinks(path,{file=false}={}){
 if(!cleanPath(path)||await realpath(path)!==path)throw Error('Source or parent symlinks are forbidden.');
 const stat=await lstat(path);if(stat.isSymbolicLink()||(file?!stat.isFile():!stat.isDirectory()))throw Error(file?'Source must be a regular file.':'Source root must be a real directory.');return stat;
}
function checkedSize(bytes,max){if(!Number.isSafeInteger(bytes)||bytes<0||bytes>max)throw Error('Declared source size is invalid or exceeds its limit.');}
function checkedText(value,name){if(typeof value!=='string'||!value.trim()||value.length>500)throw Error('A bounded '+name+' is required.');return value;}
async function configuration(config){
 if(!config||!uuid.test(config.clientId??'')||!config.storage||!cleanPath(config.storage.recordsRoot))throw Error('An explicit client ID and canonical storage configuration are required.');
 await ensureStore(config.storage,{create:false});
 if(!Array.isArray(config.roots)||!config.roots.length)throw Error('Explicit client-bound input roots are required.');
 const roots=[];
 for(const binding of config.roots){if(binding.clientId!==config.clientId)throw Error('Input root is bound to another client.');clientPath(config,binding.path);if(binding.path===config.storage.recordsRoot||binding.path===resolve(binding.path,'..'))throw Error('An unscoped input root is forbidden.');await noSymlinks(binding.path);if(!roots.includes(binding.path))roots.push(binding.path);}
 const maxSourceBytes=config.maxSourceBytes??16*1024*1024,maxTotalBytes=config.maxTotalBytes??256*1024*1024;
 if(!Number.isSafeInteger(maxSourceBytes)||maxSourceBytes<1||maxSourceBytes>256*1024*1024||!Number.isSafeInteger(maxTotalBytes)||maxTotalBytes<maxSourceBytes||maxTotalBytes>1024*1024*1024)throw Error('Source staging limits are invalid.');
 return {roots,maxSourceBytes,maxTotalBytes};
}
function allowed(config,path,roots){clientPath(config,path);if(!roots.some(r=>inside(r,path)))throw Error('Input is outside its explicitly registered client roots.');return path;}
async function readExact(config,path,expected,limits){
 allowed(config,path,limits.roots);checkedSize(expected.bytes,limits.maxSourceBytes);if(!sha.test(expected.sha256??''))throw Error('An exact source SHA256 is required.');
 await noSymlinks(path,{file:true});const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await file.stat();if(!stat.isFile()||stat.size!==expected.bytes)throw Error('Source size changed before staging.');const bytes=await file.readFile();if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Source bytes changed from the explicitly requested version.');await noSymlinks(path,{file:true});return bytes;}finally{await file.close();}
}
function snapshotPath(config,digest,name){if(!name||name==='.'||name==='..'||name.includes('/')||name.includes('\0'))throw Error('Invalid snapshot filename.');return join(config.storage.recordsRoot,'clients',config.clientId,'sources','objects',digest,name);}
function record(config,source){
 if(!source||source.clientId!==undefined&&source.clientId!==config.clientId||!sha.test(source.sha256??'')||source.id!=='src-'+source.sha256.slice(0,16))throw Error('Invalid source identity or content hash.');
 checkedSize(source.bytes,Number.MAX_SAFE_INTEGER);clientPath(config,source.canonical_path);checkedText(source.family,'source family');checkedText(source.status,'source status');
 if(source.snapshot_path){clientPath(config,source.snapshot_path);if(source.snapshot_path!==snapshotPath(config,source.sha256,basename(source.snapshot_path)))throw Error('Old source snapshot is outside its client content-addressed object.');}
 const plain={...source};delete plain.canonical_aliases;return plain;
}
function expandRecords(config,sources){
 if(!Array.isArray(sources))throw Error('Old source records are unavailable.');const records=[],paths=new Set(),ids=new Map();
 for(const source of sources){if(source.canonical_aliases!==undefined&&!Array.isArray(source.canonical_aliases))throw Error('Canonical aliases must be explicit source records.');for(const value of [source,...(source.canonical_aliases??[])]){
  const r=record(config,value);if(paths.has(r.canonical_path))throw Error('Canonical source identity is duplicated.');paths.add(r.canonical_path);
  if(ids.has(r.id)&&ids.get(r.id)!==r.sha256)throw Error('Source ID collision has differing full content hashes.');ids.set(r.id,r.sha256);records.push(r);
 }
 }return {records,uniqueIds:ids.size};
}
function uniqueRecords(records){
 const ids=new Map();for(const r of records){const old=ids.get(r.id);if(old){if(old.sha256!==r.sha256||old.bytes!==r.bytes)throw Error('Source ID collision has differing hash or size.');old.canonical_aliases??=[];old.canonical_aliases.push(r);}else ids.set(r.id,{...r});}return [...ids.values()];
}
async function immutablePut(config,path,bytes){
 const rel=relative(config.storage.recordsRoot,path);if(!inside(config.storage.recordsRoot,path))throw Error('Immutable output escaped storage.');const safe=await officeStorePath(config.storage.recordsRoot,rel,true);
 let file;try{file=await open(safe,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
 if(file){try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
 await noSymlinks(safe,{file:true});const reread=await readFile(safe);if(!reread.equals(bytes))throw Error('Immutable source/version collision; existing bytes were preserved.');
 // Flush newly created object/version directory entries as well as file data.
 // This is portable to the actual ExFAT archive; no hard links are required.
 let parent=dirname(safe);for(;;){const directory=await open(parent,'r');try{await directory.sync();}finally{await directory.close();}if(parent===config.storage.recordsRoot)break;if(!inside(config.storage.recordsRoot,parent))throw Error('Immutable parent escaped storage.');parent=dirname(parent);}
 return safe;
}
function checkInputClient(input,config){if(input.clientId!==config.clientId)throw Error('Explicit input belongs to another client.');if(!['add','refresh'].includes(input.mode))throw Error('Each input must explicitly add or refresh a source.');}
async function pointerBytes(config){return readFile(await officeStorePath(config.storage.recordsRoot,`clients/${config.clientId}/sources/current.json`));}

/** Additive staging only. No current pointer, database, foundation, allocation or approval is written.
 * Only explicit inputs are read; unselected legacy canonical-file references retain their original fail-closed runtime semantics.
 */
export async function stageOfficeSourceVersion(config,input){
 const limits=await configuration(config);
 if(!input||input.clientId!==config.clientId||!sha.test(input.expectedOldPackSha256??'')||typeof input.createdAt!=='string'||!Number.isFinite(Date.parse(input.createdAt)))throw Error('Explicit matching client, old-pack hash and creation timestamp are required.');
 if(!Array.isArray(input.inputs)||!Array.isArray(input.packets??[])||input.inputs.length+(input.packets??[]).length<1||input.inputs.length+(input.packets??[]).length>2000)throw Error('Provide a bounded explicit source/packet selection.');
 const lockPath=await officeStorePath(config.storage.recordsRoot,`clients/${config.clientId}/sources/staging.lock`),lock=await open(lockPath,'wx',0o600).catch(()=>{throw Error('Another staging operation owns this client.');});
 try{
  const pointerBefore=await pointerBytes(config),old=await readPilotSources(config.storage,config.clientId);if(old.sha256!==input.expectedOldPackSha256)throw Error('The current source pack differs from the expected old hash.');
  if(!Number.isSafeInteger(old.manifest.version)||old.manifest.version<1||!old.manifest.packets||Array.isArray(old.manifest.packets)||typeof old.manifest.packets!=='object')throw Error('Previous version/packet schema is invalid.');
  const oldBytes=await readFile(old.path),expanded=expandRecords(config,old.manifest.sources),records=[...expanded.records],changes=[],objects=new Map(),selectedPaths=new Set(),packetNames=new Set(),packets=structuredClone(old.manifest.packets);let total=0;
  // Entire input set is validated before any immutable object is created.
  for(const item of input.inputs){
   checkInputClient(item,config);const path=allowed(config,item.path,limits.roots),canonical=allowed(config,item.canonicalPath??path,limits.roots);if(selectedPaths.has(canonical))throw Error('An explicit canonical input is selected more than once.');selectedPaths.add(canonical);
   const bytes=await readExact(config,path,item,limits);if(canonical!==path)await readExact(config,canonical,item,limits);total+=bytes.length;if(total>limits.maxTotalBytes)throw Error('Selected source bytes exceed the total staging limit.');
   const index=records.findIndex(s=>s.canonical_path===canonical),prior=index<0?null:records[index];if(item.mode==='add'&&prior)throw Error('Existing canonical sources require explicit refresh.');if(item.mode==='refresh'&&(!prior||item.expectedPreviousSha256!==prior.sha256))throw Error('Refresh does not match the exact previous canonical source.');
   const source={id:'src-'+item.sha256.slice(0,16),family:checkedText(item.family,'source family'),canonical_path:canonical,sha256:item.sha256,bytes:bytes.length,snapshot_path:snapshotPath(config,item.sha256,basename(canonical)),status:checkedText(item.status,'source status')};
   if(prior)records[index]=source;else records.push(source);changes.push({mode:item.mode,canonicalPath:canonical,previous:prior,next:source});objects.set(source.snapshot_path,bytes);
  }
  for(const item of input.packets??[]){
   checkInputClient(item,config);if(typeof item.name!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(item.name)||packetNames.has(item.name))throw Error('Packet names must be safe and unique.');packetNames.add(item.name);
   const prior=Object.hasOwn(packets,item.name)?packets[item.name]:undefined;if(item.mode==='add'&&prior||item.mode==='refresh'&&(!prior||item.expectedPreviousSha256!==prior.sha256))throw Error('Packet add/refresh does not match its exact prior version.');
   const bytes=await readExact(config,item.path,item,limits);total+=bytes.length;if(total>limits.maxTotalBytes)throw Error('Selected source bytes exceed the total staging limit.');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Evidence packets must be valid UTF8 text.');}
   const next={path:snapshotPath(config,item.sha256,basename(item.path)),sha256:item.sha256,characters:text.length,bytes:bytes.length};packets[item.name]=next;objects.set(next.path,bytes);changes.push({packet:item.name,mode:item.mode,previous:prior??null,next});
  }
  const sources=uniqueRecords(records),newManifest={...old.manifest,version:(Number.isSafeInteger(old.manifest.version)?old.manifest.version:1)+1,createdAt:input.createdAt,sources,packets,sourceRecordCount:records.length,uniqueSourceCount:sources.length,previousVersion:{path:old.path,sha256:old.sha256,sourceRecords:expanded.records.length,uniqueSourceIdentities:expanded.uniqueIds},sourceVersionHistory:[...(old.manifest.sourceVersionHistory??[]),{path:old.path,sha256:old.sha256}],sourceChanges:changes,staging:{createdAs:'immutable_staged_candidate',activationManagedSeparately:true,inputRoots:limits.roots,selectedSources:input.inputs.length,selectedPackets:(input.packets??[]).length,selectedBytes:total,legacyCanonicalReferences:records.filter(s=>!s.snapshot_path).length,runtimeCanonicalReferences:sources.filter(s=>!s.snapshot_path).length,aliasDiscovery:'Runtime currently lists the primary name for each content identity; aliases preserve metadata but are not independently searched.'}};
  if(newManifest.clientId!==config.clientId||newManifest.executionMode!=='audit_only'||newManifest.brandApproved!==false||newManifest.paidServicesConfirmed!==false)throw Error('Staging cannot change the existing audit/approval boundary.');
  for(const h of newManifest.sourceVersionHistory)if(!sha.test(h.sha256??'')||h.path!==join(config.storage.recordsRoot,'clients',config.clientId,'sources','versions',h.sha256,'manifest.json'))throw Error('Source version history escaped the client namespace.');
  if(!(await pointerBytes(config)).equals(pointerBefore))throw Error('The active source pointer changed during staging preflight.');
  for(const [path,bytes]of objects)await immutablePut(config,path,bytes);
  const manifestBytes=json(newManifest),digest=hash(manifestBytes),path=join(config.storage.recordsRoot,'clients',config.clientId,'sources','versions',digest,'manifest.json');await immutablePut(config,path,manifestBytes);
  if(!(await pointerBytes(config)).equals(pointerBefore)||hash(await readFile(old.path))!==old.sha256||!oldBytes.equals(await readFile(old.path)))throw Error('Active pointer or previous immutable version changed; no activation was attempted.');
  const receipt={clientId:config.clientId,path,sha256:digest,previousPath:old.path,previousSha256:old.sha256,oldSourceRecords:expanded.records.length,oldUniqueSourceIdentities:expanded.uniqueIds,sourceRecords:records.length,uniqueSourceIdentities:sources.length,selectedSources:input.inputs.length,selectedPackets:(input.packets??[]).length,snapshotObjects:objects.size,activated:false,currentPointerUnchanged:true,legacyCanonicalReferences:newManifest.staging.legacyCanonicalReferences,aliasDiscovery:newManifest.staging.aliasDiscovery};
  await verifyStagedOfficeSourceVersion(config,receipt);return receipt;
 }finally{await lock.close();await unlink(lockPath);}
}

export async function verifyStagedOfficeSourceVersion(config,receipt){
 await configuration(config);if(!receipt||receipt.clientId!==config.clientId||!sha.test(receipt.sha256??'')||receipt.path!==join(config.storage.recordsRoot,'clients',config.clientId,'sources','versions',receipt.sha256,'manifest.json'))throw Error('Staged receipt is outside this client version namespace.');
 const path=await officeStorePath(config.storage.recordsRoot,relative(config.storage.recordsRoot,receipt.path));await noSymlinks(path,{file:true});const bytes=await readFile(path);if(hash(bytes)!==receipt.sha256)throw Error('Staged manifest readback hash differs.');const manifest=JSON.parse(bytes);if(manifest.clientId!==config.clientId||manifest.executionMode!=='audit_only'||manifest.brandApproved!==false||manifest.paidServicesConfirmed!==false)throw Error('Staged audit scope differs.');
 if(!manifest.packets||Array.isArray(manifest.packets)||typeof manifest.packets!=='object'||!Array.isArray(manifest.sourceChanges)||!Array.isArray(manifest.sourceVersionHistory))throw Error('Staged packet/history schema differs.');
 const expanded=expandRecords(config,manifest.sources);if(expanded.uniqueIds!==manifest.sources.length||expanded.records.length!==manifest.sourceRecordCount)throw Error('Staged source identities are not unique or aliases were lost.');
 for(const h of [manifest.previousVersion,...(manifest.sourceVersionHistory??[])])if(!h||!sha.test(h.sha256??'')||h.path!==join(config.storage.recordsRoot,'clients',config.clientId,'sources','versions',h.sha256,'manifest.json'))throw Error('Staged history escaped its client version namespace.');
 const snapshots=new Map(),expectSnapshot=(path,expected)=>{const prior=snapshots.get(path);if(prior&&(prior.sha256!==expected.sha256||prior.bytes!==undefined&&expected.bytes!==undefined&&prior.bytes!==expected.bytes))throw Error('Conflicting immutable snapshot reference metadata.');snapshots.set(path,{sha256:expected.sha256,bytes:expected.bytes??prior?.bytes});};
 // Immutable inherited objects remain part of this version's evidence. Only
 // unselected legacy canonical references retain deferred runtime validation.
 for(const source of expanded.records)if(source.snapshot_path)expectSnapshot(source.snapshot_path,{sha256:source.sha256,bytes:source.bytes});
 for(const change of manifest.sourceChanges??[])if(change.next?.snapshot_path){const r=record(config,change.next),member=expanded.records.find(s=>s.canonical_path===r.canonical_path);if(!member||member.sha256!==r.sha256||member.snapshot_path!==r.snapshot_path||member.bytes!==r.bytes)throw Error('Staged change is not a member of this source version.');expectSnapshot(r.snapshot_path,{sha256:r.sha256,bytes:r.bytes});}
 for(const packet of Object.values(manifest.packets)){if(!sha.test(packet.sha256??'')||packet.path!==snapshotPath(config,packet.sha256,basename(packet.path)))throw Error('Staged packet escaped its scoped object.');expectSnapshot(packet.path,{sha256:packet.sha256,bytes:packet.bytes});}
 for(const [p,expected]of snapshots){await officeStorePath(config.storage.recordsRoot,relative(config.storage.recordsRoot,p));await noSymlinks(p,{file:true});const b=await readFile(p);if(hash(b)!==expected.sha256||expected.bytes!==undefined&&b.length!==expected.bytes)throw Error('Immutable staged snapshot changed.');}
 return {clientId:config.clientId,path,sha256:receipt.sha256,uniqueSourceIdentities:manifest.sources.length,sourceRecords:expanded.records.length,verifiedSnapshotObjects:snapshots.size,activationAssessed:false};
}

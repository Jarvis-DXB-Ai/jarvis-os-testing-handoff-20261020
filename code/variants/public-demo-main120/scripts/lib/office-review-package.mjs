/** Private, server-owned review snapshots. No HTTP, auth, publication or current pointer. */
import {open,lstat,realpath,mkdir,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';

const MAX_FILE=64*1024*1024,MAX_TOTAL=256*1024*1024,MAX_MANIFEST=2*1024*1024;
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const fail=m=>{throw Error(m);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,digest=/^[a-f0-9]{64}$/;
const types={'.html':['text/html'],'.css':['text/css'],'.js':['text/javascript','application/javascript'],'.json':['application/json'],'.txt':['text/plain'],'.md':['text/markdown','text/plain','application/octet-stream'],'.png':['image/png'],'.jpg':['image/jpeg'],'.jpeg':['image/jpeg'],'.webp':['image/webp'],'.woff2':['font/woff2'],'.woff':['font/woff'],'.ttf':['font/ttf'],'.zip':['application/zip'],'.pptx':['application/vnd.openxmlformats-officedocument.presentationml.presentation'],'.pdf':['application/pdf']};
const forbidden=/^(?:private|secrets?|credentials?|node_modules|src|scripts|\.git|__macosx)$/i;
function path(value){
 if(typeof value!=='string'||!value.length||value.length>512||value.split('/').length>32||value!==value.normalize('NFC')||!value.split('/').every(p=>p.length<=160&&/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(p)&&!p.endsWith('.')&&!p.endsWith(' ')&&!forbidden.test(p))||/[\\%?#:\x00-\x1f\x7f]/.test(value))fail('Invalid review artifact path.');
 const leaf=value.split('/').at(-1);
 if(/(?:secret|credential|runtime-key|webhook|^config\.|^package(?:-lock)?\.json$|^tsconfig\.|^wrangler\.|^AGENTS\.md$|^SKILL\.md$)/i.test(leaf)||['package-manifest.json','provenance.json'].includes(value))fail('Private or reserved artifact path.');
 return value;
}
const extension=p=>p.slice(p.lastIndexOf('.')).toLowerCase();
function registration(config,clientId,revision){
 if(!uuid.test(clientId??'')||!digest.test(revision??'')||!Array.isArray(config?.packages)||config.packages.length>64)fail('Unregistered review package.');
 const matches=config.packages.filter(p=>p?.clientId===clientId&&p.manifestSha256===revision);
 if(matches.length!==1)fail('Unregistered review package.');
 const p=matches[0];if(typeof p.packageRoot!=='string'||p.packageRoot.length>4096||!isAbsolute(p.packageRoot)||resolve(p.packageRoot)!==p.packageRoot)fail('Invalid trusted package root.');
 return {clientId,revision,packageRoot:p.packageRoot};
}
async function directDirectory(directory){const s=await lstat(directory);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(directory)!==resolve(directory))fail('Review directory is not direct.');}
async function readBounded(root,relative,maxBytes,expected){
 const target=await officeStorePath(root,relative);if(await realpath(root)!==resolve(root))fail('Review root changed.');
 const h=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await h.stat();if(!before.isFile()||before.size>maxBytes||expected&&before.size!==expected.bytes)fail('Review file size or type differs.');
  const chunks=[];let size=0;
  while(true){const b=Buffer.alloc(Math.min(65536,maxBytes-size+1)),{bytesRead}=await h.read(b,0,b.length,null);if(!bytesRead)break;size+=bytesRead;if(size>maxBytes)fail('Review file exceeds byte limit.');chunks.push(b.subarray(0,bytesRead));}
  const value=Buffer.concat(chunks),after=await h.stat(),current=await lstat(target);
  if(!current.isFile()||current.isSymbolicLink()||before.dev!==current.dev||before.ino!==current.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||await realpath(target)!==join(root,relative)||expected&&(value.length!==expected.bytes||sha(value)!==expected.sha256))fail('Review file changed or hash differs.');
  return value;
 }finally{await h.close();}
}
function inventory(raw,clientId,revision){
 if(raw.length>MAX_MANIFEST||sha(raw)!==revision)fail('Exact package manifest hash differs.');
 let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('Invalid package manifest JSON.');}
 if(!manifest||typeof manifest.schema!=='string'||manifest.schema.length>160||typeof manifest.revision!=='string'||manifest.revision.length>160||manifest.clientId!==undefined&&manifest.clientId!==clientId||!Array.isArray(manifest.artifacts)||!manifest.artifacts.length||manifest.artifacts.length>4096)fail('Invalid scoped package manifest.');
 const files=[],seen=new Set();let totalBytes=0;
 for(const f of manifest.artifacts){
  const name=path(f?.path),ext=extension(name);if(seen.has(name.toLowerCase()))fail('Duplicate review path.');seen.add(name.toLowerCase());
  if(!digest.test(f.sha256??'')||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>MAX_FILE||!types[ext]?.includes(f.mime))fail('Invalid artifact hash, size or MIME.');
  totalBytes+=f.bytes;if(totalBytes>MAX_TOTAL)fail('Package exceeds total byte limit.');files.push({path:name,bytes:f.bytes,sha256:f.sha256,mime:f.mime});
 }
 if(totalBytes+raw.length+16384>MAX_TOTAL)fail('Package and metadata exceed total byte limit.');
 const entry=path(manifest.entry);if(!files.some(f=>f.path===entry&&f.mime==='text/html'))fail('Registered HTML entry unavailable.');
 return {files,entry,totalBytes,packageRevision:manifest.revision};
}
function crc32(value){let c=0xffffffff;for(const byte of value){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function archiveName(name,ext){
 if(!name.length||name.length>512||!/^[\x20-\x7e]+$/.test(name)||/[\\%?#:]/.test(name)||name.startsWith('/')||name.endsWith(' ')||name.split('/').filter((p,i,a)=>p!==''||i!==a.length-1).some(p=>!p||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' ')||p.startsWith('.')&&!(ext==='.pptx'&&p==='.rels')||forbidden.test(p)||/secret|credential|runtime-key|webhook/i.test(p))||/\.(?:ps1|ps|sh|bash|zsh|exe|dll|dylib|command|bat|cmd|py)$/i.test(name))fail('Private or unsafe archive member.');
}
function archiveExtras(value,name){
 // Unknown fields may encode alternate names, links, encryption or ZIP64.
 // Permit only bounded, understood metadata; Unicode paths must be identical.
 const seen=new Set();let cursor=0;
 while(cursor<value.length){
  if(cursor+4>value.length)fail('Malformed archive extra field.');const id=value.readUInt16LE(cursor),size=value.readUInt16LE(cursor+2);cursor+=4;if(cursor+size>value.length||seen.has(id))fail('Malformed or duplicate archive extra field.');seen.add(id);const field=value.subarray(cursor,cursor+size);cursor+=size;
  if(id===0x7075){if(size<5||field[0]!==1||field.readUInt32LE(1)!==crc32(name)||!field.subarray(5).equals(name))fail('Archive effective filename differs.');}
  else if(id===0x5455){if(![5,9,13].includes(size)||field[0]&~7)fail('Invalid archive timestamp field.');}
  else if(id===0x000a){if(size!==32||field.readUInt32LE(0)!==0||field.readUInt16LE(4)!==1||field.readUInt16LE(6)!==24)fail('Invalid archive NTFS timestamp field.');}
  else if(id===0x7875){const uid=field[1],gid=field[2+uid];if(size<5||field[0]!==1||uid<1||uid>8||gid<1||gid>8||size!==3+uid+gid)fail('Invalid archive owner metadata.');}
  else if(id===0x5855){if(![8,12].includes(size))fail('Invalid archive Unix timestamp field.');}
  else if(id===0x7855){if(![0,4].includes(size))fail('Invalid archive Unix owner field.');}
  else fail('Unsupported archive extra field.');
 }
}
function validateArchive(value,ext){
 if(value.length<22||![0x04034b50,0x06054b50].includes(value.readUInt32LE(0)))fail('Artifact archive MIME differs.');
 let end=-1;for(let i=value.length-22;i>=Math.max(0,value.length-65557);i--)if(value.readUInt32LE(i)===0x06054b50&&i+22+value.readUInt16LE(i+20)===value.length){end=i;break;}
 if(end<0||value.readUInt16LE(end+4)||value.readUInt16LE(end+6)||value.readUInt16LE(end+8)!==value.readUInt16LE(end+10))fail('Unsupported artifact archive.');
 const count=value.readUInt16LE(end+10),length=value.readUInt32LE(end+12),offset=value.readUInt32LE(end+16);if(count>4096||offset+length!==end)fail('Unbounded artifact archive.');
 const ranges=[],names=new Set();let cursor=offset,expanded=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||value.readUInt32LE(cursor)!==0x02014b50)fail('Invalid artifact archive directory.');
  const needed=value.readUInt16LE(cursor+6),flags=value.readUInt16LE(cursor+8),method=value.readUInt16LE(cursor+10),crc=value.readUInt32LE(cursor+16),compressed=value.readUInt32LE(cursor+20),size=value.readUInt32LE(cursor+24),nameLength=value.readUInt16LE(cursor+28),extra=value.readUInt16LE(cursor+30),comment=value.readUInt16LE(cursor+32),disk=value.readUInt16LE(cursor+34),mode=value.readUInt32LE(cursor+38)>>>16,local=value.readUInt32LE(cursor+42);
  const next=cursor+46+nameLength+extra+comment;
  if(next>end||needed>20||![0,8].includes(method)||flags&~(method===8?0x080e:0x0808)||disk||size>MAX_FILE||compressed>MAX_FILE||![0,0x4000,0x8000].includes(mode&0xf000))fail('Unsafe artifact archive entry.');
  const nameBytes=value.subarray(cursor+46,cursor+46+nameLength),name=nameBytes.toString('utf8');archiveName(name,ext);if(names.has(name.toLowerCase()))fail('Duplicate archive member.');names.add(name.toLowerCase());
  archiveExtras(value.subarray(cursor+46+nameLength,cursor+46+nameLength+extra),nameBytes);
  if((mode&0xf000)===0x4000&&!name.endsWith('/')||name.endsWith('/')&&size!==0||local+30>offset||value.readUInt32LE(local)!==0x04034b50)fail('Invalid local archive entry.');
  const localNameLength=value.readUInt16LE(local+26),localExtraLength=value.readUInt16LE(local+28),data=local+30+localNameLength+localExtraLength,dataEnd=data+compressed;
  if(dataEnd>offset||value.readUInt16LE(local+4)!==needed||value.readUInt16LE(local+6)!==flags||value.readUInt16LE(local+8)!==method||!value.subarray(local+30,local+30+localNameLength).equals(nameBytes))fail('Archive local and central filename or structure differs.');
  archiveExtras(value.subarray(local+30+localNameLength,data),nameBytes);
  const localCrc=value.readUInt32LE(local+14),localCompressed=value.readUInt32LE(local+18),localSize=value.readUInt32LE(local+22);
  let recordEnd=dataEnd;
  if(flags&8){
   if((localCrc!==0&&localCrc!==crc)||(localCompressed!==0&&localCompressed!==compressed)||(localSize!==0&&localSize!==size)||dataEnd+12>offset)fail('Invalid archive streaming sizes.');
   let descriptor=dataEnd;if(value.readUInt32LE(descriptor)===0x08074b50)descriptor+=4;
   if(descriptor+12>offset||value.readUInt32LE(descriptor)!==crc||value.readUInt32LE(descriptor+4)!==compressed||value.readUInt32LE(descriptor+8)!==size)fail('Invalid archive data descriptor.');recordEnd=descriptor+12;
  }else if(localCrc!==crc||localCompressed!==compressed||localSize!==size)fail('Archive local and central sizes differ.');
  if(method===0&&compressed!==size)fail('Stored archive sizes differ.');
  ranges.push({start:local,end:recordEnd});expanded+=size;if(expanded>MAX_TOTAL)fail('Expanded artifact archive too large.');cursor=next;
 }
 if(cursor!==end)fail('Artifact archive directory differs.');
 // Stream readers use local records; no orphan, hidden, overlapping or prefixed
 // records may exist outside the directory's exact contiguous coverage.
 let covered=0;for(const range of ranges.sort((a,b)=>a.start-b.start)){if(range.start!==covered)fail('Archive has hidden or overlapping local entries.');covered=range.end;}
 if(covered!==offset)fail('Archive local record coverage differs.');
 if(ext==='.pptx'&&!['[content_types].xml','_rels/.rels','ppt/presentation.xml'].every(p=>names.has(p)))fail('Presentation archive structure is unavailable.');
}

function mimeBytes(file,value){
 const ext=extension(file.path),prefix=n=>value.subarray(0,n).toString('hex');
 if(ext==='.png'&&prefix(8)!=='89504e470d0a1a0a'||['.jpg','.jpeg'].includes(ext)&&prefix(3)!=='ffd8ff'||ext==='.webp'&&(value.subarray(0,4).toString()!=='RIFF'||value.subarray(8,12).toString()!=='WEBP')||ext==='.woff2'&&value.subarray(0,4).toString()!=='wOF2'||ext==='.woff'&&value.subarray(0,4).toString()!=='wOFF'||ext==='.ttf'&&!['00010000','4f54544f','74727565'].includes(prefix(4))||ext==='.pdf'&&value.subarray(0,5).toString()!=='%PDF-')fail('Artifact content does not match MIME.');
 if(['.zip','.pptx'].includes(ext))validateArchive(value,ext);
 return value;
}
const base=r=>'review-packages/'+r.clientId+'/'+r.revision;
async function createPath(root,name){
 // Existing archive helper safely checks every ancestor, but an independent
 // creator can win its mkdir. Retry only that bounded EEXIST race and recheck.
 for(let i=0;i<64;i++){try{return await officeStorePath(root,name,true);}catch(e){if(e.code!=='EEXIST')throw e;}}
 fail('Review path creation remained busy.');
}
const provenance=(r,raw,inv)=>({version:1,clientId:r.clientId,revision:r.revision,sourceRoot:r.packageRoot,sourceManifest:{path:'package-manifest.json',sha256:r.revision,bytes:raw.length},entry:inv.entry,packageRevision:inv.packageRevision,fileCount:inv.files.length,totalBytes:inv.totalBytes});
async function snapshot(config,r){
 await ensureStore(config.storage,{create:false});const root=await officeStorePath(config.storage.recordsRoot,base(r));await directDirectory(root);
 const raw=await readBounded(root,'package-manifest.json',MAX_MANIFEST),inv=inventory(raw,r.clientId,r.revision),expected=Buffer.from(canonical(provenance(r,raw,inv))+'\n');
 const actual=await readBounded(root,'provenance.json',16384);if(!actual.equals(expected))fail('Review provenance differs.');
 return {root,inv,proof:provenance(r,raw,inv)};
}
async function writeNew(root,name,value){
 const target=await createPath(root,name),h=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{if(await realpath(root)!==resolve(root)||await realpath(target)!==join(root,name))fail('Snapshot write root changed.');await h.writeFile(value);await h.sync();}finally{await h.close();}
 const copied=await readBounded(root,name,value.length);if(!copied.equals(value))fail('Snapshot copy readback differs.');
}
async function syncTree(root,files){
 const directories=new Set([root]);for(const f of files){for(let d=dirname(join(root,f));;d=dirname(d)){directories.add(d);if(d===root)break;}}
 for(const d of [...directories].sort((a,b)=>b.length-a.length)){const h=await open(d,'r');try{await h.sync();}finally{await h.close();}}
}
/** Stage only a registered trusted package; no activation or mutable current pointer. */
export async function stageOfficeReviewPackage(config,{clientId,revision}){
 const r=registration(config,clientId,revision);await ensureStore(config.storage);await directDirectory(r.packageRoot);
 const raw=await readBounded(r.packageRoot,'package-manifest.json',MAX_MANIFEST),inv=inventory(raw,clientId,revision);
 const target=await createPath(config.storage.recordsRoot,base(r));let exists=false;
 try{await lstat(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(exists){const saved=await snapshot(config,r);for(const f of saved.inv.files){mimeBytes(f,await readBounded(r.packageRoot,f.path,MAX_FILE,f));mimeBytes(f,await readBounded(saved.root,'files/'+f.path,MAX_FILE,f));}return {...saved.proof,reused:true};}
 const parent=dirname(target);await mkdir(parent,{recursive:true,mode:0o700});const temporary=join(parent,'.staging-'+randomUUID());await mkdir(temporary,{mode:0o700});
 try{
  for(const f of inv.files){const value=mimeBytes(f,await readBounded(r.packageRoot,f.path,MAX_FILE,f));await writeNew(temporary,'files/'+f.path,value);}
  const latest=await readBounded(r.packageRoot,'package-manifest.json',MAX_MANIFEST);if(!latest.equals(raw))fail('Source manifest changed during staging.');
  await writeNew(temporary,'package-manifest.json',raw);await writeNew(temporary,'provenance.json',Buffer.from(canonical(provenance(r,raw,inv))+'\n'));
  await syncTree(temporary,['package-manifest.json','provenance.json',...inv.files.map(f=>'files/'+f.path)]);
  await officeStorePath(config.storage.recordsRoot,base(r));
  let reused=false;try{await rename(temporary,target);}catch(e){if(!['EEXIST','ENOTEMPTY'].includes(e.code))throw e;reused=true;}
  const h=await open(parent,'r');try{await h.sync();}finally{await h.close();}
  const saved=await snapshot(config,r);for(const f of saved.inv.files)mimeBytes(f,await readBounded(saved.root,'files/'+f.path,MAX_FILE,f));
  return {...saved.proof,reused};
 }finally{await rm(temporary,{recursive:true,force:true});}
}
/** Verified complete buffer only; callers own authentication, headers and HTML sandbox/CSP. */
export async function readOfficeReviewPackageFile(config,{clientId,revision,path:relativePath}){
 const r=registration(config,clientId,revision),name=path(relativePath),saved=await snapshot(config,r),file=saved.inv.files.find(f=>f.path===name);if(!file)fail('Review artifact is not registered.');
 const bytes=mimeBytes(file,await readBounded(saved.root,'files/'+name,MAX_FILE,file));
 return {clientId,revision,path:name,mime:file.mime,sha256:file.sha256,size:bytes.length,bytes:new Uint8Array(bytes),download:['.zip','.pptx','.pdf'].includes(extension(name))};
}

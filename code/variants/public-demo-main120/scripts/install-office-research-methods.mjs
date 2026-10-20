import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ensureStore,officeStorePath} from './lib/office-archive.mjs';
import {skillReadiness} from './lib/office-skill-library.mjs';
const root=new URL('../',import.meta.url),plan=JSON.parse(await readFile(new URL('src/lib/office-stack-plan.json',root),'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
await ensureStore(plan.storage,{create:false});
const methods=plan.skillLibrary.filter(s=>s.path.startsWith('skills/research-methods/'));
// Preflight the whole set before copying. Never overwrite a modified installed pack.
for(const method of methods)for(const [path,sha256] of Object.entries(method.fileHashes)){
 const source=await readFile(new URL(method.path+'/'+path,root));if(hash(source)!==sha256)throw new Error('Source method changed: '+method.id);
 const target=await officeStorePath(plan.storage.recordsRoot,'library/skills/'+method.id+'/'+path,true);
  let installed;try{installed=hash(await readFile(target));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(installed&&installed!==sha256){
   if(!method.previousRef||installed!==method.previousFileHashes?.[path])throw new Error('Installed method changed; reconcile before updating: '+method.id);
   const previous=JSON.parse(await readFile(await officeStorePath(plan.storage.recordsRoot,'library/skill-revisions/'+method.id+'/'+method.previousRef+'/metadata.json'),'utf8'));
   if(previous.ref!==method.previousRef||previous.fileHashes[path]!==installed)throw new Error('Previous reviewed method is unavailable.');
  }
}
for(const method of methods){
 for(const [path,sha256] of Object.entries(method.fileHashes)){
  const target=await officeStorePath(plan.storage.recordsRoot,'library/skills/'+method.id+'/'+path,true),bytes=await readFile(new URL(method.path+'/'+path,root));
  try{await writeFile(target,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;
   const prior=await readFile(target);if(hash(prior)!==sha256){
    if(hash(prior)!==method.previousFileHashes?.[path])throw new Error('Installed method changed after preflight.');
    const backup=await officeStorePath(plan.storage.recordsRoot,'library/skill-revisions/'+method.id+'/'+method.previousRef+'/files/'+path,true);
    try{await writeFile(backup,prior,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;if(hash(await readFile(backup))!==hash(prior))throw new Error('Prior method backup differs.');}
    const temp=target+'.reviewed.tmp';await writeFile(temp,bytes,{mode:0o600});await rename(temp,target);
   }
  }
  if(hash(await readFile(target))!==sha256)throw new Error('Method readback differs: '+method.id);
 }
 const version=await officeStorePath(plan.storage.recordsRoot,'library/skill-revisions/'+method.id+'/'+method.ref+'/metadata.json',true);await mkdir(join(version,'..'),{recursive:true});await writeFile(version,JSON.stringify(method,null,2)+'\n');
}
const ready=await skillReadiness(methods,join(plan.storage.recordsRoot,'library/skills'));if(ready.some(s=>!s.installed))throw new Error('Installed methods failed integrity.');
console.log(JSON.stringify({installed:ready.map(s=>s.id),integrity:'verified',note:'No upstream runtime or provider connection installed; behavioral efficacy needs live task review.'},null,2));

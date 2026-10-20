import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ensureStore,officeStorePath} from './lib/office-archive.mjs';
import {skillReadiness} from './lib/office-skill-library.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const revision='2026-10-15';
const additions=new Set(['entry-2026-10-15-owner-architecture.md','references/owner-architecture-2026-10-15.md']);
async function existingHash(path){try{return hash(await readFile(path));}catch(error){if(error.code==='ENOENT')return null;throw error;}}

// Add versioned guidance only. Old entries, private-release references and
// installed local edits must survive; the application registry is not written.
export async function installOwnerMethods(plan,repositoryRoot,{apply=false}={}){
 await ensureStore(plan.storage,{create:false});
 const methods=plan.skillLibrary.filter(s=>s.ownerArchitectureRevision===revision);
 if(!methods.length)throw new Error('No reviewed owner methods selected.');
 const writes=[];
 for(const method of methods){
  if(!/^office-[a-z0-9-]+$/.test(method.id)||method.path!==`skills/agent-roles/${method.id}`)throw new Error('Invalid owner method scope.');
  for(const [relative,expected] of Object.entries(method.fileHashes)){
   if(!/^[a-zA-Z0-9/_-]+\.md$/.test(relative)||relative.includes('..'))throw new Error('Invalid owner reference path.');
   const bytes=await readFile(join(repositoryRoot,method.path,relative));
   if(hash(bytes)!==expected)throw new Error('Source method changed: '+method.id+'/'+relative);
   const target=await officeStorePath(plan.storage.recordsRoot,`library/skills/${method.id}/${relative}`);
   const installed=await existingHash(target);
   if(installed&&installed!==expected)throw new Error('Installed method changed; reconcile before updating: '+method.id+'/'+relative);
   if(!installed){if(!additions.has(relative))throw new Error('Existing method is incomplete: '+method.id+'/'+relative);writes.push({relative:`library/skills/${method.id}/${relative}`,bytes});}
  }
  const relative=`library/skill-revisions/${method.id}/${method.ref}/metadata.json`,bytes=Buffer.from(JSON.stringify(method,null,2)+'\n');
  const target=await officeStorePath(plan.storage.recordsRoot,relative),installed=await existingHash(target);
  if(installed&&installed!==hash(bytes))throw new Error('Revision metadata differs: '+method.id);
  if(!installed)writes.push({relative,bytes});
 }
 if(apply){
  for(const write of writes){
   const target=await officeStorePath(plan.storage.recordsRoot,write.relative,true);
   try{await writeFile(target,write.bytes,{flag:'wx',mode:0o600});}
   catch(error){if(error.code!=='EEXIST'||await existingHash(target)!==hash(write.bytes))throw error;}
   if(await existingHash(target)!==hash(write.bytes))throw new Error('Installed readback differs.');
  }
  if((await skillReadiness(methods,join(plan.storage.recordsRoot,'library/skills'))).some(s=>!s.installed))throw new Error('Owner method integrity failed.');
 }
 return {mode:apply?'installed':'preflight',methods:methods.length,newFiles:writes.length,legacyFilesOverwritten:0,behavioralQuality:'not assessed',privateReleaseChanged:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const plan=JSON.parse(await readFile(join(root,'src/lib/office-stack-plan.json'),'utf8'));
 console.log(JSON.stringify(await installOwnerMethods(plan,root,{apply:process.argv.includes('--apply')}),null,2));
}

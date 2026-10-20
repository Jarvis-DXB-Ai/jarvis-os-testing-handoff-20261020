import {readFile,writeFile,rename,lstat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {officeBrainStructure} from '../../src/lib/office-brain-policy.mjs';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
export const brainStructureRevision=digest(officeBrainStructure);
export async function readBrainStructure(config){
 await ensureStore(config,{create:false});
 let pointer;try{pointer=JSON.parse(await readFile(await officeStorePath(config.recordsRoot,'knowledge/structure/current.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!/^[a-f0-9]{64}$/.test(pointer.revision??''))throw new Error('Invalid Brain structure pointer.');
 const record=JSON.parse(await readFile(await officeStorePath(config.recordsRoot,`knowledge/structure/versions/${pointer.revision}.json`),'utf8')),{revision,...body}=record;
 if(revision!==pointer.revision||digest(body)!==revision||digest(record.structure)!==record.structureRevision)throw new Error('Brain structure integrity failed.');
 return {...record,matchesCurrent:record.structureRevision===brainStructureRevision};
}
export async function initialiseBrainStructure(config){
 await ensureStore(config);
 const old=await readBrainStructure(config);if(old?.matchesCurrent)return old;
 for(const section of officeBrainStructure.storage){const path=section.location.split('/<')[0].replace(/\/$/,'');await officeStorePath(config.recordsRoot,path+'/placeholder',true);}
 const body={structure:officeBrainStructure,structureRevision:brainStructureRevision,installedAt:new Date().toISOString()},record={...body,revision:digest(body)};
 const path=await officeStorePath(config.recordsRoot,`knowledge/structure/versions/${record.revision}.json`,true);
 await writeFile(path,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 const current=await officeStorePath(config.recordsRoot,'knowledge/structure/current.json',true),temp=current+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify({revision:record.revision})+'\n',{mode:0o600});await rename(temp,current);return {...record,matchesCurrent:true};
}
export async function brainStorageLocations(config){
 await ensureStore(config,{create:false});
 return Promise.all(officeBrainStructure.storage.map(async section=>{const relative=section.location.split('/<')[0].replace(/\/$/,'');let available=false;try{available=(await lstat(await officeStorePath(config.recordsRoot,relative))).isDirectory();}catch(e){if(e.code!=='ENOENT')throw e;}return {id:section.id,available};}));
}
export async function savedFeedbackTasks(config,jobs,clientId=null){
 const rows=[];
 for(const job of jobs){if((job.knowledgeContext?.scope?.clientId??null)!==clientId)continue;
  let manifest;try{manifest=JSON.parse(await readFile(await officeStorePath(config.recordsRoot,'tasks/'+job.id+'/manifest.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(/^[a-f0-9]{64}$/.test(manifest.version??''))rows.push({id:job.id,brief:job.brief,version:manifest.version,status:job.status,scope:job.knowledgeContext?.scope?.id??'Historical unscoped task'});
 }
 return rows;
}

import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {readFile} from 'node:fs/promises';
import plan from './office-stack-plan.json';
import {indexOfficeFiles,readOfficeLibraryFile,type OfficeLibraryEntry} from '../../scripts/lib/office-library.mjs';
import {readReferenceLibrary,libraryCollections} from '../../scripts/lib/office-reference-library.mjs';
import {knowledgeCatalog} from '../../scripts/lib/office-foundations.mjs';
import {listJobs} from '../../scripts/lib/office-team-engine.mjs';
import {officeStorePath} from '../../scripts/lib/office-archive.mjs';
import {requireExistingClient} from './internal-api-request';
import {clientBrainV2ServerClient as db,isUuid} from './client-brain-v2-server-core';
function local(){if(!localOfficeEnabled())throw new Error('The Office library requires the private Mac environment.');}
let cache:{key:string;at:number;value:Awaited<ReturnType<typeof buildLibrary>>}|null=null;
async function buildLibrary(clientId?:string){
 local();if(clientId)await requireExistingClient(clientId);
 const [knowledge,jobs,clients]=await Promise.all([knowledgeCatalog(plan.storage),listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),db.from('clients').select('id,name')]);
 if(clients.error)throw new Error('Client names could not be loaded.');
 const names=new Map((clients.data??[]).map(c=>[c.id,c.name]));let roots:string[]|undefined;
 if(clientId){const scoped=jobs.filter(j=>j.knowledgeContext?.scope.clientId===clientId);roots=['clients/'+clientId,...knowledge.foundations.filter(f=>f.scope.clientId===clientId).map(f=>'knowledge/foundations/'+f.id),...knowledge.lessons.filter(l=>l.scope.clientId===clientId).map(l=>'knowledge/lessons/'+l.id)];
  for(const job of scoped){roots.push('tasks/'+job.id,'contexts/'+job.id);for(const step of [...job.steps,...(job.departmentReports??[])])roots.push(`agents/${step.agentId}/tasks/${job.id}`);for(const call of job.calls)roots.push(`agents/${call.agentId}/tasks/${job.id}`);
   try{const m=JSON.parse(await readFile(await officeStorePath(plan.storage.recordsRoot,'tasks/'+job.id+'/manifest.json'),'utf8'));for(const item of [...(m.steps??[]).map((s:{artifact?:unknown})=>s.artifact),...(m.departmentReports??[]).map((r:{artifact?:unknown})=>r.artifact),m.output].filter(Boolean) as {path?:string}[])if(item.path?.startsWith('objects/'))roots.push(item.path);}catch{}
  }
 }
 const references=await readReferenceLibrary(plan.storage,clientId);
 const objectScopes=new Map<string,Set<string>>();
 for(const job of jobs){const owner=job.knowledgeContext?.scope.clientId;if(!owner||clientId&&owner!==clientId)continue;try{const manifest=JSON.parse(await readFile(await officeStorePath(plan.storage.recordsRoot,'tasks/'+job.id+'/manifest.json'),'utf8'));const artifacts=[...(manifest.steps??[]).map((s:{artifact?:{path?:string}})=>s.artifact),...(manifest.departmentReports??[]).map((r:{artifact?:{path?:string}})=>r.artifact),manifest.output].filter(Boolean) as {path?:string}[];for(const artifact of artifacts){if(!artifact.path?.startsWith('objects/'))continue;const owners=objectScopes.get(artifact.path)??new Set<string>();owners.add(owner);objectScopes.set(artifact.path,owners);}}catch{}}
 const entries:OfficeLibraryEntry[]=await indexOfficeFiles(plan.storage,{roots});
 for(const entry of entries){const owners=entry.path?objectScopes.get(entry.path):null;if(owners){entry.clientIds=[...owners];if(owners.size===1)entry.clientId=[...owners][0];}if(entry.clientId)continue;const jobId=entry.path?.match(/^(?:tasks|contexts)\/([^/]+)/)?.[1]??entry.path?.match(/^agents\/[^/]+\/tasks\/([^/]+)/)?.[1];const foundationId=entry.path?.match(/^knowledge\/foundations\/([^/]+)/)?.[1];entry.clientId=(jobId?jobs.find(j=>j.id===jobId)?.knowledgeContext?.scope.clientId:null)??(foundationId?knowledge.foundations.find(f=>f.id===foundationId)?.scope.clientId:null)??null;}
 const records:{id:string;client_id:string;title:string;summary:string|null;top_section:string;subsection:string;status:string;updated_at:string}[]=[];
 for(let offset=0;;offset+=1000){let query=db.from('client_brain_v2_records').select('id,client_id,title,summary,top_section,subsection,status,updated_at').neq('top_section','logins').order('id').range(offset,offset+999);if(clientId)query=query.eq('client_id',clientId);const result=await query;if(result.error)throw new Error('Brain documents could not be loaded.');records.push(...(result.data??[]));if((result.data?.length??0)<1000)break;}
 const recordIds=new Set(records.map(r=>r.id));
 entries.push(...records.map(r=>({id:'record:'+r.id,recordId:r.id,clientId:r.client_id,kind:'document' as const,title:r.title,folder:`${names.get(r.client_id)??r.client_id}/${r.top_section}/${r.subsection}`,category:'Brain documents',bytes:null,format:'document',updatedAt:r.updated_at,status:r.status,summary:r.summary??undefined})));
 const fileIds=new Set<string>();
 for(let offset=0;;offset+=1000){let query=db.from('client_brain_v2_record_files').select('record_id,client_id,file_object_id,client_brain_file_objects!inner(file_name,file_type,file_size_bytes)').order('id').range(offset,offset+999);if(clientId)query=query.eq('client_id',clientId);const result=await query;if(result.error)throw new Error('Brain file links could not be loaded.');for(const row of result.data??[]){if(!recordIds.has(row.record_id)||fileIds.has(row.file_object_id))continue;fileIds.add(row.file_object_id);const file=row.client_brain_file_objects as unknown as {file_name:string;file_type:string|null;file_size_bytes:number|null};entries.push({id:'stored:'+row.file_object_id,recordId:row.record_id,fileId:row.file_object_id,clientId:row.client_id,kind:'file',title:file.file_name,folder:`${names.get(row.client_id)??row.client_id}/Attached files`,category:'Source attachments',bytes:file.file_size_bytes,format:file.file_type??'file',status:'Registered source',updatedAt:records.find(r=>r.id===row.record_id)?.updated_at??''});}if((result.data?.length??0)<1000)break;}
 for(const reference of references){const entry=entries.find(e=>e.path===reference.path);if(!entry)throw new Error('A curated reference is missing from the scoped index.');Object.assign(entry,{...reference,id:entry.id,summary:reference.application,category:libraryCollections.find(c=>c.id===reference.collectionId)!.name});}
 const collections=libraryCollections.map(c=>({...c,name:c.id==='client-work'?(names.get(clientId??'')??'Client')+' working material':c.name,count:references.filter(r=>r.collectionId===c.id).length}));
 return {collections,checkedAt:new Date().toISOString(),clientId:clientId??null,entries,counts:{curated:references.length,documents:records.length,files:entries.filter(e=>e.kind==='file').length,folders:new Set(entries.map(e=>e.folder)).size},clients:(clients.data??[]).filter(c=>!clientId||c.id===clientId)};
}
export async function officeLibrary(clientId?:string){local();const key=clientId??'all';if(cache?.key===key&&Date.now()-cache.at<30000)return cache.value;const value=await buildLibrary(clientId);cache={key,at:Date.now(),value};return value;}
export type OfficeLibrary=Awaited<ReturnType<typeof officeLibrary>>;
export async function openOfficeLibraryEntry(id:string,clientId?:string){
 const library=await officeLibrary(clientId),entry=library.entries.find(e=>e.id===id);if(!entry)throw new Error('Document not found in this Office scope.');
 if(entry.path){const file=await readOfficeLibraryFile(plan.storage,entry.path);if(entry.sha256){const {createHash}=await import('node:crypto');if(createHash('sha256').update(file.bytes).digest('hex')!==entry.sha256)throw new Error('The selected reference changed. Refresh the library.');}return {entry,file};}
 if(entry.kind==='document'&&entry.recordId&&isUuid(entry.recordId)){const query=db.from('client_brain_v2_records').select('id,title,summary,content,status,top_section,subsection,updated_at').eq('id',entry.recordId).eq('client_id',entry.clientId!).neq('top_section','logins');const result=await query.maybeSingle();if(result.error||!result.data)throw new Error('Brain document is unavailable.');return {entry,record:result.data};}
 if(entry.fileId){const {openClientBrainV2SourceFile}=await import('./client-brain-v2-source-mutations');return {entry,link:await openClientBrainV2SourceFile(entry.clientId!,entry.recordId!,entry.fileId)};}
 throw new Error('No saved content is available.');
}

export async function saveOfficeLibraryReference(input:{clientId:string;id:string;title:string;collectionId:string;notes:string;url?:string}){
 local();if(!isUuid(input.clientId))throw new Error('Choose a client Office first.');await requireExistingClient(input.clientId);
 const {addLibraryReference}=await import('../../scripts/lib/office-reference-library.mjs');const item=await addLibraryReference(plan.storage,input.clientId,input);cache=null;return {item};
}

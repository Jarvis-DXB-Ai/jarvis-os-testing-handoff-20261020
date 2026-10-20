import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import plan from './office-stack-plan.json';
import {storageReadiness} from '../../scripts/lib/office-archive.mjs';
import {knowledgeCatalog,candidateLessons,initialiseFoundations,updateFoundation,updateLesson,readFoundation,readLesson,buildTaskContext,validateContextRequest,roleContext} from '../../scripts/lib/office-foundations.mjs';
import type {KnowledgeCatalog,OfficeLessonCandidate,OfficeContextBundle} from '../../scripts/lib/office-foundations.mjs';
import {brainTaskProfile,brainRolePolicy} from './office-brain-policy.mjs';

function local(){if(!localOfficeEnabled()||process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Foundations require the private isolated Mac Office.');}
export type OfficeKnowledgeCatalog=KnowledgeCatalog&{enabled:boolean;message:string;candidates:OfficeLessonCandidate[]};
export async function officeKnowledge():Promise<OfficeKnowledgeCatalog>{
 local();const storage=await storageReadiness(plan.storage);
 if(storage.status!=='connected')return {enabled:false,message:storage.message,foundations:[],lessons:[],candidates:[],checkedAt:new Date().toISOString()};
 const catalog=await knowledgeCatalog(plan.storage),candidates=await candidateLessons(plan.storage);
 return {...catalog,candidates,enabled:true,message:'Versioned foundations and scoped lessons on MAC SSD. Drafts require owner review.'};
}
export async function initialiseOfficeKnowledge(){
 local();
 const source=async(id:string,title:string,path:string)=>{const bytes=await readFile(path);return{id,title,path,sha256:createHash('sha256').update(bytes).digest('hex'),status:'source-reviewed'};};
 const interfaceSource=await source('jarvis-colours','Current Jarvis interface values',resolve(process.cwd(),'src/components/design-system/brand-foundations.module.css'));
 const typeSource=await source('jarvis-type','Current Jarvis font setup',resolve(process.cwd(),'src/app/layout.tsx'));
 const boatBrief=await source('boat-brief','DemoClientC source index brief','/ABSOLUTE/TEST/OWNER/MC-STUDIOS/knowledge/clients/democlientb-on-the-sea/BRIEF.md');
 const boatKnowledge=await source('boat-register','Historical source and approval register','/ABSOLUTE/TEST/OWNER/MC-STUDIOS/knowledge/clients/democlientb-on-the-sea/knowledge.json');
 const assetsSource=await source('boat-assets','Historical asset index; approval is unknown','/ABSOLUTE/TEST/OWNER/MC-STUDIOS/knowledge/clients/democlientb-on-the-sea/assets.json');
 const assetIndex=JSON.parse(await readFile(assetsSource.path,'utf8')) as {client_id:string;assets:{id:string;path:string;sha256:string;approval_status:string;rights_status:string;role:string}[]};
 if(assetIndex.client_id!=='democlientb-on-the-sea')throw new Error('Wrong client source index.');
 const empty={positioning:'',facts:'',voice:'',visual:'',production:'',restrictions:''};
 await initialiseFoundations(plan.storage,[
  {id:'jarvis-interface',title:'Jarvis interface',scope:{kind:'internal',id:'jarvis-interface',clientId:null},fields:{positioning:'An internal operating interface for assigning, inspecting and reviewing work.',facts:'Jarvis Office is the main UI. Paperclip coordinates teams. Agent model calls use the existing monthly subscriptions.',voice:'Plain, specific and truthful. Distinguish proposed, running, saved, QA-passed and owner-reviewed states.',visual:'Retain the current near-black surfaces, Geist typography and green action/status system. Provider marks use sourced artwork. This scope is the Jarvis interface only.',production:'Keep editable source, inspect real content and responsive states, and verify the rendered result. Draft examples do not establish approval.',restrictions:'Do not transfer this identity to clients or the future agency. Do not infer publishing, client delivery or tool use from a preview.'},tokens:{surface:{panel:{$type:'color',$value:{colorSpace:'srgb',components:[10/255,10/255,12/255]}}},font:{body:{$type:'fontFamily',$value:'Geist'}},action:{background:{$type:'color',$value:{colorSpace:'srgb',components:[5/255,59/255,28/255]}}}},sources:[interfaceSource,typeSource],assets:[],gaps:['Review and approve the scope of this interface foundation.']},
  {id:'agency-company',title:'Agency and future company',scope:{kind:'company',id:'agency-company',clientId:null},fields:{...empty,positioning:'Managed AI marketing service. Future company name and final identity remain pending.',facts:'Core launch services: strategy, social content, graphic design, AI photography/video and advertising. Do not claim autonomous full-service delivery without proof.',restrictions:'Owner approves external publication, spend and client delivery. Preserve existing approved client identities.'},sources:[],assets:[],gaps:['Company name and identity are pending.','Define and review voice, visual rules and channel applications.']},
  {id:'democlientb-on-the-sea',title:'DemoClientC',scope:{kind:'client',id:'democlientb-on-the-sea',clientId:null},fields:{...empty,facts:'Exact entity: DemoClientC. Keep separate from DemoClientB. The local index is historical; operational facts need current approved sources.',visual:'Preserve supplied real vessel geometry and approved artwork. Historical guideline images and generated concepts are reference material until exact approval is reconciled.',restrictions:'Do not invent offers, route, price, capacity, dates, booking availability or a relationship with the Restaurant. Reference material is not an approved marketing asset.'},sources:[boatBrief,boatKnowledge,assetsSource],assets:assetIndex.assets.map(a=>({id:a.id,name:a.path.split('/').at(-1)??a.id,path:a.path,sha256:a.sha256,approvalStatus:a.approval_status,rightsStatus:a.rights_status,role:a.role})),gaps:['Reconcile current brand and voice approval.','Verify source assets, fonts, rights and operational facts.','No live Client Brain binding for the boat; local historical sources only.']}
 ]);
 const candidates=await candidateLessons(plan.storage);
 const prior=candidates.find(c=>c.sourceJobId==='37763ed3-2926-53ce-92bf-99b0ced2b8f2');
 if(prior){
  const id='source-process-claims';
  let exists=false;try{await readLesson(plan.storage,id);exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(!exists)await updateLesson(plan.storage,{action:'save',id,candidateId:prior.id,scope:{kind:'company',id:'agency-company',clientId:null},title:'Source process claims before writing behind-the-scenes copy',rule:'Use provided evidence for real design, manufacturing or production-process claims. If it is missing, flag the gap and avoid presenting an invented process as fact.',trigger:'Caption or behind-the-scenes writing that describes how a real product or service was made.',counterexample:'Explicit fictional storytelling may invent a fictional process when the fictional status is clear. This is not permission to invent facts about real clients.',roles:['copy','coo','test'],taskTypes:['caption']});
 }
 return officeKnowledge();
}
export async function mutateOfficeKnowledge(value:unknown){
 local();if(!value||typeof value!=='object')throw new Error('Invalid knowledge action.');
 const input=value as Record<string,unknown>;
 if(input.action==='initialise')return initialiseOfficeKnowledge();
 if(input.kind==='foundation')await updateFoundation(plan.storage,input);
 else if(input.kind==='lesson')await updateLesson(plan.storage,input);
 else throw new Error('Choose a foundation or lesson action.');
 return officeKnowledge();
}
export async function previewOfficeContext(value:unknown,{roleId='coo'}:{roleId?:string}={}):Promise<{bundle:OfficeContextBundle;roles:Record<string,Record<string,unknown>|null>}>{
 local();brainRolePolicy(roleId);const request=validateContextRequest(value),foundation=await readFoundation(plan.storage,request.foundationId);
 let clientBrain:unknown=null;
 if(foundation.scope.clientId){
  // Foundation binding is a server-owned registered identity, never an arbitrary model-supplied client ID.
  const {requireExistingClient}=await import('./internal-api-request');
  await requireExistingClient(foundation.scope.clientId);
  const {clientOfficeContext}=await import('./office-client-intake-server');
  const office=foundation.id.startsWith('audit-')?await (await import('./office-client-pilot-server')).clientPilotContext(foundation.scope.clientId,foundation.id,request):await clientOfficeContext(foundation.scope.clientId);
  if(office.foundationId!==foundation.id)throw new Error('The foundation does not match this client’s Office.');
  const {retrieveClientBrainContext}=await import('./client-brain-v2-retrieval');
  const result=await retrieveClientBrainContext(foundation.scope.clientId,{task_type:brainTaskProfile(request.taskType).clientBrainTaskType,include_sources:true,include_learnings:true,max_assets:0,freshness_mode:'current'});
  // URLs/credentials/provider metadata are not part of the model context projection.
  clientBrain={officeTeam:office.team,officeTeamRevision:office.revision,...('executionMode' in office?{executionMode:office.executionMode}:{}),goals:office.goals,paidScope:office.paidScope,auditSources:office.auditSources,registeredNotes:office.registeredNotes,client:result.client,intelligence:result.intelligence,menus:result.menus,activations:result.activations,operations:result.operations,warnings:result.warnings,brand_guidelines:result.brand_guidelines,learnings:result.learnings,sources:result.sources,brand_assets:result.brand_assets.map(a=>({id:a.id,name:a.name,kind:a.kind,role:a.role,hard_truth:a.hard_truth}))};
 }
 const bundle=await buildTaskContext(plan.storage,request,{clientBrain});
 return {bundle,roles:{[roleId]:roleContext(bundle,roleId)}};
}

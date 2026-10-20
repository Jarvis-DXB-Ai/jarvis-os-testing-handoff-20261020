import 'server-only';
import {readFile} from 'node:fs/promises';
import {clientBrainV2ServerClient as db} from './client-brain-v2-server-core';
import {requireExistingClient} from './internal-api-request';
import {clientIntake,requireLocalClientOffice} from './office-client-intake-server';
import {buildClientTeam,type ClientTeam} from './office-client-team.mjs';
import {pilotDigest,readPilotSources,pilotTaskTypes} from '../../scripts/lib/office-client-pilot.mjs';
import {provisionClientAgents} from '../../scripts/lib/office-client-agents.mjs';
import {initialiseFoundations} from '../../scripts/lib/office-foundations.mjs';
import plan from './office-stack-plan.json';
type Pilot={id:string;clientId:string;name:string;status:'audit_ready';executionMode:'audit_only';foundationId:string;brandConfirmed:false;servicesConfirmed:false;sourceRevision:string;team:ClientTeam;createdAt:string;revision:string};
const key='office:audit-pilot';
export async function clientPilot(id:string):Promise<Pilot>{
 requireLocalClientOffice();await requireExistingClient(id);
 const {data,error}=await db.from('client_brain_v2_records').select('content').eq('client_id',id).eq('stable_key',key).maybeSingle();
 if(error||!data?.content)throw new Error('No internal audit allocation is saved for this client.');
 const state=JSON.parse(data.content) as Pilot,{revision,...body}=state;
 if(state.id!==id||state.clientId!==id||revision!==pilotDigest(body)||state.executionMode!=='audit_only'||state.brandConfirmed||state.servicesConfirmed)throw new Error('Client pilot integrity check failed.');
 const sources=await readPilotSources(plan.storage,id);if(sources.sha256!==state.sourceRevision)throw new Error('The source pack changed; prepare a new audit allocation.');
 return state;
}
export async function prepareClientPilot(input:{id:string;expectedRevision:string}){
 requireLocalClientOffice();const setup=await clientIntake(input.id);
 if(setup.revision!==input.expectedRevision)throw new Error('The onboarding changed. Reload before preparing the internal audit.');
 const pack=await readPilotSources(plan.storage,input.id);
 if(!setup.name.trim()||pack.manifest.name!==setup.name||pack.manifest.clientId!==input.id)throw new Error('This retained source pack does not match the selected client identity.');
 if(!pack.manifest.packets||!Object.keys(pack.manifest.packets).length)throw new Error('The client audit needs its own pinned evidence packet.');
 const old=await db.from('client_brain_v2_records').select('content').eq('client_id',input.id).eq('stable_key',key).maybeSingle();
 if(old.error)throw new Error('The audit allocation could not be read.');
 if(old.data)return clientPilot(input.id);
 const foundationId='audit-'+input.id+'-'+pack.sha256.slice(0,10);
 await initialiseFoundations(plan.storage,[{id:foundationId,title:setup.name+' · internal audit',scope:{kind:'client',id:foundationId,clientId:input.id},fields:{...setup.brand,restrictions:setup.brand.restrictions+' Internal analysis only. No production approval, purchased-service confirmation, external writes or generation.'},sources:[{id:'audit-register',title:setup.name+' pinned source register',path:pack.path,sha256:pack.sha256,status:'Owner-authorized internal review; artifacts retain draft status'},...Object.entries(pack.manifest.packets).map(([name,p])=>({id:'audit-packet-'+name,title:name+' evidence',...(p as {path:string;sha256:string}),status:'Coordinator-supplied source evidence, not worker browsing'}))],assets:[],gaps:['Owner review of exact brand and image variants pending.','Purchased services and account access require confirmation before production.']}]);
 const team=await provisionClientAgents(plan,input.id,setup.name,buildClientTeam(pack.manifest.services,pack.manifest.workerCapacity));
 const body={id:input.id,clientId:input.id,name:setup.name,status:'audit_ready' as const,executionMode:'audit_only' as const,foundationId,brandConfirmed:false as const,servicesConfirmed:false as const,sourceRevision:pack.sha256,team,createdAt:new Date().toISOString()},state={...body,revision:pilotDigest(body)};
 const {error}=await db.from('client_brain_v2_records').insert({client_id:input.id,stable_key:key,top_section:'intelligence',subsection:'operations',record_type:'office_audit_pilot',title:setup.name+' internal audit allocation',content:JSON.stringify(state),summary:'Internal audit allocation; purchased services and brand approval remain pending.',status:'draft',knowledge_class:'operational',source_type:'manual',metadata:{execution_mode:'audit_only',source_revision:pack.sha256,team_revision:pilotDigest(team)},provenance:{origin:'Private Office audit preparation for the selected client; not commercial or brand approval.',scope:'Internal evidence analysis only'}});
 if(error)throw new Error('Client audit actors prepared; allocation save failed. Inspect before retrying.');
 return state;
}
export async function clientPilotContext(id:string,foundationId:string,request:{mode:string;taskType:string}){
 const state=await clientPilot(id);if(state.foundationId!==foundationId||request.mode!=='draft'||!pilotTaskTypes.includes(request.taskType))throw new Error('Internal audit foundations allow only draft internal/strategy/web/report analysis. Complete production onboarding for other work.');
 const pack=await readPilotSources(plan.storage,id),packet=pack.manifest.packets.social??Object.values(pack.manifest.packets)[0] as {path:string;sha256:string}|undefined;
 if(!packet)throw new Error('The client audit needs its own pinned evidence packet.');
 const notes=(await readFile(packet.path,'utf8')).slice(0,2800);
 return {clientId:id,revision:state.revision,foundationId,team:state.team,executionMode:'audit_only',goals:'Analyse this client’s retained pinned evidence; report evidence-led findings, unknowns and next actions.',paidScope:'Unconfirmed. Audit departments are test allocations, not purchased services.',auditSources:[],registeredNotes:[{title:'Internal audit evidence boundaries',kind:'facts',text:notes,sha256:packet.sha256}]};
}

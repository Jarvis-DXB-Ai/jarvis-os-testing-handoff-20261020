import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import plan from './office-stack-plan.json';
import {officeKnowledge} from './office-foundations-server';
import {loadPaperclipOfficeSnapshot} from './office-paperclip-server';
import {clientPilot} from './office-client-pilot-server';
import {clientIntake} from './office-client-intake-server';
import {requireExistingClient} from './internal-api-request';
import {intakeStage} from './office-client-team.mjs';
import {readBrainStructure,brainStorageLocations,savedFeedbackTasks} from '../../scripts/lib/office-brain.mjs';
import {listJobs} from '../../scripts/lib/office-team-engine.mjs';
import {skillReadiness} from '../../scripts/lib/office-skill-library.mjs';
import {recordOwnerFeedback} from '../../scripts/lib/office-foundations.mjs';
import {officeStorePath} from '../../scripts/lib/office-archive.mjs';
export async function officeBrainSnapshot(clientId?:string){
 const knowledge=await officeKnowledge();
 if(!knowledge.enabled)throw new Error(knowledge.message);
 const [installed,locations,board,methods,jobs]=await Promise.all([readBrainStructure(plan.storage),brainStorageLocations(plan.storage),loadPaperclipOfficeSnapshot(),skillReadiness(plan.skillLibrary,join(plan.storage.recordsRoot,'library/skills')),listJobs(undefined,{kind:'all',limit:80})]);
 let client:null|{id:string;name:string;stage:string;confirmed:boolean;services:string[];capacity:number|null;foundationId:string|null;message:string}=null;
 if(clientId){const identity=await requireExistingClient(clientId);client={id:clientId,name:identity.name,stage:'onboarding',confirmed:false,services:[],capacity:null,foundationId:null,message:'Begin onboarding before allocating this client’s team.'};try{const setup=await clientIntake(clientId);client={...client,stage:intakeStage(setup),confirmed:setup.status==='ready'&&setup.brandConfirmed,services:setup.services,capacity:setup.capacity,foundationId:setup.foundationId,message:setup.status==='ready'?'Confirmed client setup; account connections and first-cycle QA remain separate.':'Finish this saved onboarding interview before production.'};}catch(error){if(!(error instanceof Error)||!error.message.includes('has not started'))throw error;}}
 if(clientId&&client&&!client.confirmed){try{const pilot=await clientPilot(clientId);client={...client,stage:'Internal audit ready',capacity:pilot.team.maxConcurrentWorkers,foundationId:pilot.foundationId,message:'First-client audit allocated across eight departments. Purchased services and exact brand remain unconfirmed; internal analysis only.'};}catch(error){if(!(error instanceof Error)||!error.message.includes('No internal audit allocation'))throw error;}}
 const foundations=knowledge.foundations.filter(f=>clientId?f.scope.clientId===clientId:f.scope.kind!=='client'),lessons=knowledge.lessons.filter(l=>clientId?l.scope.clientId===clientId:l.scope.kind!=='client'),candidates=knowledge.candidates.filter(c=>clientId?c.scope?.clientId===clientId:!c.scope?.clientId);
 const active=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active');
 const registered=active.filter(role=>board.agents.some(a=>a.blueprintRoleId===role.id&&!a.clientId&&!a.spawnedForTask&&a.model===role.model&&a.adapter===(role.provider==='Claude Code'?'claude_local':'codex_local')&&!['paused','terminated'].includes(a.status)));
 return {checkedAt:new Date().toISOString(),structureReady:!!installed?.matchesCurrent,structureRevision:installed?.structureRevision??null,locations,client,
  team:{activeRoles:active.length,registeredRoles:registered.length,serviceDepartments:plan.focusDepartments.length,sharedDepartments:plan.supportDepartments.length,departmentQa:plan.departmentQaEnabled,methods:methods.length,verifiedMethods:methods.filter(s=>s.installed).length,packVersion:plan.skillResearch.packVersion},
  foundations:foundations.map(f=>({id:f.id,title:f.title,status:f.status,revision:f.revision,gaps:f.gaps})),learning:{candidates:candidates.length,ownerFeedback:candidates.filter(c=>c.sourceKind==='owner-feedback').length,departmentFailures:candidates.filter(c=>c.reviewStages?.some(s=>s.departmentId)).length,approved:lessons.filter(l=>l.status==='approved').length},
  feedbackTasks:await savedFeedbackTasks(plan.storage,jobs,clientId??null),storageRoot:plan.storage.recordsRoot,
  departments:[...plan.focusDepartments,...plan.supportDepartments].map(d=>({id:d.id,name:d.name,headRoleId:d.headRoleId,qaRoleId:d.qaRoleId,roles:d.roles}))};
}
export type OfficeBrainSnapshot=Awaited<ReturnType<typeof officeBrainSnapshot>>;
export async function saveOfficeFeedback(input:{jobId:string;comment:string;departmentId?:string|null;id?:string;expectedVersion?:string;clientId?:string}){
 await officeKnowledge();
 if(input.clientId){await requireExistingClient(input.clientId);const manifest=JSON.parse(await readFile(await officeStorePath(plan.storage.recordsRoot,'tasks/'+input.jobId+'/manifest.json'),'utf8'));if(manifest.knowledgeContext?.scope?.clientId!==input.clientId)throw new Error('This feedback belongs to another client’s task.');}
 if(!input.expectedVersion)throw new Error('Feedback must identify the inspected saved task version.');
 return recordOwnerFeedback(plan.storage,input);
}

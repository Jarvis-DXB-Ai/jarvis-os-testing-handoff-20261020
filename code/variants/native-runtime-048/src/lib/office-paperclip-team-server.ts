import {localOfficeEnabled,coordinatorWorkerEnvironment} from './office-runtime.mjs';
import 'server-only';
import {createHash} from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { activeStates, jobDirectory, createJob, listJobs,readJob,validateTask, stopJob, reviewJob, reconcileJob,recoverDeliveryHandoff, paperclipClient,prepareDepartmentHeadRevision,prepareDepartmentRevision,prepareDepartmentEvidenceReview,prepareFinalRevision,recoverDepartmentQa,retryDepartmentQa,recoverPlanning,recoverUndispatchedStage,recoverTerminalSpecialist } from '../../scripts/lib/office-team-engine.mjs';
import type { OfficeTeamTaskCatalog } from './office-team-contract';
import plan from './office-stack-plan.json';
import {toolReceipts} from '../../scripts/lib/office-tool-bridge.mjs';
import {storageReadiness,archiveJob} from '../../scripts/lib/office-archive.mjs';
import {persistTaskContext,readFoundation,readTaskContext} from '../../scripts/lib/office-foundations.mjs';
import {withOfficeSourceAdmission} from '../../scripts/lib/office-source-activation.mjs';
import {previewOfficeContext} from './office-foundations-server';
import {officeTaskRoute} from '../../scripts/lib/office-task-routing.mjs';
import {officeReadiness} from './office-readiness-server';
import {assessConversationReadiness} from './office-readiness.mjs';
import {requireOfficeContextRevision,resolveCooFoundation} from './office-coo-message.mjs';
import {checkOfficeGoalAdmission} from '../../scripts/lib/office-goal-policy-runtime.mjs';
import {officeCurrentRoutingFoundations} from './office-current-routing-server';

import {officeQueueState} from '../../scripts/lib/office-task-queue.mjs';
import {readOfficeRecoveryEligibility} from '../../scripts/lib/office-recovery-eligibility.mjs';

function enabled() { return localOfficeEnabled(); }
export async function officeTeamTasks(): Promise<OfficeTeamTaskCatalog> {
  if (!enabled()) return { enabled: false, message: 'Private Mac team execution is not configured in this environment.', jobs: [] };
  const storage=await storageReadiness(plan.storage);
  const all=await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER});
  const busy=all.some(j=>activeStates.includes(j.status)||j.status==='recovery_required');
  return { queue:officeQueueState(all),busy, enabled: storage.status==='connected', message: storage.status==='connected'?'COO-led Paperclip teams · monthly CLI subscriptions · scoped SSD workspaces.':storage.message, jobs: await Promise.all((await listJobs(undefined,{limit:Number.MAX_SAFE_INTEGER})).map(async j=>({...j,toolCalls:await toolReceipts(plan.storage,j.id),recovery:await readOfficeRecoveryEligibility(j,{directory:jobDirectory,continuationBlocked:busy})}))) };
}
export async function submitOfficeTeamTask(input: unknown,options:{selectedArtifacts?:import('../../scripts/lib/office-linked-artifacts.mjs').LinkedArtifactScope;/** Trusted server functions only; never accepted from task input or environment. */cooExecution?:{admit:(task:unknown)=>Promise<{canDispatch:boolean;reason:string}>;launch:(jobId:string)=>void}}={}) {
  if (!enabled()) throw new Error('Private local team execution is unavailable.');
  if((await storageReadiness(plan.storage)).status!=='connected')throw new Error('Mount the configured SSD before starting new team work.');
  let taskInput=validateTask(input);
  const automatic=!!input&&typeof input==='object'&&'autoContext' in input&&input.autoContext===true;
  const cooExecution=options.cooExecution;
  if(cooExecution&&(!automatic||taskInput.kind==='conversation'||taskInput.departmentId||typeof cooExecution.admit!=='function'||typeof cooExecution.launch!=='function'))throw new Error('An exact trusted COO execution capability is required.');
  const requestHash=automatic?createHash('sha256').update(JSON.stringify({...taskInput,cooRequestHash:undefined})).digest('hex'):null;
  let preparedInput=input;
  // Request replay returns the exact saved context, even if its foundation has since changed.
  try{const prior=await readJob(taskInput.id);if(automatic&&prior.cooRequestHash){if(prior.cooRequestHash!==requestHash)throw new Error('This request ID belongs to a different COO message.');return prior;}return (await createJob(input)).job;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(automatic){
    if(taskInput.departmentId)throw new Error('COO messages must let the COO choose the departments.');
    if(!taskInput.contextRequest)throw new Error('The Office foundation is unavailable.');
    const contextRequest=resolveCooFoundation(taskInput.brief,taskInput.contextRequest,await officeCurrentRoutingFoundations());
    preparedInput={...(input as Record<string,unknown>),contextRequest,cooRequestHash:requestHash};
    taskInput=validateTask(preparedInput);
  }
  const submit=async()=>{
  const bundle=taskInput.contextRequest?(await previewOfficeContext(taskInput.contextRequest)).bundle:null;
  if(bundle&&taskInput.kind!=='conversation')requireOfficeContextRevision(input,bundle);
  officeTaskRoute(plan,bundle?.clientBrain as Record<string,unknown>|undefined,taskInput.departmentId);
  const budget:{canDispatch:boolean;reason:string;recheck?:()=>Promise<void>}=cooExecution?await cooExecution.admit(preparedInput):await checkOfficeGoalAdmission({task:taskInput,context:bundle,companyId:plan.paperclipCompanyId,mode:'submit'});
  if(!budget.canDispatch)throw new Error('Office subscription safety hold: '+budget.reason+'. Saved work is preserved.');
  const readiness=await officeReadiness({fresh:true});
  if(taskInput.kind==='conversation'){
    const actors=await paperclipClient()(`/companies/${plan.paperclipCompanyId}/agents`);
    if(!Array.isArray(actors))throw new Error('The selected desk runtime could not be verified.');
    const target=actors.find((actor:{id:string})=>actor.id===taskInput.targetAgentId);
    if(!target||target.metadata?.modelBilling!=='subscription_only')throw new Error('The selected subscription desk is unavailable.');
    const selected=assessConversationReadiness(readiness,target.adapterType);
    if(!selected.canSubmit)throw new Error(selected.message);
  }else if(!readiness.canEnqueue)throw new Error(readiness.message);
  if(!('kind' in taskInput)||taskInput.kind!=='conversation'){if(!taskInput.contextRequest)throw new Error('Select a foundation and preview its context before assigning a new team task.');}
  // Accept multiple pinned briefs; the durable dispatcher serialises team execution.
  const jobs = await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER});
  const id = input && typeof input === 'object' && 'id' in input ? input.id : null;
  if ((taskInput.kind==='conversation'||cooExecution)&&jobs.some(j => j.status === 'recovery_required')) throw new Error('Reconcile the uncertain task before starting new model work.');
  if ((taskInput.kind==='conversation'||cooExecution)&&jobs.some(j => activeStates.includes(j.status) && j.id !== id)) throw new Error('A team is already working. Wait or stop it before assigning another task.');
  if(budget.recheck)await budget.recheck();
  const knowledgeContext=bundle?await persistTaskContext(plan.storage,taskInput.id,bundle):undefined;
  const result = await createJob(preparedInput,undefined,{knowledgeContext,departmentPackageReview:plan.departmentPackageReviewEnabled===true,selectedArtifacts:options.selectedArtifacts,queueManaged:!cooExecution&&taskInput.kind!=='conversation',specialistArtifacts:plan.specialistArtifactEnvelopeEnabled===true});
  if (result.created) {
    if(cooExecution){cooExecution.launch(result.job.id);return result.job;}
    const env = coordinatorWorkerEnvironment() as NodeJS.ProcessEnv;
    const child = spawn(process.execPath, [resolve(process.cwd(), 'scripts/office-paperclip-worker.mjs'), ...(result.job.queueManaged?[]:[result.job.id])], { cwd: process.cwd(), env, detached: true, stdio: 'ignore' });
    // A lost launch is surfaced by the durable queued record; never respawn blindly.
    child.on('error', () => { console.error('Office team worker launch failed; inspect the saved queued task.'); });
    child.unref();
  }
  return result.job;
  };
  // Keep admission visible from the first current-context read through durable
  // creation. A source activation fences new requests and waits for these tokens.
  const sourceClientId=taskInput.contextRequest?(await readFoundation(plan.storage,taskInput.contextRequest.foundationId)).scope.clientId:null;
  return sourceClientId?withOfficeSourceAdmission({storage:plan.storage,clientId:sourceClientId},submit):submit();
}
export async function controlOfficeTeamTask(input: { id: string; action: string; note?: string;departmentId?:string;expectedUpdatedAt?:string;partHashes?:Record<string,string>;assignmentCorrections?:{partId:string;expectedAssignmentSha256:string;replacements:{from:string;to:string}[]}[];corrections?:import('../../scripts/lib/office-team-engine.mjs').DepartmentCorrection[] }) {
  if (!enabled()) throw new Error('Private local team execution is unavailable.');
  if(input.action==='resumeQueue'){launchOfficeQueue();return {status:'queue_requested'};}
  if (input.action === 'stop') return stopJob(input.id);
  const queueScopedRecovery=['recoverPlanning','recoverUndispatchedStage','recoverTerminalSpecialist','recoverDeliveryHandoff'].includes(input.action);
  const recoverySource=queueScopedRecovery?await readJob(input.id):null;
  if(queueScopedRecovery&&recoverySource?.queueManaged!==true)throw new Error('This record is outside the recorded Office queue recovery scope.');
  const recoverySourceSnapshot=recoverySource?JSON.stringify(recoverySource):null;
  if(input.action==='recoverDeliveryHandoff'){
    if(typeof input.expectedUpdatedAt!=='string'||!input.expectedUpdatedAt)throw new Error('Reload the exact saved delivery before checking its board handoff.');
    const job=await recoverDeliveryHandoff(input.id,plan,{expectedUpdatedAt:input.expectedUpdatedAt});
    try{await archiveJob(job,plan.storage);}catch{console.error('Office SSD review archive pending; operational receipt remains saved.');}
    // Dedicated board-only action: never launch a worker or drain other tasks.
    return job;
  }
  if(input.action==='recoverDepartmentQa'){const job=await recoverDepartmentQa(input.id,input.expectedUpdatedAt,plan);await archiveJob(job,plan.storage);return job;}
  if(input.action==='reviseDepartmentHead'||input.action==='continueDepartmentPackage'||input.action==='reviewDepartmentEvidence'||input.action==='reviseDepartment'||input.action==='reviseFinal'||input.action==='recoverPlanning'||input.action==='retryDepartmentQa'||input.action==='recoverUndispatchedStage'||input.action==='recoverTerminalSpecialist'){
    const revise=async()=>{
    const saved=await readJob(input.id),context=saved.knowledgeContext?await readTaskContext(plan.storage,saved.id,saved.knowledgeContext):null;
    const budget=await checkOfficeGoalAdmission({task:validateTask({...saved,concurrency:saved.requestedConcurrency??null}),context,companyId:plan.paperclipCompanyId,mode:'continue'});
    if(!budget.canDispatch)throw new Error('Office subscription safety hold: '+budget.reason+'. Saved work is preserved.');
    const jobs=await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER});if(jobs.some(j=>activeStates.includes(j.status)||j.status==='recovery_required'))throw new Error('Finish or reconcile the current team before a department revision.');
    if(queueScopedRecovery){
      const current=await readJob(input.id);
      if(current.queueManaged!==true)throw new Error('This record is outside the recorded Office queue recovery scope.');
      if(current.updatedAt!==input.expectedUpdatedAt||JSON.stringify(current)!==recoverySourceSnapshot)throw new Error('The saved recovery revision changed. Reload before continuing.');
    }
    if(budget.canDispatch&&'recheck' in budget)await budget.recheck();
    const job=input.action==='reviseDepartmentHead'||input.action==='continueDepartmentPackage'?await prepareDepartmentHeadRevision(input.id,{...input,continueOnly:input.action==='continueDepartmentPackage'}):input.action==='reviewDepartmentEvidence'?await prepareDepartmentEvidenceReview(input.id,input):input.action==='retryDepartmentQa'?await retryDepartmentQa(input.id,input.expectedUpdatedAt,plan):input.action==='recoverTerminalSpecialist'?await recoverTerminalSpecialist(input.id,input.expectedUpdatedAt,plan):input.action==='recoverUndispatchedStage'?await recoverUndispatchedStage(input.id,input.expectedUpdatedAt,plan):input.action==='recoverPlanning'?await recoverPlanning(input.id,input.expectedUpdatedAt,plan):input.action==='reviseFinal'?await prepareFinalRevision(input.id,input):await prepareDepartmentRevision(input.id,input);
    const env=coordinatorWorkerEnvironment() as NodeJS.ProcessEnv;
    const child=spawn(process.execPath,[resolve(process.cwd(),'scripts/office-paperclip-worker.mjs'),job.id],{cwd:process.cwd(),env,detached:true,stdio:'ignore'});child.on('error',()=>console.error('Department revision launch failed; inspect its saved queued record.'));child.unref();return job;
    };
    const sourceClientId=(await readJob(input.id)).knowledgeContext?.scope.clientId;
    return sourceClientId?withOfficeSourceAdmission({storage:plan.storage,clientId:sourceClientId},revise):revise();
  }
  if (input.action === 'review'||input.action==='reconcile') {
    const current=input.action==='reconcile'?await readJob(input.id):null;
    const deliveryPending=current?.deliveryHandoff?.state==='pending'||(current?.status==='failed'&&current.qa?.pass===true);
    const job=input.action==='review'
      ?await reviewJob(input.id,input.note,undefined,paperclipClient())
      :deliveryPending
        ?await recoverDeliveryHandoff(input.id,plan,{expectedUpdatedAt:input.expectedUpdatedAt??current?.updatedAt})
        :await reconcileJob(input.id,paperclipClient());
    if(input.action==='reconcile')launchOfficeQueue();
    try{await archiveJob(job,plan.storage);}catch{console.error('Office SSD review archive pending; operational receipt remains saved.');}return job;
  }
  throw new Error('Unknown team action.');
}

function launchOfficeQueue(){
 const env=coordinatorWorkerEnvironment() as NodeJS.ProcessEnv;
 const child=spawn(process.execPath,[resolve(process.cwd(),'scripts/office-paperclip-worker.mjs')],{cwd:process.cwd(),env,detached:true,stdio:'ignore'});child.on('error',()=>console.error('Office queue launch failed; saved messages remain queued.'));child.unref();
}

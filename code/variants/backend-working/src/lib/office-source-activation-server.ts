import 'server-only';
import {clientBrainV2ServerClient as db} from './client-brain-v2-server-core';
import {requireExistingClient} from './internal-api-request';
import {requireLocalClientOffice} from './office-client-intake-server';
import {activateOfficeSourceVersion,recoverOfficeSourceActivation,countOfficeSourceAdmissions,type SourceActivationAllocation,type SourceActivationCallbacks} from '../../scripts/lib/office-source-activation.mjs';
import {listJobs,activeStates,paperclipClient} from '../../scripts/lib/office-team-engine.mjs';
import plan from './office-stack-plan.json';
const key='office:audit-pilot',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function record(clientId:string){
 const {data,error}=await db.from('client_brain_v2_records').select('id,client_id,content,metadata,updated_at').eq('client_id',clientId).eq('stable_key',key).maybeSingle();
 if(error||!data?.content)throw new Error('The existing client audit allocation could not be read.');return data;
}
function callbacks(clientId:string):SourceActivationCallbacks{
 const selected=(value:string)=>{if(value!==clientId)throw new Error('Source activation callback crossed client scope.');};
 return {
  async readAllocation(id){selected(id);return JSON.parse((await record(id)).content) as SourceActivationAllocation;},
  async compareAndSwapAllocation(input){
   selected(input.clientId);const old=await record(clientId);
   if(JSON.stringify(JSON.parse(old.content))!==JSON.stringify(input.expected))return false;
   // POST the exact stored bytes: embedding this large content in a PATCH filter
   // exceeds the actual gateway URL limit. The service-only RPC locks and compares
   // that row, and its existing trigger preserves history in the same transaction.
   // A lost acknowledgement is reconciled by the core's subsequent readback.
   const {data,error}=await db.rpc('office_cas_source_allocation',{
    p_client_id:clientId,p_activation_id:input.activationId,
    p_expected_content:old.content,p_expected_updated_at:old.updated_at,
    p_next_content:JSON.stringify(input.next),
   });
   if(error||typeof data!=='boolean')throw new Error('Allocation update acknowledgement is uncertain. Preserve the source fence and reconcile.');return data;
  },
  async assertQuiescent(id){
   selected(id);const [jobs,admittedDispatches,runs]=await Promise.all([listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),countOfficeSourceAdmissions({storage:plan.storage,clientId}),paperclipClient()(`/companies/${plan.paperclipCompanyId}/heartbeat-runs?summary=true`)]);
   if(!Array.isArray(runs))throw new Error('Native runtime quiescence could not be verified.');
   const scoped=jobs.filter(job=>job.knowledgeContext?.scope.clientId===clientId);
   const unresolvedCalls=scoped.flatMap(job=>job.calls??[]).filter(call=>!['succeeded','failed','cancelled','interrupted','timed_out','rejected_before_authorization'].includes(call.status));
   // Include orphan native work: absence from a saved task is uncertainty, not
   // proof of idleness. Company-wide quiet is required for this maintenance step.
   // Installed Paperclip promotes retries only from scheduled_retry. It retains
   // past retry timestamps on terminal runs; those are history, not queued work.
   const unresolvedRuns=runs.filter(run=>!['succeeded','failed','cancelled','interrupted','timed_out'].includes(run.status)||run.scheduledRetryAt!=null&&(typeof run.scheduledRetryAt!=='string'||!Number.isFinite(Date.parse(run.scheduledRetryAt))||Date.parse(run.scheduledRetryAt)>Date.now()));
   return {clientId,activeJobs:scoped.filter(job=>activeStates.includes(job.status)).length,recoveryJobs:scoped.filter(job=>job.status==='recovery_required').length+unresolvedCalls.length+unresolvedRuns.length,admittedDispatches};
  }
 };
}
export async function changeClientSourceVersion(input:Record<string,unknown>){
 requireLocalClientOffice();const id=String(input.id??'');if(!uuid.test(id))throw new Error('A valid client identity is required.');await requireExistingClient(id);
 const config={storage:plan.storage,clientId:id},trusted=callbacks(id);
 if(input.action==='recover-sources'){
  if(Object.keys(input).some(k=>!['action','id','activationId','direction'].includes(k)))throw new Error('Unexpected source recovery field.');
  return recoverOfficeSourceActivation(config,{id:String(input.activationId??''),direction:input.direction as 'forward'|'rollback'},trusted);
 }
 if(input.action!=='activate-sources'||Object.keys(input).some(k=>!['action','id','activationId','expectedOldPointerSha256','expectedOldAllocationRevision','staged','newFoundation'].includes(k)))throw new Error('Unexpected source activation action or field.');
 return activateOfficeSourceVersion(config,{id:String(input.activationId??''),expectedOldPointerSha256:String(input.expectedOldPointerSha256??''),expectedOldAllocationRevision:String(input.expectedOldAllocationRevision??''),staged:input.staged as {path:string;sha256:string},newFoundation:input.newFoundation as {id:string;revision:string}},trusted);
}

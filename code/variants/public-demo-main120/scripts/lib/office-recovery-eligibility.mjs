import {lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions=['recoverPlanning','recoverUndispatchedStage','recoverDeliveryHandoff'];
async function marker(path){try{await lstat(path);return true;}catch(e){return e.code==='ENOENT'?false:null;}}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code==='ESRCH'?false:null;}}

/** Cheap local candidate shapes, never native proof or permission to dispatch. */
export function officeRecoveryEligibility(job,{stopRequested=null,workerAlive=null,executionLockPresent=null,continuationBlocked=null}={}){
 const calls=job.calls??[],steps=job.steps??[],tasks=job.plan?.tasks,[planning,denied]=calls,last=calls.at(-1);
 const stopped=['cancelled','stopping'].includes(job.status)||stopRequested===true;
 const common=!uuid.test(job.id??'')?'invalid_task':stopped?'owner_stopped':stopRequested!==false?'stop_state_unavailable':job.kind==='conversation'?'conversation_unsupported':job.queueManaged!==true?'scope_not_verified':workerAlive===true?'worker_active':workerAlive!==false?'worker_state_unavailable':null;
 const continuation=common??(continuationBlocked!==false?'execution_not_idle':executionLockPresent===true?'execution_locked':executionLockPresent!==false?'lock_state_unavailable':null);
 const planningShape=job.status==='failed'&&!job.plan&&!steps.length&&!job.planningRecovery&&job.error?.startsWith('COO ')&&calls.length===1&&planning.stage==='planning'&&planning.status==='succeeded'&&!!planning.runId&&planning.issueId===job.issueId;
 const undispatchedShape=job.status==='failed'&&!job.undispatchedRecovery&&!job.resumeUndispatchedStage&&!job.resumePlanning&&!job.resumeDepartment&&!job.resumeFinalQa&&!job.output&&!job.qa&&calls.length===2&&planning.stage==='planning'&&planning.status==='succeeded'&&!!planning.runId&&planning.issueId===job.issueId&&denied.status==='rejected_before_authorization'&&denied.runId===null&&denied.usage===null&&Array.isArray(tasks)&&tasks.length===1&&steps.length===1&&denied.stage==='specialist:'+steps[0].id&&!steps[0].output&&!steps[0].responseReceipt&&!steps[0].spawnedFromAgentId&&['queued','failed','cancelled'].includes(steps[0].status)&&steps[0].agentId===denied.agentId&&steps[0].issueId===denied.issueId&&steps[0].id===tasks[0].id&&steps[0].roleId===tasks[0].roleId&&steps[0].assignment===tasks[0].assignment&&JSON.stringify(steps[0].dependsOn)===JSON.stringify(tasks[0].dependsOn)&&!(job.departmentReports??[]).some(r=>r.output||r.issueId||r.qa?.result||r.qa?.runId||r.partsQa?.result||r.partsQa?.runId);
 const deliveryShape=['failed','recovery_required','checking'].includes(job.status)&&(job.deliveryHandoff?.state==='pending'||job.status==='failed'&&job.qa?.pass===true)&&!!job.output&&!!job.qa&&!!job.issueId&&steps.length>0&&steps.every(s=>s.status==='completed'&&!!s.output)&&calls.length>0&&calls.every(c=>c.status==='succeeded'&&!!c.runId)&&last.stage==='qa'&&!!job.finalQaRawOutput;
 const shapes=[planningShape,undispatchedShape,deliveryShape];
 return {expectedUpdatedAt:job.updatedAt,stopRequested,actions:actions.map((action,i)=>{const reason=(i===2?common:continuation)??(!shapes[i]?'saved_shape_ineligible':null);return {action,state:reason?'blocked':'requires_verification',reasonCode:reason??'native_verification_required',startsRemainingModelWork:i!==2};})};
}

/** Catalog reads only local markers/process state. It never consults providers or writes a checkpoint. */
export async function readOfficeRecoveryEligibility(job,{directory,continuationBlocked,readMarker=marker,isAlive=alive}){
 if(!uuid.test(job.id??''))return officeRecoveryEligibility(job);
 const [stopRequested,executionLockPresent]=await Promise.all([readMarker(join(directory,job.id+'.stop')),readMarker(join(directory,'active-team.lock'))]);
 const workerAlive=job.ownerPid==null?false:Number.isSafeInteger(job.ownerPid)&&job.ownerPid>0?isAlive(job.ownerPid):null;
 return officeRecoveryEligibility(job,{stopRequested,executionLockPresent,workerAlive,continuationBlocked});
}

/** Final local boundary after asynchronous verification; not atomic with a later owner stop. */
export async function assertOfficeRecoveryCurrent(job,{directory,original,expectedUpdatedAt=job.updatedAt,continuation=false}){
 if(!uuid.test(job.id??'')||!expectedUpdatedAt)throw new Error('The exact saved recovery revision is required.');
 const raw=await readFile(join(directory,job.id+'.json'),'utf8'),current=JSON.parse(raw);
 if(current.updatedAt!==expectedUpdatedAt||original!==undefined&&raw!==original)throw new Error('The saved job changed during recovery verification. Reload before continuing.');
 if(['cancelled','stopping'].includes(current.status)||['cancelled','stopping'].includes(job.status))throw new Error('The owner stopped this task.');
 const stopped=await marker(join(directory,job.id+'.stop'));
 if(stopped!==false)throw new Error(stopped?'The owner stopped this task.':'Owner stop state is unavailable; recovery is blocked.');
 if(current.ownerPid!=null&&(!Number.isSafeInteger(current.ownerPid)||current.ownerPid<1||alive(current.ownerPid)!==false))throw new Error('The saved worker is active or unavailable; recovery is blocked.');
 if(continuation&&await marker(join(directory,'active-team.lock'))!==false)throw new Error('An active or unavailable execution lock prevents continuation.');
}

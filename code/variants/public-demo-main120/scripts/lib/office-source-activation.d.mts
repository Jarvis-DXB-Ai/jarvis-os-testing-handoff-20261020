import type {SourceVersionStorage} from './office-source-versions.mjs';
export interface SourceActivationConfig {storage:SourceVersionStorage;clientId:string;}
export interface SourceActivationRequest {
 id:string;
 /** SHA256 of the complete current.json bytes, not the manifest hash. */
 expectedOldPointerSha256:string;
 expectedOldAllocationRevision:string;
 staged:{path:string;sha256:string};
 /** Already initialized, draft, exact manifest/packet bound; never approved here. */
 newFoundation:{id:string;revision:string};
}
export interface SourceActivationAllocation {
 id:string;clientId:string;status:'audit_ready';executionMode:'audit_only';
 brandConfirmed:false;servicesConfirmed:false;sourceRevision:string;foundationId:string;
 team:unknown;revision:string;[key:string]:unknown;
}
export interface SourceActivationCallbacks {
 /** Trusted server read. Never supplied from an HTTP request payload. */
 readAllocation(clientId:string):Promise<SourceActivationAllocation>;
 /** Atomic database CAS against exact expected content/revision, tenant and stable key. */
 compareAndSwapAllocation(input:{clientId:string;activationId:string;expected:SourceActivationAllocation;next:SourceActivationAllocation}):Promise<boolean>;
 /** Must include all job kinds and requests admitted before the persistent fence. */
 assertQuiescent(clientId:string):Promise<{clientId:string;activeJobs:number;recoveryJobs:number;admittedDispatches:number}>;
}
export interface SourceActivationResult {
 version:1;id:string;clientId:string;direction:'forward'|'rollback';journalRevision:string;
 pointerSha256:string;sourceRevision:string;allocationRevision:string;foundationId:string;
 modelReplay:false;approvalGranted:false;
}
/** Cooperating dispatch/retrieval must reject existence, including malformed fence contents,
 * at clients/<clientId>/sources/activation-fence.json before reading/admitting client work.
 * Persistent failure fences are removed only after exact verified recovery.
 */
export function activateOfficeSourceVersion(config:SourceActivationConfig,input:SourceActivationRequest,callbacks:SourceActivationCallbacks):Promise<SourceActivationResult>;
export function recoverOfficeSourceActivation(config:SourceActivationConfig,input:{id:string;direction:'forward'|'rollback'},callbacks:SourceActivationCallbacks):Promise<SourceActivationResult>;
/** All existing entries count, even malformed or dead. No automatic stale-token cleanup. */
export function countOfficeSourceAdmissions(config:SourceActivationConfig):Promise<number>;
/** Wrap complete context preview and job admission; do not hold across model execution. */
export function withOfficeSourceAdmission<T>(config:SourceActivationConfig,fn:()=>Promise<T>):Promise<T>;

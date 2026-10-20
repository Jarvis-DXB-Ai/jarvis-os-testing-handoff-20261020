import type {GoalNativeDecision} from './office-goal-native-policy.mjs';
import type {SingleTaskQuotaScope} from './office-goal-budget.mjs';
import type {BoundedOfficeMetadata,OfficeGoalV2Binding,createBoundedOfficeAuthority} from './office-goal-bounded-authority.mjs';
/** Runtime validates task/context and all authority. Types never grant permission. */
export type OfficeGoalRuntimeMetadata=Omit<BoundedOfficeMetadata,'task'|'context'>&{task:unknown;context:unknown};
export type OfficeGoalDenied=Readonly<{canDispatch:false;reason:string;checkpointSaved:boolean;id:string;goalId:string;version:number;stage:string;decisionId:string|null;fileClass:string;validationPhase:string}>;
export type OfficeGoalAdmissionDecision=Readonly<{canDispatch:true;reason:'ready';checkpointSaved:true;authority:Record<string,unknown>;recheck():Promise<void>}>|OfficeGoalDenied;
export type OfficeGoalModelDecision=Readonly<{canDispatch:true;receipt:Record<string,unknown>;recheck():Promise<void>;acknowledge(runId:string):Promise<unknown>;unknown():Promise<unknown>;cancelBeforeDispatch():Promise<unknown>;settle(run:Record<string,unknown>):Promise<unknown>}>|OfficeGoalDenied;
export interface OfficeGoalRuntimeDependencies {
 /** Trusted server/test construction only; never task/HTTP input. */
 privateDirectory?:string;
 readBinding?:(directory:string)=>Promise<Readonly<OfficeGoalV2Binding>>;
 createAuthority?:typeof createBoundedOfficeAuthority;
 createPolicy?:(binding:OfficeGoalV2Binding)=>{check(stage:'admission'|'modelPolicy',singleTaskScope?:SingleTaskQuotaScope):Promise<Readonly<Pick<GoalNativeDecision,'canDispatch'|'reason'|'checkpointSaved'>&{recheckQuota?:()=>Promise<void>}>>};
}
export function createOfficeGoalPolicyRuntime(dependencies?:OfficeGoalRuntimeDependencies):Readonly<{checkOfficeGoalAdmission(metadata:OfficeGoalRuntimeMetadata):Promise<OfficeGoalAdmissionDecision>;officeGoalModelPolicy(metadata:OfficeGoalRuntimeMetadata):Promise<OfficeGoalModelDecision>}>;
export function checkOfficeGoalAdmission(metadata:OfficeGoalRuntimeMetadata):Promise<OfficeGoalAdmissionDecision>;
export function officeGoalModelPolicy(metadata:OfficeGoalRuntimeMetadata):Promise<OfficeGoalModelDecision>;

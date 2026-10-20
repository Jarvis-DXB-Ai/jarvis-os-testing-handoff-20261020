export type OfficeRecoveryAction = 'recoverPlanning' | 'recoverUndispatchedStage' | 'recoverDeliveryHandoff';
export type OfficeRecoveryEligibility = {
  expectedUpdatedAt:string;
  stopRequested:boolean|null;
  actions:{action:OfficeRecoveryAction;state:'requires_verification'|'blocked';reasonCode:string;startsRemainingModelWork:boolean}[];
};
export function officeRecoveryEligibility(job:RecoveryJob,state?:{stopRequested?:boolean|null;workerAlive?:boolean|null;executionLockPresent?:boolean|null;continuationBlocked?:boolean|null}):OfficeRecoveryEligibility;
export function readOfficeRecoveryEligibility(job:RecoveryJob,options:{directory:string;continuationBlocked:boolean;readMarker?:(path:string)=>Promise<boolean|null>;isAlive?:(pid:number)=>boolean|null}):Promise<OfficeRecoveryEligibility>;
export function assertOfficeRecoveryCurrent(job:{id:string;status:string;updatedAt:string},options:{directory:string;original?:string;expectedUpdatedAt?:string;continuation?:boolean}):Promise<void>;
import type {OfficeTeamTask} from '../../src/lib/office-team-contract';
type RecoveryJob=Partial<OfficeTeamTask>&{finalQaRawOutput?:string};

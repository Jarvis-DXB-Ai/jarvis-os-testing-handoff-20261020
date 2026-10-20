export type OfficeGoalV2Binding={version:2;enabled:true;goalId:string;ledgerPath:string;authorityPath:string;authoritySha256:string;privateDirectory:string};
export type BoundedOfficeMetadata={task:Record<string,unknown>;context:Record<string,unknown>;mode?:'submit'|'continue';stage?:string;roleId?:string;agentId?:string;adapterType?:string;model?:string;billing?:string;issueId?:string;companyId?:string;tools?:string[];methods?:unknown[];methodRoot?:string|null;plan?:unknown;concurrency?:number;workspace?:unknown;artifactGrant?:{profileId:string;profileSha256:string;clientId:string;workOrderId:string}|null;runId?:string;reservationId?:string};
export function boundedCanonical(value:unknown):string;
export function boundedSha256(value:unknown):string;
export function boundedRequestSha256(task:Record<string,unknown>):string;
export function boundedDenialReceipt(decision:unknown,options?:{stage?:string}):{version:1;decisionId:string|null;stage:string;reason:string;checkpointSaved:boolean;fileClass:string;validationPhase:string};
export function validateGoalV2Binding(config:unknown,directory:string):unknown;
export function createBoundedOfficeAuthority(binding:OfficeGoalV2Binding,options?:{now?:()=>number}):{
 initialize(ownerInitializationRef:{path:string;sha256:string}):Promise<{journalId:string;authoritySha256:string}>;
 specialistRecovery(jobId:string,stage:string):Promise<Record<string,unknown>>;
 inspect(meta:BoundedOfficeMetadata):Promise<unknown>;
 admit(meta:BoundedOfficeMetadata,options?:{existing?:boolean}):Promise<Record<string,unknown>>;
 reserve(meta:BoundedOfficeMetadata):Promise<{receipt:Record<string,unknown>;recheck():Promise<void>;acknowledge(runId:string):Promise<unknown>;unknown():Promise<unknown>;cancelBeforeDispatch():Promise<unknown>;settle(run:Record<string,unknown>):Promise<unknown>}>;
};

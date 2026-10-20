import type {CooReactiveTaskRequest,CooReactiveScope} from './office-coo-reactive.mjs';
export interface OfficeCooOperationalGrant {
 version:2;enabled:true;purpose:'future-owner-whatsapp-native-tasks';authority:{kind:'owner-instruction';principal:string;reference:string};replyGrantRevision:string;policySha256:string;revision:string;issuedAt:string;expiresAt:string;
 scopes:CooReactiveScope[];actors:{agentId:string;adapterType:'codex_local'|'claude_local';model:string}[];allowTaskHelpers:boolean;maxTasks:number;maxStagesPerTask:number;maxTotalStages:number;
}
export interface OfficeCooOperationalClaim {version:2;jobId:string;requestSha256:string;policySha256:string;grantRevision:string;ordinal:number;previousRevision:string|null;request:CooReactiveTaskRequest;at:string;revision:string;}
export function validateOfficeCooOperationalGrant(grant:unknown,reply:{principal:string;expiresAt:string},request:CooReactiveTaskRequest,at:number):OfficeCooOperationalGrant;
export function readOfficeCooOperationalTask(directory:string,request:CooReactiveTaskRequest,grant:OfficeCooOperationalGrant):OfficeCooOperationalClaim;
export function officeCooOperationalClaims(directory:string,grant:OfficeCooOperationalGrant):Promise<OfficeCooOperationalClaim[]>;
export function claimOfficeCooOperationalTask(directory:string,request:CooReactiveTaskRequest,grant:OfficeCooOperationalGrant,at:string):Promise<OfficeCooOperationalClaim>;
export function officeCooOperationalStageCount(directory:string,grant:OfficeCooOperationalGrant):Promise<number>;
export function officeCooOperationalActor(grant:OfficeCooOperationalGrant,request:CooReactiveTaskRequest,job:unknown,context:unknown,readActors?:()=>Promise<unknown>):Promise<boolean>;

export type LinkedArtifactScope={version:1;jobId:string;agentId:string;clientId:string;sourceUpdatedAt:string;files:{sourceCall:string;fileName:string;sha256:string;bytes:number;receiptSha256:string;url:string}[]};
export function linkedArtifactScope(job:unknown,agentId:string,clientId:string,receipts:unknown[]):LinkedArtifactScope;
export function validateLinkedScope(scope:LinkedArtifactScope|undefined,identity:{kind?:string;targetAgentId?:string;selectedTaskId?:string;clientId?:string}):void;
export function receiptHash(receipt:unknown):string;

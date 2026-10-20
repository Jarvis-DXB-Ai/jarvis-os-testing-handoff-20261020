export type ToolFile={name:string;bytes:number;sha256:string;url:string;verification?:{format:string;width?:number;height?:number;decoded?:boolean;parsed?:boolean;rootChecked?:boolean;headerChecked?:boolean;compression?:string}};
export type ToolReceipt={id:string;jobId:string;agentId:string;runId:string;partId:string;roleId:string;tool:string;status:string;fixture:boolean;at:string;argumentHash?:string;result:Record<string,unknown>;files:ToolFile[];reviewStatus:string};
export function nativeDraftCheckReceipts(storage:unknown,jobId:string,call:{runId:string;agentId:string;startedAt:string;finishedAt:string}):Promise<(ToolReceipt|{id:string;status:'incomplete';at:string})[]>;
export type ToolConnection={appId:string;status:string;version:string|null;testedAt:string|null;message:string;capabilities:string[];roles:string[];verification:(ToolFile&{appId:string})[];containersScope?:boolean;accountCount?:number};
export function roleTools(role:string):string[];
export function roleWorkspaceTools(role:string):string[];
export function toolAdapterOptions(plan:unknown,agent:unknown,cwd:string|null,options?:{workspaceOnly?:boolean;workspace?:boolean;workspaceRole?:string;artifactProfileId?:string|null;clientId?:string}):Promise<{tools:string[];extraArgs:string[];note:string}>;
export function bridgeReadiness(storage:unknown):Promise<{status:string;transport:string;connections:ToolConnection[];message:string}>;
export function toolReceipts(storage:unknown,jobId:string):Promise<ToolReceipt[]>;
export function readToolFile(storage:unknown,jobId:string,id:string,file:string):Promise<Buffer>;

export function localDraftProfiles(plan: any, clientId?: string): {id: string;format: string;scenes: string;secondsPerScene: string;audio: string}[];
export function scopedNativeTools(plan: any, role: string, clientId?: string, auditOnly?: boolean): string[];

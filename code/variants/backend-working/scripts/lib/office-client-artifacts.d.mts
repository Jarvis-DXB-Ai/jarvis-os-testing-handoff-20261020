/** Engineering contract. Profiles/grants/renderer are operator-owned, never MCP arguments. */
export type ClientArtifactSource={sourceId:string;path:string;sha256:string;status:'draft'|'approved'|'rejected'|'reference'};
export type ClientArtifactProfile={id:string;enabled:boolean;clientId:string;workOrderId:string;root:string;files:ClientArtifactSource[];masters:{id:string;htmlSourceId:string;cssSourceId:string;dataSourceId?:string;width:number;height:number}[]};
export type ClientArtifactGrant={profileId:string;profileSha256:string;clientId:string;workOrderId:string};
export type LocalBundleContract={version:1;origin:string;entry:string;revisionSha256:string;width:number;height:number;resourceNames:string[];requiredResources:string[];resource:(url:string)=>Buffer;check:()=>Promise<unknown>;csp:string;waitFor:string[];timeoutMs:number;network:'deny-except-exact-memory-resources';serviceWorkers:'deny';downloads:'deny'};
export type LocalBundleRenderer={contract:'office-local-bundle-v1';id:string;sourceSha256:string;leaseId:string;fixture:boolean;render:(input:LocalBundleContract)=>Promise<{png:Buffer;revisionSha256:string;complete:boolean;fontsReady:boolean;layoutReady:boolean;networkDenied:boolean;errors:string[];loadedResources:string[]}>};
export const clientArtifactSchemas:Record<string,unknown>;
export const clientArtifactFile:RegExp;
export function artifactDigest(bytes:string|Buffer):string;
export function clientProfileHash(profile:ClientArtifactProfile):string;
export function artifactProfiles(plan:any,clientId:string):ClientArtifactProfile[];
export function validateClientArtifact(name:string,args:unknown):unknown;
export function assertClientArtifactActor(ctx:any,args:any,tool:string):{profile:ClientArtifactProfile;clientId:string;workOrderId:string};
export function prepareClientArtifact(ctx:any,args:any,tool:string):Promise<any>;
export function editableBundle(input:any,args:{html:string;css:string;data:string}):{files:Map<string,Buffer>;width:number;height:number};
export function sourceArtifact(input:any):Record<string,unknown>;
export function artifactVisible(ctx:any,receipt:any,sourceJobId?:string):void;
export function readClientBundle(storage:any,jobId:string,id:string,receipt?:any):Promise<{receipt:any;manifest:any;files:Map<string,Buffer>}>;
export function allocatedClientBundle(ctx:any,id:string,revisionSha256:string):Promise<{receipt:any;manifest:any;files:Map<string,Buffer>}>;
export function saveClientBundle(ctx:any,input:any,args:any,id:string,out:string):Promise<{files:string[];result:Record<string,unknown>}>;
export function renderClientBundle(ctx:any,input:any,args:any,id:string,out:string):Promise<{files:string[];result:Record<string,unknown>}>;

export function createLeasedClientArtifactRenderer(options:{leaseId:string;checkLease:()=>Promise<void>;temporaryRoot:string;fixture?:boolean;executable?:string;onProcess?:(state:{state:string;pid?:number;cleanupConfirmed?:boolean;profile?:string;stderr?:string})=>void}):Promise<LocalBundleRenderer>;

export function artifactGrantForContext(plan:any,context:any):ClientArtifactGrant|null;
export function validateClientArtifactProfile(profile:unknown):ClientArtifactProfile;

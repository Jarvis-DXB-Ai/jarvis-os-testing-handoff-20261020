import type {OfficeCooConfig} from './office-coo-whatsapp.mjs';
import type {CooReactiveTaskRequest} from './office-coo-reactive.mjs';
export const officeCooPrivateDirectory:string;
export function officeCooTaskLineage(request:CooReactiveTaskRequest):string;
export function officeCooNativeGrantRevision(value:Record<string,unknown>):string;
export function readOfficeCooNativeRequest(directory?:string,jobId?:string):CooReactiveTaskRequest;
export interface OfficeCooNativeCapability {admit(task:unknown):Promise<{canDispatch:true;reason:string}>;assertJob(job:unknown):Promise<true>;modelPolicy(context:unknown):Promise<boolean>;request:CooReactiveTaskRequest;}
export function createOfficeCooNativeAdmission(options:{config:OfficeCooConfig;request:CooReactiveTaskRequest;directory?:string;now?:()=>number;readJob?:(id:string)=>Promise<unknown>;readActors?:()=>Promise<unknown>}):OfficeCooNativeCapability;

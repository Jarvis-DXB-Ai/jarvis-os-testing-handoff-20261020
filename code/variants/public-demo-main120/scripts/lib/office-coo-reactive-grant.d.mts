import type {CooReactivePolicy} from './office-coo-reactive.mjs';
export function canonical(value:unknown):string|undefined;
export function sha(value:unknown):string;
export function policyHash(value:unknown):string;
export function assertReactivePrivateDirectory(directory:string):void;
export function readReactivePrivateBytes(directory:string,name:string,max?:number):Buffer;
export function readReactivePrivateJson(directory:string,name:string,max?:number):unknown;
export function officeCooReactiveGrantRevision(record:Record<string,unknown>):string;
export function readOfficeCooReactiveGrant(config:{runtimeDirectory:string;binding:Record<string,unknown>;expectedGrantRevision?:string},at:string):{grant:Record<string,unknown>;policy:CooReactivePolicy};

import type {CooReactiveTaskRequest,CooReactiveScope} from './office-coo-reactive.mjs';
export interface OfficeCooServiceResponse {version:1;jobId:string;requestSha256:string;policySha256:string;scope:CooReactiveScope;code:'scope_clarification'|'admission_unconfirmed'|'owner_help';output:string;createdAt:string;revision:string;}
export function readOfficeCooServiceResponse(directory:string,request:CooReactiveTaskRequest):Promise<OfficeCooServiceResponse|null>;
export function saveOfficeCooServiceResponse(directory:string,request:CooReactiveTaskRequest,code:OfficeCooServiceResponse['code'],at?:string):Promise<OfficeCooServiceResponse>;

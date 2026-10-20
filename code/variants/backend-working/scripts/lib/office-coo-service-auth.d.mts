export const OFFICE_COO_SERVICE_BODY_LIMIT:32768;
export function readOfficeCooPrivateJson(directory:string,name:string,maxBytes?:number):Promise<any>;
export function signOfficeCooServiceRequest(secret:string,at:string,body:string):string;
export function verifyOfficeCooServiceRequest(secret:string,input:{at:string;body:string;signature:string},now?:number):boolean;

export type SharedReadReceipt={provider:string;status:string;message:string;authenticated:boolean;checkedAt:string;readOnly:true;workerRoute:'pending';evidence:string|null};
export type SharedReadiness={credentialConfigured:boolean;adapterExists:true;authenticated:boolean;workerRoute:'pending';verifiedAt:string|null;verificationStatus:string};
export const sharedProviderSpecs:Record<string,{token:string;fallback?:string;url:string;evidence:string;valid:(value:Record<string,unknown>)=>boolean}>;
export function sharedProviderReadiness(id:string,env?:Record<string,string|undefined>,now?:number):SharedReadiness|null;
export function probeSharedProvider(id:string,options?:{env?:Record<string,string|undefined>;fetchFn?:typeof fetch;now?:number}):Promise<SharedReadReceipt>;

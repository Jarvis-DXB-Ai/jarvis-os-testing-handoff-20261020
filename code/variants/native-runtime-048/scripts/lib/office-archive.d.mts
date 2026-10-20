export function storageReadiness(config:unknown):Promise<{status:string;message:string;recordsRoot?:string;mediaRoot?:string}>;
export function archiveJob(job:unknown,config:unknown):Promise<{status:string;taskPath:string;version:string;inputIds:Record<string,string>}>;
export function ensureStore(config:unknown,options?:{create?:boolean}):Promise<void>;
export function officeStorePath(root:string,path:string,create?:boolean):Promise<string>;
export function archiveSummary(config:unknown):Promise<{status:string;tasks?:number;reviewReady?:number;rejected?:number;learningCandidates?:number;approvedLessons?:number;message:string}>;

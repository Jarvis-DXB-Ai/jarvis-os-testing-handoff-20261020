export type ResearchItem={id:string;title:string;url:string;category:string;receivedAt:string;reviewedAt:string|null;decision:string;coverage:string;implementationStatus:string;observation?:string;jarvisApplication?:string;avoid?:string;ownerNotes?:string;agentRoles?:string[];tags?:string[]};
export type ResearchReceipt={path:string;sha256:string;items:number};
export function canonicalResearchUrl(value:string):string;
export function researchCatalog(config:unknown):Promise<{version:number;checkedAt:string;scope:string;items:ResearchItem[];counts:{reviewed:number;pending:number;total:number};collections:{name:string;count:number}[]}>;
export function saveResearchLink(config:unknown,input:{id:string;title:string;url:string;notes:string}):Promise<{item:ResearchItem;duplicate:boolean}>;
export function researchItem(config:unknown,id:string):Promise<ResearchItem>;
export function pinResearchContext(config:unknown,job:unknown):Promise<ResearchReceipt|null>;
export function taskResearchContext(config:unknown,job:unknown,roleId:string,assignment?:string):Promise<unknown>;

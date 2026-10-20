export type OfficeLibraryEntry={id:string;title:string;folder:string;category:string;clientId:string|null;clientIds?:string[];kind:'file'|'document';path?:string;bytes:number|null;updatedAt:string;format:string;status:string;recordId?:string;fileId?:string;summary?:string;curated?:boolean;collectionId?:string;sha256?:string;sourcePath?:string;sourceDate?:string;application?:string;rights?:string;url?:string;creator?:string};
export function libraryCategory(path:string):string;
export function indexOfficeFiles(config:unknown,options?:{roots?:string[]}):Promise<OfficeLibraryEntry[]>;
export function readOfficeLibraryFile(config:unknown,path:string):Promise<{bytes:Buffer;format:string;name:string}>;

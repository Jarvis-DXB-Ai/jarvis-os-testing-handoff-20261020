export type LibraryReference={id:string;clientId:string;curated:true;title:string;collectionId:string;path:string;sha256:string;sourcePath:string;sourceDate:string;status:string;application:string;rights:string;url?:string;creator?:string};
export const libraryCollections:{id:string;name:string;description:string}[];
export function readReferenceLibrary(config:unknown,clientId?:string):Promise<LibraryReference[]>;
export function referenceWorkspaceContext(config:unknown,clientId?:string,roleId?:string):Promise<null|{index:unknown;notes:unknown[]}>;
export function addLibraryReference(config:unknown,clientId:string,input:{id:string;title:string;collectionId:string;notes:string;url?:string}):Promise<LibraryReference>;

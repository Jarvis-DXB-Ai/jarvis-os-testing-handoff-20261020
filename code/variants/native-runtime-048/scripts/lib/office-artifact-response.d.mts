export function artifactResponse(file:string,bytes:Uint8Array,{method,range}?:{method?:string;range?:string|null}):{status:number;headers:Record<string,string>;body:Uint8Array<ArrayBuffer>|null};

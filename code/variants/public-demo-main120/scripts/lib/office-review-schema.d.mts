export function qaResponseSchema(criteria:string[]):unknown;
export function qaAdapterArguments(adapterType:string,criteria:string[]):string[];
export function modelRunOutput(run:unknown,options?:{structured?:boolean}):string|undefined;

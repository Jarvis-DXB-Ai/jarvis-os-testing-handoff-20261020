export function enforceOutputChecks<T extends {pass:boolean;checks:{criterion:string;pass:boolean;evidence:string}[]}>(qa:T,output:string):T;

export function outputWordCount(output:string):number;

export function outputLengthLimits(criterion:string):{min:number;max:number}|null;
export function assembledOutputContract(criteria?:string[]):string;

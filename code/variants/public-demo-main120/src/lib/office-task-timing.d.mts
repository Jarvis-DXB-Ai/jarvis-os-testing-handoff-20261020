import type {OfficeTeamTask} from './office-team-contract';
export type TaskTiming={elapsedSeconds:number|null;sampleCount:number;range:[number,number]|null;remaining:[number,number]|null;state:string};
export function taskTiming(task:OfficeTeamTask&{fixture?:boolean},history:(OfficeTeamTask&{fixture?:boolean})[],now?:number,models?:Record<string,string>):TaskTiming;
export function formatWorkDuration(seconds:number|null):string;

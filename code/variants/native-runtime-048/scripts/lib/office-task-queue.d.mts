import type {OfficeTeamTask} from '../../src/lib/office-team-contract';
export function queuedOfficeTasks(jobs:OfficeTeamTask[]):OfficeTeamTask[];
export function officeQueueState(jobs:OfficeTeamTask[]):{pending:number;running:number;recoveryRequired:boolean;ids:string[]};
export function drainOfficeQueue(plan:unknown,options?:{directory?:string;readJobs?:()=>Promise<OfficeTeamTask[]>;execute?:(id:string)=>Promise<OfficeTeamTask>;canExecute?:()=>Promise<boolean>;pid?:number;isAlive?:(pid:number)=>boolean}):Promise<{status:string}>;

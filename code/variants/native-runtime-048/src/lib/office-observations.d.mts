import type {OfficeTeamJob} from './office-team-server';
import type {OfficeTeamTask} from './office-team-contract';
import type {PaperclipOfficeSnapshot} from './office-paperclip';
export type WorkLane='doing'|'next'|'done'|'waiting'|'attention';
export type Progress={percent:number|null;done:number;total:number;label:string};
export type WorkPart={task:OfficeTeamTask;step:OfficeTeamTask['steps'][number];lane:WorkLane};
type Department={id:string;roles:string[];tools:string[]};
export type AppUse={agentId:string|null;roleId:string;name:string;jobId:string;stage:string;status:string;live:boolean;model:string|null;runs:number};
export function taskLane(task:OfficeTeamTask):WorkLane;
export function taskProgress(task:OfficeTeamTask):Progress;
export function partProgress(step:OfficeTeamTask['steps'][number]):Progress;
export function partLane(step:OfficeTeamTask['steps'][number],task:OfficeTeamTask):WorkLane;
export function departmentWork(jobs:OfficeTeamTask[],departmentId:string,departments:Department[]):{parts:WorkPart[];reports:{task:OfficeTeamTask;report:import('./office-team-contract').OfficeDepartmentReport}[];counts:Record<WorkLane,number>;waitingReview:number;failedQa:number;current:WorkPart|null;next:WorkPart|null};
export function appUse(appId:string,jobs:OfficeTeamTask[],snapshot:PaperclipOfficeSnapshot|null):AppUse[];
export function usedApps(task:OfficeTeamTask,agentId:string,snapshot:PaperclipOfficeSnapshot|null):string[];
export function plannedAppRoles<T extends {id:string;model:string;provider:string}>(appId:string,plan:{executives:T[];roles:T[];focusDepartments:Department[]}):T[];

export function historicalProgress(job:OfficeTeamJob):Progress;

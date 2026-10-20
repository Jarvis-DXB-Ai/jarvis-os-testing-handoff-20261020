import type {PaperclipOfficeSnapshot} from './office-paperclip';
import type {OfficeTeamTask} from './office-team-contract';
export type OfficeEnvironment={fresh:boolean;registered:number|null;runningAgentIds:string[];review:number;attention:number;queued:number;events:{id:string;jobId:string;agentId:string;actor:string;action:string;status:string;at:string;live:boolean}[]};
export function officeEnvironment(snapshot:PaperclipOfficeSnapshot|null,jobs:OfficeTeamTask[],roleIds:string[],now:number):OfficeEnvironment;

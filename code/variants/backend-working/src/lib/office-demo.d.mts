export type DemoStage={role:string;label:string;duration:number;detail:string;kind:string};
export type DemoJob={appIds:string[];workload:string;id:string;department:string;title:string;depends:string[];start:number;metric?:string;taskType?:string;recipeId?:string;scenarioId?:string;input?:string;deliverable?:string;acceptanceCriteria?:string[];effortMinutes?:[number,number]|null;playbackSeconds?:number;timing?:string;approvalScope?:string;arrivedAt?:number;outcome:string;stages:DemoStage[]};
export type DemoTask=DemoJob&{timeline:(DemoStage&{index:number;begin:number;end:number;status:string})[];current:(DemoStage&{index:number;begin:number;end:number;status:string})|null;status:string;finishedAt:number|null;progress:number};
export const demoClient:{id:string;name:string;logoUrl:string};
export const demoReferences:[string,string][];
export const demoJobs:DemoJob[];
export function demoFrame(seconds:number,approvals?:Record<string,number>):{jobs:DemoTask[];events:{id:string;jobId:string;role:string;at:number;title:string;detail:string;kind:string;department:string}[];working:DemoTask[];done:DemoTask[];waiting:DemoTask[]};

export const demoConnections:{id:string;name:string;purpose:string}[];
export function demoPlaybackDelta(previous:number|null,timestamp:number,active?:boolean):number;

export type DemoCheckpoint={at:number;taskId:string;title:string;detail:string};
export function demoWalkthrough(seconds:number,approvals?:Record<string,number>):{next:DemoCheckpoint|null;current:{title:string;detail:string};limit:number;complete:boolean;awaitingApproval:boolean};

export const demoLiveLanes:readonly {readonly department:string;readonly author:string;readonly qa:string;readonly head:string;readonly appIds:readonly string[];readonly titles:readonly string[];readonly variant:number;readonly authors:readonly string[]}[];
export type DemoRequest={id:string;department:string;title:string;start:number};
export function demoLiveFrame(seconds:number,approvals?:Record<string,number>,requests?:DemoRequest[]):ReturnType<typeof demoFrame>&{completedTotal:number};

export const demoTaskLimit:1000;
export function demoLiveCycleEnd(approvals?:Record<string,number>,requests?:DemoRequest[]):number;

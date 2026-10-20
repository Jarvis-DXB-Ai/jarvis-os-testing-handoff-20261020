export type OfficeReadinessCheck={id:string;title:string;ready:boolean;detail:string};
export type OfficeReadiness={checkedAt:string;checks:OfficeReadinessCheck[];blockers:OfficeReadinessCheck[];canSubmit:boolean;canEnqueue:boolean;busy:boolean;recoveryRequired:boolean;knowledge:{foundations:number;approvedFoundations:number;approvedLessons:number};verifiedTaskId:string|null;verifiedAt:string|null;message:string};
export function assessOfficeReadiness(input:{checks:OfficeReadinessCheck[];knowledge:OfficeReadiness['knowledge'];jobs:import('./office-team-contract').OfficeTeamTask[];checkedAt?:string}):OfficeReadiness;
export function assessConversationReadiness(readiness:OfficeReadiness,adapterType:string|undefined):{canSubmit:boolean;message:string};

export function untrackedRunningAgents<T extends {id:string;status:string}>(agents:T[],jobs:import('./office-team-contract').OfficeTeamTask[]):T[];

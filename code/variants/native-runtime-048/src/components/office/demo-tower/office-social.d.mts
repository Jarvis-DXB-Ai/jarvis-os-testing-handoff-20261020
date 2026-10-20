export type SharedSpace={id:string;name:string;description:string;center:number[];portal:number[];spots:{position:number[];rotation:number;posture:string;gesture:string}[]};
export type SocialActivity={agentId:string;spaceId:string;phase:string};
export type SocialHome={position:number[];rotation:number;index:number;elevation?:number;exit?:number[][]};
export type SocialPose={position:number[];rotation:number;posture:string;gesture:string|null};
export const officeSharedSpaces:SharedSpace[];
export function officeVisitPath(home:SocialHome,space:SharedSpace,spot:SharedSpace['spots'][number]):number[][];
export function createOfficeSocial(homes:Map<string,SocialHome>,options?:{visitPath?:(home:SocialHome,space:SharedSpace,spot:SharedSpace['spots'][number])=>number[][]}):{update(time:number,agents:{id:string;role:string;state:string;running:boolean;available?:boolean}[],enabled?:boolean,allowNew?:boolean):{poses:Map<string,SocialPose>;activity:SocialActivity[]}};

export function officeCanTakeBreak(input:{fresh:boolean;status:string;state:string;running:boolean;assigned:boolean;role:string}):boolean;

export const officeSocialPacing:{maxVisitors:number;initialQuiet:number;betweenVisits:number};

export type DemoLabelRect={x:number;y:number;width:number;height:number};
export function demoRoleLabel(name:string):string;
export function demoAgentNamesEnabled(department:string,zoom:number):boolean;
export function demoInViewAgents<T extends {visible:boolean;x:number;y:number}>(items:T[],width:number,height:number):T[];
export function demoWaitingRoleIds(waiting:{status:string;department?:string;timeline?:{role:string}[];current:{role:string;status:string;kind:string;index?:number}|null}[],registeredRoles:string[],departmentHeads?:readonly {department:string;head:string}[]):string[];
export function demoWorkstationLabelAnchor(seat:{x:number;y:number;z:number},monitor:{x:number;y:number;z:number}[]|undefined,index:number):{x:number;y:number;z:number};

export function demoLabelOffset(role:string,phone:boolean):[number,number];

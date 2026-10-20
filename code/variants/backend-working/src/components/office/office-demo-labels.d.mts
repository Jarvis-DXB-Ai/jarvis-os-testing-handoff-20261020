export type DemoLabelRect={x:number;y:number;width:number;height:number};
export function demoRoleLabel(name:string):string;
export function demoLabelPositions(items:{id:string;x:number;y:number;selected?:boolean;labelWidth?:number;monitor?:DemoLabelRect}[],width:number,height:number,obstacles?:DemoLabelRect[],options?:{focused?:boolean}):{id:string;x:number;y:number;width:number;height:number;muted:boolean}[];

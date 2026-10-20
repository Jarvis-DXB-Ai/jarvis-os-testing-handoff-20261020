export type OfficeRoom={id:string;x:number;z:number;angle:number;halfWidth:number;back:number;front:number;doorWidth:number};
export const officeRoomPlan:OfficeRoom[];
export const circulation:{halfWidth:number;halfDepth:number};
export const officeCommonsCenters:Record<string,number[]>;
export function sharedOfficeDesk(department:string,index:number):{x:number;z:number;exit:number[][]};
export function roomPoint(room:OfficeRoom,x:number,z:number):number[];
export function roomDesk(i:number,department?:string):{x:number;z:number};
export function roomExit(room:OfficeRoom,x:number,z:number):number[][];
export function officeBoundary(a:number):number[];
export function officeArrivalPlan():ReturnType<typeof import('./office-demo-floor-plan.mjs').demoArrivalPlan>;
export function circulationPath(from:number[],to:number[]):number[][];
export function supportExit(angle:number):number[][];

export function arrivalCorePolygon(polygon:number[][],lift:{position:number[];angle:number;width:number}):number[][];

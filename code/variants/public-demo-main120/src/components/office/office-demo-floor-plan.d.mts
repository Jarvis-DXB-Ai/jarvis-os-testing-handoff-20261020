import type {OfficeRoom} from './office-floor-plan.mjs';
import type {SharedSpace,SocialHome} from './office-social.mjs';
export type DemoOfficeRoom=OfficeRoom & {capacity:number;start:number;end:number;middle:number;polygon:number[][];outer:number[][];inner:number[][];fronts:number[][][];door:number[];hall:number[];doorAngle:number;area:number;columns:number;spacing:number;desks:{x:number;z:number;angle:number;pod:string;exit:number[][]}[];fixtures:{kind:string;x:number;z:number;width:number;depth:number}[]};
export const demoPromenade:{x:number;z:number};
export function demoBoundary(angle:number):number[];
export function demoOfficeRooms(departments:{id:string;headRoleId:string;qaRoleId:string;roles:string[]}[]):DemoOfficeRoom[];
export function demoPointInRoom(room:DemoOfficeRoom,point:number[],margin?:number):boolean;
export function demoRoomDesk(room:DemoOfficeRoom,index:number):{x:number;z:number;angle:number;pod:string;exit:number[][]};
export function demoRoomExit(room:DemoOfficeRoom,x:number,z:number):number[][];
export function demoPromenadePoint(angle:number):number[];
export function demoCirculationPath(from:number[],to:number[]):number[][];
export function demoVisitPath(home:SocialHome,space:SharedSpace,spot:SharedSpace['spots'][number]):number[][];
export function demoArrivalPlan():{polygon:number[][];outer:number[][];fronts:number[][][];entry:{position:number[];width:number;leaves:{side:number;center:number;width:number;depth:number}[]};counter:number[][];waiting:number[][];waitingBack:number[][];fixtures:{kind:string;position:number[];angle:number;width:number;depth:number}[];checkin:number[];visitorRoutes:number[][][];walkway:number[][]};

export function demoDeskPoint(room:DemoOfficeRoom,desk:DemoOfficeRoom['desks'][number],x:number,z:number):number[];
export function demoDeskFootprint(room:DemoOfficeRoom,desk:DemoOfficeRoom['desks'][number]):number[][];

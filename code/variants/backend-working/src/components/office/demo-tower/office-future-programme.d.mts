import type {DemoOfficeRoom} from './office-demo-floor-plan.mjs';
export type ProgrammeRect={kind:string;x:number;z:number;width:number;depth:number};
export type FutureProfile={title:string;resource:string;review:string;bar:string;features:string[]};
export const futureProfiles:Record<string,FutureProfile>;
export function pointInside(poly:number[][],p:number[],margin?:number):boolean;
export function rectCorners(rect:ProgrammeRect):number[][];
export function rectsOverlap(a:ProgrammeRect,b:ProgrammeRect,pad?:number):boolean;
export function planFutureProgramme(room:DemoOfficeRoom):{id:string;links:ProgrammeRect[];staff:number;profile:FutureProfile|undefined;placements:ProgrammeRect[];placementBasis:string;localPolygon:number[][]}|null;

export type OfficeLightingMode='live'|'sunrise'|'midday'|'sunset'|'night';
export const dubaiLocation:Readonly<{name:string;latitude:number;longitude:number;timeZone:string;utcOffset:number}>;
export function smooth(min:number,max:number,value:number):number;
export function dubaiSolarDay(value?:number):{sunrise:number;noon:number;sunset:number;date:string};
export type DubaiDaylight={mode:OfficeLightingMode;at:number;actual:number;phase:string;elevation:number;azimuth:number;daylight:number;night:number;warmth:number;sunVisible:boolean;windows:number;sunDirection:number[];sunrise:number;noon:number;sunset:number;date:string};
export function dubaiDaylight(value?:number,mode?:OfficeLightingMode):DubaiDaylight;

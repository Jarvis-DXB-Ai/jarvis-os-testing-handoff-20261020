export const pilotTaskTypes:string[];
export function pilotDigest(value:unknown):string;
export function verifyPilotSnapshot(bundle:any,current:any):void;
export function readPilotSources(storage:any,id:string):Promise<{manifest:any;path:string;sha256:string}>;

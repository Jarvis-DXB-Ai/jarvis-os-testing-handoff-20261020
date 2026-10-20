export type AgencyScheduleItem = {
 id:string; clientId:string; clientName:string; title:string; kind:string;
 status:string; date:string|null; time:string|null; month:string|null;
 source:'publishing'|'planner'|'observed'; previewUrl:string|null; caption:string|null;
 platforms:Array<{name:string;status:string}>;
};
export type AgencyContentData={generatedAt:string;today:string;clients:Array<{id:string;name:string;hidden:boolean}>;items:AgencyScheduleItem[]};
export function dubaiDate(value:string|Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function scheduleSection(item:AgencyScheduleItem,today:string){return !item.date?'undated':item.date<today?'past':item.date===today?'today':'upcoming';}
export function scheduleStatusTone(status:string){const s=status.toLowerCase();return s==='published'?'done':s==='failed'||s==='blocked'?'danger':s==='scheduled'||s==='publishing'?'scheduled':s==='approved'?'approved':'neutral';}

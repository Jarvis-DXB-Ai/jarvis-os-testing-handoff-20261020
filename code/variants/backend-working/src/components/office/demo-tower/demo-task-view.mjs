// Pure presentation of scripted task data. Queue/owner markers never become agents.
export const demoRoleLabel=(id,roles)=>id==='queue'?'Waiting for resource/review':id==='owner'?'Fictional owner decision':roles.find(role=>role.id===id)?.name??id;
export const demoDepartmentLabel=(id,departments)=>departments.find(department=>department.id===id)?.name??'Office coordination';
export const isDemoAgentRole=(id,roles)=>roles.some(role=>role.id===id);
const duration=value=>{const seconds=Math.max(0,Math.round(value));return seconds>=60?`${Math.floor(seconds/60)}m${seconds%60?' '+seconds%60+'s':''}`:`${seconds}s`;};
export function demoTaskTiming(job){
 const effort=job.effortMinutes?`${job.effortMinutes[0]}–${job.effortMinutes[1]} min illustrative effort`:'No work estimate';
 const playback=job.stages.reduce((sum,stage)=>sum+stage.duration,0);
 return `${effort} · ${duration(playback)} demo playback`;
}
export function demoTaskContext(job){
 if(!job.input)return null;
 return `Input: ${job.input} Deliverable: ${job.deliverable??'See brief.'} Checks: ${(job.acceptanceCriteria??[]).join('; ')} ${job.status==='done'?'Illustrative result':'Intended result'}: ${job.outcome}`;
}
export function demoAssignmentPhase(job,role){
 const own=job.timeline.filter(stage=>stage.role===role);
 if(!own.length)return null;
 if(own.some(stage=>stage.status==='working'))return 'doing';
 if(own.some(stage=>stage.status==='queued'))return 'next';
 return own.every(stage=>stage.status==='done')?'done':null;
}
export function demoAssignmentStage(job,role){
 const own=job.timeline.filter(stage=>stage.role===role);
 return own.find(stage=>stage.status==='working')??own.find(stage=>stage.status==='queued')??own.at(-1);
}
export const demoAssignmentStatus=(job,role)=>({doing:'working',next:'queued',done:'done'}[demoAssignmentPhase(job,role)]??'queued');
export const demoAssignmentPrefix=(job,role)=>({doing:'Doing · ',next:'Next · ',done:'✓ Role stage complete · '}[demoAssignmentPhase(job,role)]??'');
export function demoAssignmentSummary(job,role){
 const phase=demoAssignmentPhase(job,role),stage=demoAssignmentStage(job,role);
 return phase==='done'?`Role stage checked${job.status==='done'?' · Task handed off':' · Task continues with the team'}`:stage?.label??'Awaiting assignment';
}

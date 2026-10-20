const active=new Set(['queued','planning','working','reporting','synthesising','checking','stopping']);
const stamp=value=>typeof value==='string'?Date.parse(value):NaN;
function finishedAt(task){
 const ended=task.calls.map(c=>stamp(c.finishedAt)).filter(Number.isFinite);
 return ended.length?Math.max(...ended):stamp(task.updatedAt);
}
function signature(task,models){
 if(!task.plan||!task.steps.length)return null;
 const nodes=task.steps.map(s=>`${s.roleId}:${s.model}:${s.dependsOn.map(id=>task.steps.find(p=>p.id===id)?.roleId??'?').sort().join(',')}`).sort();
 const model=stage=>task.calls.find(c=>c.stage===stage)?.model??models[stage==='qa'?'test':'coo'];
 if(!model('planning')||!model('qa'))return null;
 return JSON.stringify([task.departmentPackageReviewVersion??0,nodes,(task.departmentReports??[]).map(r=>[r.departmentId,r.roleId,r.model]).sort(),task.concurrency,model('planning'),model('qa')]);
}
/** Time is an estimate from comparable completed teams, never a source of progress. */
export function taskTiming(task,history,now=Date.now(),models={}){
 const started=stamp(task.createdAt),running=active.has(task.status),end=running?now:finishedAt(task);
 const elapsedSeconds=Number.isFinite(started)&&Number.isFinite(end)?Math.max(0,Math.floor((end-started)/1000)):null;
 const key=signature(task,models),size=(task.brief.length+(task.context?.length??0));
 const samples=new Map();
 for(const prior of history){
  if(prior.id===task.id||prior.kind==='conversation'||prior.fixture||!['needs_review','reviewed'].includes(prior.status)||!prior.qa?.pass||signature(prior,models)!==key||!key)continue;
  const priorSize=prior.brief.length+(prior.context?.length??0);
  if(size&& (priorSize<size/2||priorSize>size*2))continue;
  const duration=(finishedAt(prior)-stamp(prior.createdAt))/1000;
  if(Number.isFinite(duration)&&duration>0&&duration<86400)samples.set(prior.id,duration);
 }
 const durations=[...samples.values()],sampleCount=durations.length;
 const range=sampleCount>=3?[Math.floor(Math.min(...durations)),Math.ceil(Math.max(...durations))]:null;
 if(!running)return {elapsedSeconds,sampleCount,range:null,remaining:null,state:['needs_review','reviewed','answered'].includes(task.status)?'finished':'attention'};
 if(!range||elapsedSeconds===null)return {elapsedSeconds,sampleCount,range:null,remaining:null,state:'learning'};
 if(elapsedSeconds>=range[1])return {elapsedSeconds,sampleCount,range,remaining:null,state:'overdue'};
 return {elapsedSeconds,sampleCount,range,remaining:[Math.max(0,range[0]-elapsedSeconds),range[1]-elapsedSeconds],state:'estimated'};
}
export function formatWorkDuration(seconds){
 if(seconds===null||!Number.isFinite(seconds))return '—';
 const n=Math.max(0,Math.floor(seconds));
 if(n<60)return `${n}s`;
 if(n<3600)return `${Math.floor(n/60)}m ${n%60}s`;
 return `${Math.floor(n/3600)}h ${Math.floor(n%3600/60)}m`;
}

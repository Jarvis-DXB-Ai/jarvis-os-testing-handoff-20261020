/** Read-only scene projection. Decorative motion is never an execution signal. */
export function officeEnvironment(snapshot,jobs,roleIds,now) {
 const checked=Date.parse(snapshot?.checkedAt??'');
 const age=now-checked;
 const fresh=snapshot?.status==='connected'&&Number.isFinite(age)&&age>=0&&age<=12000;
 const known=new Set(roleIds);
 const actors=(snapshot?.agents??[]).filter(a=>known.has(a.blueprintRoleId)||a.spawnedForTask);
 const runningAgentIds=fresh?actors.filter(a=>a.status==='running').map(a=>a.id):[];
 const registered=snapshot?.status==='connected'?actors.filter(a=>!a.spawnedForTask).length:null;
 const review=jobs.filter(j=>j.status==='needs_review').length;
 const attention=jobs.filter(j=>['failed','blocked','recovery_required','rejected'].includes(j.status)).length;
 const queued=jobs.filter(j=>['queued','planning','working','reporting','synthesising','checking'].includes(j.status)).reduce((n,j)=>n+(j.steps??[]).filter(s=>s.status==='queued').length,0);
 const events=jobs.flatMap(j=>(j.calls??[]).filter(c=>c.runId&&!c.fixture).map(c=>{
  const at=c.finishedAt??c.startedAt;
  if(!Number.isFinite(Date.parse(at??'')))return null;
  const stage=c.stage??'';
  const action=stage.startsWith('specialist:')?'Specialist work':stage.startsWith('department-qa:')?'Department quality review':stage.startsWith('department:')||stage.startsWith('head:')?'Head report':stage==='planning'?'Team planning':stage==='synthesis'?'COO assembly':stage==='qa'?'Final quality review':'Recorded model call';
  const actor=snapshot?.agents?.find(a=>a.id===c.agentId)?.name??c.roleId??'Agent';
  const live=fresh&&runningAgentIds.includes(c.agentId)&&c.status==='running'&&['planning','working','reporting','synthesising','checking','stopping'].includes(j.status)&&snapshot.runs?.some(r=>r.id===c.runId&&r.status==='running');
  return {id:j.id+':'+c.runId,jobId:j.id,agentId:c.agentId,actor,action,status:live?'running':c.status==='running'?'last recorded running':c.status,at,live};
 })).filter(Boolean).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,4);
 return {fresh,registered,runningAgentIds,review,attention,queued,events};
}

/** A waiting queue entry alone cannot claim an unrelated running desk. */
export function untrackedRunningAgents(agents,jobs){return agents.filter(a=>a.status==='running'&&!jobs.some(j=>['planning','working','reporting','synthesising','checking','stopping','recovery_required'].includes(j.status)&&j.calls.some(c=>c.agentId===a.id)));}
/** A selected desk needs its own verified subscription, never a substitute. */
export function assessConversationReadiness(readiness,adapterType){
 const provider=adapterType==='codex_local'?'codex':adapterType==='claude_local'?'claude':null;
 if(!provider)return{canSubmit:false,message:'This desk has no supported subscription runtime.'};
 const own=readiness.checks.find(c=>c.id===provider);
 if(!own?.ready)return{canSubmit:false,message:own?.detail??'The selected desk subscription has not been verified.'};
 const other=provider==='codex'?'claude':'codex',blocker=readiness.checks.find(c=>c.id!==other&&!c.ready);
 if(blocker)return{canSubmit:false,message:blocker.detail};
 if(readiness.recoveryRequired)return{canSubmit:false,message:'Inspect and reconcile the interrupted task before starting new work.'};
 if(readiness.busy)return{canSubmit:false,message:'The Office is working. Wait before messaging this desk.'};
 return{canSubmit:true,message:'The selected desk subscription and shared prerequisites are ready.'};
}
export function assessOfficeReadiness({checks,knowledge,jobs,checkedAt=new Date().toISOString()}) {
  const blockers=checks.filter(c=>!c.ready);
  const active=jobs.filter(j=>['queued','planning','working','reporting','synthesising','checking','stopping'].includes(j.status));
  const recovery=jobs.filter(j=>j.status==='recovery_required');
  const proof=jobs.find(j=>j.kind!=='conversation'&&j.version>=4&&['needs_review','reviewed'].includes(j.status)&&j.output&&j.qa?.pass===true&&j.departmentReports?.length&&j.departmentReports.every(r=>r.status==='completed'&&r.output&&r.agentId&&r.qa?.agentId&&r.qa.agentId!==r.agentId&&r.qa.status==='completed'&&r.qa.runId&&r.qa.result?.pass===true&&r.qa.result.checks?.length&&r.qa.result.checks.every(c=>c.pass&&c.evidence?.trim())&&!j.steps?.some(s=>s.agentId===r.qa.agentId)&&j.calls.some(c=>c.stage===`department-qa:${r.departmentId}`&&c.agentId===r.qa.agentId&&c.status==='succeeded'&&c.runId===r.qa.runId&&c.usage?.billingType==='subscription_included'))&&j.steps?.length&&j.steps.every(s=>s.status==='completed'&&s.output&&j.calls.some(c=>c.stage===`specialist:${s.id}`&&c.status==='succeeded'&&c.runId&&c.usage?.billingType==='subscription_included')&&j.departmentReports.filter(r=>r.stepIds.includes(s.id)).length===1)&&['planning','synthesis','qa'].every(stage=>j.calls.some(c=>c.stage===stage&&c.status==='succeeded'&&c.runId&&c.usage?.billingType==='subscription_included'))&&j.departmentReports.every(r=>j.calls.some(c=>c.stage===`department:${r.departmentId}`&&c.status==='succeeded'&&c.runId&&c.usage?.billingType==='subscription_included')));
  return {checkedAt,checks,blockers,canEnqueue:blockers.length===0,canSubmit:blockers.length===0&&!active.length&&!recovery.length,busy:active.length>0,recoveryRequired:recovery.length>0,knowledge,verifiedTaskId:proof?.id??null,verifiedAt:proof?.updatedAt??null,
    message:blockers.length?blockers[0].detail:recovery.length?'Inspect and reconcile the interrupted task before starting new work.':active.length?'The Office is working. New COO messages will join the queue.':'Ready for internal assignments using supplied context and verified task-scoped tools.'};
}

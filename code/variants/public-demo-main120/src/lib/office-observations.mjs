const nativeApps={cloudflare_status:'cloud',github_search:'github',graphic_card:'sharp',blender_scene:'blender',video_from_card:'ffmpeg'};
/** Read-only projections of saved Office events. No clocks, guesses or tool grants. */
export function taskLane(task){
 if(task.status==='reviewed')return 'done';
 if(['failed','cancelled','recovery_required'].includes(task.status))return 'attention';
 if(['needs_review','blocked'].includes(task.status))return 'waiting';
 if(task.status==='queued')return 'next';
 return 'doing';
}
export function taskProgress(task){
 if(!task.plan)return {percent:null,done:0,total:0,label:'Plan not saved'};
 const departmentQa=task.version>=4?(task.departmentReports??[]).filter(r=>r.qa):[];
 const total=task.steps.length+(task.departmentReports?.length??0)+departmentQa.length+4;
 const done=departmentQa.filter(r=>r.qa.status==='completed'&&r.qa.result?.pass===true).length+1+task.steps.filter(s=>s.status==='completed'&&s.output).length+(task.departmentReports??[]).filter(r=>(task.departmentPackageReviewVersion===1||r.status==='completed')&&r.output).length+(task.output?1:0)+(task.qa?.pass?1:0)+(task.status==='reviewed'&&task.reviewedAt?1:0);
 return {percent:Math.min(100,Math.round(done/total*100)),done,total,label:'Accepted milestones: plan, specialist outputs, department QA and reports, assembly, QA, owner review'};
}
export function partProgress(step){
 const done=Number(Boolean(step.issueId))+Number(Boolean(step.startedAt))+Number(step.status==='completed'&&Boolean(step.output));
 return {percent:Math.round(done/3*100),done,total:3,label:'Saved lifecycle events: assigned issue, run started, output saved'};
}
export function partLane(step,task){
 if(step.status==='completed'&&step.output)return 'done';
 if(['failed','cancelled'].includes(step.status)||['failed','cancelled','recovery_required'].includes(task.status))return 'attention';
 if(step.status==='running')return 'doing';
 if(task.status==='blocked'||step.dependsOn.some(id=>task.steps.find(s=>s.id===id)?.status!=='completed'))return 'waiting';
 return 'next';
}
export function departmentWork(jobs,departmentId,departments){
 const shared=departments.some(d=>d.id==='support')?'shared-support':'support';
 const matches=role=>departmentId==='all'||(departments.find(d=>d.roles.includes(role))?.id??shared)===departmentId;
 const parts=jobs.flatMap(task=>task.steps.filter(s=>matches(s.roleId)).map(step=>({task,step,lane:partLane(step,task)})));
 const counts=Object.fromEntries(['doing','next','done','waiting','attention'].map(lane=>[lane,parts.filter(p=>p.lane===lane).length]));
 const waitingReview=jobs.filter(t=>t.status==='needs_review'&&t.steps.some(s=>matches(s.roleId))).length;
 const failedQa=jobs.filter(t=>t.qa?.pass===false&&t.steps.some(s=>matches(s.roleId))).length;
 const reports=jobs.flatMap(task=>(task.departmentReports??[]).filter(r=>departmentId==='all'||r.departmentId===departmentId||(departmentId===shared&&!departments.some(d=>d.id===r.departmentId))).map(report=>({task,report})));
 return {parts,reports,counts,waitingReview,failedQa,current:parts.find(p=>p.lane==='doing')??null,next:parts.find(p=>p.lane==='next')??null};
}
function runtimeApp(call,snapshot){
 // Execution receipts take precedence over a role's present-day model mapping.
 const model=(call.usage?.model??call.model??'').toLowerCase();
 if(/claude|opus|sonnet|haiku/.test(model))return 'claude';
 if(/gpt|codex/.test(model))return 'codex';
 const agent=snapshot?.agents.find(a=>a.id===call.agentId);
 return agent?.adapter==='claude_local'?'claude':agent?.adapter==='codex_local'?'codex':null;
}
export function appUse(appId,jobs,snapshot){
 const rows=[];
 for(const task of jobs){
  for(const call of task.calls){
   if(!call.runId)continue;
   const runtime=runtimeApp(call,snapshot);
   const matches=appId==='paperclip'||appId===runtime||appId===`model-${call.model}`;
   if(!matches)continue;
   const agent=snapshot?.agents.find(a=>a.id===call.agentId);
   rows.push({agentId:call.agentId,roleId:call.roleId,name:agent?.name??task.steps.find(s=>s.agentId===call.agentId)?.name??call.roleId,jobId:task.id,stage:call.stage,status:call.status,live:snapshot?.status==='connected'&&['queued','planning','working','reporting','synthesising','checking','stopping'].includes(task.status)&&['running','queued'].includes(call.status)&&snapshot.runs?.some(r=>r.id===call.runId&&r.status==='running')===true,model:call.usage?.model??call.model});
  }
  for(const r of task.toolCalls??[]){if(r.fixture||r.status!=='completed')continue;const app=nativeApps[r.tool];if(appId!==app&&!(appId==='bridge-media'&&['sharp','blender','ffmpeg'].includes(app))&&!(appId==='bridge-research'&&app==='github'))continue;rows.push({agentId:r.agentId,roleId:r.roleId,name:snapshot?.agents.find(a=>a.id===r.agentId)?.name??r.roleId,jobId:task.id,stage:r.tool,status:r.result?.status==='unavailable'?'unavailable':'completed',live:false,model:null});}
  if(appId==='review'&&task.archive?.status==='synced')rows.push({agentId:null,roleId:'archive',name:'Jarvis archive coordinator',jobId:task.id,stage:'Saved task + outputs',status:'saved',live:false,model:null});
 }
 const byAgent=new Map();
 for(const row of rows){const key=row.agentId??row.roleId,previous=byAgent.get(key);if(previous){previous.runs++;previous.live||=row.live;}else byAgent.set(key,{...row,runs:1});}
 return [...byAgent.values()];
}
export function usedApps(task,agentId,snapshot){
 const calls=task.calls.filter(c=>c.agentId===agentId&&c.runId);
 const runtime=[...new Set(calls.map(c=>runtimeApp(c,snapshot)).filter(Boolean))];
 const native=(task.toolCalls??[]).filter(r=>r.agentId===agentId&&!r.fixture&&r.status==='completed').map(r=>nativeApps[r.tool]).filter(Boolean);
 return [...new Set([...(calls.length?['paperclip',...runtime]:[]),...native,...(task.archive?.status==='synced'&&task.steps.some(s=>s.agentId===agentId&&s.output)?['review']:[])])];
}
export function plannedAppRoles(appId,plan){
 const all=[...plan.executives,...plan.roles].filter(r=>!r.rosterStatus||r.rosterStatus==='active');
 if(appId==='paperclip'||appId==='review')return all;
 if(appId.startsWith('model-'))return all.filter(r=>r.model===appId.slice(6));
 if(appId==='claude'||appId==='codex')return all.filter(r=>appId==='claude'?r.provider==='Claude Code':r.provider==='Codex');
 const teams=[...plan.focusDepartments,...(plan.supportDepartments??[])].filter(d=>d.tools.includes(appId));
 return all.filter(r=>teams.some(d=>d.roles.includes(r.id)));
}

export function historicalProgress(job){
 const total=job.steps.length+3;
 const done=job.steps.filter(s=>s.status==='completed'&&s.output).length+Number(Boolean(job.synthesis))+Number(job.context_manifest?.qa?.pass===true)+Number(job.status==='reviewed');
 return {percent:Math.round(done/total*100),done,total,label:'Earlier executor milestones: specialist outputs, department QA and reports, assembly, QA, internal owner review'};
}

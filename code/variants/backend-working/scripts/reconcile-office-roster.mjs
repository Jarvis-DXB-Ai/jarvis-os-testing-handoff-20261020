import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {listJobs,activeStates,jobDirectory} from './lib/office-team-engine.mjs';
import {validateRoster} from './lib/office-roster.mjs';

const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
validateRoster(plan);
const apply=process.argv.includes('--apply'),origin='http://127.0.0.1:3100';
async function api(path,body) {
  const response=await fetch(origin+'/api'+path,{method:body?'PATCH':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error('Local roster reconciliation failed: HTTP '+response.status);
  return response.json();
}
function idle(jobs,agents) {
  if(jobs.some(j=>activeStates.includes(j.status)||j.status==='recovery_required')||agents.some(a=>a.status==='running'))throw new Error('Office must be idle and reconciled before roster updates.');
}
const agents=await api(`/companies/${plan.paperclipCompanyId}/agents`);
idle(await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),agents);
const canonical=agents.filter(a=>!a.metadata?.jarvisSpawnedForTask&&!a.metadata?.jarvisClientId);
const changes=[];
for(const role of [...plan.executives,...plan.roles]) {
  const matches=canonical.filter(a=>a.metadata?.jarvisBlueprintRoleId===role.id);
  if(matches.length!==1)throw new Error('Missing or ambiguous registered role: '+role.id);
  const agent=matches[0],parent=role.reportsTo?canonical.find(a=>a.metadata?.jarvisBlueprintRoleId===role.reportsTo):null;
  if(role.reportsTo&&!parent)throw new Error('Missing reporting head.');
  const after={name:role.name,title:role.name,capabilities:role.output,reportsTo:parent?.id??null,metadata:{...agent.metadata,jarvisDepartmentId:role.departmentId,jarvisQaDepartment:[...plan.focusDepartments,...plan.supportDepartments].find(d=>d.qaRoleId===role.id)?.id??null,jarvisRosterStatus:role.rosterStatus,jarvisMergedInto:role.mergedInto||null,jarvisRosterVersion:plan.rosterReview.version}};
  const before=Object.fromEntries(Object.keys(after).map(k=>[k,agent[k]]));
  if(!isDeepStrictEqual(before,after))changes.push({agentId:agent.id,roleId:role.id,before,after});
}
console.log(JSON.stringify({mode:apply?'apply':'preview',changes:changes.map(c=>({role:c.roleId,name:c.after.name,reportsTo:c.after.reportsTo,status:c.after.metadata.jarvisRosterStatus})),modelsStarted:0}));
if(apply&&changes.length) {
  // Shares the model worker's exclusive slot so it cannot execute against
  // partially updated identities. Recheck jobs after acquiring it.
  const lockPath=join(jobDirectory,'active-team.lock');
  const lock=await open(lockPath,'wx',0o600);
  try {
    await lock.writeFile(JSON.stringify({purpose:'roster-reconciliation',pid:process.pid}));
    idle(await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),await api(`/companies/${plan.paperclipCompanyId}/agents`));
    const directory=join(plan.storage.recordsRoot,'reports','roster-review-2026-10-13');await mkdir(directory,{recursive:true});
    const backup=join(directory,`identity-revision-${Date.now()}.json`);
    await writeFile(backup,JSON.stringify({version:plan.rosterReview.version,changes},null,2)+'\n',{flag:'wx'});
    for(const change of changes) {
      const result=await api('/agents/'+change.agentId,change.after);
      for(const key of Object.keys(change.after))if(!isDeepStrictEqual(result[key],change.after[key]))throw new Error('Roster write not verified for '+change.roleId+': '+key);
    }
    console.log(JSON.stringify({verified:changes.length,backup,modelsStarted:0}));
  } finally {await lock.close();await unlink(lockPath);}
}

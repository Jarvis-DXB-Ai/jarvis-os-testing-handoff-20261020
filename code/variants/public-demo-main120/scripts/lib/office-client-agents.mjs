import {open,unlink} from 'node:fs/promises';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {paperclipClient} from './office-team-engine.mjs';
async function createClientAgents(plan,clientId,clientName,team,{api=paperclipClient()}={}){
 const path=`/companies/${plan.paperclipCompanyId}/agents`,agents=await api(path),roleAgents={},departments={};
 const create=async(roleId,key,label,reportsTo=null)=>{
  const existing=agents.find(a=>a.metadata?.jarvisClientId===clientId&&a.metadata?.jarvisClientSlot===key);
  if(existing){if(['paused','terminated'].includes(existing.status))throw new Error('An allocated client desk is paused. Review its status before rebuilding.');return existing;}
  const base=agents.find(a=>a.metadata?.jarvisBlueprintRoleId===roleId&&!a.metadata?.jarvisClientId&&!a.metadata?.jarvisSpawnedForTask);
  if(!base||base.metadata?.modelBilling!=='subscription_only'||!['claude_local','codex_local'].includes(base.adapterType))throw new Error('A subscription-backed source role is missing: '+roleId);
  const config=Object.fromEntries(Object.entries(base.adapterConfig??{}).filter(([key])=>['command','model','engine','timeoutSec','dangerouslySkipPermissions','dangerouslyBypassApprovalsAndSandbox'].includes(key)));
  if(config.dangerouslySkipPermissions||config.dangerouslyBypassApprovalsAndSandbox)throw new Error('Client desks cannot inherit bypassed permissions.');
  const actor=await api(path,{name:`${clientName} · ${label}`.slice(0,150),title:label,role:'general',reportsTo,adapterType:base.adapterType,adapterConfig:{...config,maxTurnsPerRun:1},runtimeConfig:{heartbeat:{enabled:true,intervalSec:0,wakeOnDemand:true,wakeOnAssignment:false,maxConcurrentRuns:1,maxTurnContinuation:{enabled:false,maxAttempts:0}}},permissions:{canCreateAgents:false,canCreateSkills:false},metadata:{jarvisBlueprintRoleId:roleId,jarvisClientId:clientId,jarvisClientSlot:key,modelBilling:'subscription_only'},instructionsBundle:{entryFile:'AGENTS.md',files:{'AGENTS.md':`You are a client-specific Jarvis desk for ${clientName}, client_id ${clientId}. Use only this issue's pinned client context, approved methods and explicit tool grants. Other clients' notes, credentials and work are outside your scope. No new agents, publishing, spend, credentials or tools are authorized by this role. The Office coordinator saves outputs and enforces one-use monthly-subscription model grants.`}}});agents.push(actor);return actor;
 };
 const coo=await create('coo','coo','Client COO');roleAgents.coo=coo.id;
 roleAgents.test=(await create('test','final-qa','Final quality gate',coo.id)).id;
 for(const roleId of team.roleIds){const source=[...plan.roles,...plan.executives].find(r=>r.id===roleId);roleAgents[roleId]=(await create(roleId,'specialist:'+roleId,source?.name??roleId,coo.id)).id;}
 for(const d of [...team.departments,...(team.sharedDepartments??[])]){const head=d.headRoleId==='coo'?coo:await create(d.headRoleId,'head:'+d.id,d.headLabel,coo.id),qa=await create(d.qaRoleId,'qa:'+d.id,d.qaLabel,head.id);departments[d.id]={headAgentId:head.id,qaAgentId:qa.id};roleAgents[d.headRoleId]??=head.id;roleAgents[d.qaRoleId]??=qa.id;}
 return {...team,runtime:{roleAgents,departments,agentIds:[...new Set([...Object.values(roleAgents),...Object.values(departments).flatMap(d=>[d.headAgentId,d.qaAgentId])])]}};
}

export async function provisionClientAgents(plan,clientId,name,team,options){if(!/^[0-9a-f-]{36}$/i.test(clientId))throw new Error('Invalid client runtime identity.');if(!plan.storage)return createClientAgents(plan,clientId,name,team,options);await ensureStore(plan.storage);const path=await officeStorePath(plan.storage.recordsRoot,`runtime/clients/${clientId}/provision.lock`,true);const lock=await open(path,'wx',0o600).catch(()=>{throw new Error('Another build is assembling this client’s desks. Reload after it completes.');});try{return await createClientAgents(plan,clientId,name,team,options);}finally{await lock.close();await unlink(path);}}

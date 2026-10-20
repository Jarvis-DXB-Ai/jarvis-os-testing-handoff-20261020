/** Finite future-owner native authority. Explicit private installation only;
 * immutable task claims are consumed before any job creation, never renewed. */
import {open,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {canonical,sha,readReactivePrivateJson,assertReactivePrivateDirectory} from './office-coo-reactive-grant.mjs';
const fail=()=>{throw Error('Finite owner WhatsApp native authority requires review.');};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
function scope(v){return v?.kind==='agency'&&Object.keys(v).join(',')==='kind'||v?.kind==='client'&&Object.keys(v).sort().join(',')==='clientId,kind'&&uuid(v.clientId);}
export function validateOfficeCooOperationalGrant(g,reply,request,at){
 const keys='actors,allowTaskHelpers,authority,enabled,expiresAt,issuedAt,maxStagesPerTask,maxTasks,maxTotalStages,policySha256,purpose,replyGrantRevision,revision,scopes,version';
 if(g.version!==2||g.purpose!=='future-owner-whatsapp-native-tasks'||Object.keys(g).sort().join(',')!==keys||g.authority.principal!==reply.principal||!Array.isArray(g.scopes)||!g.scopes.length||g.scopes.length>128||g.scopes.some(v=>!scope(v))||new Set(g.scopes.map(canonical)).size!==g.scopes.length||!g.scopes.some(s=>canonical(s)===canonical(request.scope))||typeof g.allowTaskHelpers!=='boolean'||!Number.isSafeInteger(g.maxTasks)||g.maxTasks<1||g.maxTasks>128||!Number.isSafeInteger(g.maxStagesPerTask)||g.maxStagesPerTask<1||g.maxStagesPerTask>128||!Number.isSafeInteger(g.maxTotalStages)||g.maxTotalStages<1||g.maxTotalStages>4096||g.maxTotalStages>g.maxTasks*g.maxStagesPerTask||Date.parse(g.expiresAt)-Date.parse(g.issuedAt)>30*86400000||Date.parse(g.expiresAt)>Date.parse(reply.expiresAt)||Date.parse(g.issuedAt)>at||Date.parse(g.expiresAt)<=at)fail();
 return g;
}
const taskName=id=>{if(!uuid(id))fail();return 'coo-native-task.'+id+'.json';};
function claimValid(row,grant,request){
 const {revision,...body}=row;
 if(row.version!==2||row.grantRevision!==grant.revision||!row.request||!uuid(row.request.jobId)||row.jobId!==row.request.jobId||row.requestSha256!==row.request.requestSha256||row.policySha256!==grant.policySha256||row.request.policySha256!==grant.policySha256||!grant.scopes.some(s=>canonical(s)===canonical(row.request.scope))||!Number.isSafeInteger(row.ordinal)||row.ordinal<1||row.ordinal>grant.maxTasks||!Number.isFinite(Date.parse(row.at))||sha(body)!==revision||Object.keys(row).sort().join(',')!=='at,grantRevision,jobId,ordinal,policySha256,previousRevision,request,requestSha256,revision,version'||request&&canonical(row.request)!==canonical(request))fail();return row;
}
export function readOfficeCooOperationalTask(directory,request,grant){
 return claimValid(readReactivePrivateJson(directory,taskName(request.jobId),65536),grant,request);
}
export async function officeCooOperationalClaims(directory,grant){
 const names=(await readdir(directory)).filter(n=>n.startsWith('coo-native-task.'));if(names.length>512)fail();const claims=[];
 for(const name of names){if(!/^coo-native-task\.[a-f0-9-]{36}\.json$/.test(name))fail();const row=readReactivePrivateJson(directory,name,65536),{revision,...body}=row;
  // Even retired-grant records must remain intact; corruption cannot move a
  // consumed current claim into an ignored grant and free capacity.
  if(name!==taskName(row.jobId)||!['requestSha256','grantRevision'].every(k=>typeof row[k]==='string'&&/^[a-f0-9]{64}$/.test(row[k])))fail();
  if(row.version===2){if(sha(body)!==revision)fail();}
  else if(row.version!==1||Object.keys(row).sort().join(',')!=='grantRevision,jobId,requestSha256,version')fail();
  if(row.grantRevision!==grant.revision)continue;claimValid(row,grant);claims.push(row);}
 claims.sort((a,b)=>a.ordinal-b.ordinal);let previous=null;for(const [i,row]of claims.entries()){if(row.ordinal!==i+1||row.previousRevision!==previous)fail();previous=row.revision;}return claims;
}
async function sync(directory){const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}}
export async function claimOfficeCooOperationalTask(directory,request,grant,at){
 assertReactivePrivateDirectory(directory);const lockPath=join(directory,'coo-native-admission.lock');let lock;
 try{
  const deadline=Date.now()+5000;while(!lock){try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code!=='EEXIST'||Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,20));}}
  try{return readOfficeCooOperationalTask(directory,request,grant);}catch(e){if(e.code!=='ENOENT')throw e;}
  const claims=await officeCooOperationalClaims(directory,grant);if(claims.length>=grant.maxTasks)fail();
  const body={version:2,jobId:request.jobId,requestSha256:request.requestSha256,policySha256:grant.policySha256,grantRevision:grant.revision,ordinal:claims.length+1,previousRevision:claims.at(-1)?.revision??null,request,at},value={...body,revision:sha(body)};
  const h=await open(join(directory,taskName(request.jobId)),'wx',0o600);try{await h.writeFile(canonical(value)+'\n');await h.sync();}finally{await h.close();}await sync(directory);
  return readOfficeCooOperationalTask(directory,request,grant);
 }finally{if(lock){await lock.close();await unlink(lockPath);await sync(directory);}}
}
/** Validate all current-grant stage chains before consuming another total stage.
 * Earlier grant history is retained; no task or stage capacity is reset in code. */
export async function officeCooOperationalStageCount(directory,grant){
 const claims=new Map((await officeCooOperationalClaims(directory,grant)).map(c=>[c.jobId,c])),names=(await readdir(directory)).filter(n=>n.startsWith('coo-native-stage.')&&n!=='coo-native-stage.lock');if(names.length>32768)fail();const groups=new Map();let total=0;
 for(const name of names){if(!/^coo-native-stage\.[a-f0-9-]{36}\.[0-9]{4}\.json$/.test(name))fail();const row=readReactivePrivateJson(directory,name),{revision,...body}=row;if(sha(body)!==revision)fail();if(row.grantRevision!==grant.revision)continue;
  const claim=claims.get(row.jobId);if(!claim||row.version!==1||row.requestSha256!==claim.requestSha256||sha(body)!==revision||name!=='coo-native-stage.'+row.jobId+'.'+String(row.ordinal).padStart(4,'0')+'.json')fail();
  const group=groups.get(row.jobId)??[];group.push(row);groups.set(row.jobId,group);total++;
 }
 for(const rows of groups.values()){rows.sort((a,b)=>a.ordinal-b.ordinal);let previous=null;const stages=new Set();for(const [i,row]of rows.entries()){if(row.ordinal!==i+1||row.previousRevision!==previous||stages.has(row.stage))fail();stages.add(row.stage);previous=row.revision;}if(rows.length>grant.maxStagesPerTask)fail();}
 if(total>grant.maxTotalStages)fail();return total;
}
/** Only an explicitly allowed task helper can derive its base actor's model
 * permission. The actual saved step AND fresh Paperclip actors must agree. */
export async function officeCooOperationalActor(grant,request,job,context,readActors){
 if(grant.actors.some(a=>a.agentId===context.agentId&&a.adapterType===context.adapterType&&a.model===context.model))return true;
 if(!grant.allowTaskHelpers||typeof readActors!=='function'||!context.stage.startsWith('specialist:'))return false;
 const steps=(job.steps??[]).filter(s=>'specialist:'+s.id===context.stage&&s.agentId===context.agentId&&uuid(s.spawnedFromAgentId));if(steps.length!==1)return false;const step=steps[0],baseGrant=grant.actors.find(a=>a.agentId===step.spawnedFromAgentId&&a.adapterType===context.adapterType&&a.model===context.model);if(!baseGrant)return false;
 const actors=await readActors();if(!Array.isArray(actors)||actors.length>1000)return false;const actor=actors.find(a=>a.id===context.agentId),base=actors.find(a=>a.id===baseGrant.agentId),client=request.scope.kind==='client'?request.scope.clientId:null;
 const matches=a=>a&&a.adapterType===baseGrant.adapterType&&a.adapterConfig?.model===baseGrant.model&&a.metadata?.modelBilling==='subscription_only'&&(a.metadata.jarvisClientId??null)===client&&a.metadata.jarvisBlueprintRoleId===step.roleId&&!['paused','terminated'].includes(a.status);
 return !!(matches(base)&&!base.metadata.jarvisSpawnedForTask&&matches(actor)&&actor.metadata.jarvisSpawnedForTask===request.jobId&&actor.metadata.jarvisTaskPartId===step.id&&job.calls?.some(c=>c.stage===context.stage&&c.agentId===context.agentId&&c.roleId===step.roleId&&c.status==='dispatching'&&c.runId===null));
}

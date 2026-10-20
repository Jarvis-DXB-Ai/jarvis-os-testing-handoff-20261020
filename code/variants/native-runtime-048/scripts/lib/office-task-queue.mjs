import {open,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {listJobs,executeJob,jobDirectory,activeStates} from './office-team-engine.mjs';
const executing=j=>activeStates.includes(j.status)&&j.status!=='queued';
export function queuedOfficeTasks(jobs){return jobs.filter(j=>j.queueManaged&&j.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
export function officeQueueState(jobs){const queued=queuedOfficeTasks(jobs);return {pending:queued.length,running:jobs.filter(executing).length,recoveryRequired:jobs.some(j=>j.status==='recovery_required'),ids:queued.map(j=>j.id)};}
/** One durable dispatcher; worker/model leases remain the engine's responsibility. */
export async function drainOfficeQueue(plan,{directory=jobDirectory,readJobs=()=>listJobs(directory,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),execute=(id)=>executeJob(id,plan,{directory}),canExecute=async()=>true,pid=process.pid,isAlive=p=>{try{process.kill(p,0);return true;}catch{return false;}}}={}){
 const path=join(directory,'queue-dispatch.lock');let lock;
 try{lock=await open(path,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(await readFile(path,'utf8'));}catch{return {status:'locked'};}if(!Number.isSafeInteger(owner.pid)||isAlive(owner.pid))return {status:'locked'};await unlink(path).catch(()=>{});try{lock=await open(path,'wx',0o600);}catch{return {status:'locked'};}}
 await lock.writeFile(JSON.stringify({pid}));
 try{
  while(true){const jobs=await readJobs();if(jobs.some(j=>j.status==='recovery_required'))return {status:'recovery'};if(jobs.some(executing))return {status:'busy'};const next=queuedOfficeTasks(jobs)[0];if(!next)return {status:'idle'};if(!await canExecute())return {status:'paused'};const result=await execute(next.id);if(result.status==='queued')return {status:'busy'};}
 }finally{await lock.close();await unlink(path).catch(()=>{});}
}

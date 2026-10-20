import { readFile } from 'node:fs/promises';
import {drainOfficeQueue,queuedOfficeTasks} from './lib/office-task-queue.mjs';
import { executeJob,listJobs } from './lib/office-team-engine.mjs';
import {officeLocalOrigin} from '../src/lib/office-runtime.mjs';
const plan = JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json', import.meta.url), 'utf8'));
if(process.argv[2])await executeJob(process.argv[2], plan);
// Keep the dispatcher alive across jobs, independent of the browser.
// Recheck once after releasing its lease to cover a concurrent enqueue at exit.
for(;;){const result=await drainOfficeQueue(plan,{canExecute:async()=>{try{const r=await fetch(officeLocalOrigin()+'/api/office/readiness',{signal:AbortSignal.timeout(20000)});if(!r.ok)return false;const ready=await r.json();return ready.canEnqueue===true&&!ready.recoveryRequired;}catch{return false;}}});if(result.status!=='idle'||!queuedOfficeTasks(await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER})).length)break;}

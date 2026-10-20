import {readFile} from 'node:fs/promises';
import {listJobs,activeStates} from './lib/office-team-engine.mjs';
import {archiveJob,ensureStore} from './lib/office-archive.mjs';
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
await ensureStore(plan.storage);
const jobs=await listJobs();if(jobs.some(j=>activeStates.includes(j.status)))throw new Error('An Office team is active; sync after it finishes.');
for(const job of jobs)await archiveJob(job,plan.storage);
console.log(`Exported ${jobs.length} saved task records to the SSD. No model calls, retries, approvals or source asset changes.`);

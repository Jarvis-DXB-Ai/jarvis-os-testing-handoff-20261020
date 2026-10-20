/** One exact WhatsApp task only. Import does not execute work or drain any queue. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadOfficeCooCapture} from './start-office-coo-capture.mjs';
import {readOfficeCooNativeRequest,createOfficeCooNativeAdmission} from './lib/office-coo-native-admission.mjs';
import {readJob,executeJob,paperclipClient} from './lib/office-team-engine.mjs';
export async function runOfficeCooTask(id,{loadCapture=loadOfficeCooCapture,readNativeRequest=readOfficeCooNativeRequest,createAdmission=createOfficeCooNativeAdmission,readTask=readJob,readActors=async()=>{const p=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));return paperclipClient()('/companies/'+p.paperclipCompanyId+'/agents');},execute=executeJob,readPlan=async()=>JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'))}={}){
 if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))throw Error('Exact COO task ID required.');
 const {config}=await loadCapture(),request=readNativeRequest(undefined,id);if(request?.jobId!==id)throw Error('Unrelated task cannot use COO native authority.');
 const capability=createAdmission({config,request,readJob:readTask,readActors}),job=await readTask(id);await capability.assertJob(job);
 if(job.status!=='queued')return {jobId:id,status:job.status,executed:false};
 const result=await execute(id,await readPlan(),{modelPolicy:capability.modelPolicy});return {jobId:id,status:result.status,executed:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==3){console.error('One exact COO task ID required.');process.exitCode=1;}
 else runOfficeCooTask(process.argv[2]).then(result=>console.log(JSON.stringify(result)),()=>{console.error('Exact COO native task stopped. Inspect saved grant/task/stage receipts; no automatic retry.');process.exitCode=1;});
}

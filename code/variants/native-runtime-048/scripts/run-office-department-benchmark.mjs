// Owner-authorised live department benchmark. Runs through the existing COO queue.
// Stable case IDs prevent duplicate submission after an uncertain HTTP response.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {readJob,activeStates} from './lib/office-team-engine.mjs';
import {cooMessageInput} from '../src/lib/office-coo-message.mjs';
const report='/ABSOLUTE/TEST/OWNER/Documents/Jarvis OS/reports/office-live-benchmark-2026-10-14',base='http://127.0.0.1:3101';
const wanted=process.argv.slice(2);if(!wanted.length)throw Error('Choose explicit prepared case keys.');
const prepared=JSON.parse(await readFile(join(report,'cases.json'),'utf8')).cases;const cases=wanted.map(key=>prepared.find(c=>c.key===key));if(cases.some(c=>!c))throw Error('Unknown case key.');
async function api(path,body){const r=await fetch(base+path,{...(body?{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok)throw Error(d.error??'Office API rejected the request.');return d;}
for(const initialCase of cases){
 const c=JSON.parse(await readFile(join(report,'cases.json'),'utf8')).cases.find(c=>c.key===initialCase.key);
 let job;try{job=await readJob(c.id)}catch(e){if(e.code!=='ENOENT')throw e;}
 const input=cooMessageInput({id:c.id,brief:c.brief,context:c.context,criteria:c.criteria,contextRequest:c.request});
 await mkdir(join(report,c.key),{recursive:true});await writeFile(join(report,c.key,'request.json'),JSON.stringify(input,null,2)+'\n');
 if(!job){let readiness=await api('/api/office/readiness');for(let check=0;!readiness.canEnqueue&&!readiness.recoveryRequired&&check<3;check++){console.log(JSON.stringify({event:'preflight_wait',case:c.key,message:readiness.message}));await new Promise(r=>setTimeout(r,5000));readiness=await api('/api/office/readiness');}if(!readiness.canEnqueue||readiness.recoveryRequired)throw Error('Live benchmark blocked by current readiness: '+readiness.message);job=(await api('/api/office/teams',input)).job;console.log(JSON.stringify({event:'submitted',case:c.key,id:job.id,status:job.status}));}
 let last='';while(activeStates.includes(job.status)){
  const state=JSON.stringify({status:job.status,steps:job.steps.map(s=>({role:s.roleId,state:s.status})),reports:job.departmentReports?.map(r=>({department:r.departmentId,status:r.status,qa:r.qa?.status})),calls:job.calls.length});
  if(last!==state){console.log(JSON.stringify({event:'progress',case:c.key,id:c.id,...JSON.parse(state)}));last=state;await writeFile(join(report,c.key,'live.json'),JSON.stringify(job,null,2)+'\n');}
  await new Promise(r=>setTimeout(r,10000));job=await readJob(c.id);
 }
 await writeFile(join(report,c.key,'result.json'),JSON.stringify(job,null,2)+'\n');
 await writeFile(join(report,c.key,'delivery.txt'),job.output??job.error??'No assembled delivery.');
 console.log(JSON.stringify({event:'terminal',case:c.key,id:c.id,status:job.status,roles:job.steps.map(s=>s.roleId),departments:job.departmentReports?.map(r=>r.departmentId),calls:job.calls.length,qaPassed:job.qa?.pass===true,error:job.error}));
 if(job.status==='recovery_required')throw Error('Uncertain outcome requires reconciliation before more model work.');
}

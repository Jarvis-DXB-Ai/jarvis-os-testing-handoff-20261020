import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {recoverDeliveryHandoff,validateQa} from './lib/office-team-engine.mjs';

async function fixture(check){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-delivery-')),id=randomUUID(),parentId=randomUUID(),qaId=randomUUID(),agentId=randomUUID(),runId=randomUUID(),companyId=randomUUID();
 const output='Saved internal fixture output',hash=createHash('sha256').update(output).digest('hex'),criteria=['Use the saved fixture'];
 const raw=JSON.stringify({pass:true,checks:[{criterion:criteria[0],pass:true,evidence:'Saved fixture present'}],note:'Internal QA'});
 const job={id,version:2,kind:'team',status:'failed',error:'fetch failed',updatedAt:'2026-10-14T00:00:00.000Z',issueId:parentId,ownerPid:null,output,criteria,qa:validateQa(JSON.parse(raw),criteria),finalQaRawOutput:raw,steps:[{status:'completed',output:'Saved work'}],calls:[{stage:'qa',agentId,runId,issueId:qaId,status:'succeeded'}]};
 const run={id:runId,agentId,companyId,contextSnapshot:{issueId:qaId},status:'succeeded',resultJson:{summary:raw},usageJson:{billingType:'subscription_included'}};
 const parent={id:parentId,companyId,status:'blocked',createdByUserId:'existing-human',assigneeAgentId:agentId};
 const qaIssue={id:qaId,companyId,parentId,status:'done',description:JSON.stringify({sha256:hash})},patches=[];
 let loseAck=false,intercept=null;
 const api=async(path,body,method)=>{
  if(intercept)await intercept(path,body,method);
  if(method==='PATCH'){const item=path==='/issues/'+parentId?parent:path==='/issues/'+qaId?qaIssue:null;assert.ok(item);Object.assign(item,body);patches.push({path,body});if(loseAck){loseAck=false;throw new Error('Lost acknowledgement after apply');}return structuredClone(item);}
  assert.equal(method,undefined,'No dispatch, retry or model mutation is allowed');
  const item=path==='/heartbeat-runs/'+runId?run:path==='/issues/'+parentId?parent:path==='/issues/'+qaId?qaIssue:null;assert.ok(item,path);return structuredClone(item);
 };
 const save=()=>writeFile(join(directory,id+'.json'),JSON.stringify(job));
 const recover=()=>recoverDeliveryHandoff(id,{paperclipCompanyId:companyId},{api,directory,expectedUpdatedAt:job.updatedAt});
 try{await save();await check({job,run,parent,qaIssue,patches,save,recover,directory,loseNextAck:()=>{loseAck=true;},setIntercept:fn=>{intercept=fn;}});}finally{await rm(directory,{recursive:true,force:true});}
}
test('legacy failed delivery reconciles only the exact completed board handoff and preserves output and approval',()=>fixture(async({job,recover,patches})=>{const before=structuredClone(job),result=await recover();assert.equal(result.status,'needs_review');assert.equal(result.deliveryHandoff.state,'confirmed');assert.equal(result.reviewedAt,undefined);assert.equal(result.output,before.output);assert.deepEqual(result.calls,before.calls);assert.equal(result.deliveryRecoveryHistory[0].priorError,'fetch failed');assert.equal(patches.length,1);assert.equal(patches[0].body.assigneeUserId,'existing-human');}));
test('lost acknowledgement stays recoverable; explicit readback avoids repeating an already applied mutation',()=>fixture(async({job,recover,patches,loseNextAck,directory})=>{loseNextAck();const pending=await recover();assert.equal(pending.status,'recovery_required');assert.equal(pending.deliveryHandoff.state,'pending');Object.assign(job,JSON.parse(await readFile(join(directory,job.id+'.json'),'utf8')));const result=await recover();assert.equal(result.status,'needs_review');assert.equal(patches.length,1);assert.equal(result.deliveryRecoveryHistory.length,2);}));
for(const [name,change] of [
 ['foreign run',({run})=>{run.companyId=randomUUID();}],
 ['active run',({run})=>{run.status='running';}],
 ['scheduled retry',({run})=>{run.scheduledRetryAt=new Date(Date.now()+100000).toISOString();}],
 ['paid model run',({run})=>{run.usageJson.billingType='api';}],
 ['changed native QA',({run})=>{run.resultJson.summary='{}';}],
 ['wrong parent',({qaIssue})=>{qaIssue.parentId=randomUUID();}],
 ['changed output hash',({qaIssue})=>{qaIssue.description='{}';}],
 ['human closed parent',({parent})=>{parent.status='done';}],
 ['active worker',({job})=>{job.ownerPid=process.pid;}],
 ['changed pending output',({job})=>{job.deliveryHandoff={state:'pending',parentIssueId:job.issueId,qaIssueId:job.calls[0].issueId,outputSha256:'wrong'};}]
])test(name+' refuses recovery before writes',()=>fixture(async f=>{change(f);await f.save();await assert.rejects(f.recover);assert.equal(f.patches.length,0);}));
test('stale caller revision cannot change board state',()=>fixture(async f=>{f.job.updatedAt='changed';await assert.rejects(f.recover,/changed/);assert.equal(f.patches.length,0);}));
for(const status of ['cancelled','stopping'])test(status+' pending delivery cannot restore a stopped task',()=>fixture(async f=>{
 f.job.status=status;f.job.deliveryHandoff={state:'pending'};await f.save();await assert.rejects(f.recover,/owner stopped/);assert.equal(f.patches.length,0);
}));
test('stop marker blocks otherwise eligible delivery without board mutation',()=>fixture(async f=>{
 await writeFile(join(f.directory,f.job.id+'.stop'),'Owner stopped');await assert.rejects(f.recover,/owner stopped/);assert.equal(f.patches.length,0);
}));
for(const stop of [true,false])test((stop?'stop':'same-timestamp job change')+' during native verification prevents board mutation',()=>fixture(async f=>{
 let changed=false;f.setIntercept(async path=>{if(!changed&&path.startsWith('/heartbeat-runs/')){changed=true;if(stop)await writeFile(join(f.directory,f.job.id+'.stop'),'Owner stop during verification');else await writeFile(join(f.directory,f.job.id+'.json'),JSON.stringify({...f.job,error:'Changed without timestamp'}));}});
 await assert.rejects(f.recover,stop?/owner stopped/:/changed during/);assert.equal(f.patches.length,0);
}));
test('pending failed final QA reconciles to failed/block and never becomes owner approval',()=>fixture(async f=>{
 const raw=JSON.stringify({pass:false,checks:[{criterion:f.job.criteria[0],pass:false,evidence:'Incomplete fixture'}],note:'Rejected'});
 f.job.qa=validateQa(JSON.parse(raw),f.job.criteria);f.job.finalQaRawOutput=raw;f.run.resultJson.summary=raw;
 f.job.deliveryHandoff={state:'pending',parentIssueId:f.job.issueId,qaIssueId:f.job.calls[0].issueId,outputSha256:createHash('sha256').update(f.job.output).digest('hex')};await f.save();
 const result=await f.recover();assert.equal(result.status,'failed');assert.equal(result.qa.pass,false);assert.equal(result.deliveryHandoff.state,'confirmed');assert.equal(result.reviewedAt,undefined);assert.ok(f.patches.every(p=>p.body.status==='blocked'));
}));

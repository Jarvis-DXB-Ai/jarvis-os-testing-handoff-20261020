import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessOfficeReadiness,assessConversationReadiness} from '../src/lib/office-readiness.mjs';
import {paperclipClient} from './lib/office-team-engine.mjs';
import {spawn} from 'node:child_process';
const baseline={checks:[{id:'auth',title:'Subscription',ready:true,detail:'Reconnect subscription'}],knowledge:{foundations:3,approvedFoundations:0,approvedLessons:0},jobs:[]};
const proof=()=>({id:'real',version:4,status:'needs_review',output:'Deliverable',qa:{pass:true},steps:[{id:'copy',agentId:'copy-agent',status:'completed',output:'Copy'}],departmentReports:[{departmentId:'marketing',agentId:'head-agent',status:'completed',output:'Head summary',stepIds:['copy'],qa:{agentId:'qa-agent',status:'completed',runId:'department-qa:marketing',result:{pass:true,checks:[{pass:true,evidence:'Actual fixture review evidence.'}]}}}],calls:['planning','specialist:copy','department:marketing','synthesis','qa','department-qa:marketing'].map(stage=>({stage,agentId:stage.startsWith('department-qa')?'qa-agent':'other-agent',status:'succeeded',runId:stage,usage:{billingType:'subscription_included'}}))});
test('draft foundations allow scoped internal text; unavailable prerequisites block execution',()=>{
  assert.equal(assessOfficeReadiness(baseline).canSubmit,true);
  const blocked=assessOfficeReadiness({...baseline,checks:[{...baseline.checks[0],ready:false}]});
  assert.equal(blocked.canSubmit,false);assert.equal(blocked.message,'Reconnect subscription');
});
test('active and uncertain work block another task, including conversations',()=>{
  for(const status of ['queued','planning','working','reporting','synthesising','checking','stopping','recovery_required'])assert.equal(assessOfficeReadiness({...baseline,jobs:[{kind:'conversation',status}]}).canSubmit,false);
});
test('individual desks require their actual provider while all shared prerequisites still apply',()=>{
 const checks=[{id:'storage',ready:true,detail:'Mount SSD'},{id:'claude',ready:false,detail:'Reconnect Claude'},{id:'codex',ready:true,detail:'Reconnect Codex'}];
 const assess=(overrides={})=>assessOfficeReadiness({...baseline,checks,...overrides});
 assert.equal(assess().canSubmit,false);assert.equal(assessConversationReadiness(assess(),'codex_local').canSubmit,true);assert.equal(assessConversationReadiness(assess(),'claude_local').canSubmit,false);
 const reverse=checks.map(c=>({...c,ready:c.id!=='codex'}));assert.equal(assessConversationReadiness(assess({checks:reverse}),'claude_local').canSubmit,true);assert.equal(assessConversationReadiness(assess({checks:reverse}),'codex_local').canSubmit,false);
 for(const adapter of[undefined,'http','unknown'])assert.equal(assessConversationReadiness(assess(),adapter).canSubmit,false);
 assert.equal(assessConversationReadiness(assess({checks:checks.filter(c=>c.id!=='codex')}),'codex_local').canSubmit,false);
 assert.equal(assessConversationReadiness(assess({checks:checks.map(c=>({...c,ready:false}))}),'codex_local').canSubmit,false);
 assert.equal(assessConversationReadiness(assess({checks:checks.map(c=>c.id==='storage'?{...c,ready:false}:c)}),'codex_local').message,'Mount SSD');
 for(const status of['queued','working','recovery_required'])assert.equal(assessConversationReadiness(assess({jobs:[{status}]}),'codex_local').canSubmit,false);
});
test('workflow proof requires real subscription receipts and complete report coverage',()=>{
  const assess=job=>assessOfficeReadiness({...baseline,jobs:[job]}).verifiedTaskId;
  assert.equal(assess(proof()),'real');
  for(const change of [j=>j.version=3,j=>j.qa.pass=false,j=>j.kind='conversation',j=>j.steps=[],j=>j.departmentReports=[],j=>j.departmentReports[0].stepIds=[],j=>j.calls.pop(),j=>j.calls[1].usage=null,j=>j.calls[2].runId=null,j=>j.departmentReports[0].qa.agentId='head-agent',j=>j.departmentReports[0].qa.agentId='copy-agent',j=>j.departmentReports[0].qa.result.pass=false,j=>j.departmentReports[0].qa.result.checks=[]]){const j=proof();change(j);assert.equal(assess(j),null);}
});
test('transient read failure can recover without dispatching a model',async()=>{
  let reads=0;const api=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async(_url,options)=>{assert.equal(options.method,'GET');if(++reads<3)throw new Error('temporary read outage');return Response.json({status:'succeeded'});}});
  assert.equal((await api('/heartbeat-runs/run')).status,'succeeded');assert.equal(reads,3);
});
test('mutations and rejected reads are never retried; outages are bounded',async()=>{
  for(const method of ['POST','PATCH','DELETE']){let calls=0;const api=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async()=>{calls++;throw new Error('lost acknowledgement');}});await assert.rejects(api('/dispatch',{},method));assert.equal(calls,1);}
  for(const status of [401,403,404,503]){let calls=0;const api=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async()=>{calls++;return new Response('',{status});}});await assert.rejects(api('/heartbeat-runs/run'));assert.equal(calls,status===503?3:1);}
});

import {enforceOutputChecks} from '../src/lib/office-output-checks.mjs';
test('whole-response caps reject extra commentary even when model QA passes',()=>{
 const qa={pass:true,checks:[{criterion:'Entire response: at most 5 words.',pass:true,evidence:'Model says five words.'}]};
 assert.equal(enforceOutputChecks(qa,'A short draft').pass,true);
 const rejected=enforceOutputChecks(qa,'A short draft. Extra notes appended here.');
 assert.equal(rejected.pass,false);assert.match(rejected.checks[0].evidence,/Deterministic length/);assert.equal(qa.pass,true);
 const scoped={...qa,checks:[{...qa.checks[0],criterion:'Each caption is at most 5 words.'}]};
 assert.equal(enforceOutputChecks(scoped,'Multiple captions with more than five words in total').pass,true);
 assert.equal(enforceOutputChecks({...qa,pass:false},'Short').pass,false);
});
test('rejected process drains a large parent prompt without EPIPE or model execution',async()=>{
  const moduleUrl=new URL('./office-subscription-runner.mjs',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {discardRejectedInput} from ${JSON.stringify(moduleUrl)}; await discardRejectedInput(); process.exitCode=78;`],{stdio:['pipe','pipe','pipe']});
  let pipeError;child.stdin.on('error',error=>{pipeError=error;});child.stdout.resume();child.stderr.resume();
  const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  child.stdin.end('synthetic rejected input\n'.repeat(100000));
  assert.equal(await exited,78);assert.equal(pipeError,undefined);
});

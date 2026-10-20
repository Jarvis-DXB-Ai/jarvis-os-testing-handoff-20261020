import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {readGoalSharedUsage} from './lib/office-goal-meter-broker.mjs';
import {createGoalNativePolicy,normalizeGoalNativeMeter} from './lib/office-goal-native-policy.mjs';
import {observeGoalBudget} from './lib/office-goal-budget.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
async function fixture(t){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'office-ui-meter-')));t.after(()=>rm(directory,{recursive:true,force:true}));const s={now:Date.parse('2026-10-15T14:00:00.000Z'),reads:[0,0],claudeFailure:false,brokerCalls:0,jobCalls:0,enabled:true,jobs:[]};
 const meter=provider=>({provider,name:provider==='codex'?'Codex':'Claude',plan:'synthetic-subscription',source:'synthetic-authoritative-'+provider,resetCredits:null,windows:[{label:provider==='codex'?'codex · 7 days':'7 days · all models',usedPercent:provider==='codex'?35:15,remainingPercent:provider==='codex'?65:85,resetsAt:'2026-10-22T14:00:00.000Z'}],observedAt:new Date(s.now-(provider==='codex'?1000:2000)).toISOString()});
 const readers=[async()=>{s.reads[0]++;return meter('codex');},async()=>{s.reads[1]++;if(s.claudeFailure)throw Error('synthetic429');return meter('claude');}],broker=()=>readGoalSharedUsage(directory,{now:()=>s.now,readers});
 const source=await readFile(new URL('../src/lib/office-usage-server.ts',import.meta.url),'utf8');
 function app(){const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[s.now]));}static now(){return s.now;}}
  const stubs={'server-only':{},'node:os':{homedir:()=>'/synthetic-user'},'./office-runtime.mjs':{localOfficeEnabled:()=>s.enabled},'../../scripts/lib/office-goal-meter-broker.mjs':{readGoalSharedUsage:async directory=>{assert.equal(directory,'/synthetic-user/Library/Application Support/Jarvis Office/goal-control');s.brokerCalls++;return broker();}},'../../scripts/lib/office-team-engine.mjs':{listJobs:async()=>{s.jobCalls++;return s.jobs;}}};
  runInNewContext(compiled,{module,exports:module.exports,Date:Clock,require:name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('node:')?require(name):assert.fail('Unexpected/raw reader dependency: '+name)},{timeout:1000});return module.exports;
 }
 return {directory,s,meter,readers,broker,app};
}
test('synthetic UI retains ORIGINAL per-provider observedAt and checkedAt; aggregate uses oldest observation',async t=>{
 const f=await fixture(t),usage=await f.app().officeUsage();assert.equal(usage.providers.length,2);for(const p of usage.providers){assert.equal(p.checkedAt,p.observedAt);assert.equal(p.observedAt,f.meter(p.provider).observedAt);assert.equal(p.status,'available');}assert.equal(usage.checkedAt,f.meter('claude').observedAt);assert.notEqual(usage.checkedAt,new Date(f.s.now).toISOString());assert.deepEqual(f.s.reads,[1,1]);
});
test('synthetic independent UI server instances share broker disk observations instead of reading each account twice',async t=>{
 const f=await fixture(t),one=f.app(),two=f.app(),a=await one.officeUsage();f.s.now+=30000;const b=await two.officeUsage();assert.equal(b.checkedAt,a.checkedAt);assert.equal(b.providers[0].observedAt,a.providers[0].observedAt);assert.equal(f.s.brokerCalls,2);assert.deepEqual(f.s.reads,[1,1]);
});
test('synthetic exact60s broker boundary refreshes account observation without renewing old timestamp',async t=>{
 const f=await fixture(t),app=f.app(),a=await app.officeUsage();f.s.now+=57999;const b=await app.officeUsage();assert.equal(b.checkedAt,a.checkedAt);assert.deepEqual(f.s.reads,[1,1]);f.s.now++;const c=await app.officeUsage();assert.notEqual(c.checkedAt,a.checkedAt);assert.equal(c.providers[1].observedAt,f.meter('claude').observedAt);assert.deepEqual(f.s.reads,[2,2]);assert.equal(a.checkedAt,'2026-10-15T13:59:58.000Z');
});
test('synthetic authoritative failure after expiry exposes unknown windows with no stale or raw-reader fallback',async t=>{
 const f=await fixture(t),app=f.app(),a=await app.officeUsage();assert.equal(a.providers[0].windows.length,1);f.s.now+=60000;f.s.claudeFailure=true;const b=await app.officeUsage();for(const p of b.providers){assert.equal(p.status,'unavailable');assert.equal(p.observedAt,null);assert.equal(p.windows.length,0);}assert.equal(b.activity.length,0);assert.deepEqual(f.s.reads,[2,2]);const stored=JSON.parse(await readFile(join(f.directory,'goal-native-meters.json')));assert.equal(stored.meters[1].observedAt,a.providers[1].observedAt);
});
test('synthetic broker lease failure cannot trigger independent account requests from UI',async t=>{
 const f=await fixture(t);await writeFile(join(f.directory,'goal-native-meters.lock'),'synthetic-existing-lease',{mode:0o600});const usage=await f.app().officeUsage();assert.ok(usage.providers.every(p=>p.status==='unavailable'&&p.windows.length===0));assert.deepEqual(f.s.reads,[0,0]);
});
test('synthetic concurrent calls in one UI server share pending load, then next call rechecks broker freshness',async t=>{
 const f=await fixture(t),app=f.app();const [a,b]=await Promise.all([app.officeUsage(),app.officeUsage()]);assert.equal(a,b);assert.equal(f.s.brokerCalls,1);assert.equal(f.s.jobCalls,1);await app.officeUsage();assert.equal(f.s.brokerCalls,2);assert.deepEqual(f.s.reads,[1,1]);
});
test('synthetic broker corruption remains unknown without fresh reader fallback',async t=>{
 const f=await fixture(t);await f.broker();const initial=[...f.s.reads];await writeFile(join(f.directory,'goal-native-meters.json'),'{}',{mode:0o600});const usage=await f.app().officeUsage();assert.ok(usage.providers.every(p=>p.status==='unavailable'&&p.windows.length===0));assert.deepEqual(f.s.reads,initial);
});
test('synthetic nonlocal Office gate performs no broker/account/job read',async t=>{
 const f=await fixture(t);f.s.enabled=false;await assert.rejects(f.app().officeUsage(),/private Mac office/);assert.equal(f.s.brokerCalls,0);assert.equal(f.s.jobCalls,0);assert.deepEqual(f.s.reads,[0,0]);
});
test('synthetic activity receipt deduplication/client identity/token values remain unchanged',async t=>{
 const f=await fixture(t);f.s.jobs=[{id:'job',brief:'Synthetic brief',knowledgeContext:{scope:{clientId:'client'}},calls:[{runId:'run',roleId:'copywriter',model:'Sonnet',status:'succeeded',startedAt:'2026-10-15T13:00:00Z',finishedAt:'2026-10-15T13:01:00Z',usage:{model:'Claude Sonnet',inputTokens:10,outputTokens:20,cachedInputTokens:3}},{runId:'run',roleId:'duplicate',model:'Codex',status:'succeeded',startedAt:'2026-10-15T12:00:00Z'}]}];const usage=await f.app().officeUsage();assert.equal(usage.activity.length,1);assert.equal(usage.activity[0].clientId,'client');assert.equal(usage.activity[0].provider,'claude');assert.equal(usage.activity[0].inputTokens,10);assert.equal(usage.activity[0].outputTokens,20);assert.equal(usage.activity[0].cachedTokens,3);
});
test('synthetic original stale meter timestamps still fail closed in unchanged native guard',async t=>{
 const f=await fixture(t),goalId='synthetic-original-goal',ledgerPath=join(f.directory,'ledger.json'),meters=[f.meter('codex'),f.meter('claude')],normalize=()=>meters.map(m=>normalizeGoalNativeMeter(m,m.provider,m.observedAt));await observeGoalBudget({goalId,ledgerPath,nowMs:f.s.now},{initialise:true,observedAt:new Date(f.s.now).toISOString(),meters:normalize()});await writeFile(join(f.directory,'goal-native-policy.json'),JSON.stringify({version:1,enabled:true,goalId,ledgerPath}),{mode:0o600});f.s.now+=120001;const guard=createGoalNativePolicy({privateDirectory:f.directory,goalId,ledgerPath},{now:()=>f.s.now,readCodexUsage:async()=>meters[0],readClaudeUsage:async()=>meters[1]});const decision=await guard.admission();assert.equal(decision.canDispatch,false);assert.equal(decision.reason,'meter_stale');const ledger=JSON.parse(await readFile(ledgerPath));assert.equal(ledger.sequence,1);assert.equal(ledger.policy.codexRemainingFloor,70);assert.equal(ledger.windows[Object.keys(ledger.windows)[0]].initialUsedPercent,35);
});

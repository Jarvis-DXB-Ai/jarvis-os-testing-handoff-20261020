import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm,chmod,symlink,mkdir,link} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {observeGoalBudget,extendGoalBudget} from './lib/office-goal-budget.mjs';
import {createGoalNativePolicy,normalizeGoalNativeMeter,readGoalNativeBinding} from './lib/office-goal-native-policy.mjs';
import {createOfficeGoalPolicyRuntime} from './lib/office-goal-policy-runtime.mjs';
async function fixture(t){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'office-native-policy-')));t.after(()=>rm(directory,{force:true,recursive:true}));
 const binding={privateDirectory:directory,goalId:'original-persistent-goal',ledgerPath:join(directory,'ledger.json')},state={now:Date.parse('2026-10-15T10:00:00Z'),codex:2,claude:13,reads:[0,0]};
 const config={version:1,enabled:true,goalId:binding.goalId,ledgerPath:binding.ledgerPath};
 const configPath=join(directory,'goal-native-policy.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 const meter=(provider)=>({provider,source:provider+' authoritative test meter',observedAt:new Date(state.now).toISOString(),windows:provider==='codex'?[{label:'codex · 7 days',usedPercent:state.codex,resetsAt:'2026-10-22T10:00:00Z'},{label:'codex · 5 hours',usedPercent:0,resetsAt:'2026-10-15T15:00:00Z'}]:[{label:'7 days · all models',usedPercent:state.claude,resetsAt:'2026-10-22T10:00:00Z'},{label:'5 hours · all models',usedPercent:0,resetsAt:null}]});
 const deps={now:()=>state.now,readCodexUsage:async()=>{state.reads[0]++;return meter('codex');},readClaudeUsage:async()=>{state.reads[1]++;return meter('claude');}};
 const budget=()=>({ledgerPath:binding.ledgerPath,goalId:binding.goalId,nowMs:state.now});
 await observeGoalBudget(budget(),{initialise:true,observedAt:new Date(state.now).toISOString(),meters:['codex','claude'].map(p=>normalizeGoalNativeMeter(meter(p),p,new Date(state.now).toISOString()))});state.now++;
 return {directory,binding,state,config,configPath,deps,meter,budget,guard:()=>createGoalNativePolicy(binding,deps)};
}
test('guard rereads both meters and persists a readback checkpoint at admission and every model stage',async t=>{
 const f=await fixture(t),guard=f.guard();let r=await guard.admission();assert.equal(r.canDispatch,true);assert.equal(r.checkpointSaved,true);assert.equal(r.stage,'admission');assert.equal(r.sequence,2);assert.equal(await guard.modelPolicy(),true);assert.deepEqual(f.state.reads,[2,2]);const checkpoint=JSON.parse(await readFile(join(f.directory,'goal-native-policy-checkpoint.json')));assert.equal(checkpoint.stage,'modelPolicy');assert.equal(checkpoint.canDispatch,true);assert.equal(checkpoint.sequence,3);
 f.state.codex=28;r=await guard.admission();assert.equal(r.canDispatch,false);assert.equal(r.reason,'usage_stop');assert.equal(await guard.modelPolicy(),false);
});
test('guard consumes validated saved60 policy and keeps the original goal identity/baseline/carried budget',async t=>{
 const f=await fixture(t);f.state.codex=28;const stopped=await f.guard().admission();assert.equal(stopped.reason,'usage_stop');await extendGoalBudget(f.budget(),{expectedLedgerSha256:stopped.ledgerSha256,codexRemainingFloor:60,authority:{kind:'owner-instruction',reference:'synthetic continuation'},note:'Exact10-point extension only.'});f.state.now++;
 const r=await f.guard().admission();assert.equal(r.canDispatch,true);assert.equal(r.goalId,'original-persistent-goal');const l=JSON.parse(await readFile(f.binding.ledgerPath));assert.equal(l.windows[Object.keys(l.windows)[0]].initialUsedPercent,2);assert.equal(l.windows[Object.keys(l.windows)[0]].carriedUsage,26);f.state.codex=38;assert.equal((await f.guard().admission()).reason,'usage_stop');
});
test('Claude cutoff blocks all stages and no provider fallback or ledger init is available',async t=>{
 const f=await fixture(t);f.state.claude=48;assert.equal(await f.guard().modelPolicy(),false);await rm(f.binding.ledgerPath);const reads=[...f.state.reads];assert.equal((await f.guard().admission()).canDispatch,false);assert.deepEqual(f.state.reads,reads);await assert.rejects(readFile(f.binding.ledgerPath),{code:'ENOENT'});
});
test('stale/future/missing/failed/malformed meters fail closed before ledger observation',async t=>{
 for(const mode of ['stale','future','missing','failed','duration','provider']){const f=await fixture(t),before=await readFile(f.binding.ledgerPath);f.deps.readCodexUsage=async()=>{if(mode==='failed')throw new Error('no meter');const v=f.meter('codex');if(mode==='stale')v.observedAt=new Date(f.state.now-120001).toISOString();if(mode==='future')v.observedAt=new Date(f.state.now+1).toISOString();if(mode==='missing')v.windows=[];if(mode==='duration')v.windows[0].windowDurationMins=300;if(mode==='provider')v.provider='foreign';return v;};const r=await f.guard().admission();assert.equal(r.canDispatch,false,mode);assert.deepEqual(await readFile(f.binding.ledgerPath),before,mode);}
});
test('config missing/disabled/foreign goal/extra keys and ledger permissions/corruption all fail closed',async t=>{
 for(const mode of ['missing','disabled','goal','extra','config-mode','ledger-mode','corruption']){const f=await fixture(t);if(mode==='missing')await rm(f.configPath);if(mode==='disabled')f.config.enabled=false;if(mode==='goal')f.config.goalId='another-goal';if(mode==='extra')f.config.fallback='paid';if(['disabled','goal','extra'].includes(mode))await writeFile(f.configPath,JSON.stringify(f.config));if(mode==='config-mode')await chmod(f.configPath,0o644);if(mode==='ledger-mode')await chmod(f.binding.ledgerPath,0o644);if(mode==='corruption')await writeFile(f.binding.ledgerPath,'{}');assert.equal((await f.guard().admission()).canDispatch,false,mode);}
});
test('owner private directory and all file/parent symlinks or hardlinked files are rejected',async t=>{
 for(const mode of ['directory-mode','config-symlink','config-hardlink','ledger-symlink','parent-symlink']){const f=await fixture(t);if(mode==='directory-mode')await chmod(f.directory,0o755);if(mode==='config-symlink'||mode==='config-hardlink'){const dest=join(f.directory,'other.json');await writeFile(dest,JSON.stringify(f.config),{mode:0o600});await rm(f.configPath);await (mode==='config-symlink'?symlink:link)(dest,f.configPath);}if(mode==='ledger-symlink'){const dest=join(f.directory,'other-ledger.json');await writeFile(dest,await readFile(f.binding.ledgerPath),{mode:0o600});await rm(f.binding.ledgerPath);await symlink(dest,f.binding.ledgerPath);}let binding=f.binding;if(mode==='parent-symlink'){const alias=join(f.directory,'alias');const nested=join(f.directory,'nested');await mkdir(nested,{mode:0o700});await symlink(nested,alias);binding={...f.binding,privateDirectory:alias};}assert.equal((await createGoalNativePolicy(binding,f.deps).admission()).canDispatch,false,mode);}
});
test('config revocation during meter or observer work prevents a successful dispatch',async t=>{
 for(const stage of ['meter','observe']){const f=await fixture(t);const revoke=()=>writeFile(f.configPath,JSON.stringify({...f.config,enabled:false}));if(stage==='meter')f.deps.readClaudeUsage=async()=>{await revoke();return f.meter('claude');};else f.deps.observeGoalBudget=async(c,v)=>{const r=await observeGoalBudget(c,v);await revoke();return r;};assert.equal((await f.guard().admission()).canDispatch,false);}
});
test('same-ledger concurrent guard checks cannot overlap meter/observation stages',async t=>{
 const f=await fixture(t);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);f.deps.readCodexUsage=async()=>{entered();await gate;return f.meter('codex');};const first=f.guard().admission();await started;const second=await f.guard().admission();assert.equal(second.canDispatch,false);assert.equal(second.reason,'inflight');release();assert.equal((await first).canDispatch,true);
});
test('checkpoint write failure and stale meters after observation refuse dispatch',async t=>{
 for(const mode of ['checkpoint','stale']){const f=await fixture(t);if(mode==='checkpoint')await mkdir(join(f.directory,'goal-native-policy-checkpoint.json'));else f.deps.observeGoalBudget=async(c,v)=>{const r=await observeGoalBudget(c,v);f.state.now+=120001;return r;};const r=await f.guard().admission();assert.equal(r.canDispatch,false);assert.equal(r.reason,mode==='checkpoint'?'checkpoint_unavailable':'meter_stale');}
});
test('binding loader accepts only exact enabled private config with canonical absolute ledger path',async t=>{
 const f=await fixture(t);assert.deepEqual(await readGoalNativeBinding(f.directory),f.binding);for(const extra of [{enabled:false},{ledgerPath:'relative.json'},{goalId:''},{version:2},{extra:true}]){await writeFile(f.configPath,JSON.stringify({...f.config,...extra}));await assert.rejects(readGoalNativeBinding(f.directory));}
});
test('runtime wrappers resolve fixed default directory anew each stage; loader/guard failure denies and cannot fall back',async()=>{
 const calls=[];let fail=false;const runtime=createOfficeGoalPolicyRuntime({readBinding:async directory=>{calls.push(directory);if(fail)throw new Error('missing config');return {privateDirectory:directory,goalId:'original',ledgerPath:'/synthetic/ledger'};},createPolicy:()=>({check:async stage=>({id:'x',goalId:'original',stage,canDispatch:true,reason:'ready',observedAt:'synthetic',checkpointSaved:true})})});assert.equal((await runtime.checkOfficeGoalAdmission()).canDispatch,true);assert.equal(await runtime.officeGoalModelPolicy(),true);assert.deepEqual(calls,[1,2].map(()=>join(homedir(),'Library','Application Support','Jarvis Office','goal-control')));fail=true;assert.equal(await runtime.officeGoalModelPolicy(),false);assert.equal((await runtime.checkOfficeGoalAdmission()).checkpointSaved,false);
 const throwing=createOfficeGoalPolicyRuntime({readBinding:async()=>{throw new Error('no config');},createPolicy:()=>{throw new Error('must not be reached');}});assert.equal(await throwing.officeGoalModelPolicy(),false);
});

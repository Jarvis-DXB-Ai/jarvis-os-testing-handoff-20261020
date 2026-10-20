import {constants} from 'node:fs';
import {lstat,open,realpath,rename,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readCodexUsage,readClaudeUsage} from './office-subscription-usage.mjs';
import {observeGoalBudget,readGoalBudgetUsageMode,recordGoalBudgetUsageUnavailable} from './office-goal-budget.mjs';
import {readGoalSharedUsage} from './office-goal-meter-broker.mjs';
import {validateGoalV2Binding} from './office-goal-bounded-authority.mjs';

const active=new Set(),MAX_AGE=120000;
const claudeLabels=new Map(['5 hours · all models','7 days · all models','7 days · Opus','7 days · Sonnet','7 days · OAuth apps'].map(label=>[label,label.startsWith('5 hours')?300:10080]));
/** Labels are generated from the owning normalizers' numeric durations, never guessed by substring. */
export function normalizeGoalNativeMeter(meter,provider,completedAt){
  if(meter?.provider!==provider||!Array.isArray(meter.windows)||!meter.windows.length||typeof meter.source!=='string'||!meter.source)throw new Error('meter_contract');
  const observedAt=meter.observedAt===undefined?completedAt:meter.observedAt;
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))throw new Error('meter_timestamp');
  const labels=new Set();let weekly=false;
  const windows=meter.windows.map(w=>{
    let duration;
    if(provider==='claude')duration=claudeLabels.get(w.label);
    else if(provider==='codex'&&typeof w.label==='string'){
      const period=w.label.match(/^.+ · (7 days|5 hours|[1-9]\d* minutes)$/)?.[1];
      duration=period==='7 days'?10080:period==='5 hours'?300:period?Number(period.split(' ')[0]):undefined;
    }
    if(!Number.isSafeInteger(duration)||duration<1||w.windowDurationMins!==undefined&&w.windowDurationMins!==duration)throw new Error('meter_duration');
    if(labels.has(w.label)||typeof w.usedPercent!=='number'||!Number.isFinite(w.usedPercent)||w.usedPercent<0||w.usedPercent>100)throw new Error('meter_contract');
    labels.add(w.label);if(duration===10080)weekly=true;
    const unusedShort=provider==='claude'&&duration<10080&&w.usedPercent===0&&w.resetsAt===null;
    if(!unusedShort&&(typeof w.resetsAt!=='string'||!Number.isFinite(Date.parse(w.resetsAt))))throw new Error('meter_contract');
    return {label:w.label,usedPercent:w.usedPercent,resetsAt:w.resetsAt,windowDurationMins:duration};
  });
  if(!weekly)throw new Error('meter_contract');
  return {provider,observedAt,source:meter.source,windows};
}
function absolute(path){if(typeof path!=='string'||path.includes('\0')||resolve(path)!==path)throw new Error('private_path');return path;}
async function directories(path,privateMode=false){
  for(let p=path;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('private_path');if(p===path&&privateMode&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))throw new Error('private_permissions');if(dirname(p)===p)break;}
  if(await realpath(path)!==path)throw new Error('private_path');
}
async function privateRead(path,max){
  await directories(dirname(path));
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const a=await f.stat();if(!a.isFile()||a.uid!==process.getuid()||(a.mode&0o7777)!==0o600||a.nlink!==1||a.size>max)throw new Error('private_permissions');const raw=await f.readFile('utf8'),b=await f.stat(),c=await lstat(path);if([b,c].some(s=>s.ino!==a.ino||s.dev!==a.dev||s.size!==a.size||s.mtimeMs!==a.mtimeMs||s.ctimeMs!==a.ctimeMs)||Buffer.byteLength(raw)!==a.size)throw new Error('private_changed');return raw;}finally{await f.close();}
}
async function checkpoint(directory,decision){
  await directories(directory,true);
  const path=join(directory,'goal-native-policy-checkpoint.json'),tmp=path+'.'+randomUUID()+'.tmp';
  try{const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(decision)+'\n');await f.sync();}finally{await f.close();}await rename(tmp,path);const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}if(JSON.parse(await privateRead(path,8192)).id!==decision.id)throw new Error('checkpoint_readback');}finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
/** Fixed-location runtime loader uses the same private-path checks as dispatch. */
export async function readGoalNativeBinding(privateDirectory){
  const directory=absolute(privateDirectory);await directories(directory,true);
  const c=JSON.parse(await privateRead(join(directory,'goal-native-policy.json'),4096));
  validateGoalV2Binding(c,directory);
  return Object.freeze({...c,privateDirectory:directory});
}
/** Trusted server construction only. Dependencies are process-owned functions, never task/HTTP input. */
export function createGoalNativePolicy(binding,dependencies={}){
  const directory=absolute(binding.privateDirectory),ledgerPath=absolute(binding.ledgerPath),goalId=binding.goalId;
  if(typeof goalId!=='string'||!goalId.trim())throw new Error('goal_binding');
  const clock=dependencies.now??Date.now,readers=[dependencies.readCodexUsage??readCodexUsage,dependencies.readClaudeUsage??readClaudeUsage],observe=dependencies.observeGoalBudget??observeGoalBudget;
  const key=ledgerPath;
  async function config(){
    await directories(directory,true);
    const raw=await privateRead(join(directory,'goal-native-policy.json'),4096),c=JSON.parse(raw);
    validateGoalV2Binding(c,directory);
    if(c.goalId!==goalId||c.ledgerPath!==ledgerPath||c.authorityPath!==binding.authorityPath||c.authoritySha256!==binding.authoritySha256)throw new Error('config_disabled_or_mismatch');
    return raw;
  }
  async function check(stage){
    const decision={id:randomUUID(),goalId,stage:stage==='admission'?'admission':'modelPolicy',canDispatch:false,reason:'guard_unavailable',observedAt:new Date(clock()).toISOString(),checkpointSaved:false};
    let owned=false,meters,configPin;
    try{
      if(!['admission','modelPolicy'].includes(stage))throw new Error('invalid_stage');
      if(active.has(key))throw new Error('inflight');active.add(key);owned=true;
      const pinned=await config();
      // Existing ledger required; this module never initializes, resets or reconciles it.
      const ledger=JSON.parse(await privateRead(ledgerPath,32*1024*1024));
      if(ledger.goalId!==goalId||ledger.policy?.usageStopMode&&ledger.policy.usageStopMode!=='enforced')throw new Error('new_goal_usage_policy_required');
      const budgetConfig={goalId,ledgerPath,maxAgeMs:MAX_AGE,safetyMarginPoints:2,nowMs:clock()};
      const mode=await readGoalBudgetUsageMode(budgetConfig);
      const fresh=()=>meters?.every(m=>Date.parse(m.observedAt)<=clock()&&clock()-Date.parse(m.observedAt)<=MAX_AGE);
      const unknown=async category=>recordGoalBudgetUsageUnavailable({...budgetConfig,nowMs:clock()},{attemptedAt:new Date(clock()).toISOString(),failureCategory:category,meters:meters??[]});
      const apply=r=>{decision.reason=r.reason;decision.canDispatch=r.canDispatch===true&&(r.reason==='ready'||r.reason==='owner_waived_usage_unknown'&&r.usageStopMode==='owner-waived');decision.sequence=r.sequence;decision.ledgerSha256=r.ledgerSha256;decision.usageStopMode=r.usageStopMode??'enforced';decision.usageStatus=r.usageStatus??'observed';decision.accountingHoldCount=r.accountingHolds.length;};
      let unavailable;
      try{
        const shared=!dependencies.readCodexUsage&&!dependencies.readClaudeUsage?await readGoalSharedUsage(directory):null;
        const settled=await Promise.allSettled(readers.map(async(read,i)=>{let value;if(shared)value=shared[i];else{try{value=await read();}catch{throw new Error('authoritative_'+(i===0?'codex':'claude')+'_meter_unavailable');}}return normalizeGoalNativeMeter(value,i===0?'codex':'claude',new Date(clock()).toISOString());}));
        meters=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
        const failures=settled.filter(r=>r.status!=='fulfilled');
        const corrupt=failures.find(r=>!['authoritative_codex_meter_unavailable','authoritative_claude_meter_unavailable'].includes(r.reason?.message));
        if(corrupt)throw corrupt.reason;
        if(meters.some(m=>Date.parse(m.observedAt)>clock()))throw new Error('meter_future');
        if(failures.length)throw failures[0].reason;
        if(!fresh())throw new Error('meter_stale');
      }catch(error){
        const category=error.code==='EEXIST'?'meter_busy':error.message;
        if(mode.usageStopMode!=='owner-waived'||!['authoritative_codex_meter_unavailable','authoritative_claude_meter_unavailable','meter_stale','meter_busy'].includes(category))throw error;
        unavailable=category;
      }
      if(await config()!==pinned)throw new Error('config_changed');
      let r=unavailable?await unknown(unavailable):await observe({...budgetConfig,nowMs:clock()},{observedAt:new Date(clock()).toISOString(),meters});
      if(meters?.some(m=>Date.parse(m.observedAt)>clock()))throw new Error('meter_future');
      if(mode.usageStopMode==='owner-waived'&&(!unavailable&&!fresh()||r.reason==='meter_unavailable'&&r.detail==='Both authoritative meters must be freshly observed after explicit reconciliation.'))r=await unknown('meter_stale');
      apply(r);
      if(!unavailable&&!fresh()&&mode.usageStopMode!=='owner-waived'){decision.canDispatch=false;decision.reason='meter_stale';}
      if(await config()!==pinned)throw new Error('config_changed');
      configPin=pinned;
    }catch(error){decision.canDispatch=false;decision.reason=['inflight','meter_stale','config_disabled_or_mismatch','config_changed','invalid_stage'].includes(error.message)?error.message:'guard_unavailable';const safe=['private_path','private_permissions','private_changed','meter_contract','meter_timestamp','meter_duration','authoritative_codex_meter_unavailable','authoritative_claude_meter_unavailable','meter_integrity','meter_future','meter_stale','meter_readback'];decision.failureCategory=safe.includes(error.message)?error.message:'validation_unavailable';}
    try{if(decision.canDispatch&&await config()!==configPin)throw new Error('config_changed');decision.checkpointSaved=true;await checkpoint(directory,decision);if(decision.canDispatch&&await config()!==configPin){decision.canDispatch=false;decision.reason='config_changed';await checkpoint(directory,decision);}if(meters?.some(m=>Date.parse(m.observedAt)>clock())){decision.canDispatch=false;decision.reason='meter_future';decision.failureCategory='meter_future';await checkpoint(directory,decision);}
    else if(decision.usageStatus!=='unknown'&&meters?.some(m=>clock()-Date.parse(m.observedAt)>MAX_AGE)){
      if(decision.usageStopMode==='owner-waived'&&decision.canDispatch){const r=await recordGoalBudgetUsageUnavailable({goalId,ledgerPath,nowMs:clock()},{attemptedAt:new Date(clock()).toISOString(),failureCategory:'meter_stale',meters});decision.reason=r.reason;decision.canDispatch=r.canDispatch;decision.sequence=r.sequence;decision.ledgerSha256=r.ledgerSha256;decision.usageStatus='unknown';if(await config()!==configPin)throw new Error('config_changed');}
      else{decision.canDispatch=false;decision.reason='meter_stale';}
      await checkpoint(directory,decision);
    }}catch(error){decision.canDispatch=false;decision.reason=error.message==='config_changed'?'config_changed':'checkpoint_unavailable';decision.checkpointSaved=false;}finally{if(owned)active.delete(key);}
    return Object.freeze(decision);
  }
  return Object.freeze({check,admission:()=>check('admission'),modelPolicy:async()=> (await check('modelPolicy')).canDispatch});
}

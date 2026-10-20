import {constants} from 'node:fs';
import {lstat,open,realpath,rename,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readCodexUsage,readClaudeUsage} from './office-subscription-usage.mjs';
import {observeGoalBudget,recheckSingleTaskQuota} from './office-goal-budget.mjs';
import {readGoalSharedUsage} from './office-goal-meter-broker.mjs';
import {validateGoalV2Binding} from './office-goal-bounded-authority.mjs';

const active=new Set(),MAX_AGE=120000;
const claudeLabels=new Map(['5 hours · all models','7 days · all models','7 days · Opus','7 days · Sonnet','7 days · OAuth apps'].map(label=>[label,label.startsWith('5 hours')?300:10080]));
/** Labels are generated from the owning normalizers' numeric durations, never guessed by substring. */
export function normalizeGoalNativeMeter(meter,provider,completedAt){
  if(meter?.provider!==provider||!Array.isArray(meter.windows)||!meter.windows.length||typeof meter.source!=='string'||!meter.source)throw new Error('meter_contract');
  const observedAt=meter.observedAt===undefined?completedAt:meter.observedAt;
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))throw new Error('meter_timestamp');
  return {provider,observedAt,source:meter.source,windows:meter.windows.map(w=>{
    let duration;
    if(provider==='claude')duration=claudeLabels.get(w.label);
    else if(provider==='codex'&&typeof w.label==='string'){
      const period=w.label.match(/^.+ · (7 days|5 hours|[1-9]\d* minutes)$/)?.[1];
      duration=period==='7 days'?10080:period==='5 hours'?300:period?Number(period.split(' ')[0]):undefined;
    }
    if(!Number.isSafeInteger(duration)||duration<1||w.windowDurationMins!==undefined&&w.windowDurationMins!==duration)throw new Error('meter_duration');
    return {label:w.label,usedPercent:w.usedPercent,resetsAt:w.resetsAt,windowDurationMins:duration};
  })};
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
  async function check(stage,singleTaskScope){
    const decision={id:randomUUID(),goalId,stage:stage==='admission'?'admission':'modelPolicy',canDispatch:false,reason:'guard_unavailable',observedAt:new Date(clock()).toISOString(),checkpointSaved:false};
    let owned=false,meters,configPin;
    try{
      if(!['admission','modelPolicy'].includes(stage))throw new Error('invalid_stage');
      if(active.has(key))throw new Error('inflight');active.add(key);owned=true;
      const pinned=await config();
      // Existing ledger required; this module never initializes, resets or reconciles it.
      const ledger=JSON.parse(await privateRead(ledgerPath,32*1024*1024));
      if(ledger.goalId!==goalId||ledger.policy?.usageStopMode&&ledger.policy.usageStopMode!=='enforced')throw new Error('new_goal_usage_policy_required');
      const shared=!dependencies.readCodexUsage&&!dependencies.readClaudeUsage?await readGoalSharedUsage(directory):null;
      const settled=await Promise.allSettled(readers.map(async(read,i)=>{const value=shared?shared[i]:await read();return normalizeGoalNativeMeter(value,i===0?'codex':'claude',new Date(clock()).toISOString());}));
      if(settled.some(x=>x.status!=='fulfilled'))throw new Error('meter_read_or_contract');
      meters=settled.map(x=>x.value);
      const fresh=()=>meters.every(m=>Date.parse(m.observedAt)<=clock()&&clock()-Date.parse(m.observedAt)<=MAX_AGE);
      if(!fresh())throw new Error('meter_stale');
      if(await config()!==pinned)throw new Error('config_changed');
      const r=await observe({goalId,ledgerPath,maxAgeMs:MAX_AGE,safetyMarginPoints:2,nowMs:clock(),...(singleTaskScope?{singleTaskScope}:{})},{observedAt:new Date(clock()).toISOString(),meters});
      decision.reason=r.reason;decision.canDispatch=r.canDispatch===true&&r.reason==='ready';decision.sequence=r.sequence;decision.ledgerSha256=r.ledgerSha256;
      if(!fresh()){decision.canDispatch=false;decision.reason='meter_stale';}
      if(await config()!==pinned)throw new Error('config_changed');
      configPin=pinned;
    }catch(error){decision.canDispatch=false;decision.reason=['inflight','meter_stale','config_disabled_or_mismatch','config_changed','invalid_stage'].includes(error.message)?error.message:'guard_unavailable';const safe=['private_path','private_permissions','private_changed','meter_contract','meter_timestamp','meter_duration','authoritative_codex_meter_unavailable','authoritative_claude_meter_unavailable','meter_integrity','meter_future','meter_stale','meter_readback'];decision.failureCategory=safe.includes(error.message)?error.message:'validation_unavailable';}
    try{if(decision.canDispatch&&await config()!==configPin)throw new Error('config_changed');decision.checkpointSaved=true;await checkpoint(directory,decision);if(decision.canDispatch&&await config()!==configPin){decision.canDispatch=false;decision.reason='config_changed';await checkpoint(directory,decision);}if(meters?.some(m=>Date.parse(m.observedAt)>clock()||clock()-Date.parse(m.observedAt)>MAX_AGE)){decision.canDispatch=false;decision.reason='meter_stale';await checkpoint(directory,decision);}}catch(error){decision.canDispatch=false;decision.reason=error.message==='config_changed'?'config_changed':'checkpoint_unavailable';decision.checkpointSaved=false;}finally{if(owned)active.delete(key);}
    return Object.freeze({...decision,recheckQuota:()=>recheckSingleTaskQuota({goalId,ledgerPath,nowMs:clock(),singleTaskScope})});
  }
  return Object.freeze({check,admission:()=>check('admission'),modelPolicy:async()=> (await check('modelPolicy')).canDispatch});
}

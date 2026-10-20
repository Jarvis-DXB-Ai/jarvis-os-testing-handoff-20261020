import {readFile,open,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const pct = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const unchanged = value => JSON.parse(JSON.stringify(value));
function payload(ledger) { const {integrity,...body}=ledger; return body; }
function verify(ledger,goalId) {
  if(ledger.version!==1||ledger.goalId!==goalId||ledger.integrity!==digest(payload(ledger))) throw new Error('Goal budget ledger identity or integrity mismatch. Preserve it for inspection; no dispatch is authorised.');
  let previous=null;
  for(const event of ledger.history) { const {hash,...body}=event; if(body.previousHash!==previous||hash!==digest(body))throw new Error('Goal budget history integrity mismatch.'); previous=hash; }
  if(ledger.sequence!==ledger.history.length)throw new Error('Goal budget sequence mismatch.');
  const waivers=ledger.history.filter(e=>e.type==='owner-usage-stop-waiver');
  if(waivers.length>1||(ledger.policy.usageStopMode===undefined?waivers.length!==0:ledger.policy.usageStopMode!=='owner-waived'||waivers.length!==1))throw new Error('Goal usage waiver lacks a valid recorded owner instruction.');
  if(waivers.length){const e=waivers[0],w=e.waiver;if(!w||w.from!=='enforced'||w.to!=='owner-waived'||!validAuthority(w.authority)||typeof w.note!=='string'||!w.note.trim()||typeof w.expectedLedgerSha256!=='string'||!/^[a-f0-9]{64}$/.test(w.expectedLedgerSha256)||!Number.isSafeInteger(e.sequence)||e.sequence<2)throw new Error('Invalid recorded owner usage waiver.');}
  const extensions=ledger.history.filter(e=>e.type==='owner-budget-extension');
  if(extensions.length>1||ledger.policy.codexRemainingFloor!==(extensions.length?60:70))throw new Error('Goal budget floor lacks a valid recorded owner extension.');
  if(extensions.length){
    const e=extensions[0],a=e.extension;
    if(!a||a.fromCodexRemainingFloor!==70||a.toCodexRemainingFloor!==60||a.headroomIncreasePoints!==10||!validAuthority(a.authority)||typeof a.note!=='string'||!a.note.trim()||!Number.isSafeInteger(e.sequence)||e.sequence<2||a.expectedLedgerSha256?.match(/^[a-f0-9]{64}$/)===null||typeof a.expectedLedgerSha256!=='string')throw new Error('Invalid recorded owner extension authority or policy.');
    const initial=observations(ledger.history[0].observation,Date.parse(ledger.history[0].at),Infinity).filter(w=>w.provider==='codex');
    if(!initial.length||!Array.isArray(a.windows)||a.windows.length!==initial.length)throw new Error('Invalid owner extension window scope.');
    for(const row of initial){
      const entries=a.windows.filter(w=>w.key===row.key),current=ledger.windows[row.key],original=Math.max(0,30-ledger.policy.safetyMarginPoints-row.usedPercent);
      if(entries.length!==1||entries[0].beforeInitialHeadroom!==original||entries[0].afterInitialHeadroom!==original+10||!current||current.initialUsedPercent!==row.usedPercent||current.initialHeadroom!==original+10)throw new Error('Owner extension cannot rebase the original allowance.');
    }
  }
}
function policy(config,ledger) {
  const margin=config.safetyMarginPoints??2,maxAgeMs=config.maxAgeMs??120000;
  if(!Number.isFinite(margin)||margin<2||margin>=30||!Number.isFinite(maxAgeMs)||maxAgeMs<1||maxAgeMs>300000)throw new Error('Use at least two percentage points of safety margin and a freshness limit of at most five minutes.');
  const floor=ledger?.policy.codexRemainingFloor??70;
  if(![70,60].includes(floor)||config.codexRemainingFloor!==undefined&&config.codexRemainingFloor!==floor)throw new Error('Codex floor must match the recorded owner extension; policy cannot change during observation.');
  const mode=ledger?.policy.usageStopMode??'enforced';
  if(!['enforced','owner-waived'].includes(mode)||config.usageStopMode!==undefined&&config.usageStopMode!==mode)throw new Error('Usage stop mode must match the recorded owner waiver; policy cannot change during observation.');
  return {codexRemainingFloor:floor,claudeWeeklyRemainingFloor:50,safetyMarginPoints:margin,maxAgeMs,...(mode==='owner-waived'?{usageStopMode:mode}:{})};
}
function observations(input,now,maxAgeMs) {
  if(!stamp(input.observedAt)||Date.parse(input.observedAt)>now||now-Date.parse(input.observedAt)>maxAgeMs)throw new Error('Observation timestamp is missing, future or stale.');
  if(!Array.isArray(input.meters)||input.meters.length!==2)throw new Error('Both authoritative subscription meters are required.');
  const providers=new Set(),out=[];
  for(const meter of input.meters) {
    if(!['codex','claude'].includes(meter.provider)||providers.has(meter.provider))throw new Error('A subscription meter is missing or duplicated.'); providers.add(meter.provider);
    if(typeof meter.source!=='string'||!meter.source.trim()||!stamp(meter.observedAt)||Date.parse(meter.observedAt)>now||now-Date.parse(meter.observedAt)>maxAgeMs)throw new Error('A meter source or fresh timestamp is unavailable.');
    if(!Array.isArray(meter.windows)||!meter.windows.length)throw new Error('A subscription meter has no windows.');
    let weekly=false;const keys=new Set();
    for(const window of meter.windows) {
      if(typeof window.label!=='string'||!window.label.trim()||!pct(window.usedPercent)||!Number.isSafeInteger(window.windowDurationMins)||window.windowDurationMins<=0)throw new Error('A meter window is malformed; duration and percentage must be authoritative.');
      if(window.windowDurationMins===10080)weekly=true;
      const unusedClaudeShort=meter.provider==='claude'&&window.windowDurationMins<10080&&window.usedPercent===0&&window.resetsAt===null;
      if(!unusedClaudeShort&&!stamp(window.resetsAt))throw new Error('A used or core meter window is missing its reset timestamp.');
      if(stamp(window.resetsAt)&&Date.parse(window.resetsAt)<=Date.parse(meter.observedAt))throw new Error('Meter reset timestamp is stale or inconsistent.');
      const key=JSON.stringify([meter.provider,window.label,window.windowDurationMins]); if(keys.has(key))throw new Error('Duplicate meter window.');keys.add(key);
      out.push({key,provider:meter.provider,label:window.label,windowDurationMins:window.windowDurationMins,usedPercent:window.usedPercent,resetsAt:window.resetsAt===null?null:new Date(window.resetsAt).toISOString(),observedAt:new Date(meter.observedAt).toISOString(),source:meter.source});
    }
    if(!weekly)throw new Error('The provider weekly core meter is unavailable.');
  }
  return out;
}
function threshold(row,p) { return (row.provider==='codex'?100-p.codexRemainingFloor:row.windowDurationMins===10080?100-p.claudeWeeklyRemainingFloor:100)-p.safetyMarginPoints; }
// Provider-specific precision only: no allowance/segment is renewed. Codex uses
// whole seconds and an EARLIEST canonical boundary, so +1s cannot walk forward.
// Claude retains its existing nearest-second subsecond rule.
function resetJitter(previous,row) {
  if(previous.key!==row.key||previous.provider!==row.provider||previous.windowDurationMins!==row.windowDurationMins||!stamp(previous.resetsAt)||!stamp(row.resetsAt))return null;
  if(previous.provider==='codex'){
    const before=Date.parse(previous.resetsAt),after=Date.parse(row.resetsAt),earliest=Math.min(before,after);
    if(before===after||before%1000!==0||after%1000!==0||Math.abs(after-before)>1000
      ||!stamp(previous.observedAt)||!stamp(row.observedAt)
      ||Date.parse(previous.observedAt)>earliest-120000||Date.parse(row.observedAt)>earliest-120000)return null;
    return {key:row.key,kind:'codex-reset-integer-second-precision',previousResetAt:previous.resetsAt,observedResetAt:row.resetsAt,canonicalResetAt:new Date(earliest).toISOString()};
  }
  if(previous.provider!=='claude')return null;
  const before=Date.parse(previous.resetsAt),after=Date.parse(row.resetsAt),canonical=Math.round(before/1000)*1000;
  if(before===after||Math.round(after/1000)*1000!==canonical||Math.abs(after-before)>1000
    ||Date.parse(previous.observedAt)>=Math.min(before,after)-1000||Date.parse(row.observedAt)>=Math.min(before,after)-1000)return null;
  return {key:row.key,kind:'claude-reset-subsecond-precision',previousResetAt:previous.resetsAt,observedResetAt:row.resetsAt,canonicalResetAt:new Date(canonical).toISOString()};
}
async function persistLedger(config,ledger) {
  ledger.integrity=digest(payload(ledger));
  const temporary=config.ledgerPath+'.'+randomUUID()+'.tmp';
  try {const f=await open(temporary,'wx',0o600);try{await f.writeFile(JSON.stringify(ledger,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(temporary,config.ledgerPath);}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  const reread=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(reread,config.goalId);if(reread.integrity!==ledger.integrity)throw new Error('Goal budget readback differs; no dispatch is authorised.');return reread;
}
function publicWindows(ledger) { return Object.values(ledger.windows).map(w=>({provider:w.provider,label:w.label,windowDurationMins:w.windowDurationMins,initialUsedPercent:w.initialUsedPercent,initialHeadroom:w.initialHeadroom,carriedUsage:w.carriedUsage,usedPercent:w.usedPercent,remainingPercent:100-w.usedPercent,resetsAt:w.resetsAt,observedAt:w.observedAt,segments:w.segments,headroomRemaining:Math.max(0,w.initialHeadroom-w.carriedUsage)})); }
function result(ledger,reason,detail) { return {canDispatch:reason==='ready'||reason==='owner_waived_usage_unknown',reason,detail,usageStatus:['ready','usage_stop','accounting_uncertain'].includes(reason)?'observed':'unknown',usageStopMode:ledger.policy.usageStopMode??'enforced',goalId:ledger.goalId,sequence:ledger.sequence,windows:publicWindows(ledger),accountingHolds:[...ledger.accountingHolds],ledgerSha256:ledger.integrity}; }

/** Observe both account meters. No provider/model calls, reset redemption, process cancellation or goal-status mutations occur here.
 * A missing ledger requires explicit initialise:true. Existing ledgers can never be rebased.
 * Reset gaps and unexplained decreases latch a hold, because unobserved usage cannot be reconstructed honestly.
 */
export async function observeGoalBudget(config,input) {
  if(typeof config.ledgerPath!=='string'||!config.ledgerPath.startsWith('/')||typeof config.goalId!=='string'||!config.goalId.trim())throw new Error('An absolute ledger path and persistent goal ID are required.');
  const now=config.nowMs??Date.now(); if(!Number.isFinite(now))throw new Error('Invalid current time.');
  await mkdir(dirname(config.ledgerPath),{recursive:true});
  const lock=await open(config.ledgerPath+'.lock','wx',0o600).catch(()=>{throw new Error('Another observer owns the goal budget lock. No dispatch is authorised.');});
  try {
    let ledger;try { ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId); } catch(error) {if(error.code!=='ENOENT')throw error;}
    const p=policy(config,ledger);
    if(ledger&&input.initialise===true)throw new Error('Goal budget is already initialised; rebasing is forbidden.');
    if(!ledger&&input.initialise!==true)throw new Error('Explicit one-time goal budget initialisation is required.');
    if(ledger&&JSON.stringify(ledger.policy)!==JSON.stringify(p))throw new Error('The saved goal budget policy cannot change during observation.');
    let rows,error,staleBaseline=false;try {rows=observations(input,now,p.maxAgeMs);if(ledger?.refreshRequiredAfter&&(Date.parse(input.observedAt)<=Date.parse(ledger.refreshRequiredAfter)||rows.some(row=>Date.parse(row.observedAt)<=Date.parse(ledger.refreshRequiredAfter))))throw new Error('Both authoritative meters must be freshly observed after explicit reconciliation.');}catch(e){error=e.message;}
    // The initial authoritative snapshot may have aged while the guard was being prepared.
    // Preserve its original allowance, but never authorise dispatch until a fresh follow-up.
    if(!ledger&&error&&input.initialise===true){try{rows=observations(input,now,Infinity);staleBaseline=true;error=undefined;}catch{}}
    if(!ledger&&error)throw new Error('Cannot initialise a goal budget from unavailable meters: '+error);
    if(!ledger)ledger={version:1,goalId:config.goalId,createdAt:input.observedAt,policy:p,sequence:0,windows:{},accountingHolds:[],history:[]};
    let reason='ready',detail='All observed subscription windows retain the configured safety margin.';const normalisations=[];
    if(error){reason='meter_unavailable';detail=error;}
    else {
      if(ledger.sequence) {
        const expected=Object.keys(ledger.windows),received=rows.map(r=>r.key);
        if(expected.some(k=>!received.includes(k))){reason='meter_unavailable';detail='A previously reported usage window is missing.';}
        for(const row of rows)if(!expected.includes(row.key))ledger.accountingHolds.push('A new or changed usage window has no approved initial allowance: '+row.key);
      }
      // A partial/malformed snapshot cannot advance the last good observation.
      if(reason!=='meter_unavailable')for(const row of rows) {
        let previous=ledger.windows[row.key],canonicalResetAt;
        if(!previous){if(ledger.sequence)continue;ledger.windows[row.key]={...row,initialUsedPercent:row.usedPercent,initialHeadroom:Math.max(0,threshold(row,p)-row.usedPercent),carriedUsage:0,segments:1};continue;}
        if(Date.parse(row.observedAt)<Date.parse(previous.observedAt)){ledger.accountingHolds.push('Meter observation moved backwards: '+row.key);continue;}
        if(previous.resetsAt===null&&row.resetsAt!==null){
          // An unused Claude short window may acquire its first reset without rebasing.
          if(previous.usedPercent!==0)ledger.accountingHolds.push('Missing earlier reset accounting: '+row.key);
        }else if(previous.resetsAt!==row.resetsAt){
          const precision=resetJitter(previous,row);
          if(precision){if(row.usedPercent<previous.usedPercent){ledger.accountingHolds.push('Unexplained percentage decrease: '+row.key);continue;}normalisations.push(precision);if(row.provider==='codex')canonicalResetAt=precision.canonicalResetAt;previous.carriedUsage+=Math.max(0,row.usedPercent-previous.usedPercent);}
          else {const rollover=previous.resetsAt&&row.resetsAt&&Date.parse(row.observedAt)>=Date.parse(previous.resetsAt)&&Date.parse(row.resetsAt)>Date.parse(previous.resetsAt);
          if(!rollover||previous.usedPercent!==100){ledger.accountingHolds.push('Reset gap or changed reset timestamp prevents complete carried-usage accounting: '+row.key);continue;}
          previous.carriedUsage+=row.usedPercent;previous.segments++;}
        }else if(row.usedPercent<previous.usedPercent){ledger.accountingHolds.push('Unexplained percentage decrease: '+row.key);continue;}
        else previous.carriedUsage+=Math.max(0,row.usedPercent-previous.usedPercent);
        // First activation of an unused short window still consumes its initial allowance.
        if(previous.resetsAt===null&&row.resetsAt!==null)previous.carriedUsage+=Math.max(0,row.usedPercent-previous.usedPercent);
        Object.assign(previous,row);if(canonicalResetAt)previous.resetsAt=canonicalResetAt;
      }
      if(reason!=='meter_unavailable')delete ledger.refreshRequiredAfter;
      ledger.accountingHolds=[...new Set(ledger.accountingHolds)];
      const blockingHold=ledger.accountingHolds.find(h=>p.usageStopMode!=='owner-waived'||!usageAccountingHold(h));
      if(blockingHold){reason='accounting_uncertain';detail=blockingHold;}
      else if(p.usageStopMode!=='owner-waived'&&reason!=='meter_unavailable'&&Object.values(ledger.windows).some(w=>w.usedPercent>=threshold(w,p)||w.carriedUsage>=w.initialHeadroom)){reason='usage_stop';detail='At least one usage window reached its conservative live or carried allowance cutoff.';}
    }
    if(p.usageStopMode==='owner-waived'&&reason==='ready')detail='Owner waived numeric usage stops and usage-accounting uncertainty only. Both fresh authoritative meters remain valid; historical accounting holds are retained.';
    if(staleBaseline){reason='meter_unavailable';detail='Original baseline saved without rebasing. A fresh full meter observation is required before dispatch.';}
    const event={sequence:ledger.sequence+1,at:new Date(now).toISOString(),observation:unchanged(input),reason,detail,...(normalisations.length?{normalisations}:{}),previousHash:ledger.history.at(-1)?.hash??null};
    ledger.history.push({...event,hash:digest(event)});ledger.sequence++;ledger.integrity=digest(payload(ledger));
    const reread=await persistLedger(config,ledger);
    return result(reread,reason,detail);
  }finally {await lock.close();await unlink(config.ledgerPath+'.lock');}
}

/** Explicitly retire only a recorded provider-specific reset-precision hold.
 * The original history and exact allowance remain unchanged. A fresh observation
 * is mandatory afterwards; reconciliation itself never authorises dispatch.
 */
export async function reconcileResetJitterHold(config,input) {
  if(typeof config.ledgerPath!=='string'||!config.ledgerPath.startsWith('/')||typeof config.goalId!=='string'||!config.goalId.trim())throw new Error('An absolute ledger path and persistent goal ID are required.');
  const now=config.nowMs??Date.now();
  if(!Number.isFinite(now)||!input||typeof input.expectedLedgerSha256!=='string'||typeof input.hold!=='string'||!Number.isSafeInteger(input.observationSequence)||typeof input.note!=='string'||!input.note.trim())throw new Error('Exact ledger hash, recorded hold, observation sequence and audit note are required.');
  const lock=await open(config.ledgerPath+'.lock','wx',0o600).catch(()=>{throw new Error('Another observer owns the goal budget lock. No dispatch is authorised.');});
  try {
    const ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId);
    const p=policy(config,ledger);
    if(ledger.integrity!==input.expectedLedgerSha256||JSON.stringify(ledger.policy)!==JSON.stringify(p))throw new Error('The ledger or policy changed before explicit hold reconciliation.');
    const prefix='Reset gap or changed reset timestamp prevents complete carried-usage accounting: ';
    if(!input.hold.startsWith(prefix)||!ledger.accountingHolds.includes(input.hold))throw new Error('Only a currently recorded reset-precision hold can be reconciled.');
    const event=ledger.history.find(e=>e.sequence===input.observationSequence);
    if(!event||event.reason!=='accounting_uncertain'||event.detail!==input.hold||!event.observation)throw new Error('The exact originating accounting observation is required.');
    const key=input.hold.slice(prefix.length),previous=ledger.windows[key];
    const rows=observations(event.observation,Date.parse(event.at),Infinity),row=rows.find(r=>r.key===key);
    let originPrevious;
    for(const candidate of ledger.history.filter(e=>e.sequence<event.sequence&&e.observation).reverse()){try{originPrevious=observations(candidate.observation,Date.parse(candidate.at),Infinity).find(r=>r.key===key);if(originPrevious)break;}catch{}}
    const isCodex=row?.provider==='codex';
    if(isCodex){
      // Codex recovery needs an explicit proof of the adjacent accepted observation,
      // not a selected older pair that could skip an unexplained gap.
      const prior=ledger.history.find(e=>e.sequence===event.sequence-1);
      if(!input.codexProof||input.codexProof.originHash!==event.hash||input.codexProof.previousHash!==prior?.hash||prior?.reason!=='ready'||event.previousHash!==prior.hash)throw new Error('Exact adjacent accepted Codex observation hashes are required.');
      originPrevious=observations(prior.observation,Date.parse(prior.at),Infinity).find(r=>r.key===key);
    }
    const precision=originPrevious&&row?resetJitter(originPrevious,row):null;
    const currentSameWindow=previous&&row&&(previous.resetsAt===row.resetsAt||resetJitter(previous,row));
    if(!precision||!currentSameWindow||row.usedPercent<originPrevious.usedPercent||previous.usedPercent<originPrevious.usedPercent||(Date.parse(previous.observedAt)>Date.parse(row.observedAt)&&previous.usedPercent<row.usedPercent))throw new Error('Recorded evidence does not prove a same-window provider precision change with unchanged or increasing usage.');
    const retired={hold:input.hold,originSequence:event.sequence,originHash:event.hash,precision,originPreviousObservation:originPrevious,priorWindow:unchanged(previous),note:input.note.trim(),...(isCodex?{codexProof:unchanged(input.codexProof)}:{})};
    if(Date.parse(previous.observedAt)<=Date.parse(row.observedAt)&&previous.usedPercent<=row.usedPercent){previous.carriedUsage+=Math.max(0,row.usedPercent-previous.usedPercent);Object.assign(previous,row);}
    if(isCodex){previous.resetsAt=new Date(Math.min(Date.parse(previous.resetsAt),Date.parse(precision.canonicalResetAt))).toISOString();ledger.refreshRequiredAfter=new Date(now).toISOString();}
    ledger.accountingHolds=ledger.accountingHolds.filter(h=>h!==input.hold);
    const reason=ledger.accountingHolds.length?'accounting_uncertain':'meter_unavailable',detail=ledger.accountingHolds[0]??'Recorded reset precision hold reconciled explicitly. Refresh both authoritative meters before dispatch.';
    const audit={sequence:ledger.sequence+1,at:new Date(now).toISOString(),type:'recorded-reset-jitter-reconciliation',retiredHold:retired,reason,detail,previousHash:ledger.history.at(-1)?.hash??null};
    ledger.history.push({...audit,hash:digest(audit)});ledger.sequence++;
    const reread=await persistLedger(config,ledger);return result(reread,reason,detail);
  }finally{await lock.close();await unlink(config.ledgerPath+'.lock');}
}

function validAuthority(authority){return authority&&Object.keys(authority).sort().join(',')==='kind,reference'&&authority.kind==='owner-instruction'&&typeof authority.reference==='string'&&authority.reference.trim().length>0&&authority.reference.length<=4096;}
/** Trusted owner-authorized call only. Append the single authorized 70→60 change.
 * No observation, reset, hold or consumption is replaced. Both meters must then
 * be observed strictly after this event before dispatch can resume.
 */
export async function extendGoalBudget(config,input){
  if(typeof config.ledgerPath!=='string'||!config.ledgerPath.startsWith('/')||typeof config.goalId!=='string'||!config.goalId.trim())throw new Error('An absolute ledger path and persistent goal ID are required.');
  const now=config.nowMs??Date.now();
  if(!Number.isFinite(now)||!input||typeof input.expectedLedgerSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedLedgerSha256)||input.codexRemainingFloor!==60||!validAuthority(input.authority)||typeof input.note!=='string'||!input.note.trim()||input.note.length>8192)throw new Error('Exact ledger hash, owner-instruction audit authority, note and authorized Codex floor60 are required.');
  const lock=await open(config.ledgerPath+'.lock','wx',0o600).catch(()=>{throw new Error('Another observer owns the goal budget lock. No dispatch is authorised.');});
  try{
    const ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId);
    const p=policy(config,ledger);
    if(ledger.integrity!==input.expectedLedgerSha256||JSON.stringify(ledger.policy)!==JSON.stringify(p))throw new Error('The ledger or policy changed before the owner extension.');
    if(p.codexRemainingFloor!==70||ledger.history.some(e=>e.type==='owner-budget-extension'))throw new Error('The authorized owner extension has already been recorded; repeated extension is forbidden.');
    if(now<Date.parse(ledger.history.at(-1).at)||Object.values(ledger.windows).some(w=>now<Date.parse(w.observedAt)))throw new Error('Owner extension timestamp cannot precede existing accounting.');
    const windows=Object.values(ledger.windows).filter(w=>w.provider==='codex').map(w=>({key:w.key,beforeInitialHeadroom:w.initialHeadroom,afterInitialHeadroom:w.initialHeadroom+10}));
    if(!windows.length)throw new Error('Existing Codex windows are required; no new allowance windows may be created.');
    for(const w of windows)ledger.windows[w.key].initialHeadroom=w.afterInitialHeadroom;
    ledger.policy={...ledger.policy,codexRemainingFloor:60};
    ledger.refreshRequiredAfter=new Date(now).toISOString();
    const reason=ledger.accountingHolds.length?'accounting_uncertain':'meter_unavailable',detail=ledger.accountingHolds[0]??'Owner extension recorded without rebasing. Refresh both authoritative meters before dispatch.';
    const event={sequence:ledger.sequence+1,at:new Date(now).toISOString(),type:'owner-budget-extension',extension:{fromCodexRemainingFloor:70,toCodexRemainingFloor:60,headroomIncreasePoints:10,expectedLedgerSha256:input.expectedLedgerSha256,authority:unchanged(input.authority),note:input.note.trim(),windows},reason,detail,previousHash:ledger.history.at(-1)?.hash??null};
    ledger.history.push({...event,hash:digest(event)});ledger.sequence++;
    return result(await persistLedger(config,ledger),reason,detail);
  }finally{await lock.close();await unlink(config.ledgerPath+'.lock');}
}

function usageAccountingHold(hold){return typeof hold==='string'&&['Reset gap or changed reset timestamp prevents complete carried-usage accounting: ','Unexplained percentage decrease: ','Missing earlier reset accounting: '].some(prefix=>hold.startsWith(prefix));}
/** Explicit trusted owner instruction only. Removes usage-derived stops without
 * changing allowance history or provider/security/freshness requirements.
 */
export async function waiveGoalBudgetUsageStops(config,input){
  if(typeof config.ledgerPath!=='string'||!config.ledgerPath.startsWith('/')||typeof config.goalId!=='string'||!config.goalId.trim())throw new Error('An absolute ledger path and persistent goal ID are required.');
  const now=config.nowMs??Date.now();
  if(!Number.isFinite(now)||!input||typeof input.expectedLedgerSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedLedgerSha256)||!validAuthority(input.authority)||typeof input.note!=='string'||!input.note.trim()||input.note.length>8192)throw new Error('Exact ledger hash, owner-instruction authority and audit note are required for the usage waiver.');
  const lock=await open(config.ledgerPath+'.lock','wx',0o600).catch(()=>{throw new Error('Another observer owns the goal budget lock. No dispatch is authorised.');});
  try{
    const ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId);const p=policy(config,ledger);
    if(ledger.integrity!==input.expectedLedgerSha256||JSON.stringify(ledger.policy)!==JSON.stringify(p))throw new Error('The ledger or policy changed before the owner usage waiver.');
    if(p.usageStopMode==='owner-waived')throw new Error('The owner usage waiver has already been recorded; repeated waiver is forbidden.');
    if(now<Date.parse(ledger.history.at(-1).at)||Object.values(ledger.windows).some(w=>now<Date.parse(w.observedAt)))throw new Error('Owner waiver timestamp cannot precede existing accounting.');
    const waiver={from:'enforced',to:'owner-waived',expectedLedgerSha256:input.expectedLedgerSha256,authority:unchanged(input.authority),note:input.note.trim(),previousPolicy:unchanged(ledger.policy),preservedWindowsSha256:digest(ledger.windows),preservedAccountingHoldsSha256:digest(ledger.accountingHolds)};
    ledger.policy={...ledger.policy,usageStopMode:'owner-waived'};ledger.refreshRequiredAfter=new Date(now).toISOString();
    const reason='meter_unavailable',detail='Owner usage waiver recorded. Future authoritative usage observations retain their real times; unavailable usage must be recorded explicitly as unknown.';
    const event={sequence:ledger.sequence+1,at:new Date(now).toISOString(),type:'owner-usage-stop-waiver',waiver,reason,detail,previousHash:ledger.history.at(-1)?.hash??null};
    ledger.history.push({...event,hash:digest(event)});ledger.sequence++;
    return result(await persistLedger(config,ledger),reason,detail);
  }finally{await lock.close();await unlink(config.ledgerPath+'.lock');}
}

/** Read-only verified mode lookup. Parsing a saved flag alone is never authority. */
export async function readGoalBudgetUsageMode(config){
 const ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId);policy(config,ledger);
 return Object.freeze({goalId:ledger.goalId,usageStopMode:ledger.policy.usageStopMode??'enforced',ledgerSha256:ledger.integrity});
}
/** Best-effort usage endpoint failure is distinct from native provider failure.
 * Only a verified recorded waiver authorizes this explicit UNKNOWN checkpoint.
 * No provider observation timestamp/window/reset/headroom/hold is synthesized.
 */
export async function recordGoalBudgetUsageUnavailable(config,input){
 if(typeof config.ledgerPath!=='string'||!config.ledgerPath.startsWith('/')||typeof config.goalId!=='string'||!config.goalId.trim())throw new Error('An absolute ledger path and persistent goal ID are required.');
 const now=config.nowMs??Date.now(),categories=['authoritative_codex_meter_unavailable','authoritative_claude_meter_unavailable','meter_stale','meter_busy'];
 if(!Number.isFinite(now)||!input||!stamp(input.attemptedAt)||Date.parse(input.attemptedAt)>now||now-Date.parse(input.attemptedAt)>120000||!categories.includes(input.failureCategory)||input.meters!==undefined&&!Array.isArray(input.meters))throw new Error('A current attempt and explicit usage availability category are required.');
 const lock=await open(config.ledgerPath+'.lock','wx',0o600).catch(()=>{throw new Error('Another observer owns the goal budget lock. No dispatch is authorised.');});
 try{
  const ledger=JSON.parse(await readFile(config.ledgerPath,'utf8'));verify(ledger,config.goalId);const p=policy(config,ledger);
  if(p.usageStopMode!=='owner-waived')throw new Error('Usage endpoint unavailability cannot authorize dispatch without a recorded owner waiver.');
  if(now<Date.parse(ledger.history.at(-1).at))throw new Error('Usage attempt cannot move ledger time backwards.');
  const blocking=ledger.accountingHolds.find(h=>!usageAccountingHold(h));
  const reason=blocking?'accounting_uncertain':'owner_waived_usage_unknown',detail=blocking??'Owner waived usage stops. Account usage is UNKNOWN; no meter freshness or quota availability is claimed. Native provider authentication and execution remain independently enforced.';
  const event={sequence:ledger.sequence+1,at:new Date(now).toISOString(),type:'owner-waived-usage-unavailable',usageObservation:{attemptedAt:input.attemptedAt,status:'unknown',failureCategory:input.failureCategory,meters:unchanged(input.meters??[])},reason,detail,previousHash:ledger.history.at(-1)?.hash??null};
  ledger.history.push({...event,hash:digest(event)});ledger.sequence++;
  return {...result(await persistLedger(config,ledger),reason,detail),usageStatus:'unknown'};
 }finally{await lock.close();await unlink(config.ledgerPath+'.lock');}
}

import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {join} from 'node:path';
import {homedir} from 'node:os';
import type {SubscriptionMeter} from '../../scripts/lib/office-subscription-usage.mjs';
import {readGoalSharedUsage} from '../../scripts/lib/office-goal-meter-broker.mjs';
import {listJobs} from '../../scripts/lib/office-team-engine.mjs';
type Provider=SubscriptionMeter&{status:'available'|'unavailable';checkedAt:string;observedAt:string|null;message:string};
type ObservedMeter=SubscriptionMeter&{observedAt:string};
const privateDirectory=join(homedir(),'Library','Application Support','Jarvis Office','goal-control');
let pending:ReturnType<typeof loadUsage>|null=null;
async function loadProviders():Promise<Provider[]>{
 const attemptedAt=new Date().toISOString();
 try{
  // The same private broker owns account observations for the UI and native guard.
  // Its original per-provider times survive disk reuse; no UI cache renews them.
  const meters=await readGoalSharedUsage(privateDirectory) as ObservedMeter[];
  return meters.map<Provider>(v=>({...v,status:v.windows.length?'available':'unavailable',checkedAt:v.observedAt,observedAt:v.observedAt,message:v.windows.length?(v.provider==='claude'?'Account-wide quota, shared with Claude apps and CLI use.':'Account-wide quota, shared with other chats and Office agents.'):'The account returned no quota windows.'}));
 }catch{
  // A broker lock, stale observation or unavailable authoritative meter stays
  // unknown. This view never starts independent readers or serves old windows.
  return ['codex','claude'].map<Provider>(provider=>({provider,name:provider==='codex'?'Codex':'Claude',plan:null,source:provider==='codex'?'Codex account/rateLimits/read':'Claude account usage',windows:[],resetCredits:null,status:'unavailable',checkedAt:attemptedAt,observedAt:null,message:'Shared account meter unavailable. Refresh after the authoritative account meter becomes available.'}));
 }
}
async function loadUsage(){
 const [providers,jobs]=await Promise.all([loadProviders(),listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER})]);
 const observations=providers.flatMap(p=>p.observedAt?[p.observedAt]:[]);
 const checkedAt=observations.length?observations.reduce((oldest,at)=>Date.parse(at)<Date.parse(oldest)?at:oldest):new Date().toISOString();
 const seen=new Set<string>();const activity:{jobId:string;brief:string;clientId:string|null;role:string;provider:string;model:string;status:string;runId:string;inputTokens:number|null;outputTokens:number|null;cachedTokens:number|null;at:string}[]=[];
 for(const job of jobs)for(const call of job.calls){if(!call.runId||seen.has(call.runId))continue;seen.add(call.runId);const model=call.usage?.model??call.model;activity.push({jobId:job.id,brief:job.brief,clientId:job.knowledgeContext?.scope.clientId??null,role:call.roleId,provider:/claude|opus|sonnet|haiku/i.test(model)?'claude':'codex',model,status:call.status,runId:call.runId,inputTokens:call.usage?.inputTokens??null,outputTokens:call.usage?.outputTokens??null,cachedTokens:call.usage?.cachedInputTokens??null,at:call.finishedAt??call.startedAt});}
 return {checkedAt,providers,activity:activity.sort((a,b)=>b.at.localeCompare(a.at))};
}
export async function officeUsage(){if(!localOfficeEnabled())throw new Error('Subscription usage requires the private Mac office.');if(!pending)pending=loadUsage().finally(()=>{pending=null;});return pending;}
export type OfficeUsage=Awaited<ReturnType<typeof officeUsage>>;

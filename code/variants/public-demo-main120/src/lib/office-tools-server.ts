import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';
import plan from './office-stack-plan.json';
import expansion from './office-connection-expansion.json';
import {sharedProviderReadiness} from '../../scripts/lib/office-shared-connections.mjs';
import {storageReadiness,archiveSummary} from '../../scripts/lib/office-archive.mjs';
import {bridgeReadiness} from '../../scripts/lib/office-tool-bridge.mjs';
import {skillReadiness} from '../../scripts/lib/office-skill-library.mjs';
import {knowledgeCatalog} from '../../scripts/lib/office-foundations.mjs';
const run=promisify(execFile);
export type OfficeSharedConnection={id:string;status:'partial'|'not_configured';accountStatus:'owner_reported'|'unverified';credentialConfigured:boolean;adapterExists:boolean;authenticated:boolean;scope:'shared';message:string;workerRoute?:'pending';verifiedAt?:string|null;verificationStatus?:string};
type Tools={sharedConnections?:OfficeSharedConnection[];knowledge?:{status:string;foundations:number;approvedFoundations:number;approvedLessons:number;clientBrainBindings:number;checkedAt:string};bridge?:Awaited<ReturnType<typeof bridgeReadiness>>;archive?:Awaited<ReturnType<typeof archiveSummary>>;storage?:Awaited<ReturnType<typeof storageReadiness>>;checkedAt:string;higgsfield:{status:string;plan:string|null;credits:number|null;message:string};skills:Awaited<ReturnType<typeof skillReadiness>>};
function sharedConnections():OfficeSharedConnection[]{
 const configured=(name:string)=>Boolean(process.env[name]?.trim()&&!process.env[name]?.startsWith('TEST'));
 const zernio=configured('ZERNIO_API_KEY'),manychat=configured('MANYCHAT_API_KEY'),pinterest=configured('PINTEREST_ACCESS_TOKEN');
 return [
  {id:'zernio',status:'partial',accountStatus:'owner_reported',credentialConfigured:zernio,adapterExists:true,authenticated:false,scope:'shared',message:'Existing account confirmed by owner. Jarvis publishing and analytics adapter already exists. '+(zernio?'A server credential is configured; provider authentication has not been tested in this Office.':'Shared Office server authentication is pending; no credential is configured here.')+' Client profiles and channel permissions are a later setup stage.'},
  {id:'manychat',status:manychat?'partial':'not_configured',accountStatus:'unverified',credentialConfigured:manychat,adapterExists:false,authenticated:false,scope:'shared',message:'Selected for shared messaging and lead-capture setup. '+(manychat?'A server credential is configured; eligible plan, authentication and reusable integration remain unverified.':'Eligible account plan, secure server token and reusable integration remain to configure.')+' Client channels, triggers and custom flows follow later. No message sending is enabled.'},
  {id:'pinterest',status:'partial',accountStatus:'unverified',credentialConfigured:pinterest,adapterExists:true,authenticated:false,scope:'shared',message:'Existing Pinterest board/pin read routes and inspiration library found in Jarvis. '+(pinterest?'A direct server token is configured; board permissions and image import have not been verified in Office.':'Direct Pinterest read authentication is pending in this Office.')+' Owner-selected moodboards will guide palette, composition, lighting and tone after review. Zernio board listing alone does not import pin images; reference uploads remain a fallback. No Pinterest writes or model analysis run by opening setup.'}
 ,...expansion.sharedReads.map(provider=>{const state=sharedProviderReadiness(provider.id)!;return {id:provider.id,status:'partial' as const,accountStatus:'unverified' as const,...state,scope:'shared' as const,message:provider.nextStep+' '+(state.authenticated?'Shared account read verified; worker route remains pending.':state.credentialConfigured?'Server authentication configured; use Check account read to verify.':'Secure server authentication is not configured in this Office.')};})];
}
let cached:{time:number;value:Tools}|null=null;
let pending:Promise<Tools>|null=null;
async function knowledgeReadiness():Promise<NonNullable<Tools['knowledge']>>{
 try{const k=await knowledgeCatalog(plan.storage);return {status:k.foundations.length?'connected':'not_configured',foundations:k.foundations.length,approvedFoundations:k.foundations.filter(f=>f.status==='approved').length,approvedLessons:k.lessons.filter(l=>l.status==='approved').length,clientBrainBindings:k.foundations.filter(f=>f.scope.clientId).length,checkedAt:k.checkedAt};}
 catch{return {status:'unavailable',foundations:0,approvedFoundations:0,approvedLessons:0,clientBrainBindings:0,checkedAt:new Date().toISOString()};}
}
export async function officeTools():Promise<Tools> {
  if(!localOfficeEnabled())return {checkedAt:new Date().toISOString(),higgsfield:{status:'unavailable',plan:null,credits:null,message:'Private Mac bridge is not configured here.'},skills:[]};
  if(cached&&Date.now()-cached.time<60000)return {...cached.value,sharedConnections:sharedConnections(),knowledge:await knowledgeReadiness()};
  if(pending)return pending;
  pending=(async()=>{
    const skills=await skillReadiness(plan.skillLibrary,join(plan.storage.recordsRoot,'library/skills'));
    let higgsfield:Tools['higgsfield'];
    try {
      const result=await run(join(homedir(),'.local/bin/higgsfield'),['account','status','--json'],{timeout:10000,maxBuffer:32000,encoding:'utf8',env:Object.fromEntries(['HOME','PATH','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!])) as NodeJS.ProcessEnv});
      const value=JSON.parse(result.stdout);
      if(typeof value.credits!=='number'||typeof value.subscription_plan_type!=='string')throw new Error('Invalid account response');
      higgsfield={status:'connected',plan:value.subscription_plan_type,credits:value.credits,message:'Official subscription CLI connected on Mac. Creative dispatch and exact-version media review are pending; no generation test performed.'};
    } catch {higgsfield={status:'unavailable',plan:null,credits:null,message:'Mac CLI account read failed. Reconnect or select the correct workspace; retained plan notes do not prove a live connection.'};}
    const value={sharedConnections:sharedConnections(),knowledge:await knowledgeReadiness(),bridge:await bridgeReadiness(plan.storage),checkedAt:new Date().toISOString(),higgsfield,skills,storage:await storageReadiness(plan.storage),archive:await archiveSummary(plan.storage)};cached={time:Date.now(),value};return value;
  })();
  try{return await pending;}finally{pending=null;}
}

import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGoalNativePolicy,readGoalNativeBinding} from './office-goal-native-policy.mjs';
import {boundedCanonical,boundedDenialReceipt,createBoundedOfficeAuthority} from './office-goal-bounded-authority.mjs';

const PRIVATE_DIRECTORY=join(homedir(),'Library','Application Support','Jarvis Office','goal-control');
/** Dependencies are trusted server/tests only; task/HTTP input never selects authority or paths. */
export function createOfficeGoalPolicyRuntime(dependencies={}){
 const directory=dependencies.privateDirectory??PRIVATE_DIRECTORY;
 const load=dependencies.readBinding??readGoalNativeBinding,create=dependencies.createPolicy??createGoalNativePolicy,authority=dependencies.createAuthority??createBoundedOfficeAuthority;
 async function gate(stage,meta){
  try{
   const binding=await load(directory);if(binding.version!==2)throw Error('goal_binding_version');
   const bounded=authority(binding);await bounded.inspect(meta);
   const usage=await create(binding).check(stage);
   if(usage.canDispatch!==true||usage.reason!=='ready'||usage.checkpointSaved!==true)throw Error('usage_'+usage.reason);
   const unchanged=async()=>{if(boundedCanonical(await load(directory))!==boundedCanonical(binding))throw Error('goal_binding_changed');};
   await unchanged();
   if(stage==='admission'){
    const receipt=await bounded.admit(meta,{existing:meta?.mode==='continue'});
    return Object.freeze({canDispatch:true,reason:'ready',checkpointSaved:true,authority:receipt,recheck:async()=>{await unchanged();await bounded.admit(meta,{existing:true});await unchanged();}});
   }
   const ticket=await bounded.reserve(meta);
   return Object.freeze({canDispatch:true,...ticket,recheck:async()=>{await unchanged();await ticket.recheck();await unchanged();}});
  }catch(error){const id=randomUUID(),safe=boundedDenialReceipt({id,reason:error.code==='EEXIST'?'authority_journal_busy':error.message,checkpointSaved:false,fileClass:error.fileClass,validationPhase:error.validationPhase??stage},{stage});return Object.freeze({...safe,id,goalId:'unavailable',canDispatch:false});}
 }
 return Object.freeze({checkOfficeGoalAdmission:meta=>gate('admission',meta),officeGoalModelPolicy:meta=>gate('modelPolicy',meta)});
}
const runtime=createOfficeGoalPolicyRuntime();
export const checkOfficeGoalAdmission=runtime.checkOfficeGoalAdmission;
export const officeGoalModelPolicy=runtime.officeGoalModelPolicy;

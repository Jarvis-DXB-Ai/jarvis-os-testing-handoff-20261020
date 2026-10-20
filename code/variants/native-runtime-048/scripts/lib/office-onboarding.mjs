import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {ensureStore,officeStorePath} from './office-archive.mjs';
import {readFoundation,knowledgeCatalog} from './office-foundations.mjs';
import {validateOnboarding,onboardingBrief} from '../../src/lib/office-onboarding.mjs';
import {readOnboardingEvidence} from './office-onboarding-evidence.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const valid=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,90}$/.test(id))throw new Error('Invalid scope.');return id;};
export async function readOnboarding(config,id){
 await ensureStore(config,{create:false});const path=await officeStorePath(config.recordsRoot,`onboarding/${valid(id)}/current.json`);
 let r;try{r=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const {revision,...body}=r;if(body.foundationId!==id||hash(body)!==revision)throw new Error('Onboarding integrity check failed.');return r;
}
export async function onboardingCatalog(config){const {foundations}=await knowledgeCatalog(config);return {foundations:foundations.filter(f=>f.status!=='retired'),records:(await Promise.all(foundations.filter(f=>f.status!=='retired').map(async f=>{const record=await readOnboarding(config,f.id);return record?{...record,evidence:await readOnboardingEvidence(config,record,f)}:null;}))).filter(Boolean)};}
export async function saveOnboarding(config,input){
 const value=validateOnboarding(input.record);await ensureStore(config);const foundation=await readFoundation(config,value.foundationId);
 if((value.proposalSourceIds??[]).some(id=>!foundation.sources.some(source=>source.id===id)))throw new Error('Select proposal evidence from this foundation’s registered sources.');
 if(foundation.status==='retired')throw new Error('This foundation is retired.');
 if(value.foundationRevision&&(foundation.status!=='approved'||value.foundationRevision!==foundation.revision))throw new Error('The approved foundation changed. Review and link its current revision.');
 const base=`onboarding/${value.foundationId}`,lockPath=await officeStorePath(config.recordsRoot,base+'/mutation.lock',true);
 const lock=await open(lockPath,'wx',0o600).catch(()=>{throw new Error('Another onboarding save is in progress. Try again.');});
 try{
  const prior=await readOnboarding(config,value.foundationId);if((prior?.revision??null)!==(input.expectedRevision??null))throw new Error('This onboarding changed in another session. Reload saved data before editing.');
  // Upstream edits invalidate first-cycle signoff. Reconfirm against the revised inputs.
  if(prior){const basis=r=>JSON.stringify({services:r.services,proposalSourceIds:r.proposalSourceIds??[],intake:Object.fromEntries(Object.entries(r.intake).filter(([k])=>k!=='review')),competitors:r.competitors,foundationRevision:r.foundationRevision,departments:Object.fromEntries(Object.entries(r.departments).map(([k,d])=>[k,{...d,qaEvidence:''}]))});if(basis(prior)!==basis(value)){value.intake.review='';for(const d of Object.values(value.departments))d.qaEvidence='';}}
  const body={...value,updatedAt:new Date().toISOString()},saved={...body,revision:hash(body)},bytes=JSON.stringify(saved,null,2)+'\n';
  await writeFile(await officeStorePath(config.recordsRoot,base+`/versions/${saved.revision}.json`,true),bytes,{flag:'wx',mode:0o600});
  const target=await officeStorePath(config.recordsRoot,base+'/current.json',true),temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,bytes,{mode:0o600});await rename(temp,target);return saved;
 }finally{await lock.close();await unlink(lockPath);}
}
export async function prepareOnboarding(config,input){const record=await readOnboarding(config,valid(input.foundationId));if(!record||record.revision!==input.expectedRevision)throw new Error('Save or reload the latest onboarding before preparing a brief.');const foundation=await readFoundation(config,record.foundationId);return onboardingBrief(record,foundation,await readOnboardingEvidence(config,record,foundation));}

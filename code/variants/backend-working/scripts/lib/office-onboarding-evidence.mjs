import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {readApprovalReceipts,validateApprovalEvidence} from './office-approval-receipts.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const subject=(kind,id,value)=>({kind,id,sha256:digest(value)});

// Notes remain useful context. Only a current server-read receipt can satisfy a gate.
export function onboardingEvidenceRequirements(record,foundation){
 const scope={clientId:foundation.scope.clientId??foundation.scope.id,foundationKey:foundation.id};
 const basis={foundationId:record.foundationId,services:record.services,proposalSourceIds:record.proposalSourceIds??[],intake:Object.fromEntries(Object.entries(record.intake).filter(([k])=>k!=='review')),competitors:record.competitors,foundationRevision:record.foundationRevision,departments:Object.fromEntries(Object.entries(record.departments).map(([id,d])=>[id,{...d,qaEvidence:''}]))};
 const selectedProposalSources=foundation.sources.filter(source=>(record.proposalSourceIds??[]).includes(source.id));
 const requirements=[
  {id:'proposal',kind:'owner-approval',subjects:[subject('proposal',foundation.id,selectedProposalSources)]},
  {id:'scope',kind:'owner-approval',subjects:[subject('service-scope',foundation.id,basis)]},
  {id:'assets',kind:'owner-approval',subjects:[subject('asset-register',foundation.id,{sources:foundation.sources,assets:foundation.assets})]},
  {id:'brand',kind:'owner-approval',subjects:[{kind:'foundation',id:foundation.id,sha256:foundation.revision}]},
  ...record.services.flatMap(id=>[
   {id:'access-'+id,kind:'tool-access',subjects:[subject('department-access',id,{scope,service:id,scopeBasis:basis,access:record.departments[id].access,accessStatus:record.departments[id].accessStatus})]},
   {id:'review-'+id,kind:'independent-review',subjects:[subject('department-review',id,{scope,basis,qaEvidence:record.departments[id].qaEvidence,artifacts:record.departments[id].reviewArtifacts??[]})]},
  ]),
  {id:'first-cycle',kind:'owner-approval',subjects:[subject('first-cycle',foundation.id,{scope,basis,review:record.intake.review,reviews:record.services.map(id=>({id,qaEvidence:record.departments[id].qaEvidence,artifacts:record.departments[id].reviewArtifacts??[]}))})]},
 ];
 return {scope,requirements};
}

export function intakeEvidenceRequirements(state){
 const foundationKey='client-'+state.id,scope={clientId:state.id,foundationKey};
 return {scope,requirements:[
  {id:'proposal',kind:'owner-approval',subjects:[subject('proposal',foundationKey,state.sources.filter(source=>(state.proposalSourcePaths??[]).includes(source.path)))]},
  {id:'scope',kind:'owner-approval',subjects:[subject('service-scope',foundationKey,{clientId:state.id,scope:state.scope,services:state.services,capacity:state.capacity,goals:state.goals})]},
  {id:'brand',kind:'owner-approval',subjects:[subject('brand',foundationKey,{brand:state.brand,website:state.website,socials:state.socials,competitors:state.competitors,audit:state.audit,logoPath:state.logoPath,logoSha256:state.logoSha256})]},
  {id:'assets',kind:'owner-approval',subjects:[subject('asset-register',foundationKey,{sources:state.sources,logoPath:state.logoPath,logoSha256:state.logoSha256})]},
 ]};
}

async function sourceIntegrity(sources){
 const defects=[];
 for(const source of sources){
  try{
   if(typeof source.path!=='string'||!source.path.startsWith('/')||!(/^[a-f0-9]{64}$/.test(source.sha256??'')))throw new Error();
   const info=await lstat(source.path);if(!info.isFile()||info.isSymbolicLink()||info.size>32*1024*1024)throw new Error();
   if(createHash('sha256').update(await readFile(source.path)).digest('hex')!==source.sha256)throw new Error();
  }catch{defects.push(source.id??source.title??'Registered source');}
 }
 return defects;
}

async function evaluate(config,manifest,sources){
 const ledger=await readApprovalReceipts(config,manifest.scope);
 const defects=await sourceIntegrity(sources);
 const checks=Object.fromEntries(manifest.requirements.map(requirement=>[requirement.id,validateApprovalEvidence({receipts:ledger.receipts,scope:manifest.scope,kind:requirement.kind,subjects:requirement.subjects,now:new Date().toISOString()})]));
 // A receipt records the inspected version. It cannot bless subsequent source edits.
 const passed=id=>defects.length===0&&checks[id]?.valid===true;
 return {ledgerRevision:ledger.revision,sourceDefects:defects,checks,passed};
}

export async function readOnboardingEvidence(config,record,foundation){
 const result=await evaluate(config,onboardingEvidenceRequirements(record,foundation),[...foundation.sources,...foundation.assets]);
 const artifactDefects=Object.fromEntries(await Promise.all(record.services.map(async id=>[id,await sourceIntegrity(record.departments[id].reviewArtifacts??[])])));
 const reviewed=id=>(record.departments[id].reviewArtifacts??[]).length>0&&artifactDefects[id].length===0&&result.passed('review-'+id);
 return {revision:record.revision??null,ledgerRevision:result.ledgerRevision,sourceDefects:[...result.sourceDefects,...Object.entries(artifactDefects).flatMap(([id,defects])=>defects.map(d=>id+': '+d))],proposal:result.passed('proposal')&&(record.proposalSourceIds??[]).length>0&&(record.proposalSourceIds??[]).every(id=>foundation.sources.some(source=>source.id===id)),scope:result.passed('scope'),assets:result.passed('assets'),brand:result.passed('brand'),access:Object.fromEntries(record.services.map(id=>[id,result.passed('access-'+id)])),reviews:Object.fromEntries(record.services.map(id=>[id,reviewed(id)])),firstCycle:record.services.every(reviewed)&&result.passed('first-cycle')};
}

export async function requireIntakeApprovalEvidence(config,state){
 const result=await evaluate(config,intakeEvidenceRequirements(state),[...state.sources,...(state.logoPath&&state.logoSha256?[{path:state.logoPath,sha256:state.logoSha256,title:'Registered logo'}]:[])]);
 const gaps=['proposal','scope','brand','assets'].filter(id=>!result.passed(id));
 if(!(state.proposalSourcePaths??[]).length||(state.proposalSourcePaths??[]).some(path=>!state.sources.some(source=>source.path===path)))gaps.push('selected proposal source');
 if(gaps.length||result.sourceDefects.length)throw new Error('Current signed-authority approval receipts required: '+[...gaps,...result.sourceDefects.map(id=>'changed source '+id)].join(', ')+'. Notes and confirmation flags do not authorise production.');
 return {ledgerRevision:result.ledgerRevision,requirements:intakeEvidenceRequirements(state).requirements};
}

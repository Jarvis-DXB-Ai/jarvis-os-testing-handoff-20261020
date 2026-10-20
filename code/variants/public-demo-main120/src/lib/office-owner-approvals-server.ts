import 'server-only';
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {authorizeOwner} from '../cloudflare/owner-access';
import {requireInternalJarvisMutation} from './internal-api-request';
import {localOfficeEnabled} from './office-runtime.mjs';
import {clientIntake} from './office-client-intake-server';
import {readFoundation} from '../../scripts/lib/office-foundations.mjs';
import {readOnboarding} from '../../scripts/lib/office-onboarding.mjs';
import {intakeEvidenceRequirements,onboardingEvidenceRequirements,readOnboardingEvidence} from '../../scripts/lib/office-onboarding-evidence.mjs';
import {appendApprovalReceipt,readApprovalReceipts,revokeApprovalReceipt,validateApprovalEvidence} from '../../scripts/lib/office-approval-receipts.mjs';
import plan from './office-stack-plan.json';

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
type Target={kind:'guided'|'foundation';id:string};
type Source={id:string;title:string;path:string;sha256:string};
function target(value:unknown):Target{
 const t=value as Target;if(!t||!['guided','foundation'].includes(t.kind)||typeof t.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,90}$/.test(t.id))throw new Error('Choose an existing onboarding scope.');return {kind:t.kind,id:t.id};
}
async function inspectFile(source:Source){
 const stat=await lstat(source.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024||sha(await readFile(source.path))!==source.sha256)throw new Error('Registered evidence changed or is unavailable: '+source.title);
}
async function packet(selected:Target){
 if(!localOfficeEnabled())throw new Error('The private Office is required.');
 if(selected.kind==='guided'){
  const state=await clientIntake(selected.id);
  return {manifest:intakeEvidenceRequirements(state),recordRevision:state.revision!,sources:state.sources.map(s=>({...s,id:'source-'+sha(s.path)})),proposalIds:state.sources.filter(s=>(state.proposalSourcePaths??[]).includes(s.path)).map(s=>'source-'+sha(s.path)),reviewReady:false,view:{name:state.name,scope:state.scope,services:state.services,brand:state.brand,proposalSourcePaths:state.proposalSourcePaths??[]}};
 }
 const record=await readOnboarding(plan.storage,selected.id);if(!record)throw new Error('Save onboarding before reviewing its evidence.');const foundation=await readFoundation(plan.storage,selected.id);
 const evidence=await readOnboardingEvidence(plan.storage,record,foundation);
 const sources:Source[]=[...foundation.sources,...foundation.assets.map(a=>({...a,title:a.name})),...record.services.flatMap(id=>(record.departments[id].reviewArtifacts??[]).map(a=>({...a,id:id+'-'+a.id,title:id+' reviewed output '+a.id})))];
 if(new Set(sources.map(s=>s.id)).size!==sources.length)throw new Error('Resolve duplicate source identities before approval.');
 return {manifest:onboardingEvidenceRequirements(record,foundation),recordRevision:record.revision!,sources,proposalIds:record.proposalSourceIds??[],reviewReady:record.services.length>0&&record.services.every(id=>evidence.reviews[id]),view:{name:foundation.title,scope:record.intake.scope,services:record.services,foundationRevision:foundation.revision,foundationFields:foundation.fields,proposalSourceIds:record.proposalSourceIds??[],departments:record.departments}};
}
const snapshotRevision=(p:{manifest:unknown;recordRevision:string;sources:Source[];proposalIds:string[];reviewReady:boolean;view:unknown})=>sha(JSON.stringify({manifest:p.manifest,recordRevision:p.recordRevision,sources:p.sources,proposalIds:p.proposalIds,reviewReady:p.reviewReady,view:p.view}));
async function signedOwner(request:NextRequest){
 // Reverify the actual signed assertion. Caller-supplied identity headers and a
 // same-origin flag alone never grant authority to create an approval receipt.
 const identity=await authorizeOwner(request,{JARVIS_ACCESS_TEAM_DOMAIN:process.env.JARVIS_ACCESS_TEAM_DOMAIN??'',JARVIS_ACCESS_AUDIENCE:process.env.JARVIS_ACCESS_AUDIENCE??'',JARVIS_OWNER_EMAILS:process.env.JARVIS_OWNER_EMAILS??''});
 if(identity instanceof Response)throw new Error('A current authenticated owner session is required for approval evidence.');
 return {type:'owner' as const,subject:identity.subject,provider:'cloudflare-access',verificationId:sha(request.headers.get('cf-access-jwt-assertion')!)};
}
export async function ownerApprovalManifest(request:NextRequest){
 await signedOwner(request);
 const selected=target({kind:request.nextUrl.searchParams.get('kind'),id:request.nextUrl.searchParams.get('id')});
 const p=await packet(selected),ledger=await readApprovalReceipts(plan.storage,p.manifest.scope);
 return {target:selected,recordRevision:p.recordRevision,manifestRevision:snapshotRevision(p),ledgerRevision:ledger.revision,view:p.view,sources:p.sources,requirements:p.manifest.requirements.map(r=>({...r,status:validateApprovalEvidence({receipts:ledger.receipts,scope:p.manifest.scope,kind:r.kind,subjects:r.subjects,now:new Date().toISOString()}),ownerActionAvailable:r.kind==='owner-approval'&&(r.id!=='proposal'||p.proposalIds.length>0)&&(r.id!=='first-cycle'||p.reviewReady)})),boundary:'Owner decisions do not replace independent QC, tool verification, sending permission or a signed client contract. A receipt records only its exact selected purpose and version.'};
}

export async function ownerApprovalDownload(request:NextRequest){
 await signedOwner(request);
 const selected=target({kind:request.nextUrl.searchParams.get('kind'),id:request.nextUrl.searchParams.get('id')}),p=await packet(selected);
 if(request.nextUrl.searchParams.get('manifestRevision')!==snapshotRevision(p))throw new Error('Reload the exact review packet before downloading its evidence.');
 const source=p.sources.find(s=>s.id===request.nextUrl.searchParams.get('sourceId'));if(!source)throw new Error('This source is not registered in this review scope.');
 await inspectFile(source);const bytes=await readFile(source.path);if(sha(bytes)!==source.sha256)throw new Error('The selected source changed.');
 return {bytes,name:source.path.split('/').at(-1)!.replace(/[^a-zA-Z0-9._-]/g,'_')};
}
export async function decideOwnerApproval(request:NextRequest,input:Record<string,unknown>){
 requireInternalJarvisMutation(request);const authority=await signedOwner(request);
 if(Object.keys(input).some(k=>!['action','target','recordRevision','manifestRevision','ledgerRevision','requirementId','decision','evidenceIds','idempotencyKey','receiptId','agreementConfirmed'].includes(k)))throw new Error('Unexpected approval fields.');
 const selected=target(input.target),p=await packet(selected);
 if(typeof input.idempotencyKey!=='string'||typeof input.ledgerRevision!=='string'&&input.ledgerRevision!==null)throw new Error('A saved ledger revision and retry identity are required.');
 if(input.action==='revoke'){
  if(typeof input.receiptId!=='string')throw new Error('Choose the exact receipt to revoke.');const ledger=await readApprovalReceipts(plan.storage,p.manifest.scope),receipt=ledger.receipts.find(r=>r.id===input.receiptId);
  if(!receipt||receipt.kind!=='owner-approval')throw new Error('This interface can revoke only owner decisions in this scope.');
  // Revocation restricts authority. Missing/changed output files cannot prevent it.
  const saved=await revokeApprovalReceipt(plan.storage,{scope:p.manifest.scope,targetReceiptId:receipt.id,evidence:[{kind:'revocation-target',id:receipt.id,sha256:receipt.revision}],expectedRevision:input.ledgerRevision,idempotencyKey:input.idempotencyKey},{authority,verifyAuthority:()=>true});return {ledgerRevision:saved.revision,receipt:saved.receipt,replayed:saved.replayed};
 }
 if(input.action!=='decide'||!['approved','rejected'].includes(String(input.decision)))throw new Error('Choose approve or reject for the exact reviewed version.');
 if(input.manifestRevision!==snapshotRevision(p))throw new Error('The exact evidence manifest changed. Reload and inspect its current versions before deciding.');
 if(input.recordRevision!==p.recordRevision)throw new Error('The onboarding changed. Review the current version before deciding.');
 const requirement=p.manifest.requirements.find(r=>r.id===input.requirementId);
 if(!requirement||requirement.kind!=='owner-approval')throw new Error('Owner decisions cannot certify tool access or independent departmental review.');
 const approving=input.decision==='approved';
 const selectedEvidenceIds=input.evidenceIds??[];
 if(!Array.isArray(selectedEvidenceIds)||selectedEvidenceIds.length>32||new Set(selectedEvidenceIds).size!==selectedEvidenceIds.length||approving&&!selectedEvidenceIds.length)throw new Error('Select the actual registered evidence inspected for approval.');
 const sources=selectedEvidenceIds.map(id=>{const source=p.sources.find(s=>s.id===id);if(!source)throw new Error('Evidence belongs to another scope or is not registered.');return source;});
 if(approving){
  for(const source of sources)await inspectFile(source);
  if(requirement.id==='proposal'&&input.agreementConfirmed!==true)throw new Error('Attest that the selected proposal records the client’s accepted scope.');
  if(requirement.id==='proposal'&&(!p.proposalIds.length||!p.proposalIds.every(id=>selectedEvidenceIds.includes(id))))throw new Error('Inspect and select the registered proposal evidence explicitly.');
  if(requirement.id==='first-cycle'&&!p.reviewReady)throw new Error('Independent review of every exact department output is required first.');
 }
 // A signed rejection attests the owner's restrictive decision, never file inspection.
 const evidence=approving?sources.map(s=>({kind:'registered-source',id:s.id,sha256:s.sha256})):[{kind:'owner-rejection',id:requirement.id,sha256:sha(JSON.stringify({manifestRevision:input.manifestRevision,decision:'rejected'}))}];
 const context={authority,verifyAuthority:async()=>{const current=await packet(selected);if(snapshotRevision(current)!==input.manifestRevision)return false;if(approving)for(const source of sources)await inspectFile(source);return true;}};
 const saved=await appendApprovalReceipt(plan.storage,{scope:p.manifest.scope,kind:'owner-approval',decision:input.decision as 'approved'|'rejected',subjects:requirement.subjects,evidence,expectedRevision:input.ledgerRevision,idempotencyKey:input.idempotencyKey},context);
 return {ledgerRevision:saved.revision,receipt:saved.receipt,replayed:saved.replayed};
}

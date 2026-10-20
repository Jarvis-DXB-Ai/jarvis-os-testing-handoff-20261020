import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {emptyOnboarding,onboardingProgress} from '../src/lib/office-onboarding.mjs';
import {appendApprovalReceipt,revokeApprovalReceipt,readApprovalReceipts} from './lib/office-approval-receipts.mjs';
import {onboardingEvidenceRequirements,intakeEvidenceRequirements,readOnboardingEvidence,requireIntakeApprovalEvidence} from './lib/office-onboarding-evidence.mjs';

// Fictional authorities, files and clients. No real owner/QC approval is issued.
const sha=value=>createHash('sha256').update(value).digest('hex');
const trusted=kind=>({authority:{type:kind==='owner-approval'?'owner':kind==='independent-review'?'reviewer':'tool',subject:'synthetic-'+kind,provider:'synthetic-fixture-only',verificationId:'fictional-signed-assertion'},verifyAuthority:()=>true});
async function fixture(t){
 const volume=await mkdtemp(join(tmpdir(),'onboarding-evidence-'));t.after(()=>rm(volume,{recursive:true,force:true}));
 const config={testing:true,recordsVolume:volume,recordsRoot:join(volume,'records')};await mkdir(config.recordsRoot);
 const proposal=join(volume,'synthetic-proposal.txt'),artifact=join(volume,'synthetic-deliverable.txt');await writeFile(proposal,'fictional signed proposal');await writeFile(artifact,'fictional reviewed deliverable');
 const foundation={id:'fictional-foundation',title:'Synthetic client only',scope:{kind:'client',id:'fictional-foundation',clientId:'fictional-client'},status:'approved',revision:sha('fictional-foundation-v1'),sources:[{id:'proposal-1',title:'Fictional proposal',path:proposal,sha256:sha('fictional signed proposal')}],assets:[]};
 const record=emptyOnboarding(foundation.id);record.services=['social'];record.proposalSourceIds=['proposal-1'];record.foundationRevision=foundation.revision;record.revision=sha('fictional-record-v1');for(const key of Object.keys(record.intake))record.intake[key]='Synthetic context only';
 record.competitors=[{name:'Synthetic',url:'https://example.com',observedAt:'2026-01-01',finding:'Synthetic',opportunity:'Synthetic',kind:'direct'}];Object.assign(record.departments.social,{brief:'Synthetic deliverable',access:'Fictional local access',accessStatus:'verified',qaEvidence:'Fictional inspected output',reviewArtifacts:[{id:'output-1',path:artifact,sha256:sha('fictional reviewed deliverable')}]});
 return {config,foundation,record,proposal,artifact};
}
async function issue(config,manifest){
 let ledger=await readApprovalReceipts(config,manifest.scope);
 for(const requirement of manifest.requirements){ledger=await appendApprovalReceipt(config,{scope:manifest.scope,kind:requirement.kind,decision:requirement.kind==='owner-approval'?'approved':requirement.kind==='independent-review'?'passed':'verified',subjects:requirement.subjects,evidence:[{kind:'synthetic-only',id:'fictional-inspection',sha256:sha('fictional evidence')}],expectedRevision:ledger.revision,idempotencyKey:'fixture-'+requirement.id},trusted(requirement.kind));}
 return ledger;
}
test('synthetic gate: saved notes, flags and serialized approval fields do not provide readiness',async t=>{
 const f=await fixture(t);const e=await readOnboardingEvidence(f.config,{...f.record,evidence:{proposal:true,scope:true}},f.foundation);
 assert.equal(e.proposal,false);assert.equal(onboardingProgress(f.record,f.foundation,e).ready,false);assert.equal(onboardingProgress(f.record,f.foundation,e).complete,false);
});
test('synthetic gate: exact owner, access and independent artifact receipts satisfy distinct stages',async t=>{
 const f=await fixture(t);await issue(f.config,onboardingEvidenceRequirements(f.record,f.foundation));
 const e=await readOnboardingEvidence(f.config,f.record,f.foundation);assert.equal(e.proposal,true);assert.equal(e.reviews.social,true);assert.equal(onboardingProgress(f.record,f.foundation,e).complete,true);
 const changed=structuredClone(f.record);changed.intake.scope='Changed service quantity';changed.revision=sha('record-v2');const next=await readOnboardingEvidence(f.config,changed,f.foundation);assert.equal(next.scope,false);assert.equal(next.access.social,false);assert.equal(onboardingProgress(changed,f.foundation,next).complete,false);
});
test('synthetic gate: actual deliverable mutation revokes review and first-cycle while scope remains valid',async t=>{
 const f=await fixture(t);await issue(f.config,onboardingEvidenceRequirements(f.record,f.foundation));await writeFile(f.artifact,'unreviewed changed output');
 const e=await readOnboardingEvidence(f.config,f.record,f.foundation);assert.equal(e.scope,true);assert.equal(e.reviews.social,false);assert.equal(e.firstCycle,false);assert.match(e.sourceDefects[0],/output-1/);assert.equal(onboardingProgress(f.record,f.foundation,e).complete,false);
});
test('synthetic gate: no produced artifact or selected proposal is never a complete engagement',async t=>{
 const f=await fixture(t);f.record.departments.social.reviewArtifacts=[];f.record.proposalSourceIds=[];await issue(f.config,onboardingEvidenceRequirements(f.record,f.foundation));
 const e=await readOnboardingEvidence(f.config,f.record,f.foundation);assert.equal(e.proposal,false);assert.equal(e.reviews.social,false);assert.equal(e.firstCycle,false);
});
test('synthetic gate: current source bytes and client isolation are checked independently of status flags',async t=>{
 const f=await fixture(t);await issue(f.config,onboardingEvidenceRequirements(f.record,f.foundation));
 const other=await readOnboardingEvidence(f.config,f.record,{...f.foundation,scope:{...f.foundation.scope,clientId:'other-client'}});assert.equal(other.scope,false);
 await writeFile(f.proposal,'changed proposal at same path');const changed=await readOnboardingEvidence(f.config,f.record,f.foundation);assert.equal(changed.proposal,false);assert.equal(changed.scope,false);
});
test('synthetic guided intake: missing, revoked and changed receipts reject production admission',async t=>{
 const f=await fixture(t);const state={id:'fictional-client',scope:'Fictional purchased deliverables',services:['social'],capacity:2,goals:'Fictional objective',brand:{facts:'Synthetic only'},website:'https://example.com',socials:[],competitors:[],audit:[],logoPath:null,logoSha256:null,sources:f.foundation.sources,proposalSourcePaths:[f.proposal],status:'ready',brandConfirmed:true};
 await assert.rejects(requireIntakeApprovalEvidence(f.config,state),/approval receipts required/);
 const manifest=intakeEvidenceRequirements(state),issued=await issue(f.config,manifest);await requireIntakeApprovalEvidence(f.config,state);
 await assert.rejects(requireIntakeApprovalEvidence(f.config,{...state,scope:'Changed quantity'}),/scope/);
 const scopeReceipt=issued.receipts.find(r=>r.subjects.some(s=>s.kind==='service-scope'));
 await revokeApprovalReceipt(f.config,{scope:manifest.scope,targetReceiptId:scopeReceipt.id,evidence:[{kind:'synthetic-only',id:'fictional-revocation',sha256:sha('fictional revoke')}],idempotencyKey:'fixture-revoke',expectedRevision:issued.revision},trusted('owner-approval'));
 await assert.rejects(requireIntakeApprovalEvidence(f.config,state),/scope/);
});

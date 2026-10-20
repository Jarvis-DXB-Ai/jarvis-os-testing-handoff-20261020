import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
/** Coordinator observations, not model claims. Unperformed actions stay unknown. */
export function deliveryEvidence(job,verifiedTools=[]){
 const steps=job.steps??[],calls=job.calls??[];
 const drafts=steps.filter(s=>typeof s.output==='string'&&s.output.trim()).map(s=>({partId:s.id,roleId:s.roleId,status:'draft',sha256:hash(s.output),dependsOn:s.dependsOn??[],correction:s.coordinatorCorrection??null}));
 const exports=verifiedTools.filter(r=>r.status==='completed'&&!r.fixture&&r.tool!=='image_view'&&r.files?.length).map(r=>({id:r.id,partId:r.partId,runId:r.runId,tool:r.tool,status:'exported-not-visually-approved',files:r.files}));
 const visualInspections=verifiedTools.filter(r=>r.status==='completed'&&!r.fixture&&r.tool==='image_view').map(r=>({id:r.id,partId:r.partId,runId:r.runId,status:'pixels-delivered-not-quality-approved',source:r.result?.source??null,preview:{width:r.result?.width,height:r.result?.height,sourceHasAlpha:r.result?.sourceHasAlpha,background:r.result?.previewBackground},files:r.files}));
 const uncertain=calls.filter(c=>['dispatching','queued','running','scheduled_retry'].includes(c.status)).map(c=>({stage:c.stage,agentId:c.agentId,runId:c.runId,issueId:c.issueId,status:c.status}));
 return {version:1,jobId:job.id,clientId:job.knowledgeContext?.scope.clientId??null,updatedAt:job.updatedAt,drafts,exports,visualInspections,
  final:job.output?{sha256:hash(job.output),status:'assembled-draft',...(job.assembly?{assembly:job.assembly}:{})}:null,
  quality:{departments:(job.departmentReports??[]).map(r=>({departmentId:r.departmentId,...(job.departmentPackageReviewVersion===1?{coverage:'specialist-parts-and-head',evidence:r.qa?.evidence??null}:{}),status:r.qa?.result? r.qa.result.pass?'passed':'failed':'not-assessed',checks:r.qa?.result?.checks??[]})),final:job.qa??{status:'not-assessed'}},
  ownerReview:{status:job.reviewedAt?job.status==='reviewed'?'reviewed':'recorded':'pending',at:job.reviewedAt??null,note:job.reviewNote??''},
  externalActions:{status:'not-established',note:'Model text and local media exports do not prove publishing, sending, payments or account changes. These require their own authenticated action receipts.'},
  checkpoint:{status:job.status,completedParts:steps.filter(s=>s.status==='completed').map(s=>s.id),remainingParts:steps.filter(s=>s.status!=='completed').map(s=>s.id),uncertainCalls:uncertain,research:job.researchContext??null,foundation:job.knowledgeContext??null,
   deliveryHandoff:job.deliveryHandoff??null,
   nextAction:uncertain.length?'Reconcile the recorded native runs before any continuation; never replay an uncertain write.':job.deliveryHandoff?.state==='pending'?'Reconcile the saved board handoff; do not rerun completed models.':job.status==='failed'?'Inspect saved QA and exact draft versions; use the existing bounded correction or recovery path.':job.status==='needs_review'?'Owner review of the assembled draft and actual exports.':'Continue through the existing task coordinator only.',automaticResume:false},
  measurement:{status:'not-measured',note:'Output quality and model usage are distinct from customer outcomes; no campaign results inferred.'}};
}

import {createHash} from 'node:crypto';
import {departmentReviewCurrent} from './office-department-review.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const requiresCooReleaseReview=job=>job.departmentPartsReviewVersion===1&&job.assembly?.kind==='preserved-single-reviewed-artifact';
export function cooReleaseEvidence(job){
 if(typeof job.output!=='string'||!job.output.trim())throw Error('COO release review requires the complete preserved artifact.');
 const departments=(job.departmentReports??[]).map(r=>({departmentId:r.departmentId,headAgentId:r.agentId,headIssueId:r.issueId,headOutput:r.output,partsQa:r.partsQa,packageQa:r.qa}));
 return {artifactSha256:hash(job.output),departmentEvidenceSha256:hash(JSON.stringify(departments)),criteriaSha256:hash(JSON.stringify(job.criteria)),requestSha256:hash(JSON.stringify([job.brief,job.context,job.criteria,job.knowledgeContext??null]))};
}
export function cooReleaseReviewCurrent(job){
 if(!requiresCooReleaseReview(job))return true;
 try{
  const q=job.cooReleaseReview;if(q?.status!=='completed'||q.result?.pass!==true)return false;
  if(!job.departmentReports?.length||!job.departmentReports.every(r=>departmentReviewCurrent(job,r)))return false;
  const current=cooReleaseEvidence(job);if(!q.evidence||Object.keys(current).some(k=>q.evidence[k]!==current[k]))return false;
  if(q.result.checks?.length!==job.criteria.length||q.result.checks.some((c,i)=>c.criterion!==job.criteria[i]||c.pass!==true||!c.evidence?.trim()))return false;
  if(typeof q.rawOutput!=='string'||q.rawSha256!==hash(q.rawOutput)||q.resultSha256!==hash(JSON.stringify(q.result)))return false;
  const index=job.calls.findIndex(c=>c.stage==='coo-release'&&c.roleId==='coo'&&c.agentId===q.agentId&&c.issueId===q.issueId&&c.runId===q.runId&&c.status==='succeeded'&&c.outputContract?.status!=='rejected'&&c.returnedOutput===q.rawOutput);
  return index>=0&&job.departmentReports.every(r=>{const packageIndex=job.calls.findIndex(c=>c.stage==='department-qa:'+r.departmentId&&c.runId===r.qa?.runId);return packageIndex>=0&&packageIndex<index;});
 }catch{return false;}
}

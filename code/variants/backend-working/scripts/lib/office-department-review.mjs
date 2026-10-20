import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export const departmentPartChecks=['Every assigned department part is complete and useful.','Claims and brand treatment match the supplied client evidence; unknowns remain explicit.','The department outputs satisfy their own assignments and are ready for a head summary.'];
export const departmentPackageChecks=['Department specialist parts are complete, useful and accurate against the supplied evidence.','The head summary faithfully represents these parts and sources; unknowns, limits and action states remain explicit.','The reviewed department package meets its assigned scope and is ready for COO assembly.'];
export const departmentReviewChecks=job=>job.departmentPackageReviewVersion===1?departmentPackageChecks:departmentPartChecks;
function sourceParts(job,report){
 if(!report.stepIds?.length||new Set(report.stepIds).size!==report.stepIds.length)throw Error('Unique department parts are required for review.');
 return report.stepIds.map(id=>{const s=job.steps.find(p=>p.id===id);if(!s||s.status!=='completed'||!s.output?.trim())throw Error('Department source parts are incomplete.');return {id:s.id,roleId:s.roleId,agentId:s.agentId,issueId:s.issueId,assignment:s.assignment,output:s.output,dependencies:(s.dependsOn??[]).map(id=>({id,output:job.steps.find(p=>p.id===id)?.output??null}))};});
}
export function departmentPartsEvidence(job,report){
 const parts=sourceParts(job,report),authors=parts.map(part=>{
  const call=job.calls.findLast(c=>c.stage==='specialist:'+part.id&&c.agentId===part.agentId&&c.issueId===part.issueId);
  if(!call?.runId||call.status!=='succeeded'||call.outputContract?.status==='rejected'||typeof call.returnedOutput!=='string')throw Error('Raw-parts review needs the exact successful specialist source run.');
  return {partId:part.id,agentId:call.agentId,issueId:call.issueId,runId:call.runId,responseSha256:hash(call.returnedOutput)};
 });
 return {partsSha256:hash(JSON.stringify(parts)),authorRunsSha256:hash(JSON.stringify(authors)),requestSha256:hash(JSON.stringify([job.brief,job.context,job.criteria,job.knowledgeContext??null])),criteriaSha256:hash(JSON.stringify(departmentPartChecks)),supplementalEvidenceSha256:hash(JSON.stringify((job.departmentEvidenceHistory??[]).filter(h=>h.departmentId===report.departmentId)))};
}
export function departmentPartsReviewCurrent(job,report){
 const q=report.partsQa;
 if(job.departmentPartsReviewVersion!==1||job.departmentPackageReviewVersion!==1||job.version<4||job.kind==='conversation'||q?.status!=='completed'||q.result?.pass!==true)return false;
 try{
  if(!q.agentId||q.agentId===report.agentId||q.agentId!==report.qa?.agentId||report.stepIds.some(id=>job.steps.find(s=>s.id===id)?.agentId===q.agentId))return false;
  if(q.result.checks?.length!==departmentPartChecks.length||q.result.checks.some((c,i)=>c.pass!==true||c.criterion!==departmentPartChecks[i]||!c.evidence?.trim()))return false;
  const current=departmentPartsEvidence(job,report);if(!q.evidence||Object.keys(current).some(k=>current[k]!==q.evidence[k]))return false;
  if(typeof q.rawOutput!=='string'||q.rawSha256!==hash(q.rawOutput)||q.resultSha256!==hash(JSON.stringify(q.result)))return false;
  const reviewIndex=job.calls.findIndex(c=>c.stage===`department-parts-qa:${report.departmentId}`&&c.agentId===q.agentId&&c.issueId===q.issueId&&c.runId===q.runId&&c.status==='succeeded'&&c.outputContract?.status!=='rejected'&&c.returnedOutput===q.rawOutput);
  return reviewIndex>=0&&report.stepIds.every(id=>{const part=job.steps.find(s=>s.id===id),authorIndex=job.calls.findLastIndex(c=>c.stage==='specialist:'+id&&c.agentId===part.agentId&&c.issueId===part.issueId);return authorIndex>=0&&authorIndex<reviewIndex;});
 }catch{return false;}
}
export function departmentPackageEvidence(job,report){
 if(!report.output?.trim())throw Error('A complete head draft and unique department parts are required for review.');
 const parts=sourceParts(job,report);
 return {headSha256:hash(report.output),partsSha256:hash(JSON.stringify(parts)),requestSha256:hash(JSON.stringify([job.brief,job.context,job.criteria,job.knowledgeContext??null]))};
}
export function departmentReviewCurrent(job,report){
 const q=report.qa;
 if(q?.status!=='completed'||q.result?.pass!==true)return false;
 if(job.departmentPackageReviewVersion!==1)return true;
 if(job.version<4||job.kind==='conversation')return false;
 try{
  if(q.agentId===report.agentId||report.stepIds.some(id=>job.steps.find(s=>s.id===id)?.agentId===q.agentId))return false;
  if(q.result.checks?.length!==departmentPackageChecks.length||q.result.checks.some((c,i)=>c.pass!==true||c.criterion!==departmentPackageChecks[i]||!c.evidence?.trim()))return false;
  const current=departmentPackageEvidence(job,report);if(!q.evidence||Object.keys(current).some(k=>current[k]!==q.evidence[k]))return false;
  if(job.departmentPartsReviewVersion!==1)return job.calls.some(c=>c.stage===`department-qa:${report.departmentId}`&&c.agentId===q.agentId&&c.runId===q.runId&&c.status==='succeeded');
  if(!departmentPartsReviewCurrent(job,report))return false;
  if(typeof q.rawOutput!=='string'||q.rawSha256!==hash(q.rawOutput)||q.resultSha256!==hash(JSON.stringify(q.result)))return false;
  const partsIndex=job.calls.findIndex(c=>c.runId===report.partsQa.runId&&c.issueId===report.partsQa.issueId),headIndex=job.calls.findIndex(c=>c.stage===`department:${report.departmentId}`&&c.agentId===report.agentId&&c.issueId===report.issueId&&c.status==='succeeded'&&c.outputContract?.status!=='rejected'&&c.returnedOutput===report.output),packageIndex=job.calls.findIndex(c=>c.stage===`department-qa:${report.departmentId}`&&c.agentId===q.agentId&&c.issueId===q.issueId&&c.runId===q.runId&&c.status==='succeeded'&&c.outputContract?.status!=='rejected'&&c.returnedOutput===q.rawOutput);
  const stages=[job.calls[partsIndex],job.calls[headIndex],job.calls[packageIndex]];
  return partsIndex>=0&&headIndex>partsIndex&&packageIndex>headIndex&&stages.every(c=>c?.runId&&c.issueId)&&new Set(stages.map(c=>c.runId)).size===3&&new Set(stages.map(c=>c.issueId)).size===3;
 }catch{return false;}
}

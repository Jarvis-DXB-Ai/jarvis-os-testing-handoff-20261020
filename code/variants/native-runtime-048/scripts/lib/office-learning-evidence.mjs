export function learningFailureStages(job){
 const stages=[];
 const add=(id,departmentId,checks)=>{const evidence=(checks??[]).filter(c=>c.pass===false);if(evidence.length)stages.push({id,departmentId,evidence});};
 add('final',null,job.qa?.checks);
 for(const report of job.departmentReports??[])add('department:'+report.departmentId,report.departmentId,report.qa?.result?.checks);
 // A failed protocol/runtime stage is useful evidence even when QA could not
 // return structured checks. Preserve it as a candidate, never an approval.
 if(!stages.length&&job.status==='failed'&&typeof job.error==='string'&&job.error.trim()&&job.calls?.some(c=>c.runId||c.reconciliation)){
  const call=job.calls.at(-1),departmentId=call.stage?.startsWith('department-qa:')?call.stage.slice('department-qa:'.length):null;
  add('execution:'+call.stage,departmentId,[{criterion:'The saved execution completed its runtime and response contract.',pass:false,evidence:`${job.error} Stage: ${call.stage}; run: ${call.runId??'not authorised; reconciled issue mismatch'}.`}]);
 }
 return stages;
}

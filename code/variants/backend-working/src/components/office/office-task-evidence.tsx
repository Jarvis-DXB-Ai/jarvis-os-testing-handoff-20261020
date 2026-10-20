import type {OfficeTeamTask} from '@/lib/office-team-contract';

type Result = NonNullable<OfficeTeamTask['qa']>;
type Review = {status?: string; agentId?: string; name?: string; runId?: string | null; issueId?: string; result?: Result | null};
const unavailable = 'Unavailable in this saved record';

function Field({name, value}: {name: string; value?: string | null}) {
  return <p><strong>{name}: </strong><code style={{overflowWrap: 'anywhere'}}>{value || unavailable}</code></p>;
}

function SavedReview({title, review}: {title: string; review?: Review | null}) {
  const decision = review?.result?.pass === true ? 'Recorded pass' : review?.result?.pass === false ? 'Recorded rejection' : 'Decision unavailable';
  return <details><summary>{title} · {decision}</summary>
    <Field name="Saved status" value={review?.status}/>
    <Field name="Reviewer" value={review?.name || review?.agentId}/>
    {review?.name && <Field name="Reviewer ID" value={review.agentId}/>}
    <Field name="Run ID" value={review?.runId}/><Field name="Issue ID" value={review?.issueId}/>
    {review?.result?.checks.map((check, index) => <p key={index}><strong>{check.pass ? 'Pass' : 'Fail'} · {check.criterion}</strong><br/>{check.evidence}</p>)}
    {review?.result?.note && <p>{review.result.note}</p>}
  </details>;
}

function Bindings({values}: {values?: object | null}) {
  return values ? <>{Object.entries(values).map(([name, value]) => <Field key={name} name={name} value={typeof value === 'string' ? value : null}/>)}</> : <p>Artifact bindings: {unavailable}</p>;
}

export function OfficeTaskEvidence({task}: {task: OfficeTeamTask}) {
  const finalCall = task.calls.filter(call => call.stage === 'qa').at(-1);
  return <details aria-label="Saved review evidence"><summary>Saved review evidence & artifact bindings</summary>
    <Field name="Task ID" value={task.id}/><Field name="Saved revision" value={task.updatedAt}/>
    <p>These are saved decisions and bindings, not a fresh verification. A recorded hash does not establish a QA pass. Missing evidence is unavailable.</p>
    {task.steps.map(step => <Field key={step.id} name={`${step.id} specialist artifact SHA-256`} value={step.responseReceipt?.artifactSha256}/>)}
    {(task.departmentReports?.length ?? 0) === 0 && <p>Department raw-parts and package QA: {unavailable}</p>}
    {task.departmentReports?.map(report => <section key={report.id} aria-label={`${report.departmentName} saved evidence`}>
      <h4>{report.departmentName}</h4>
      <SavedReview title="Raw-parts QA" review={report.partsQa}/>
      <Bindings values={report.partsQa?.evidence}/>
      <Field name="Raw-parts review response SHA-256" value={report.partsQa?.rawSha256}/>
      <Field name="Raw-parts review result SHA-256" value={report.partsQa?.resultSha256}/>
      <Field name="Head report status" value={report.status}/><Field name="Head agent ID" value={report.agentId}/>
      <SavedReview title="Department package QA" review={report.qa}/><Bindings values={report.qa?.evidence}/>
    </section>)}
    <SavedReview title="COO release review" review={task.cooReleaseReview}/>
    <Bindings values={task.cooReleaseReview?.evidence}/>
    <Field name="COO review response SHA-256" value={task.cooReleaseReview?.rawSha256}/>
    <Field name="COO review result SHA-256" value={task.cooReleaseReview?.resultSha256}/>
    <Field name="Preserved source part" value={task.assembly?.sourcePartId}/>
    <Field name="Preserved source artifact SHA-256" value={task.assembly?.sourceArtifactSha256}/>
    {task.assembly?.headReportHashes.map(binding => <Field key={binding.departmentId} name={`${binding.departmentId} head report SHA-256`} value={binding.sha256}/>)}
    <SavedReview title="Final independent QA" review={task.qa || finalCall ? {status: finalCall?.status, agentId: finalCall?.agentId, runId: finalCall?.runId, issueId: finalCall?.issueId, result: task.qa} : null}/>
    <Field name="Final handoff status" value={task.deliveryHandoff?.state}/>
    <Field name="Final output SHA-256" value={task.deliveryHandoff?.outputSha256}/>
    <Field name="Final QA issue bound to output" value={task.deliveryHandoff?.qaIssueId}/>
    <Field name="Parent issue bound to output" value={task.deliveryHandoff?.parentIssueId}/>
    <p>Owner review, publishing and client delivery remain separate decisions.</p>
  </details>;
}

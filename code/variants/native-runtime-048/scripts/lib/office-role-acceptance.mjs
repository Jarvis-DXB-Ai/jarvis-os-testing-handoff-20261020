import {createHash} from 'node:crypto';
import {validateRoster, rosterDepartments} from './office-roster.mjs';
import {departmentReviewCurrent, departmentPartsReviewCurrent} from './office-department-review.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const array = value => Array.isArray(value) ? value : [];
const outputHash = value => typeof value === 'string' && value.trim() ? hash(value) : null;
function uniqueMap(rows, key) {
  const result = new Map();
  for (const row of rows) {
    if (!row || typeof row[key] !== 'string' || result.has(row[key])) throw Error(`Missing or duplicate evidence ${key}.`);
    result.set(row[key], row);
  }
  return result;
}

/** Join coordinator calls to independently read Paperclip run records.
 * Inputs are trusted source records, never facts extracted from model prose.
 * This function grants nothing and never dispatches, writes or certifies a role.
 */
export function verifyRoleNativeCall(call, run, companyId) {
  return Boolean(call && run && call.status === 'succeeded' && run.status === 'succeeded'
    && call.runId && call.runId === run.id && call.agentId === run.agentId
    && call.issueId && call.issueId === run.contextSnapshot?.issueId
    && run.companyId === companyId && run.usageJson?.billingType === 'subscription_included'
    && !run.scheduledRetryAt && !run.fixture && !call.fixture);
}

export function roleDependencyAllocation(steps) {
  const rows = array(steps), ids = new Set(rows.map(s => s.id));
  if (ids.size !== rows.length) return {valid: false, reason: 'duplicate-part', parts: []};
  const done = new Set(), pending = [...rows];
  if (rows.some(s => !Array.isArray(s.dependsOn) || new Set(s.dependsOn).size !== s.dependsOn.length
    || s.dependsOn.some(id => !ids.has(id) || id === s.id))) return {valid: false, reason: 'invalid-dependency', parts: []};
  while (pending.length) {
    const index = pending.findIndex(s => s.dependsOn.every(id => done.has(id)));
    if (index < 0) return {valid: false, reason: 'dependency-cycle', parts: []};
    done.add(pending.splice(index, 1)[0].id);
  }
  return {valid: true, reason: null, parts: rows.map(s => ({partId: s.id, roleId: s.roleId,
    dependsOn: [...s.dependsOn], outputSha256: outputHash(s.output),
    dependenciesComplete: s.dependsOn.every(id => rows.some(p => p.id === id && p.status === 'completed' && outputHash(p.output)))}))};
}

function currentMethods(call, methods) {
  const installed = array(methods), saved = array(call.skills);
  const required = installed.filter(s => s.kind !== 'supplement');
  return saved.length > 0 && required.length > 0
    && required.every(s => saved.some(r => r.id === s.id))
    && saved.every(s => installed.some(r => r.id === s.id && r.sha256 === s.sha256
      && r.contextSha256 === s.contextSha256 && r.contextPath === s.contextPath));
}

function nativeReviewMatches(qa, run) {
  const raw = run?.resultJson?.summary ?? run?.summary;
  if (typeof raw !== 'string' || raw !== qa?.rawOutput) return false;
  try {
    const result = JSON.parse(raw);
    return result.pass === qa.result?.pass && JSON.stringify(result.checks) === JSON.stringify(qa.result?.checks)
      && (typeof result.note === 'string' ? result.note.slice(0, 3000) : '') === qa.result?.note;
  } catch { return false; }
}

/** Deterministic inventory for one explicit client (null means agency-only).
 * Current-method receipts and verified tool receipts must be obtained by the
 * owning server/collector using the existing integrity readers. Historical
 * evidence stays historical; independent QA is artifact/package scoped.
 */
export function buildRoleAcceptanceInventory({plan, jobs = [], nativeRuns = [], actors = [],
  clientId = null, methodReceipts = {}, methodReadiness = [], toolCatalog = {}, toolReceipts = [], observedAt}) {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) throw Error('An explicit observation time is required.');
  if (clientId !== null && (typeof clientId !== 'string' || !clientId)) throw Error('An explicit client scope is required.');
  const active = validateRoster(plan), departments = rosterDepartments(plan);
  const runs = uniqueMap(nativeRuns, 'id');
  const actorMap = uniqueMap(actors, 'id'); uniqueMap(jobs, 'id');
  const scoped = jobs.filter(j => (j.knowledgeContext?.scope?.clientId ?? null) === clientId && !j.fixture);
  const installed = new Map(methodReadiness.map(s => [s.id, s]));
  const rows = active.map(role => {
    const department = departments.find(d => d.roles.includes(role.id));
    const runtime = actors.filter(a => a.metadata?.jarvisBlueprintRoleId === role.id
      && (a.metadata?.jarvisClientId ?? null) === clientId && !a.metadata?.jarvisSpawnedForTask);
    const methods = array(methodReceipts[role.id]);
    return {roleId: role.id, name: role.name, responsibility: role.output, departmentId: department.id,
      reportsTo: role.reportsTo, tier: role.id === 'coo' ? 'coo' : department.qaRoleId === role.id ? 'department-qa'
        : role.id === 'test' ? 'final-qa' : department.headRoleId === role.id ? 'head' : 'specialist',
      availability: {configured: runtime.length > 0, actors: runtime.map(a => ({id: a.id, status: a.status,
        adapterType: a.adapterType, model: a.adapterConfig?.model ?? null})),
        meaning: 'Runtime registration/status only; authentication, quota and task dispatch readiness are separate.'},
      methods: {verified: methods.length > 0 && methods.every(s => installed.get(s.id)?.integrity === 'verified'
        && installed.get(s.id)?.installed === true), receipts: methods},
      tools: {configured: array(toolCatalog[role.id]), grants: [], verifiedUses: []},
      nativeCalls: [], dependencyAllocations: [], independentPartsQa: [], independentQa: [], headReports: [], cooStages: [], finalQaRecords: [],
      ownerReviewRecords: [], craftAcceptance: {status: 'not-certified', meaning: 'Calls and narrow package QA do not certify general role craft.'},
      ownerApproval: {status: 'not-established', meaning: 'Job review markers are not an artifact-bound owner approval receipt.'}};
  });
  const byRole = new Map(rows.map(r => [r.roleId, r]));
  const rejectedCalls = [], usedRuns = new Set();
  for (const job of [...scoped].sort((a, b) => a.id.localeCompare(b.id))) {
    const verified = new Map();
    for (const call of array(job.calls)) {
      const row = byRole.get(call.roleId);
      if (!row) continue;
      const actor = actorMap.get(call.agentId);
      if (!verifyRoleNativeCall(call, runs.get(call.runId), plan.paperclipCompanyId)
        || actor?.metadata?.jarvisBlueprintRoleId !== call.roleId
        || (actor.metadata?.jarvisClientId ?? null) !== clientId) {
        rejectedCalls.push({jobId: job.id, runId: call.runId ?? null, roleId: call.roleId, stage: call.stage,
          reason: 'Not joined to a terminal matching subscription-included native run.'});
        continue;
      }
      if (usedRuns.has(call.runId)) throw Error('The same native run is attributed more than once.');
      usedRuns.add(call.runId);
      verified.set(call.runId, call);
      const ref = {jobId: job.id, kind: job.kind ?? 'team', stage: call.stage, runId: call.runId,
        agentId: call.agentId, issueId: call.issueId, model: runs.get(call.runId).usageJson?.model ?? call.model,
        currentMethods: row.methods.verified && currentMethods(call, methodsFor(call.roleId)),
        outputContract: call.outputContract?.status ?? 'not-recorded'};
      row.nativeCalls.push(ref);
      row.tools.grants.push({...ref, tools: [...array(call.tools)]});
      for (const receipt of toolReceipts.filter(r => r.verified === true && r.jobId === job.id
        && r.runId === call.runId && r.agentId === call.agentId && r.status === 'completed'
        && !r.fixture && array(call.tools).includes(r.tool))) {
        row.tools.verifiedUses.push({...ref, receiptId: receipt.id, tool: receipt.tool,
          fileHashes: array(receipt.files).map(f => ({name: f.name, sha256: f.sha256}))});
      }
      if (call.roleId === 'coo' && ['planning', 'synthesis'].includes(call.stage)) row.cooStages.push(ref);
    }
    function methodsFor(roleId) { return array(methodReceipts[roleId]); }
    if (job.kind === 'conversation') continue;
    const allocation = roleDependencyAllocation(job.steps);
    for (const step of array(job.steps)) {
      const row = byRole.get(step.roleId);
      if (row && [...verified.values()].some(c => c.stage === `specialist:${step.id}` && c.agentId === step.agentId)) {
        row.dependencyAllocations.push({jobId: job.id, valid: allocation.valid, reason: allocation.reason,
          part: allocation.parts.find(p => p.partId === step.id) ?? null});
      }
    }
    for (const report of array(job.departmentReports)) {
      const department = departments.find(d => d.id === report.departmentId);
      const head = byRole.get(report.roleId), reviewer = byRole.get(report.qa?.roleId);
      const headCall = [...verified.values()].find(c => c.stage === `department:${report.departmentId}`
        && c.agentId === report.agentId && c.roleId === report.roleId);
      if (head && headCall && report.status === 'completed' && outputHash(report.output)) head.headReports.push({jobId: job.id,
        departmentId: report.departmentId, runId: headCall.runId, outputSha256: outputHash(report.output),
        status: 'recorded-head-output', meaning: 'Saved head report; native call does not by itself bind current output bytes.'});
      const qaCall = verified.get(report.qa?.runId);
      const participants = array(report.stepIds).map(id => array(job.steps).find(s => s.id === id));
      const authorsVerified = participants.length > 0 && participants.every(s => s && [...verified.values()]
        .some(c => c.stage === `specialist:${s.id}` && c.agentId === s.agentId && c.roleId === s.roleId));
      const partsCall = verified.get(report.partsQa?.runId);
      const partsVerified = job.departmentPartsReviewVersion === 1 && partsCall
        && partsCall.stage === `department-parts-qa:${report.departmentId}`
        && partsCall.roleId === department?.qaRoleId && report.partsQa?.roleId === partsCall.roleId
        && nativeReviewMatches(report.partsQa, runs.get(partsCall.runId))
        && departmentPartsReviewCurrent(job, report);
      if (partsVerified && allocation.valid && authorsVerified) {
        const record = {jobId: job.id, departmentId: report.departmentId, runId: partsCall.runId,
          reviewerRoleId: partsCall.roleId, reviewerAgentId: partsCall.agentId,
          evidence: {...report.partsQa.evidence}, scope: 'current-saved-raw-parts',
          meaning: 'Raw-parts QA only; head/package QA, whole-role craft and owner approval remain separate.'};
        if (reviewer) reviewer.independentPartsQa.push({...record, participation: 'reviewer'});
        for (const s of participants) byRole.get(s.roleId)?.independentPartsQa.push({...record, participation: 'author', partId: s.id});
      }
      // Legacy reviews remain visible as calls but cannot pass the new package contract.
      if (job.departmentPackageReviewVersion === 1 && allocation.valid && authorsVerified && headCall && qaCall
        && department?.headRoleId === report.roleId && department?.qaRoleId === report.qa?.roleId
        && (job.departmentPartsReviewVersion !== 1 || partsVerified)
        && qaCall.stage === `department-qa:${report.departmentId}` && qaCall.roleId === report.qa?.roleId
        && nativeReviewMatches(report.qa, runs.get(qaCall.runId)) && departmentReviewCurrent(job, report)) {
        const record = {jobId: job.id, departmentId: report.departmentId, runId: qaCall.runId,
          reviewerRoleId: qaCall.roleId, reviewerAgentId: qaCall.agentId, headRunId: headCall.runId,
          evidence: {...report.qa.evidence}, scope: 'current-saved-department-package',
          reviewPipeline: job.departmentPartsReviewVersion === 1 ? 'parts-then-head-then-package' : 'historical-head-then-package',
          meaning: 'Artifact-bound package QA only; no owner approval, production proof or whole-role certification.'};
        if (reviewer) reviewer.independentQa.push({...record, participation: 'reviewer'});
        if (head) head.independentQa.push({...record, participation: 'head'});
        for (const s of participants) byRole.get(s.roleId)?.independentQa.push({...record, participation: 'author', partId: s.id});
      }
    }
    const finalCall = [...verified.values()].find(c => c.stage === 'qa');
    if (finalCall && job.qa) byRole.get(finalCall.roleId)?.finalQaRecords.push({jobId: job.id, runId: finalCall.runId,
      recordedPass: job.qa.pass === true, outputSha256: outputHash(job.output),
      status: 'recorded-not-current-output-bound', meaning: 'Final QA has no independently verified current-output target receipt in this inventory.'});
    if (job.reviewedAt) for (const roleId of new Set(array(job.steps).map(s => s.roleId))) byRole.get(roleId)?.ownerReviewRecords
      .push({jobId: job.id, at: job.reviewedAt, status: job.status, meaning: 'Review marker only; approval remains not established.'});
  }
  return {version: 1, observedAt, clientId, companyId: plan.paperclipCompanyId,
    totals: {roles: rows.length, scopedJobs: scoped.length, nativeCalls: rows.reduce((n, r) => n + r.nativeCalls.length, 0),
      rolesWithNativeCall: rows.filter(r => r.nativeCalls.length).length,
      rolesWithCurrentMethodCall: rows.filter(r => r.nativeCalls.some(c => c.currentMethods)).length,
      rolesWithCurrentPartsQa: rows.filter(r => r.independentPartsQa.length).length,
      rolesWithCurrentPackageQa: rows.filter(r => r.independentQa.length).length},
    roles: rows, rejectedCalls, historicalMergedRoles: array(plan.roles).filter(r => r.rosterStatus === 'merged')
      .map(r => ({roleId: r.id, mergedInto: r.mergedInto, reason: r.rosterReason ?? null})),
    limits: ['Caller must preserve and hash its actual source reads.', 'No per-role conversation certification.',
      'No dispatch, tool grant, owner approval or external action is authorized by this inventory.']};
}

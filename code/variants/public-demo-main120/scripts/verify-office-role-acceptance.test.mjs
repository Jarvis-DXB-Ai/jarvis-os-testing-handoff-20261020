import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildRoleAcceptanceInventory, verifyRoleNativeCall, roleDependencyAllocation} from './lib/office-role-acceptance.mjs';
import {departmentPackageEvidence, departmentPackageChecks, departmentPartChecks, departmentPartsEvidence} from './lib/office-department-review.mjs';

// Synthetic records test adversarial evidence joins. They are not native proof.
function fixture() {
  const roles = ['coo', 'author', 'reviewer', 'test'].map(id => ({id, name: id, rosterStatus: 'active',
    output: `${id} responsibility`, departmentId: 'operations', department: 'Operations', reportsTo: id === 'coo' ? null : 'coo'}));
  const plan = {paperclipCompanyId: 'company', departmentQaEnabled: true, executives: [roles[0]], roles: roles.slice(1),
    focusDepartments: [{id: 'operations', name: 'Operations', headRoleId: 'coo', qaRoleId: 'reviewer',
      roles: roles.map(r => r.id), core: roles.map(r => r.id)}], supportDepartments: []};
  const method = {id: 'protocol', kind: 'protocol', sha256: 'method', contextSha256: 'context', contextPath: 'SKILL.md'};
  const call = (roleId, stage) => ({roleId, stage, agentId: `actor-${roleId}`, runId: `run-${stage}`,
    issueId: `issue-${stage}`, status: 'succeeded', skills: [{...method}], tools: ['draft_check']});
  const calls = [call('author', 'specialist:part'), call('coo', 'department:operations'),
    call('reviewer', 'department-qa:operations'), call('test', 'qa')];
  const job = {id: 'job', version: 4, kind: 'team', brief: 'useful task', context: '', criteria: ['task criterion'],
    knowledgeContext: {scope: {clientId: 'client'}}, departmentPackageReviewVersion: 1, calls,
    steps: [{id: 'part', roleId: 'author', agentId: 'actor-author', issueId: calls[0].issueId,
      status: 'completed', assignment: 'draft', output: 'Draft.', dependsOn: []}], output: 'Draft.',
    departmentReports: [], qa: {pass: true}, reviewedAt: '2026-10-15T00:00:00Z', status: 'reviewed'};
  const result = {pass: true, checks: departmentPackageChecks.map(criterion => ({criterion, pass: true, evidence: 'actual scoped evidence'})), note: ''};
  const report = {departmentId: 'operations', roleId: 'coo', agentId: 'actor-coo', status: 'completed',
    output: 'Head.', stepIds: ['part'], qa: {roleId: 'reviewer', agentId: 'actor-reviewer', runId: calls[2].runId,
      status: 'completed', result, rawOutput: JSON.stringify(result)}};
  report.qa.evidence = departmentPackageEvidence(job, report); job.departmentReports.push(report);
  return {plan, jobs: [job], clientId: 'client', observedAt: '2026-10-15T12:00:00Z',
    nativeRuns: calls.map(c => ({id: c.runId, agentId: c.agentId, companyId: 'company',
      contextSnapshot: {issueId: c.issueId}, status: 'succeeded', usageJson: {billingType: 'subscription_included'},
      resultJson: c === calls[2] ? {summary: report.qa.rawOutput} : {}})),
    actors: roles.map(r => ({id: `actor-${r.id}`, status: 'idle', metadata: {jarvisBlueprintRoleId: r.id, jarvisClientId: 'client'}})),
    methodReceipts: Object.fromEntries(roles.map(r => [r.id, [{...method}]])),
    methodReadiness: [{id: 'protocol', installed: true, integrity: 'verified'}]};
}
const role = (inventory, id) => inventory.roles.find(r => r.roleId === id);
const hash = text => createHash('sha256').update(text).digest('hex');
function twoGateFixture() {
  const f = fixture(), job = f.jobs[0], report = job.departmentReports[0];
  job.departmentPartsReviewVersion = 1;
  job.calls[0].returnedOutput = job.steps[0].output;
  const result = {pass: true, checks: departmentPartChecks.map(criterion => ({criterion, pass: true, evidence: 'raw source evidence'})), note: ''};
  const rawOutput = JSON.stringify(result);
  const call = {roleId: 'reviewer', stage: 'department-parts-qa:operations', agentId: 'actor-reviewer',
    runId: 'run-raw-parts', issueId: 'issue-raw-parts', status: 'succeeded', returnedOutput: rawOutput};
  report.partsQa = {roleId: 'reviewer', agentId: call.agentId, issueId: call.issueId, runId: call.runId,
    status: 'completed', result, rawOutput, rawSha256: hash(rawOutput), resultSha256: hash(JSON.stringify(result)),
    evidence: departmentPartsEvidence(job, report)};
  report.issueId = job.calls[1].issueId;
  job.calls[1].returnedOutput = report.output;
  report.qa.issueId = job.calls[2].issueId;
  job.calls[2].returnedOutput = report.qa.rawOutput;
  job.calls.splice(1, 0, call);
  f.nativeRuns.push({id: call.runId, agentId: call.agentId, companyId: 'company', contextSnapshot: {issueId: call.issueId},
    status: 'succeeded', usageJson: {billingType: 'subscription_included'}, resultJson: {summary: rawOutput}});
  return f;
}

test('separates runtime, native, method, package QA, craft and owner approval', () => {
  const inventory = buildRoleAcceptanceInventory(fixture()), author = role(inventory, 'author');
  assert.equal(author.availability.configured, true); assert.equal(author.methods.verified, true);
  assert.equal(author.nativeCalls.length, 1); assert.equal(author.nativeCalls[0].currentMethods, true);
  assert.equal(author.independentQa.length, 1); assert.equal(author.craftAcceptance.status, 'not-certified');
  assert.equal(author.independentQa[0].reviewPipeline, 'historical-head-then-package');
  assert.equal(author.ownerApproval.status, 'not-established'); assert.equal(author.ownerReviewRecords.length, 1);
  assert.equal(role(inventory, 'test').finalQaRecords[0].status, 'recorded-not-current-output-bound');
});

test('new two-gate jobs expose distinct native raw and package review evidence', () => {
  const a = role(buildRoleAcceptanceInventory(twoGateFixture()), 'author');
  assert.equal(a.independentPartsQa.length, 1); assert.equal(a.independentQa.length, 1);
  assert.equal(a.independentQa[0].reviewPipeline, 'parts-then-head-then-package');
  assert.notEqual(a.independentPartsQa[0].runId, a.independentQa[0].runId);
});

test('new package acceptance requires real raw native review and correct saved order', () => {
  for (const mutate of [f => {f.nativeRuns.pop();}, f => {f.jobs[0].departmentReports[0].partsQa.result.pass = false;},
    f => {const calls = f.jobs[0].calls; [calls[1], calls[2]] = [calls[2], calls[1]];}]) {
    const f = twoGateFixture(); mutate(f); assert.equal(role(buildRoleAcceptanceInventory(f), 'author').independentQa.length, 0);
  }
});

test('conversation with passing prose cannot become independent package QA', () => {
  const f = fixture(); f.jobs[0].kind = 'conversation';
  const a = role(buildRoleAcceptanceInventory(f), 'author');
  assert.equal(a.nativeCalls.length, 1); assert.equal(a.independentQa.length, 0); assert.equal(a.ownerReviewRecords.length, 0);
});

test('native evidence rejects foreign actor, issue, company, billing and retry states', () => {
  const f = fixture(), call = f.jobs[0].calls[0], run = f.nativeRuns[0];
  assert.equal(verifyRoleNativeCall(call, run, 'company'), true);
  for (const patch of [{id: 'wrong'}, {agentId: 'wrong'}, {contextSnapshot: {issueId: 'wrong'}}, {companyId: 'foreign'},
    {status: 'running'}, {usageJson: {billingType: 'paid_api'}}, {scheduledRetryAt: '2099-01-01'}, {fixture: true}]) {
    assert.equal(verifyRoleNativeCall(call, {...run, ...patch}, 'company'), false);
  }
});

test('actor role and client identity must match actual native call', () => {
  const f = fixture(); f.actors.find(a => a.id === 'actor-author').metadata.jarvisBlueprintRoleId = 'coo';
  assert.equal(role(buildRoleAcceptanceInventory(f), 'author').nativeCalls.length, 0);
});

test('separates clients even when a role exists in both tenants', () => {
  const f = fixture(); f.clientId = 'other'; const i = buildRoleAcceptanceInventory(f);
  assert.equal(i.totals.nativeCalls, 0); assert.equal(i.totals.scopedJobs, 0);
});

test('changed method context keeps historical native proof but loses current-method claim', () => {
  const f = fixture(); f.methodReceipts.author[0].contextSha256 = 'revised';
  const a = role(buildRoleAcceptanceInventory(f), 'author');
  assert.equal(a.nativeCalls.length, 1); assert.equal(a.nativeCalls[0].currentMethods, false);
});

test('unverified installed methods cannot establish current-method native coverage', () => {
  const f = fixture(); f.methodReadiness[0].integrity = 'unverified';
  assert.equal(role(buildRoleAcceptanceInventory(f), 'author').nativeCalls[0].currentMethods, false);
});

test('mutated author, head or request bytes invalidate current package QA', () => {
  for (const mutate of [f => {f.jobs[0].steps[0].output += ' altered';},
    f => {f.jobs[0].departmentReports[0].output += ' altered';}, f => {f.jobs[0].brief += ' altered';}]) {
    const f = fixture(); mutate(f); assert.equal(role(buildRoleAcceptanceInventory(f), 'author').independentQa.length, 0);
  }
});

test('coordinator-edited passing QA cannot replace actual native verdict', () => {
  const f = fixture(); f.nativeRuns[2].resultJson.summary = JSON.stringify({pass: false, checks: [], note: 'reject'});
  assert.equal(role(buildRoleAcceptanceInventory(f), 'author').independentQa.length, 0);
});

test('self review and missing native head or author evidence cannot pass package QA', () => {
  for (const mutate of [f => {f.jobs[0].departmentReports[0].qa.agentId = 'actor-author';},
    f => {f.nativeRuns.splice(1, 1);}, f => {f.nativeRuns.splice(0, 1);}]) {
    const f = fixture(); mutate(f); assert.equal(role(buildRoleAcceptanceInventory(f), 'author').independentQa.length, 0);
  }
});

test('legacy department QA is preserved as native evidence, not new package acceptance', () => {
  const f = fixture(); delete f.jobs[0].departmentPackageReviewVersion;
  const a = role(buildRoleAcceptanceInventory(f), 'reviewer');
  assert.equal(a.nativeCalls.length, 1); assert.equal(a.independentQa.length, 0);
});

test('grants do not prove tool execution; fixtures and wrong-run receipts are excluded', () => {
  const f = fixture(), c = f.jobs[0].calls[0];
  const r = {id: 'receipt', jobId: 'job', runId: c.runId, agentId: c.agentId, status: 'completed', tool: 'draft_check', verified: true};
  f.toolReceipts = [{...r, fixture: true}, {...r, runId: 'wrong'}, {...r, verified: false}, {...r, tool: 'ungranted'}, r];
  const a = role(buildRoleAcceptanceInventory(f), 'author');
  assert.equal(a.tools.grants.length, 1); assert.equal(a.tools.verifiedUses.length, 1);
});

test('missing, cyclic, duplicate and incomplete dependencies remain explicit', () => {
  assert.equal(roleDependencyAllocation([{id: 'a', dependsOn: ['missing']}]).valid, false);
  assert.equal(roleDependencyAllocation([{id: 'a', dependsOn: ['b']}, {id: 'b', dependsOn: ['a']}]).reason, 'dependency-cycle');
  assert.equal(roleDependencyAllocation([{id: 'a', dependsOn: []}, {id: 'a', dependsOn: []}]).reason, 'duplicate-part');
  assert.equal(roleDependencyAllocation([{id: 'a', dependsOn: []}, {id: 'b', dependsOn: ['a']}]).parts[1].dependenciesComplete, false);
});

test('ambiguous duplicate sources and absent observation times fail closed', () => {
  const f = fixture(); f.nativeRuns.push(f.nativeRuns[0]); assert.throws(() => buildRoleAcceptanceInventory(f), /duplicate/);
  const g = fixture(); delete g.observedAt; assert.throws(() => buildRoleAcceptanceInventory(g), /observation/);
  const h = fixture(); h.jobs.push({...h.jobs[0], id: 'another-job'});
  assert.throws(() => buildRoleAcceptanceInventory(h), /attributed more than once/);
});

test('inventory is deterministic and leaves source records unchanged', () => {
  const f = fixture(), before = JSON.stringify(f), a = buildRoleAcceptanceInventory(f);
  assert.deepEqual(a, buildRoleAcceptanceInventory(f)); assert.equal(JSON.stringify(f), before);
});

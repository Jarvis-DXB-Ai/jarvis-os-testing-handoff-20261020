import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { localAppEnvironment, localTestConfig, root } from './isolated-home-config.mjs';

const keys = localTestConfig();
assert.ok(existsSync(`${root}.next/standalone/server.js`), 'Build the isolated app before testing the model adapter.');
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://127.0.0.1:3103';
const mockOrigin = 'http://127.0.0.1:3123';
const alpha = 'a7604343-92d7-56ec-bf35-b272cac7f8b7';
const agentIds = ['23427350-4eb6-5957-8e3d-a53d1cac249f', '5927bfcc-9862-5a50-b368-e6f4fd7c736c', 'bcbe6e5b-0aec-5fac-b4df-87d94f5739a6', 'f222601e-4e84-5c4f-a102-bd9ce42591ac'];
const sixAgentIds = [...agentIds, '0060ec37-a0a0-5d54-ba6f-3232bea649a7', 'f3a40e92-835e-5eb9-a761-accbbab6e53a'];

test('Anthropic adapter plans, runs four workers in parallel, synthesizes and independently checks scoped mock work', async t => {
  const calls = [];
  let active = 0, peak = 0;
  let failNextWorker = false;
  let rejectNextQa = false;
  let slowWorkers = false;
  let longWorkers = false;
  const mock = createServer(async (req, res) => {
    assert.equal(req.url, '/v1/messages');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const kind = String(body.system).includes('Jarvis team planner') ? 'planner' : String(body.system).includes('independent QA reviewer') ? 'qa' : String(body.system).includes('Jarvis team lead') ? 'lead' : 'worker';
    calls.push({ kind, model: body.model, body });
    const shouldFailWorker = kind === 'worker' && failNextWorker;
    if (shouldFailWorker) failNextWorker = false;
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, kind === 'worker' ? shouldFailWorker ? 20 : slowWorkers ? 650 : 180 : 30));
    active--;
    if (shouldFailWorker) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Synthetic provider failure' } }));
      return;
    }
    const team = kind === 'planner' ? JSON.parse(String(body.messages[0].content).split('Team JSON: ')[1]) : null;
    const hasCheck = kind === 'qa' && String(body.messages[0].content).includes('Every factual claim uses approved context');
    const output = kind === 'planner' ? JSON.stringify({ assignments: team.map(role => ({ agentId: role.agentId, task: `${role.expectedOutput} Use approved facts and flag unknowns.` })) }) : kind === 'qa' ? JSON.stringify(rejectNextQa ? { pass: false, issues: ['Synthetic unsupported claim.'] } : { pass: true, issues: [], checks: hasCheck ? [{ index: 1, pass: true, evidence: 'Synthetic approved fact appears in the scoped draft.' }] : [] }) : kind === 'lead' ? 'MOCK LEAD: combined, source-scoped draft for human review.' : longWorkers ? `MOCK WORKER: ALPHA_OFFICE_MOCK_FACT. ${'x'.repeat(5600)}` : `MOCK WORKER: ${body.model}; source ALPHA_OFFICE_MOCK_FACT.`;
    if (kind === 'qa') rejectNextQa = false;
    res.writeHead(200, { 'content-type': 'application/json', 'request-id': `office-mock-${calls.length}` });
    res.end(JSON.stringify({ id: `msg_office_${calls.length}`, type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: output }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 11, output_tokens: 22 } }));
  });
  await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(3123, '127.0.0.1', resolve); });
  t.after(() => mock.close());

  const child = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: root, env: {
    ...localAppEnvironment(keys), NODE_ENV: 'production', PORT: '3103', HOSTNAME: '127.0.0.1',
    JARVIS_RUNTIME_WORKER_ORIGIN: origin, JARVIS_OFFICE_LIVE_ENABLED: '1', JARVIS_OFFICE_TEST_PROVIDER_MOCK: '1',
    ANTHROPIC_API_KEY: 'REPLACE_WITH_TEST_CREDENTIAL', ANTHROPIC_BASE_URL: mockOrigin,
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let childLog = '';
  child.stdout.on('data', chunk => { childLog += chunk.toString(); });
  child.stderr.on('data', chunk => { childLog += chunk.toString(); });
  t.after(() => { child.kill('SIGTERM'); });

  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { ready = (await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' })).ok; } catch {}
  }
  assert.ok(ready, `Production server did not start: ${childLog.slice(-1200)}`);

  const factId = crypto.randomUUID();
  const fact = await db.from('client_brain_v2_records').insert({ id: factId, client_id: alpha, stable_key: `office-mock-${factId}`,
    top_section: 'intelligence', subsection: 'core_identity', record_type: 'test_fact', title: 'Office mock fact',
    summary: 'ALPHA_OFFICE_MOCK_FACT is a synthetic source for provider testing.', knowledge_class: 'stable', status: 'approved', priority: 5 });
  assert.ifError(fact.error);
  t.after(async () => { await db.from('client_brain_v2_records').delete().eq('id', factId); });

  const response = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: draft launch strategy, content plan, copy and visuals using approved facts only.', acceptanceCriteria: ['Every factual claim uses approved context'], clientId: alpha,
      agentIds, concurrency: 4, modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const created = await response.json();
  assert.equal(response.status, 201, JSON.stringify(created));
  const jobId = created.job.id;
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', jobId); });

  let result;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    assert.equal(res.status, 200);
    result = (await res.json()).jobs.find(job => job.id === jobId);
    if (result && !['queued', 'running'].includes(result.status)) break;
  }
  assert.equal(result?.status, 'needs_review', JSON.stringify({ result, log: childLog.slice(-1000) }));
  assert.deepEqual(result.steps.map(step => step.agent_id), agentIds);
  assert.equal(result.provider_calls, 7);
  assert.equal(result.input_tokens, 77);
  assert.equal(result.output_tokens, 154);
  assert.equal(result.context_manifest.qa.pass, true);
  assert.deepEqual(result.context_manifest.acceptance_criteria, ['Every factual claim uses approved context']);
  assert.deepEqual(result.context_manifest.qa.checks, [{ index: 1, pass: true, evidence: 'Synthetic approved fact appears in the scoped draft.' }]);
  assert.match(result.synthesis, /MOCK LEAD/);
  assert.equal(calls.length, 7);
  assert.equal(calls[0].kind, 'planner');
  assert.equal(calls.filter(call => call.kind === 'worker').length, 4);
  assert.ok(peak >= 2 && peak <= 4, `Expected bounded worker overlap, peak was ${peak}`);
  assert.deepEqual(calls.map(call => call.model), ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
  for (const call of calls) {
    assert.match(JSON.stringify(call.body), /ALPHA_OFFICE_MOCK_FACT/);
    assert.doesNotMatch(JSON.stringify(call.body), /BETA_ONLY_FACT/);
  }
  const removedEvidence = await db.from('office_team_jobs').update({ context_manifest: { ...result.context_manifest, qa: { pass: true, issues: [], checks: [] } } }).eq('id', jobId);
  assert.ifError(removedEvidence.error);
  const deniedMissingEvidence = await fetch(`${origin}/api/office/jobs/${jobId}/review`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ note: 'Attempt without saved checks' }) });
  assert.equal(deniedMissingEvidence.status, 409, 'Review must recheck saved per-item evidence');

  failNextWorker = true;
  const failedResponse = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: verify provider failure recovery.', clientId: alpha, agentIds, concurrency: 4,
      modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const failedCreated = await failedResponse.json();
  assert.equal(failedResponse.status, 201, JSON.stringify(failedCreated));
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', failedCreated.job.id); });
  let failedResult;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    failedResult = (await res.json()).jobs.find(job => job.id === failedCreated.job.id);
    if (failedResult && !['queued', 'running'].includes(failedResult.status)) break;
  }
  assert.equal(failedResult?.status, 'recovery_required');
  assert.ok(failedResult.steps.some(step => step.status === 'unknown'));
  assert.equal(calls.length, 12, 'Provider calls must not be silently retried');
  assert.equal(calls.slice(7).filter(call => call.kind === 'lead' || call.kind === 'qa').length, 0, 'No synthesis after an uncertain specialist call');

  const callsBeforeBoundedFailure = calls.length;
  failNextWorker = true;
  const boundedResponse = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: stop assigning queued roles after a provider failure.', clientId: alpha, agentIds: sixAgentIds, concurrency: 2,
      modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const boundedCreated = await boundedResponse.json();
  assert.equal(boundedResponse.status, 201, JSON.stringify(boundedCreated));
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', boundedCreated.job.id); });
  let boundedResult;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    boundedResult = (await res.json()).jobs.find(job => job.id === boundedCreated.job.id);
    if (boundedResult && !['queued', 'running'].includes(boundedResult.status)) break;
  }
  assert.equal(boundedResult?.status, 'recovery_required');
  assert.equal(calls.slice(callsBeforeBoundedFailure).filter(call => call.kind === 'worker').length, 2,
    'A failed worker must stop all specialists that have not yet started');
  assert.equal(calls.slice(callsBeforeBoundedFailure).filter(call => ['lead', 'qa'].includes(call.kind)).length, 0);

  rejectNextQa = true;
  const qaResponse = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: verify independent QA rejection.', clientId: alpha, agentIds: agentIds.slice(0, 1), concurrency: 1,
      modelPolicy: 'fast', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const qaCreated = await qaResponse.json();
  assert.equal(qaResponse.status, 201, JSON.stringify(qaCreated));
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', qaCreated.job.id); });
  let qaResult;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    qaResult = (await res.json()).jobs.find(job => job.id === qaCreated.job.id);
    if (qaResult && !['queued', 'running'].includes(qaResult.status)) break;
  }
  assert.equal(qaResult?.status, 'failed');
  assert.equal(qaResult.context_manifest.qa.pass, false);
  assert.deepEqual(qaResult.context_manifest.qa.issues, ['Synthetic unsupported claim.']);
  const deniedReview = await fetch(`${origin}/api/office/jobs/${qaCreated.job.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ note: 'Try to bypass QA' }) });
  assert.equal(deniedReview.status, 409);

  slowWorkers = true;
  const callsBeforeStop = calls.length;
  const stopResponse = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: stop while specialists are working.', clientId: alpha, agentIds, concurrency: 4,
      modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const stopCreated = await stopResponse.json();
  assert.equal(stopResponse.status, 201, JSON.stringify(stopCreated));
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', stopCreated.job.id); });
  let inFlight;
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    inFlight = (await res.json()).jobs.find(job => job.id === stopCreated.job.id);
    if (inFlight?.steps.some(step => step.status === 'running')) break;
  }
  assert.ok(inFlight?.steps.some(step => step.status === 'running'), 'A worker should be in flight before the stop request');
  const stopRequest = await fetch(`${origin}/api/office/jobs/${stopCreated.job.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}' });
  assert.equal(stopRequest.status, 200);
  let stoppedResult;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    stoppedResult = (await res.json()).jobs.find(job => job.id === stopCreated.job.id);
    if (stoppedResult && !['queued', 'running', 'cancel_requested'].includes(stoppedResult.status)) break;
  }
  assert.equal(stoppedResult?.status, 'cancelled');
  assert.equal(stoppedResult.provider_calls, 5);
  assert.equal(calls.slice(callsBeforeStop).filter(call => ['lead', 'qa'].includes(call.kind)).length, 0);

  slowWorkers = false;
  longWorkers = true;
  const longStart = calls.length;
  const longResponse = await fetch(`${origin}/api/office/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ brief: 'TEST: include all six large specialist outputs in a bounded lead prompt.', clientId: alpha,
      agentIds: sixAgentIds, concurrency: 4, modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID(), autoStart: true }) });
  const longCreated = await longResponse.json();
  assert.equal(longResponse.status, 201, JSON.stringify(longCreated));
  t.after(async () => { await db.from('office_team_jobs').delete().eq('id', longCreated.job.id); });
  let longResult;
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await fetch(`${origin}/api/office/jobs`, { cache: 'no-store' });
    longResult = (await res.json()).jobs.find(job => job.id === longCreated.job.id);
    if (longResult && !['queued', 'running'].includes(longResult.status)) break;
  }
  assert.equal(longResult?.status, 'needs_review');
  assert.ok(longResult.steps.every(step => step.output.length > 5000), 'Complete specialist outputs must be saved');
  const leadPrompt = String(calls.slice(longStart).find(call => call.kind === 'lead')?.body.messages[0].content);
  for (const name of ['DEMO Brand Strategist', 'DEMO Content Planner', 'DEMO Copywriter', 'DEMO Visual Director', 'DEMO Research Analyst', 'DEMO Quality Reviewer']) {
    assert.ok(leadPrompt.includes(name), `Lead prompt omitted ${name}`);
  }
  assert.equal((leadPrompt.match(/\[Excerpt ends; full output is saved in the specialist step\.\]/g) ?? []).length, 6);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { localAppEnvironment, localTestConfig } from './isolated-home-config.mjs';

// Run only against the loopback, synthetic Jarvis test database and preview.
const keys = localTestConfig();
const env = localAppEnvironment(keys);
assert.equal(env.JARVIS_ISOLATED_TEST, '1');
const base = process.env.OFFICE_TEST_BASE ?? 'http://127.0.0.1:3101';
assert.equal(new URL(base).hostname, '127.0.0.1');
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const agentIds = ['2eaf1cb9-14d7-5cde-9cfb-894fc9017f2d', '3671b532-072e-5d3a-9989-e03c8d8413e0'];
const alpha = 'a7604343-92d7-56ec-bf35-b272cac7f8b7';
const beta = 'c8aef456-9613-5dd2-9a9e-2207708a7338';

async function request(path, body) {
  const res = await fetch(`${base}${path}`, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body), cache: 'no-store',
  });
  return { status: res.status, data: await res.json() };
}

test('Office persists bounded team work, isolates client facts, and gates review', async t => {
  const jobs = [];
  const facts = [];
  t.after(async () => {
    if (jobs.length) await db.from('office_team_jobs').delete().in('id', jobs);
    if (facts.length) await db.from('client_brain_v2_records').delete().in('id', facts);
  });

  const catalog = await request('/api/office/jobs');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.availability.mode, 'fixture');

  const crossOrigin = await fetch(`${base}/api/office/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://unrelated.example' }, body: '{}',
  });
  assert.equal(crossOrigin.status, 403);
  const internalWithoutToken = await request('/api/office/internal/execute', { jobId: crypto.randomUUID() });
  assert.equal(internalWithoutToken.status, 401);

  const bad = await request('/api/office/jobs', { brief: 'TEST invalid', clientId: alpha, agentIds: [], concurrency: 2, modelPolicy: 'balanced', idempotencyKey: crypto.randomUUID() });
  assert.equal(bad.status, 400);

  for (const [clientId, marker] of [[alpha, 'ALPHA_ONLY_FACT'], [beta, 'BETA_ONLY_FACT']]) {
    const id = crypto.randomUUID();
    const inserted = await db.from('client_brain_v2_records').insert({
      id, client_id: clientId, stable_key: `office-integration-${id}`, top_section: 'intelligence', subsection: 'core_identity',
      record_type: 'test_fact', title: `Office ${marker}`, summary: `${marker} belongs only to this test client.`,
      knowledge_class: 'stable', status: 'approved', priority: 5,
    });
    assert.ifError(inserted.error);
    facts.push(id);
  }

  const key = crypto.randomUUID();
  const payload = { brief: 'TEST integration: draft a client-scoped plan and review its facts.', clientId: alpha, agentIds, concurrency: 2, modelPolicy: 'balanced', idempotencyKey: key };
  const created = await request('/api/office/jobs', payload);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  jobs.push(created.data.job.id);
  assert.equal(created.data.job.steps.length, 2);
  assert.deepEqual(created.data.job.steps.map(step => step.agent_id), agentIds);
  assert.match(created.data.job.context_manifest.excerpt, /ALPHA_ONLY_FACT/);
  assert.doesNotMatch(created.data.job.context_manifest.excerpt, /BETA_ONLY_FACT/);

  const duplicate = await request('/api/office/jobs', payload);
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.data.job.id, created.data.job.id);
  const conflict = await request('/api/office/jobs', { ...payload, brief: 'Different request with same key' });
  assert.equal(conflict.status, 409);
  const policyConflict = await request('/api/office/jobs', { ...payload, modelPolicy: 'quality' });
  assert.equal(policyConflict.status, 409);
  const concurrencyConflict = await request('/api/office/jobs', { ...payload, concurrency: 3 });
  assert.equal(concurrencyConflict.status, 409);

  const attempts = await Promise.all([request(`/api/office/jobs/${created.data.job.id}/execute`, {}), request(`/api/office/jobs/${created.data.job.id}/execute`, {})]);
  assert.deepEqual(attempts.map(x => x.status).sort(), [200, 409]);
  const completed = attempts.find(x => x.status === 200).data.job;
  assert.equal(completed.status, 'needs_review');
  assert.equal(completed.provider_calls, 0);
  assert.ok(completed.steps.every(step => step.status === 'completed' && step.output?.includes('LOCAL WORKFLOW FIXTURE')));
  assert.match(completed.synthesis, /LOCAL WORKFLOW FIXTURE/);
  assert.equal(completed.context_manifest.qa.pass, true);

  const reviewed = await request(`/api/office/jobs/${created.data.job.id}/review`, { note: 'Integration check complete.' });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.job.status, 'reviewed');
  assert.equal(reviewed.data.job.review_note, 'Integration check complete.');
  assert.equal((await request(`/api/office/jobs/${created.data.job.id}/review`, { note: 'Again' })).status, 409);

  const betaJob = await request('/api/office/jobs', { ...payload, clientId: beta, agentIds: agentIds.slice(0, 1), idempotencyKey: crypto.randomUUID() });
  assert.equal(betaJob.status, 201, JSON.stringify(betaJob.data));
  jobs.push(betaJob.data.job.id);
  assert.match(betaJob.data.job.context_manifest.excerpt, /BETA_ONLY_FACT/);
  assert.doesNotMatch(betaJob.data.job.context_manifest.excerpt, /ALPHA_ONLY_FACT/);

  const automatic = await request('/api/office/jobs', { ...payload, clientId: beta, agentIds: agentIds.slice(0, 1), idempotencyKey: crypto.randomUUID(), autoStart: true });
  assert.equal(automatic.status, 201, JSON.stringify(automatic.data));
  jobs.push(automatic.data.job.id);
  let automaticStatus = 'queued';
  for (let attempt = 0; attempt < 30 && ['queued', 'running'].includes(automaticStatus); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const fresh = await request('/api/office/jobs');
    automaticStatus = fresh.data.jobs.find(job => job.id === automatic.data.job.id)?.status ?? 'missing';
  }
  assert.equal(automaticStatus, 'needs_review', 'Server must finish the job after POST returns');
  const missingQa = await db.from('office_team_jobs').update({ context_manifest: { ...automatic.data.job.context_manifest, auto_start: true } }).eq('id', automatic.data.job.id);
  assert.ifError(missingQa.error);
  assert.equal((await request(`/api/office/jobs/${automatic.data.job.id}/review`, { note: 'QA was removed' })).status, 409,
    'A completed job must still have explicit passing QA before review');

  const staleQueue = await db.from('office_team_jobs').update({ context_manifest: { ...betaJob.data.job.context_manifest, auto_start: true }, created_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq('id', betaJob.data.job.id);
  assert.ifError(staleQueue.error);
  const queueRecovery = await request('/api/office/jobs');
  assert.equal(queueRecovery.data.jobs.find(job => job.id === betaJob.data.job.id)?.status, 'recovery_required');

  const lostJob = await request('/api/office/jobs', { ...payload, agentIds: agentIds.slice(0, 1), idempotencyKey: crypto.randomUUID() });
  assert.equal(lostJob.status, 201);
  jobs.push(lostJob.data.job.id);
  const lostToken = crypto.randomUUID();
  const lostUpdate = await db.from('office_team_jobs').update({ status: 'running', lease_token: lostToken, lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', lostJob.data.job.id);
  assert.ifError(lostUpdate.error);
  const lostStep = await db.from('office_team_steps').update({ status: 'running' }).eq('job_id', lostJob.data.job.id);
  assert.ifError(lostStep.error);
  const leaseRecovery = await request('/api/office/jobs');
  const recovered = leaseRecovery.data.jobs.find(job => job.id === lostJob.data.job.id);
  assert.equal(recovered?.status, 'recovery_required');
  assert.equal(recovered?.steps[0].status, 'unknown');

  const stopCandidate = await request('/api/office/jobs', { ...payload, agentIds: agentIds.slice(0, 1), idempotencyKey: crypto.randomUUID() });
  assert.equal(stopCandidate.status, 201);
  jobs.push(stopCandidate.data.job.id);
  const stopped = await request(`/api/office/jobs/${stopCandidate.data.job.id}/cancel`, {});
  assert.equal(stopped.status, 200);
  assert.equal(stopped.data.job.status, 'cancelled');
  assert.equal(stopped.data.job.steps[0].status, 'cancelled');
  assert.equal((await request(`/api/office/jobs/${stopCandidate.data.job.id}/execute`, {})).status, 409);

  const anon = await fetch(`${keys.API_URL}/rest/v1/office_team_jobs?select=id&limit=1`, {
    headers: { apikey: keys.ANON_KEY, Authorization: `Bearer ${keys.ANON_KEY}` }, cache: 'no-store',
  });
  assert.notEqual(anon.status, 200, 'Browser database role must not read Office records');

  const readback = await request('/api/office/jobs');
  assert.equal(readback.status, 200);
  assert.equal(readback.data.jobs.find(job => job.id === created.data.job.id)?.status, 'reviewed');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
// Transpile the pure contract only; no Next server, database or provider access.
const source = readFileSync(new URL('../src/lib/office.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(new URL('../src/lib/office.ts', import.meta.url)), module, module.exports);
const { recordedOfficeStates, blueprintRoster, productionRoster, createTestRun, runOfficeTeam, reviewTestRun, parseSavedOfficeRuns } = module.exports;
const agents = blueprintRoster().agents.slice(0, 6);
const make = (changes = {}) => createTestRun({ id: 'test-team', brief: 'Synthetic launch brief', agents, modelPolicy: 'quality', concurrency: 3, failAgentId: null, ...changes });
const tick = () => new Promise(resolve => setTimeout(resolve, 4));

test('bounded pool actually overlaps workers and returns every result before review', async () => {
  let active = 0, peak = 0;
  const snapshots = [];
  const result = await runOfficeTeam(make(), async step => { active++; peak = Math.max(active, peak); await tick(); active--; return `Result for ${step.agentId}`; }, new AbortController().signal, run => snapshots.push(run));
  assert.equal(peak, 3); assert.equal(active, 0);
  assert.equal(result.status, 'waiting_for_review');
  assert.equal(result.steps.filter(s => s.output).length, 6);
  assert.equal(snapshots[0].steps.filter(s => s.status === 'running').length, 1, 'snapshots must not mutate after delivery');
  assert.equal(reviewTestRun(result, 'Checked').status, 'approved');
});

test('a failure or empty output cannot become an approved result', async () => {
  for (const kind of ['throws', 'empty']) {
    const result = await runOfficeTeam(make(), async step => {
      if (step.agentId === agents[1].id) { if (kind === 'throws') throw new Error('Missing source'); return ''; }
      return 'Synthetic result';
    }, new AbortController().signal, () => {});
    assert.equal(result.status, 'failed');
    assert.equal(result.steps.filter(s => s.status === 'completed').length, 5);
    assert.throws(() => reviewTestRun(result, ''), /Only a complete/);
  }
});

test('cancellation stops new workers and never records late responses as completed', async () => {
  const controller = new AbortController(); let starts = 0;
  const result = await runOfficeTeam(make({ concurrency: 2 }), async () => { starts++; controller.abort(); await tick(); return 'late'; }, controller.signal, () => {});
  assert.equal(starts, 1); assert.equal(result.status, 'cancelled');
  assert.ok(result.steps.every(s => s.status === 'cancelled' && s.output === null));
});

test('reload recovers unfinished tests as interrupted while preserving successful evidence', () => {
  const run = make(); run.steps[0].status = 'completed'; run.steps[0].output = 'preserved';
  const [restored] = parseSavedOfficeRuns(JSON.stringify([run]));
  assert.equal(restored.status, 'interrupted'); assert.equal(restored.steps[0].output, 'preserved');
  assert.ok(restored.steps.slice(1).every(s => s.status === 'cancelled'));
  assert.deepEqual(parseSavedOfficeRuns('[null, {"id": 8}]'), []);
  assert.throws(() => parseSavedOfficeRuns('{invalid'));
});

test('invalid briefs, team size and concurrency are rejected before dispatch', () => {
  assert.throws(() => make({ brief: '  ' }));
  assert.throws(() => make({ brief: 'a'.repeat(2001) }));
  assert.throws(() => make({ agents: [] }));
  assert.throws(() => make({ agents: blueprintRoster().agents.slice(0, 7) }));
  assert.throws(() => make({ concurrency: 5 }));
  assert.throws(() => make({ failAgentId: 'unknown' }));
  assert.equal(make({ agents: [agents[0], agents[0]] }).steps.length, 1);
});

test('missing production records do not become blueprint agents or fabricated activity', () => {
  assert.deepEqual(productionRoster(null, null), { agents: [], departments: [] });
  const b = blueprintRoster();
  assert.equal(new Set(b.agents.map(a => a.id)).size, b.agents.length);
  assert.ok(b.agents.every(a => a.model === null && a.runtimeKey === null));
});


test('recorded desk status does not expose an obsolete failure after a completed run', () => {
  const runtime = { definitions: [{ id: 'definition', agent_id: 'agent' }], runs: [
    { agent_runtime_definition_id: 'definition', created_at: '2026-10-10', status: 'failed' },
    { agent_runtime_definition_id: 'definition', created_at: '2026-10-12', status: 'completed' },
  ] };
  assert.deepEqual(recordedOfficeStates(runtime), { agent: 'completed' });
  runtime.runs.push({ agent_runtime_definition_id: 'definition', created_at: '2026-10-11', status: 'waiting_for_external' });
  assert.deepEqual(recordedOfficeStates(runtime), { agent: 'waiting_for_external' });
  assert.deepEqual(recordedOfficeStates(null), {});
});

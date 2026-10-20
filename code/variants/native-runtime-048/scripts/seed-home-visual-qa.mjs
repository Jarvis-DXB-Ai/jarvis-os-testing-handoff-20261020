import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localTestConfig } from './isolated-home-config.mjs';

// Persistent synthetic fixtures for independent Claude QA; never hosted data.
const config = localTestConfig();
const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fixtures = [
  ['2042401b-3835-51d1-ac95-e97b7b5578db', 'TEST Briefing Short', 'TEST Check the venue notes'],
  ['a7168b91-95f9-563b-aa43-5ebaece4c7cd', 'TEST Briefing Medium', 'TEST Review the service details, opening hours and approved venue information before using them in the next content plan'],
  ['c4c0229a-f4c8-57c3-9fa8-3548f6b62232', 'TEST Briefing Long Client Label For Independent Responsive Carousel And Ellipsis Verification', 'TEST Verify the longer venue brief, clarify the missing operating details, review the approved service information and confirm the outstanding content assumptions before preparing the next plan'],
];
for (const [id, name, title] of fixtures) {
  assert.ifError((await db.from('clients').upsert({ id, name, industry: 'Synthetic visual QA', status: 'active' })).error);
  assert.ifError((await db.from('client_brain_v2_records').upsert({ id, client_id: id, stable_key: 'TEST-home-visual-qa', top_section: 'intelligence', subsection: 'knowledge_gaps', record_type: 'knowledge_gap', knowledge_class: 'knowledge_gap', title, status: 'needs_review', priority: 3 })).error);
  // Reset only these synthetic items' dismissal state, so carousel QA is repeatable.
  assert.ifError((await db.from('home_owner_suggestion_dismissals').delete().eq('owner_id', 'isolated-owner').eq('dedupe_identity', `client-review:${id}`)).error);
}
async function api(path, body, method = 'POST') {
  const response = await fetch('http://127.0.0.1:3101' + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response.json();
}
for (const [title, initial, final] of [
  ['TEST QA orange - direct creation', 'in_progress', 'in_progress'],
  ['TEST QA orange - lifecycle start', 'not_started', 'in_progress'],
  ['TEST QA drag this task into orange', 'not_started', 'not_started'],
]) {
  const { data, error } = await db.from('jarvis_tasks').select('id,status').eq('client_id', fixtures[0][0]).eq('title', title).neq('status', 'archived');
  assert.ifError(error);
  if (data.length) continue; // Preserve a reviewer's existing drag result on rerun.
  const created = await api('/api/tasks/create', { title, clientId: fixtures[0][0], targetStatus: initial });
  if (initial !== final) await api(`/api/home/tasks/${created.task.id}`, { action: 'start', expectedUpdatedAt: created.task.updated_at }, 'PATCH');
}
const home = await (await fetch('http://127.0.0.1:3101/api/home')).json();
assert.ok(home.clients.every(client => client.name.startsWith('TEST ')));
assert.equal(home.suggestions.filter(s => fixtures.some(([id]) => s.dedupeIdentity === `client-review:${id}`)).length, 3);
const { data: tasks, error } = await db.from('jarvis_tasks').select('status').eq('client_id', fixtures[0][0]).like('title', 'TEST QA%').eq('status', 'in_progress');
assert.ifError(error); assert.ok(tasks.length >= 2);
console.log('Ready: 3 different-length briefings, 2+ In progress tasks and a drag candidate at http://127.0.0.1:3101. Fixtures are retained for Claude QA.');

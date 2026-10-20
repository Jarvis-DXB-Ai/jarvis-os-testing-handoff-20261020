import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { localTestConfig } from './isolated-home-config.mjs';

const config = localTestConfig();
const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = 'http://127.0.0.1:3101';
const run = `TEST ${Date.now()}`;
const clientId = 'a7604343-92d7-56ec-bf35-b272cac7f8b7';
const created = [];
async function api(path, body, method = 'POST') {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function read(id) {
  const { data, error } = await db.from('jarvis_tasks').select('*').eq('id', id).single();
  assert.ifError(error); return data;
}
async function create(status) {
  const response = await api('/api/tasks/create', { title: `${run} ${status}`, clientId, targetStatus: status });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  created.push(response.body.task.id);
  const stored = await read(response.body.task.id);
  assert.equal(stored.status, status); assert.equal(stored.client_id, clientId);
  return response.body.task;
}
try {
const home = await api('/api/home', null, 'GET');
assert.equal(home.status, 200); assert.ok(home.body.clients.every(c => c.name.startsWith('TEST ')));
for (const lane of ['not_started','in_progress','completed','reviewed']) {
  const task = await create(lane);
  if (lane === 'completed' || lane === 'reviewed') assert.ok(task.completed_at);
  if (lane === 'reviewed') assert.ok(task.reviewed_at);
}
assert.equal((await api('/api/tasks/create', { title:'', targetStatus:'not_started' })).status, 400);
assert.equal((await api('/api/tasks/create', { title:run, targetStatus:'invalid' })).status, 400);
const task = await create('not_started');
assert.equal((await api(`/api/home/tasks/${task.id}`, { action:'review' }, 'PATCH')).status, 409);
for (const [action,status] of [['start','in_progress'],['complete','completed'],['review','reviewed'],['start','in_progress'],['complete','completed'],['review','reviewed'],['reopen','not_started']]) {
  const result = await api(`/api/home/tasks/${task.id}`, { action }, 'PATCH');
  assert.equal(result.status, 200); const stored = await read(task.id); assert.equal(stored.status, status);
  if (action === 'start') { assert.equal(stored.completed_at,null); assert.equal(stored.reviewed_at,null); }
}
const reopened = await read(task.id); assert.equal(reopened.completed_at,null); assert.equal(reopened.reviewed_at,null);
await create('not_started');
const { data: lane } = await db.from('jarvis_tasks').select('id').eq('status','not_started').order('manual_order').order('created_at').order('id');
const expected = lane.map(t => t.id); const reverse = [...expected].reverse();
const reordered = await api('/api/tasks/reorder', { status:'not_started', expectedTaskIds:expected, orderedTaskIds:reverse });
assert.equal(reordered.status,200,JSON.stringify(reordered.body));
assert.equal((await api('/api/tasks/reorder', { status:'not_started', expectedTaskIds:expected, orderedTaskIds:reverse })).status,409);
const concurrent = await Promise.all([
  api('/api/tasks/reorder', { status:'not_started', expectedTaskIds:reverse, orderedTaskIds:expected }),
  api('/api/tasks/reorder', { status:'not_started', expectedTaskIds:reverse, orderedTaskIds:[...reverse.slice(1),reverse[0]] }),
]);
assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
const before = await read(task.id);
const edits = await Promise.all(['first','second'].map(title => api(`/api/home/tasks/${task.id}`, { action:'update', title:`${run} ${title}`, expectedUpdatedAt:before.updated_at }, 'PATCH')));
console.log('Concurrent edit responses:', edits.map(r=>r.status));
assert.deepEqual(edits.map(r=>r.status).sort(),[200,409], 'Stale edits must not overwrite the winning edit');
// Exercise every Home lane pair through the atomic endpoint.
async function laneIds(status) {
  const {data,error} = await db.from('jarvis_tasks').select('id').eq('status',status).order('manual_order').order('created_at').order('id');
  assert.ifError(error); return data.map(t=>t.id);
}
async function moveBody(task, to) {
  const ids = await laneIds(to);
  return { taskId:task.id, from:task.status, to, expectedUpdatedAt:task.updated_at,
    expectedDestinationIds:ids, orderedTaskIds:[task.id,...ids.filter(id=>id!==task.id)] };
}
for (const from of ['not_started','in_progress','completed','reviewed']) {
  for (const to of ['not_started','in_progress','completed','reviewed']) {
    const item = await create(from);
    const payload = await moveBody(item,to);
    const response = await api('/api/tasks/move',payload);
    assert.equal(response.status,200,JSON.stringify(response.body));
    const after = await read(item.id);
    assert.equal(after.status,to); assert.deepEqual(await laneIds(to),payload.orderedTaskIds);
    if (['not_started','in_progress'].includes(to)) { assert.equal(after.completed_at,null); assert.equal(after.reviewed_at,null); }
    if (to==='completed' || to==='reviewed') assert.ok(after.completed_at);
    if (to==='reviewed') assert.ok(after.reviewed_at);
    if (from==='completed' && to==='reviewed') assert.equal(after.completed_at,item.completed_at);
    const stale = await api('/api/tasks/move',payload);
    assert.equal(stale.status,409);
  }
}
const competing = await create('not_started');
const moves = await Promise.all([
  moveBody(competing,'in_progress').then(body=>api('/api/tasks/move',body)),
  moveBody(competing,'reviewed').then(body=>api('/api/tasks/move',body)),
]);
assert.deepEqual(moves.map(r=>r.status).sort(),[200,409]);
const conflictTask = await create('not_started');
const conflictPayload = await moveBody(conflictTask,'completed');
await create('completed');
assert.equal((await api('/api/tasks/move',conflictPayload)).status,409);
assert.equal((await read(conflictTask.id)).status,'not_started');
// Force the reorder write to fail AFTER the status update, proving rollback.
function sql(query) { execFileSync('docker',['exec','-i','supabase_db_jarvis-home-test','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:query,stdio:['pipe','pipe','pipe']}); }
const rollbackTask = await create('not_started');
const beforeRollback = await read(rollbackTask.id);
const rollbackPayload = await moveBody(rollbackTask,'reviewed');
sql(`CREATE FUNCTION public.test_home_order_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.id = '${rollbackTask.id}'::uuid AND NEW.manual_order IS DISTINCT FROM OLD.manual_order THEN
RAISE EXCEPTION 'TEST injected ordering failure'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER test_home_order_failure BEFORE UPDATE ON public.jarvis_tasks FOR EACH ROW EXECUTE FUNCTION public.test_home_order_failure();`);
try {
  assert.equal((await api('/api/tasks/move',rollbackPayload)).status,500);
  assert.deepEqual(await read(rollbackTask.id),beforeRollback,'Failed ordering must roll back status and timestamps');
} finally { sql('DROP TRIGGER test_home_order_failure ON public.jarvis_tasks; DROP FUNCTION public.test_home_order_failure();'); }
const anon = createClient(config.API_URL, config.ANON_KEY, {auth:{persistSession:false}});
assert.ok((await anon.rpc('move_jarvis_task', {p_task_id:rollbackTask.id,p_expected_updated_at:rollbackTask.updated_at,p_from:'not_started',p_to:'completed',p_expected_destination_ids:[],p_ordered_task_ids:[rollbackTask.id]})).error,'Anonymous database clients cannot invoke task mutation');
// Enough rows to cross the former global 120-task truncation boundary.
const {data: bulk, error: bulkError} = await db.from('jarvis_tasks').insert(Array.from({length:225},(_,i)=>({
  title:`${run} capacity ${i}`, client_id:clientId, status:'not_started', manual_order:Date.now()+i,
}))).select('id');
assert.ifError(bulkError); created.push(...bulk.map(t=>t.id));
const expanded = await api('/api/home', null, 'GET');
assert.equal(expanded.status,200);
assert.ok(bulk.every(t=>expanded.body.tasks.some(visible=>visible.id===t.id)), 'Home must include all rows needed to reorder a column');
const largeLane = await laneIds('not_started');
assert.ok(largeLane.length > 200);
assert.equal((await api('/api/tasks/reorder',{status:'not_started',expectedTaskIds:largeLane,orderedTaskIds:[...largeLane].reverse()})).status,200);
for (const id of created) assert.equal((await api(`/api/home/tasks/${id}`, {action:'archive'}, 'PATCH')).status,200);


} finally {
  for (let offset = 0; offset < created.length; offset += 50) {
    const { error } = await db.from('jarvis_tasks').update({status:'archived',archived_at:new Date().toISOString()}).in('id',created.slice(offset,offset+50));
    assert.ifError(error);
  }
}

console.log('PASS: real local persistence, all four creation lanes, lifecycle, validation, stale/concurrent reorder, concurrent edit, all 16 atomic lane pairs, failed-write rollback, competing moves, 200+ column reorder, RPC permissions and archive.');

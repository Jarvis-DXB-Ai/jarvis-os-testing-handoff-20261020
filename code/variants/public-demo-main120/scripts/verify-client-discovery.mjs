import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localTestConfig } from './isolated-home-config.mjs';
const config = localTestConfig();
const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY);
// Production identifiers with synthetic records, exclusively in the isolated DB.
const hidden = ['344da257-e4ec-548c-b3b8-959b3af8d001','ae2aa0d1-79d9-5dd1-b656-804e16927959','b29c0cbf-48fa-5e12-b7aa-8848365e66d8'];
const visible = '8d771fc0-2914-57cc-90f1-9ab90f4611fd';
const ids = [...hidden, visible];
const existing = await db.from('clients').select('id').in('id',ids);
assert.ifError(existing.error); assert.equal(existing.data.length,0,'Do not overwrite existing fixtures');
async function get(path) {const r=await fetch('http://127.0.0.1:3101'+path); assert.equal(r.status,200); return r;}
const before = await (await get('/api/home')).json();
try {
  assert.ifError((await db.from('clients').insert(ids.map((id,i)=>({id,name:`AAA TEST Discovery ${i}`,status:'active',industry:'Synthetic QA',brain_architecture_version:'hospitality_restaurant_v2'})))).error);
  const home = await (await get('/api/home')).json();
  const nav = await (await get('/api/navigation')).json();
  const index = await (await get('/clients')).text();
  for(const id of hidden) {
    assert.ok(!home.clients.some(c=>c.id===id));
    assert.ok(!JSON.stringify(nav).includes(id));
  }
  assert.ok(home.clients.some(c=>c.id===visible));
  assert.ok(JSON.stringify(nav).includes(visible));
  for(let i=0;i<3;i++) assert.ok(!index.includes(`AAA TEST Discovery ${i}`));
  assert.ok(index.includes('AAA TEST Discovery 3'));
  assert.deepEqual(home.money,before.money,'Discovery must not affect finance');
  const stored=await db.from('clients').select('id,status').in('id',ids);
  assert.ifError(stored.error); assert.equal(stored.data.length,4);
  assert.ok(stored.data.every(c=>c.status==='active'));
  await get('/clients/'+hidden[0]); // Historical deep link remains available.
  console.log('PASS: Home, navigation and client index exclusions; visible client retained; finance unchanged; hidden records and deep links preserved.');
} finally {
  assert.ifError((await db.from('clients').delete().in('id',ids)).error);
}

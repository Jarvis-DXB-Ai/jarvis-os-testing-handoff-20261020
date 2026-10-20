import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localTestConfig } from './isolated-home-config.mjs';
const keys = localTestConfig();
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY);
const id = n => `97777777-7777-4777-8777-${String(n).padStart(12,'0')}`;
const client = id(1), other = id(2), plan = id(3), empty = id(4);
async function save(table, rows) { assert.ifError((await db.from(table).upsert(rows)).error); }
await save('clients', [client,other].map((id,i)=>({id,name:`TEST Client Suite ${i+1}`,status:'active',industry:'Synthetic QA',brain_architecture_version:'hospitality_restaurant_v2'})));
await save('social_monthly_content_plans', [{id:plan,client_id:client,plan_month:'2026-09-01',status:'plan_ready',target_feed_count:15,is_current:true},{id:empty,client_id:client,plan_month:'2026-10-01',status:'draft',target_feed_count:15,is_current:true}]);
await save('social_monthly_content_plan_items', Array.from({length:15},(_,i)=>({id:id(10+i),client_id:client,monthly_plan_id:plan,position:i+1,subject:`TEST Post ${String(i+1).padStart(2,'0')}`,creative_concept:'Synthetic concept for isolated review.',planned_date:i===14?null:`2026-09-${String(28-i).padStart(2,'0')}`,date_fixed:i===0,pillar:i%2?'lifestyle':'food',production_method:'ai_photography',grid_role:i%2?'venue_breather':'hero_food',status:i<2?'blocked':i%2?'ready':'draft',missing_asset_note:i<2?`TEST blocker ${i+1}: needs the approved plated reference.`:'',grid_crop_behavior:'safe'})));
// A selected artifact points at an existing synthetic image; no provider runs.
const referenceFile = await db.from('client_brain_file_objects').select('id').eq('storage_bucket','thumbnails').eq('storage_path','qa/manual-studio/reference.png').single();
assert.ifError(referenceFile.error);
await save('social_monthly_plan_production_artifacts', {id:id(51),client_id:client,monthly_plan_id:plan,monthly_plan_item_id:id(12),version:1,status:'selected',is_selected:true,execution_mode:'dry_run',prompt_version:'synthetic-qa',package_hash:'synthetic-qa',file_object_id:referenceFile.data.id});
const origin = 'http://127.0.0.1:3101';
const previewPath = `/api/clients/${client}/monthly-plans/${plan}/items/${id(12)}/preview`;
const preview = await fetch(origin + previewPath);
assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/webp');
assert.match(preview.headers.get('cache-control'), /private/);
assert.ok((await preview.arrayBuffer()).byteLength <= 128*1024);
assert.equal((await fetch(origin + previewPath.replace(client,other))).status,404);
assert.equal((await fetch(origin + previewPath.replace(id(12),id(13)))).status,404);
assert.ifError((await db.from('social_monthly_plan_production_artifacts').update({status:'stale'}).eq('id',id(51))).error);
try { assert.equal((await fetch(origin + previewPath)).status,404); }
finally { assert.ifError((await db.from('social_monthly_plan_production_artifacts').update({status:'selected'}).eq('id',id(51))).error); }

const html = await (await fetch(`${origin}/clients/${client}/planner?plan=${plan}`)).text();
assert.ok(html.includes(previewPath));
assert.ok(html.includes('TEST Post 01') && html.includes('TEST Post 15'));
assert.ok(html.indexOf('Open item 1:') < html.indexOf('Open item 2:'));
assert.ok(html.includes(`item=${id(10)}`));
assert.ok(html.includes('approval will not clear'));
assert.ok(html.includes('TEST blocker 1: needs the approved plated reference.'));
const emptyHtml = await (await fetch(`${origin}/clients/${client}/planner?plan=${empty}`)).text();
assert.ok(!emptyHtml.includes('Feed grid'));
assert.ok(!emptyHtml.includes('Pillar mix'));
const otherHtml = await (await fetch(`${origin}/clients/${other}/planner?plan=${plan}`)).text();
assert.ok(!otherHtml.includes('TEST Post 01'));
// Exercise actual read / reference-order endpoints, on pre-existing synthetic Studio fixtures.
const studioClient = '0b8dd9fb-4914-5228-8166-ada22fde9ca9';
const session = '5b911048-a1f3-5611-a238-b26d5c65cfb9';
await save('ai_content_generations', [
  {id:id(60),client_id:studioClient,session_id:session,version:100,status:'generated',execution_mode:'dry_run',provider:'synthetic-fixture',model:'synthetic-fixture',prompt_version:'synthetic-qa',aspect_ratio:'4:5',prompt_text:'TEST ONLY: saved version prompt; no provider was called.',file_object_id:referenceFile.data.id},
  {id:id(61),client_id:studioClient,session_id:session,version:101,status:'failed',execution_mode:'dry_run',provider:'synthetic-fixture',model:'synthetic-fixture',prompt_version:'synthetic-qa',aspect_ratio:'4:5',prompt_text:'TEST ONLY: failed version prompt.',failure_reason:'TEST: synthetic failure, no provider was called.'},
]);
const studioUrl = `${origin}/api/clients/${studioClient}/ai-content/${session}`;
const detailResponse = await fetch(studioUrl);
assert.equal(detailResponse.status,200);
const detail = await detailResponse.json();
assert.equal(detail.references.length,6);
assert.ok(detail.generations.find(row=>row.id===id(60)).thumbnail_url.includes('/previews/'));
assert.ok(!detail.generations.find(row=>row.id===id(60)).image_url.includes('/display-previews/'));
for (const reference of detail.references) {
  assert.ok(reference.thumbnail_url?.includes('/previews/'), 'Display reference must be a derivative, never original fallback');
  const r = await fetch(new URL(reference.thumbnail_url,origin)); assert.equal(r.status,200); assert.ok((await r.arrayBuffer()).byteLength <= 128*1024);
}
const original = await db.storage.from('thumbnails').download('qa/manual-studio/reference.png');
assert.ifError(original.error);
const originalBytes = Buffer.from(await original.data.arrayBuffer());
const privatePreview = detail.references[0].thumbnail_url;
assert.equal((await fetch(new URL(privatePreview.replace(studioClient,other),origin))).status,404);
assert.equal((await fetch(new URL(privatePreview.replace(referenceFile.data.id,id(99)),origin))).status,404);
const ref=detail.references[0];
const change = async order => {const r=await fetch(`${studioUrl}/references/${ref.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference_order:order})}); assert.equal(r.status,200);return r.json();};
try { const changed=await change(2); assert.equal(changed.references[1].id,ref.id); }
finally { await change(1); }
const after = await db.storage.from('thumbnails').download('qa/manual-studio/reference.png');
assert.ifError(after.error); assert.ok(originalBytes.equals(Buffer.from(await after.data.arrayBuffer())));
const foreign = await fetch(`${origin}/clients/${other}/ai-content/studio?session=${session}`);
const foreignHtml = await foreign.text(); assert.ok(foreignHtml.includes('Session unavailable')); assert.ok(!foreignHtml.includes('TEST Manual prompt export'));
console.log('PASS: client-scoped plans, feed-position order, exact blockers, item handoff links, empty draft, private bounded Studio previews, real reference reorder + restore, unchanged original and foreign-session rejection.');
console.log(`Planner fixture: ${origin}/clients/${client}/planner?plan=${plan}`);
console.log(`Studio fixture: ${origin}/clients/${studioClient}/ai-content/studio?session=${session}`);

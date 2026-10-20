import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { localTestConfig } from './isolated-home-config.mjs';

const keys = localTestConfig();
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY);
// Exercise the legacy private-thumbnail route used by deliverables, not Brain V2 signing.
const bucket = 'thumbnails';
const listed = await db.storage.listBuckets();
assert.equal(listed.error, null, listed.error?.message);
const existing = listed.data.find(item => item.id === bucket);
if (existing) assert.equal(existing.public, false, 'QA thumbnails must remain private');
else {
  const created = await db.storage.createBucket(bucket, { public: false });
  assert.equal(created.error, null, created.error?.message);
}
const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
<rect width="400" height="500" fill="#183c37"/><circle cx="200" cy="200" r="120" fill="#e4b68b"/>
<rect x="55" y="325" width="290" height="100" rx="16" fill="#faf4e8"/>
<text x="200" y="365" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#183c37">SYNTHETIC QA IMAGE</text>
<text x="200" y="400" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#183c37">Private preview · 4:5</text></svg>`)).png().toBuffer();
const path = 'qa/design-integration/preview.png';
const upload = await db.storage.from(bucket).upload(path, image, { contentType: 'image/png', upsert: true });
assert.equal(upload.error, null, upload.error?.message);
// The browser data adapter rewrites this legacy URL to /api/owner-media/ before rendering.
const thumbnail = `${keys.API_URL}/storage/v1/object/public/${bucket}/${path}`;
async function save(table, rows) { const result = await db.from(table).upsert(rows); assert.equal(result.error, null, result.error?.message); }
const dept = '9e89435c-22f2-55c3-867c-95f281cd1c53';
const lead = '3671b532-072e-5d3a-9989-e03c8d8413e0';
const member = '2eaf1cb9-14d7-5cde-9cfb-894fc9017f2d';
const missing = 'f222601e-4e84-5c4f-a102-bd9ce42591ac';
const deliverable = '8fd62e9d-a38d-5ae1-af40-1f99a1cd8a77';
await save('agent_departments', [{ id: dept, slug: 'test-design-review', name: 'TEST Design Review', purpose: 'Synthetic integration QA only.', sort_order: 0 }]);
await save('agents', [{ id: lead, agent_name: 'TEST Review Lead' }, { id: member, agent_name: 'TEST Review Assistant' }, { id: missing, agent_name: 'TEST Missing Profile' }]);
await save('agent_organization_profiles', [{ agent_id: lead, department_id: dept, role_title: 'Review lead', operational_status: 'planned', purpose: 'Synthetic role for visual review.', responsibilities: ['Inspect fixture outputs'], boundaries: ['No provider execution'] }, { agent_id: member, department_id: dept, manager_agent_id: lead, role_title: 'Review assistant', operational_status: 'experimental', purpose: 'Exercise reporting links and selection.', responsibilities: ['Check template consistency'], boundaries: [] }]);
await save('deliverables', [{ id: deliverable, client_id: 'a7604343-92d7-56ec-bf35-b272cac7f8b7', title: 'TEST Deliverable — approved output and revision history', type: 'Post', platform: 'Instagram', status: 'In Progress', approval_status: 'not_started', assigned_agent: null, due_date: null }]);
await save('deliverable_assets', [
  { id: '199701f8-2625-5195-bbcf-60954a09bfed', deliverable_id: deliverable, name: 'TEST Final image', status: 'final', version: 2, thumbnail_url: thumbnail, file_url: thumbnail },
  { id: 'fa2634dc-509b-5d9c-86ba-adbc403b6408', deliverable_id: deliverable, name: 'TEST Failed candidate', status: 'failed', version: 1, thumbnail_url: null, file_url: null },
  { id: 'fa876975-53ea-53fe-a65f-dc9164cf459a', deliverable_id: deliverable, name: 'TEST Unavailable preview', status: 'draft', version: 1, thumbnail_url: thumbnail.replace('preview.png', 'missing.png'), file_url: null },
]);
await save('deliverable_copy', [{ id: '9f3f2be3-881e-5d0d-a2dc-85a232def889', deliverable_id: deliverable, copy_type: 'Caption', content: 'Synthetic caption for isolated visual review only.', status: 'active', version: 1 }]);
await save('deliverable_revisions', [{ id: '0071f19c-4881-5085-ad75-80334797afa4', deliverable_id: deliverable, note: 'TEST: compare the new output against the recorded reference.', requested_by: 'TEST Owner', status: 'open' }]);
await save('deliverable_activity', [{ id: '7544fefc-2ff8-5774-9a6d-779bfae2b560', deliverable_id: deliverable, actor: 'TEST Owner', action: 'fixture_created', summary: 'Isolated integration fixture; no production activity.' }]);
console.log('Retained isolated QA fixtures. Deliverable: ' + deliverable);

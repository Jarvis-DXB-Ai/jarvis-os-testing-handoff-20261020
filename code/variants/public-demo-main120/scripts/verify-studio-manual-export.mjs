import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { localTestConfig } from './isolated-home-config.mjs';
const keys = localTestConfig();
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY);
const id = n => `95555555-5555-4555-8555-${String(n).padStart(12,'0')}`;
const client = id(1), other = id(2), session = id(3), file = id(4);
async function save(table, rows) { assert.ifError((await db.from(table).upsert(rows)).error); }
await save('clients', [client,other].map((id,i)=>({id,name:`TEST Manual Studio ${i+1}`,status:'active',industry:'Synthetic QA',brain_architecture_version:'hospitality_restaurant_v2'})));
await save('ai_content_sessions', {id:session,client_id:client,title:'TEST Manual prompt export',creative_request:'Recreate the composition from Image 1 with foods from Images 2, 3, 4, drink from Image 5 and venue from Image 6.',aspect_ratio:'4:5',status:'active'});
const buckets = await db.storage.listBuckets(); assert.ifError(buckets.error);
if (!buckets.data.some(b=>b.id==='thumbnails')) assert.ifError((await db.storage.createBucket('thumbnails',{public:false})).error);
assert.equal((await db.storage.getBucket('thumbnails')).data.public,false);
const bytes = await sharp({create:{width:40,height:50,channels:3,background:'#1b5844'}}).png().toBuffer();
const path='qa/manual-studio/reference.png';
assert.ifError((await db.storage.from('thumbnails').upload(path,bytes,{upsert:true,contentType:'image/png'})).error);
await save('client_brain_file_objects',{id:file,storage_bucket:'thumbnails',storage_path:path,file_name:'TEST reference.png',file_type:'image/png',file_size_bytes:bytes.length});
const roles=['composition_inspiration','food_truth','food_truth','food_truth','drink_truth','venue_truth'];
const metadata=[{},...[1,2,3].map(n=>({asset_category:'food',dish_name:`TEST Dish ${n}`,visible_ingredients:['TEST ingredient A','TEST ingredient B'],serving_vessel:'TEST white plate'})),{asset_category:'drinks',drink_name:'TEST citrus drink',serving_vessel:'TEST tall glass'},{asset_category:'interiors',venue_zone:'TEST dining room',material_notes:'TEST dark wood'}];
for(let i=1;i<6;i++) {
 await save('client_brain_v2_records',{id:id(20+i),client_id:client,stable_key:`TEST-manual-${i}`,top_section:'assets',subsection:'library',record_type:'asset',knowledge_class:'asset',title:`TEST Asset ${i}`,status:'approved',metadata:metadata[i]});
 await save('client_brain_v2_record_files',{id:id(30+i),client_id:client,record_id:id(20+i),file_object_id:file,semantic_role:'truth_reference',approval_status:'approved',sort_order:0});
}
const refs=roles.map((role,i)=>({id:id(40+i),client_id:client,session_id:session,source_type:i?'client_brain_asset':'session_upload',source_record_id:i?id(20+i):null,file_object_id:file,display_name:i?`TEST Asset ${i}`:'TEST Inspiration',role,reference_order:i+1,source_metadata:metadata[i]}));
await save('ai_content_session_references',refs);
async function call(body={},scope=client) {
 const response=await fetch(`http://127.0.0.1:3101/api/clients/${scope}/ai-content/${session}/manual-prompt`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
}
async function counts() {
 const result=[];
 for(const table of ['ai_content_prompt_versions','ai_content_provider_requests','ai_content_generations']) {
  const r=await db.from(table).select('id',{count:'exact',head:true}).eq('client_id',client);assert.ifError(r.error);result.push(r.count);
 } return result;
}
const before=await counts();
const result=await call();assert.equal(result.status,200,JSON.stringify(result.data));
assert.equal(result.cache,'private, no-store');assert.equal(result.data.provider_called,false);
assert.deepEqual(result.data.references.map(r=>r.image_number),[1,2,3,4,5,6]);
assert.deepEqual(result.data.references.map(r=>r.role),roles);
assert.match(result.data.prompt,/TEST ingredient A/);assert.match(result.data.prompt,/IMAGE 6 — VENUE TRUTH/);
assert.equal((await fetch(result.data.references[0].thumbnail_url)).status,200);
assert.equal((await call({},other)).status,404);
assert.equal((await call({creative_request:''})).status,400);
assert.equal((await call({creative_request:'x'.repeat(10001)})).status,400);
assert.equal((await call({aspect_ratio:'wrong'})).status,400);
const edited=await call({creative_request:'TEST unsaved brief',correction:'TEST angle correction',aspect_ratio:'1:1'});
assert.equal(edited.status,200);assert.match(edited.data.prompt,/TEST unsaved brief/);assert.match(edited.data.prompt,/TEST angle correction/);
await save('ai_content_session_references',{...refs[0],role:'food_truth'});
assert.equal((await call()).status,409);
await save('ai_content_session_references',refs[0]);
await save('client_brain_v2_records',{id:id(21),client_id:client,stable_key:'TEST-manual-1',top_section:'assets',subsection:'library',record_type:'asset',knowledge_class:'asset',title:'TEST Asset 1',status:'archived',metadata:metadata[1]});
assert.equal((await call()).status,409);
assert.ifError((await db.from('client_brain_v2_records').update({status:'approved'}).eq('id',id(21)).eq('client_id',client)).error);
assert.deepEqual(await counts(),before,'Export must not write prompts, provider requests or generations');
// Synthetic persisted AI output verifies export handling without calling a model.
const promptId=id(80);
const snapshot=refs.map((r,i)=>({id:r.id,role:r.role,source_type:r.source_type,file_object_id:file,display_name:r.display_name,metadata:Object.fromEntries(Object.entries(metadata[i]).filter(([k])=>k!=='asset_category'))}));
await save('ai_content_prompt_versions',{id:promptId,client_id:client,session_id:session,version:1,status:'ready',execution_mode:'live',provider:'anthropic',model:'TEST synthetic only',prompt_version:'TEST fixture',user_brief:(await db.from('ai_content_sessions').select('creative_request').eq('id',session).single()).data.creative_request,generated_prompt:'TEST saved AI output; no model was called.',provider_prompt:'TEST saved AI output; no model was called.',structured_context:{reference_snapshot:snapshot},execution:{aspect_ratio:'4:5',provider_called:false}});
try {
 const ai=await call({prompt_id:promptId});assert.equal(ai.status,200,JSON.stringify(ai.data));
 assert.equal(ai.data.mode,'creative_director');assert.equal(ai.data.prompt,'TEST saved AI output; no model was called.');
 assert.equal(ai.data.provider_called,false);assert.ok(ai.data.metadata_gaps.some(gap=>gap.startsWith('Image 5:')));
 assert.equal((await call({prompt_id:promptId,creative_request:'Changed brief'})).status,409);
 assert.equal((await call({prompt_id:promptId,aspect_ratio:'1:1'})).status,409);
 assert.ifError((await db.from('ai_content_session_references').update({reference_order:7}).eq('id',refs[0].id)).error);
 assert.equal((await call({prompt_id:promptId})).status,409);
 await save('ai_content_session_references',refs[0]);
} finally { assert.ifError((await db.from('ai_content_prompt_versions').delete().eq('id',promptId).eq('client_id',client)).error); }
assert.deepEqual(await counts(),before);
console.log('PASS: saved AI prompt export, metadata gap warnings, changed brief/ratio/order rejection. No provider call; synthetic prompt row removed.');
console.log('PASS: six ordered images, ingredient arrays, signed image access, tenant rejection, input bounds, unsaved brief, truth firewall, archived asset rejection and no generation/provider/prompt writes.');
console.log(`Retained synthetic preview: http://127.0.0.1:3101/clients/${client}/ai-content/studio?legacy=1`);

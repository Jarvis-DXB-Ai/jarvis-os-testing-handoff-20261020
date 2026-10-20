import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { localTestConfig } from './isolated-home-config.mjs';
const keys = localTestConfig();
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY);
const id = n => `96666666-6666-4666-8666-${String(n).padStart(12,'0')}`;
const client = id(1), other = id(2), empty = id(3), unsupported = id(4);
async function save(table, rows) { assert.ifError((await db.from(table).upsert(rows)).error); }
await save('clients',[client,other,empty,unsupported].map((value,i)=>({id:value,name:`TEST Assets r03 ${['Library','Other','Empty','Unsupported'][i]}`,status:'active',industry:'Synthetic QA',brain_architecture_version:i===3?'legacy_v1':'hospitality_restaurant_v2'})));
const bucket='thumbnails';
const buckets=await db.storage.listBuckets();assert.ifError(buckets.error);
if(!buckets.data.some(b=>b.id===bucket)) assert.ifError((await db.storage.createBucket(bucket,{public:false})).error);
assert.equal((await db.storage.getBucket(bucket)).data.public,false);
const bytes=await sharp({create:{width:400,height:500,channels:3,background:'#265744'}}).png().toBuffer();
const path='qa/assets-r03/preview.png';
assert.ifError((await db.storage.from(bucket).upload(path,bytes,{upsert:true,contentType:'image/png'})).error);
await save('client_brain_file_objects',[{id:id(10),storage_bucket:bucket,storage_path:'qa/assets-r03/original-unavailable.png',optimized_path:'qa/assets-r03/optimized-unavailable.png',preview_path:path,file_name:'TEST Private preview.png',file_type:'image/png',file_size_bytes:bytes.length},{id:id(11),storage_bucket:bucket,storage_path:'qa/assets-r03/missing.png',file_name:'TEST Missing object.png',file_type:'image/png'}]);
const cases=[
 ['Approved dish','food','truth_reference','approved',true],
 ['Dish pending file approval','food','truth_reference','draft',true],
 ['Staff without generation permission','staff','truth_reference','draft',false],
 ['Generated food direction','food','generated_asset','approved',true],
 ['Composition reference','interiors','creative_reference','approved',false],
 ['Unclassified raw upload','unclassified','raw_asset','needs_review',false],
 ['No file attached','food',null,null,false],
 ['Missing preview object','drinks','truth_reference','approved',true],
 ['Approved record with restricted file','food','truth_reference','restricted',true],
];
for(const [i,[title,category,role,approval,approved]] of cases.entries()) {
 await save('client_brain_v2_records',{id:id(20+i),client_id:client,stable_key:`TEST-assets-r03-${i}`,top_section:'assets',subsection:'library',record_type:'asset',knowledge_class:'asset',title:`TEST ${title}`,status:'approved',metadata:{asset_category:category,asset_category_source:'human_confirmed',dish_name:'TEST Dish',drink_name:'TEST Drink',key_visual_details:'TEST visible walls',approved_for_generation:approved}});
 if(role) await save('client_brain_v2_record_files',{id:id(40+i),client_id:client,record_id:id(20+i),file_object_id:id(i===7?11:10),semantic_role:role,approval_status:approval,sort_order:0});
}
await save('client_brain_v2_records',[{id:id(70),client_id:client,stable_key:'TEST-assets-archived',top_section:'assets',subsection:'library',record_type:'asset',knowledge_class:'asset',title:'TEST Archived',status:'archived'}, {id:id(71),client_id:other,stable_key:'TEST-assets-other',top_section:'assets',subsection:'library',record_type:'asset',knowledge_class:'asset',title:'TEST Other tenant',status:'approved'}]);
await save('client_brain_pinterest_inspirations',['pending','failed'].map((state,i)=>({id:id(80+i),client_id:client,file_object_id:id(10+i),title:`TEST Inspiration ${state}`,status:'needs_review',analysis_state:state})));
async function call(suffix,scope=client,body) {
 const response=await fetch(`http://127.0.0.1:3101/api/clients/${scope}/brain-v2/assets/${suffix}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
const list=await call('library');assert.equal(list.status,200,JSON.stringify(list.body));
assert.equal(list.cache,'private, no-store');
const library=list.body;
assert.equal(library.records.length,9);assert.equal(library.inspirations.length,2);
assert.equal(library.records.some(r=>[id(70),id(71)].includes(r.id)),false);
assert.equal(library.records.find(r=>r.id===id(28)).status,'approved');
assert.equal(library.records.find(r=>r.id===id(28)).files[0].approval_status,'restricted');
assert.equal((await call('library',empty)).body.records.length,0);
assert.equal((await call('library',empty)).body.supported,true);
assert.equal((await call('library',unsupported)).body.supported,false);
assert.equal((await call(id(20),other)).status,404);
const detail=await call(id(20));assert.equal(detail.status,200);assert.match(new URL(detail.body.record.files[0].signed_url).pathname,/display-previews\/v1\//,'Browser detail also uses the display derivative');
assert.equal(detail.body.record.files[0].storage_path,'qa/assets-r03/original-unavailable.png','Source identity remains unchanged');
const thumbs=await call('thumbnails',client,{assetIds:[id(20),id(26),id(27),id(71)]});
assert.equal(thumbs.status,200);assert.equal(thumbs.cache,'private, no-store');
const urls=thumbs.body.thumbnailUrls;assert.ok(urls[id(20)]);assert.ok(!urls[id(26)]);assert.ok(!urls[id(71)]);
const url=new URL(urls[id(20)]);assert.match(url.pathname,/display-previews\/v1\//,'Only the display derivative is served');
const token=JSON.parse(Buffer.from(url.searchParams.get('token').split('.')[1],'base64url').toString());assert.equal(token.exp-token.iat,1800);
const image=await fetch(url);assert.equal(image.status,200);const previewBytes=Buffer.from(await image.arrayBuffer());const previewInfo=await sharp(previewBytes).metadata();assert.equal(previewInfo.format,'webp');assert.ok(previewInfo.width<=640 && previewInfo.height<=640);assert.ok(previewBytes.length<=128*1024);assert.deepEqual(Buffer.from(await (await db.storage.from(bucket).download(path)).data.arrayBuffer()),bytes,'Existing source is untouched');
assert.notEqual((await fetch(`${keys.API_URL}/storage/v1/object/public/${bucket}/${path}`)).status,200);
if(urls[id(27)]) assert.notEqual((await fetch(urls[id(27)])).status,200);
assert.equal((await call('thumbnails',client,{assetIds:Array.from({length:49},(_,i)=>id(100+i))})).status,400);
// Storage expiry is tested using a short-lived grant, not a claim that 30 minutes elapsed.
const short=await db.storage.from(bucket).createSignedUrl(path,1);assert.ifError(short.error);
await new Promise(resolve=>setTimeout(resolve,2500));
assert.notEqual((await fetch(short.data.signedUrl)).status,200);
const refreshed=await call('thumbnails',client,{assetIds:[id(20)]});assert.equal((await fetch(refreshed.body.thumbnailUrls[id(20)])).status,200);
console.log('PASS: 9 records, pending/failed inspiration, archived exclusion, tenant isolation, independent approvals, empty/unsupported, private bounded display derivative from preview source, 1800-second TTL, expired short grant rejection, refresh, and 48-ID bound.');
console.log(`Retained local QA: http://127.0.0.1:3101/clients/${client}/brain/assets`);

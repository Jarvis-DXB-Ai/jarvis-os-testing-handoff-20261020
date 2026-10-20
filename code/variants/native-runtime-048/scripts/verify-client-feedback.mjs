import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig} from './isolated-home-config.mjs';
const keys=localTestConfig(),db=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY);
for(const name of ['client-assets','social-content']) { const found=await db.storage.getBucket(name);if(!found.data)assert.ifError((await db.storage.createBucket(name,{public:false})).error); }
if(existsSync('/tmp/jarvis-client-feedback-fixture.json')) {const old=JSON.parse(readFileSync('/tmp/jarvis-client-feedback-fixture.json','utf8'));assert.ifError((await db.from('clients').delete().in('id',[old.id,old.other]).like('name','TEST Profile%')).error);if(old.paths?.length)await db.storage.from('client-assets').remove([...old.paths,`${old.id}/profile/cover.json`,`${old.id}/profile/avatar.json`]);await db.storage.from('social-content').remove([old.mediaPath||`${old.id}/test-social.png`]);await db.storage.from('client-assets').remove([`social-thumbnails/instagram/${old.id}.jpg`]);}
const origin='http://127.0.0.1:3101',id=randomUUID(),other=randomUUID(),month=randomUUID(),snapshot=randomUUID();
const save=async(table,rows)=>assert.ifError((await db.from(table).insert(rows)).error);
await save('clients',[{id,name:'TEST Profile & Social',status:'active',industry:'Synthetic QA',brain_architecture_version:'hospitality_restaurant_v2'},{id:other,name:'TEST Profile Other',status:'active',brain_architecture_version:'hospitality_restaurant_v2'}]);
const image=await sharp({create:{width:1400,height:1000,channels:3,background:'#345349'}}).png().toBuffer();
const changed=await sharp({create:{width:1400,height:1000,channels:3,background:'#625545'}}).png().toBuffer();
const paths=[];
writeFileSync('/tmp/jarvis-client-feedback-fixture.json',JSON.stringify({id,other,paths}));
async function upload(slot,bytes) {const body=new FormData();body.set('file',new File([bytes],'test.png',{type:'image/png'}));const r=await fetch(`${origin}/api/clients/${id}/profile-image?slot=${slot}`,{method:'POST',body});const payload=await r.json();return {r,payload};}
for(const [slot,bytes] of [['cover',image],['avatar',image],['cover',changed]]) {
 const {r,payload}=await upload(slot,bytes);assert.equal(r.status,200,JSON.stringify(payload));
 const revision=new URL(payload.url,origin).searchParams.get('v');
 paths.push(`${id}/profile/${slot}/${revision}/original`,`${id}/profile/${slot}/${revision}/preview.webp`);
 writeFileSync('/tmp/jarvis-client-feedback-fixture.json',JSON.stringify({id,other,paths}));
 const original=await db.storage.from('client-assets').download(paths.at(-2));assert.ifError(original.error);assert.ok(Buffer.from(await original.data.arrayBuffer()).equals(bytes));
 const preview=await fetch(origin+payload.url);assert.equal(preview.status,200);assert.match(preview.headers.get('cache-control'),/private/);const previewBytes=Buffer.from(await preview.arrayBuffer());assert.ok(previewBytes.length<=128*1024);const info=await sharp(previewBytes).metadata();assert.ok(info.width<=640&&info.height<=640);const expected=await sharp(bytes).stats(),actual=await sharp(previewBytes).stats();assert.ok(Math.abs(expected.channels[0].mean-actual.channels[0].mean)<5,'Replacement preview must reflect the latest upload');
 assert.equal((await fetch(origin+payload.url.replace(id,other))).status,404);
}
const bad=await upload('cover',Buffer.from('Not an image'));assert.equal(bad.r.status,400);
assert.equal((await fetch(`${origin}/api/clients/${id}/profile-image?slot=cover`)).status,200);
await save('social_performance_snapshots',[{id:snapshot,client_id:id,provider:'zernio',platform:'instagram',provider_account_id:'TEST',period_key:'current_30d',period_start:'2026-08-07',period_end:'2026-09-06',followers:12500,post_reach:43000,views:85000,engagements:1500,synced_at:new Date().toISOString()},{id:randomUUID(),synced_at:new Date().toISOString(),client_id:id,provider:'zernio',platform:'instagram',provider_account_id:'TEST',period_key:'previous_30d',period_start:'2026-07-08',period_end:'2026-08-06',followers:12000,post_reach:50000,views:80000,engagements:1300}]);
await save('social_performance_post_observations',Array.from({length:3},(_,i)=>({client_id:id,snapshot_id:snapshot,provider:'zernio',platform:'instagram',provider_post_id:`TEST-${i}`,post_type:'feed',published_at:'2026-09-01',title:`TEST Post ${i+1}`,reach:900+i*100,likes:124,comments:7,shares:i?4:null,saves:12,views:1500,native_metrics:{average_watch_time:3.5},observed_at:new Date().toISOString()})));
await save('social_audience_snapshots',{client_id:id,provider:'zernio',provider_account_id:'TEST',period_start:'2026-08-07',period_end:'2026-09-06',top_cities:[{label:'Dubai',count:100,percent:64.51612903225806},{label:'Abu Dhabi',count:30,percent:19.35483870967742}],top_countries:[{label:'United Arab Emirates',count:150,percent:96.7741935483871}],age_distribution:[{label:'25–34',count:80,percent:51.61290322580645}],gender_distribution:[{label:'Female',count:85,percent:54.83870967741936}],fetched_at:new Date().toISOString()});
await save('social_content_months',{id:month,client_id:id,month_start:'2026-09-01'});
const thumbPath=`social-thumbnails/instagram/${id}.jpg`;assert.ifError((await db.storage.from('client-assets').upload(thumbPath,await sharp(image).resize(400,500).jpeg({quality:60}).toBuffer(),{contentType:'image/jpeg'})).error);assert.ifError((await db.from('social_performance_post_observations').update({thumbnail_path:thumbPath}).eq('client_id',id)).error);
const posts=Array.from({length:7},(_,i)=>({id:randomUUID(),client_id:id,social_content_month_id:month,content_kind:i===6?'story':'feed',format:i===6?'story':'feed',title:`TEST Upcoming ${i+1}`,sequence:i+1,status:'Approved',scheduled_date:`2026-09-${String(10+i).padStart(2,'0')}`,scheduled_time:'18:00:00'}));await save('social_content_items',posts);
const placementIds=[randomUUID(),randomUUID()];
await save('social_story_placements',placementIds.map((placementId,i)=>({id:placementId,client_id:id,social_content_month_id:month,social_content_item_id:posts[6].id,scheduled_date:`2026-09-${16+i*7}`,scheduled_time:'18:00:00',scheduled_at:`2026-09-${16+i*7}T14:00:00Z`,sequence:i+1,status:'Approved'})));
const plannerHtml=await (await fetch(`${origin}/clients/${id}/planner`)).text();
for(const placementId of placementIds)assert.ok(plannerHtml.includes(placementId),'Calendar must retain each Story occurrence');
const mediaPath=`${id}/test-social.png`;assert.ifError((await db.storage.from('social-content').upload(mediaPath,image,{contentType:'image/png'})).error);
await save('social_content_media',posts.map(p=>({client_id:id,social_content_item_id:p.id,storage_bucket:'social-content',storage_path:mediaPath,file_name:'test.png',mime_type:'image/png',byte_size:image.length,sort_order:1})));
const preview=await fetch(`${origin}/api/clients/${id}/content/${posts[0].id}/preview`);assert.equal(preview.status,200);assert.ok((await preview.arrayBuffer()).byteLength<=128*1024);assert.equal((await fetch(`${origin}/api/clients/${other}/content/${posts[0].id}/preview`)).status,404);
const overview=await (await fetch(`${origin}/api/clients/${id}/overview?view=summary`)).json();assert.equal(overview.overview.upcoming.length,7);assert.equal(overview.overview.performance.topPost.likes,124);assert.ok(overview.overview.upcoming[0].thumbnailUrl.includes('/preview'));
writeFileSync('/tmp/jarvis-client-feedback-fixture.json',JSON.stringify({id,other,paths,mediaPath}));
console.log('PASS: cover/avatar upload and replacement, original byte preservation, bounded private previews, invalid-image rejection with previous image retained, cross-client preview isolation, top-post engagement fields and upcoming previews.');
console.log(`${origin}/clients/${id}`);

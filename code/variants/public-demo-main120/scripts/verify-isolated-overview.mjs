import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localTestConfig } from './isolated-home-config.mjs';
const config=localTestConfig();
const db=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const clientId=randomUUID(), otherId=randomUUID(), monthId=randomUUID();
const month=new Date().toISOString().slice(0,7)+'-01';
async function insert(table,rows) { const r=await db.from(table).insert(rows); assert.ifError(r.error); }
async function overview(id) {
 const r=await fetch(`http://127.0.0.1:3101/api/clients/${id}/overview`);const body=await r.json();
 assert.equal(r.status,200,JSON.stringify(body));return body.overview;
}
try {
 await insert('clients',[{id:clientId,name:'TEST Overview counts'},{id:otherId,name:'TEST Overview other tenant'}]);
 await insert('client_brain_v2_records',Array.from({length:9},(_,i)=>({client_id:clientId,stable_key:`TEST-gap-${i}`,top_section:'intelligence',subsection:'knowledge_gaps',record_type:'knowledge_gap',knowledge_class:'knowledge_gap',title:`TEST Gap ${i}`,status:i===8?'archived':i===7?'resolved':'needs_review',priority:3})));
 await insert('client_brain_v2_records',{client_id:otherId,stable_key:'TEST-other',top_section:'intelligence',subsection:'knowledge_gaps',record_type:'knowledge_gap',knowledge_class:'knowledge_gap',title:'TEST other tenant gap',status:'active'});
 await insert('social_content_months',{id:monthId,client_id:clientId,month_start:month});
 await insert('social_content_items',Array.from({length:130},(_,i)=>({client_id:clientId,social_content_month_id:monthId,content_kind:'feed',format:'feed',title:`TEST Post ${i}`,sequence:i+1,scheduled_date:month,status:i<120?'Draft':i<128?'Published':'Failed'})));
 const snapshotId=randomUUID(),oldSnapshotId=randomUUID();
 await insert('social_performance_snapshots',[
  {id:snapshotId,client_id:clientId,provider:'zernio',platform:'instagram',provider_account_id:'TEST',period_key:'current_30d',period_start:month,period_end:month,synced_at:new Date().toISOString()},
  {id:oldSnapshotId,client_id:clientId,provider:'zernio',platform:'instagram',provider_account_id:'TEST',period_key:'current_30d',period_start:'2020-01-01',period_end:'2020-01-30',synced_at:'2020-02-01T00:00:00Z'},
 ]);
 await insert('social_performance_post_observations',[
  ...[10,20,30,40,50,120].map((reach,i)=>({snapshot_id:snapshotId,client_id:clientId,provider:'zernio',platform:'instagram',provider_post_id:`TEST-${i}`,published_at:month,post_type:'feed',title:`TEST observed ${i}`,reach,observed_at:new Date().toISOString()})),
  {snapshot_id:oldSnapshotId,client_id:clientId,provider:'zernio',platform:'instagram',provider_post_id:'TEST-old-outlier',published_at:'2020-01-10',post_type:'feed',title:'TEST old outlier',reach:99999,observed_at:'2020-02-01T00:00:00Z'},
 ]);
 const data=await overview(clientId);
 assert.equal(data.brain.recordCount,8);assert.equal(data.brain.openGapCount,7);assert.equal(data.brainGaps.length,4);
 assert.equal(data.pipeline.published.count,8);assert.equal(data.pipeline.published.failed,2);assert.equal(data.pulse.monthStart,month);
 assert.equal(data.performance.topPost.reach,120);assert.equal(data.performance.topPost.reachVsMedian,120/35);
 assert.deepEqual(data.performance.topPost,data.performance.topPosts[0]);
 const other=await overview(otherId);
 assert.equal(other.brain.recordCount,1);assert.equal(other.brain.openGapCount,1);
 assert.equal(other.pipeline.published.count,0);assert.equal(other.socialPerformance.instagram,null);
 assert.equal(other.performance.topPost,null);
 console.log('PASS: exact Brain totals vs preview, tenant isolation, 120+ publishing counts, latest snapshot scope, even median and consistent top post.');
} finally {
 // Delete only the two synthetic clients created by this test (FK cascade).
 const {error}=await db.from('clients').delete().in('id',[clientId,otherId]);assert.ifError(error);
}

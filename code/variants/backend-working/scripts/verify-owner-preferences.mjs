import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig} from './isolated-home-config.mjs';
const config=localTestConfig();
const db=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const clientId=randomUUID(),monthId=randomUUID(),itemId=randomUUID(),recordId=randomUUID();
const dedupe=`client-review:${clientId}`,sourceKey=`social-content:${itemId}:Ready for Review`;
const month=new Date().toISOString().slice(0,7)+'-01';
async function insert(table,value){assert.ifError((await db.from(table).insert(value)).error);}
async function home(){const r=await fetch('http://127.0.0.1:3101/api/home');assert.equal(r.status,200);return r.json();}
async function post(path,value){return fetch('http://127.0.0.1:3101/api/home/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});}
try{
 await insert('clients',{id:clientId,name:'TEST owner preferences'});
 await insert('client_brain_v2_records',{id:recordId,client_id:clientId,stable_key:'TEST-preferences',top_section:'intelligence',subsection:'knowledge_gaps',record_type:'knowledge_gap',knowledge_class:'knowledge_gap',title:'TEST needs review',status:'needs_review',priority:3});
 await insert('social_content_months',{id:monthId,client_id:clientId,month_start:month});
 await insert('social_content_items',{id:itemId,client_id:clientId,social_content_month_id:monthId,content_kind:'feed',format:'feed',title:'TEST notification',status:'Ready for Review'});
 let snapshot=await home();const suggestion=snapshot.suggestions.find(s=>s.dedupeIdentity===dedupe);assert.ok(suggestion);
 await insert('home_owner_suggestion_dismissals',{owner_id:'TEST-other-owner',dedupe_identity:dedupe,evidence_hash:suggestion.evidenceHash});
 await insert('home_owner_notification_reads',{owner_id:'TEST-other-owner',source_key:sourceKey});
 snapshot=await home();assert.ok(snapshot.suggestions.some(s=>s.id===suggestion.id));assert.equal(snapshot.notifications.find(n=>n.sourceKey===sourceKey).isUnread,true);
 assert.equal((await post('suggestions',{action:'dismiss',dedupeIdentity:dedupe,evidenceHash:suggestion.evidenceHash})).status,200);
 assert.equal((await home()).suggestions.some(s=>s.id===suggestion.id),false);
 const {data:stored,error}=await db.from('home_owner_suggestion_dismissals').select('*').eq('owner_id','isolated-owner').eq('dedupe_identity',dedupe).single();assert.ifError(error);
 assert.equal(Date.parse(stored.expires_at)-Date.parse(stored.dismissed_at),86400000);
 assert.ifError((await db.from('home_owner_suggestion_dismissals').update({dismissed_at:new Date(Date.now()-2*86400000).toISOString(),expires_at:new Date(Date.now()-86400000).toISOString()}).eq('owner_id','isolated-owner').eq('dedupe_identity',dedupe)).error);
 assert.ok((await home()).suggestions.some(s=>s.id===suggestion.id),'Expired dismissal must resurface');
 assert.equal((await post('suggestions',{action:'dismiss',dedupeIdentity:dedupe,evidenceHash:suggestion.evidenceHash})).status,200);
 assert.ifError((await db.from('client_brain_v2_records').update({title:'TEST changed evidence'}).eq('id',recordId)).error);
 assert.ok((await home()).suggestions.some(s=>s.dedupeIdentity===dedupe && s.evidenceHash!==suggestion.evidenceHash),'Changed evidence bypasses prior dismissal');
 assert.equal((await post('notifications',{action:'mark_read',sourceKeys:[sourceKey]})).status,200);
 assert.equal((await home()).notifications.find(n=>n.sourceKey===sourceKey).isUnread,false);
 assert.equal((await post('notifications',{action:'mark_read',sourceKeys:['TEST unknown source']})).status,409);
 console.log('PASS: owner-scoped read state, persisted 24-hour dismissal, expiry, changed evidence and stale notification checks.');
} finally{
 assert.ifError((await db.from('home_owner_suggestion_dismissals').delete().eq('dedupe_identity',dedupe)).error);
 assert.ifError((await db.from('home_owner_notification_reads').delete().eq('source_key',sourceKey)).error);
 assert.ifError((await db.from('clients').delete().eq('id',clientId)).error);
}
const source=await readFile(new URL('../src/lib/home-provider-health.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {providerSnapshotHealth:health}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now=Date.now();const connection={id:'one',client_id:'democlientb',platform:'instagram',status:'connected',provider_connection_id:'account',platform_account_id:'platform'};
const snapshot={client_id:'democlientb',platform:'instagram',provider_account_id:'account',period_key:'current_30d',synced_at:new Date(now).toISOString()};
assert.equal(health([connection],[snapshot],now).state,'ok');
assert.equal(health([connection,{...connection,client_id:'future',status:'not_connected'}],[snapshot],now).state,'ok');
assert.equal(health([connection,{...connection,client_id:'second'}],[snapshot],now).state,'warn');
assert.equal(health([connection],[{...snapshot,synced_at:new Date(now-49*3600000).toISOString()}],now).state,'warn');
assert.equal(health([connection],[{...snapshot,provider_account_id:'wrong'}],now).state,'warn');
assert.equal(health([{...connection,status:'expired'}],[snapshot],now).state,'warn');
assert.match(health([],[],now).note,/not applicable/);
console.log('PASS: provider freshness respects connected accounts; unrelated clients and snapshots cannot distort health.');

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire,Module} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig,localAppEnvironment} from './isolated-home-config.mjs';
const config=localTestConfig();Object.assign(process.env,localAppEnvironment(config));
const require=createRequire(import.meta.url),oldResolve=Module._resolveFilename,oldLoad=Module._load;
Module._resolveFilename=function(name,...args){if(name.startsWith('@/')){const base=resolve('src',name.slice(2));name=[base+'.ts',base+'.tsx'].find(existsSync)||base;}return oldResolve.call(this,name,...args);};
Module._load=function(name,...args){if(name==='server-only')return {};return oldLoad.call(this,name,...args);};
Module._extensions['.ts']=function(module,path){module._compile(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,path);};
const db=createClient(config.API_URL,config.SERVICE_ROLE_KEY),a=randomUUID(),b=randomUUID(),ma=randomUUID(),mb=randomUUID(),plan=randomUUID(),idea=randomUUID(),post=randomUUID(),story=randomUUID(),snapshot=randomUUID(),facebookSnapshot=randomUUID(),latestSnapshot=randomUUID();
const save=async(table,rows)=>assert.ifError((await db.from(table).insert(rows)).error);
const realFetch=globalThis.fetch;let reading=false,reads=0;
globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55421');if(reading){assert.equal(init?.method??'GET','GET','Overview may only read records');reads++;}return realFetch(input,init);};
try{
 await save('clients',[{id:a,name:'TEST Company schedule A',status:'active'},{id:b,name:'TEST Company schedule B',status:'archived'}]);
 await save('social_content_months',[{id:ma,client_id:a,month_start:'2026-09-01'},{id:mb,client_id:b,month_start:'2026-09-01'}]);
 await save('social_monthly_content_plans',{id:plan,client_id:a,plan_month:'2026-09-01',status:'draft',is_current:true});
 await save('social_monthly_content_plan_items',{id:idea,client_id:a,monthly_plan_id:plan,position:1,subject:'TEST linked idea',status:'draft'});
 await save('social_content_items',[{id:post,client_id:a,social_content_month_id:ma,title:'TEST linked post',content_kind:'feed',format:'feed',status:'Published',scheduled_date:'2026-09-02',scheduled_time:'12:30:00',content_context:{lineage:{monthlyPlanItemId:idea}}},{id:story,client_id:a,social_content_month_id:ma,title:'TEST repeated Story',content_kind:'story',format:'story',status:'Approved',content_context:{}}]);
 await save('social_story_placements',[8,15].map((day,i)=>({client_id:a,social_content_month_id:ma,social_content_item_id:story,scheduled_date:`2026-09-${String(day).padStart(2,'0')}`,scheduled_time:'17:00:00',scheduled_at:`2026-09-${String(day).padStart(2,'0')}T13:00:00Z`,status:i?'Scheduled':'Published',sequence:i+1})));
 // Cross the default 1,000-row database page size.
 await save('social_content_items',Array.from({length:1005},(_,i)=>({client_id:b,social_content_month_id:mb,content_kind:'feed',format:'feed',title:`TEST B ${i}`,sequence:i+1,status:'Draft'})));
 await save('social_content_platform_targets',{client_id:a,social_content_item_id:post,platform:'instagram',status:'Published',external_post_id:'TEST-linked-external',selected:true});
 await save('social_performance_snapshots',[snapshot,facebookSnapshot,latestSnapshot].map((id,i)=>({id,client_id:a,provider:'zernio',platform:i===1?'facebook':'instagram',provider_account_id:'TEST',period_key:i===2?'previous_30d':'current_30d',period_start:i===2?'2026-08-01':'2026-09-01',period_end:i===2?'2026-08-31':'2026-09-30'})));
 await save('social_performance_post_observations',[{client_id:a,snapshot_id:snapshot,provider:'zernio',platform:'instagram',provider_post_id:'TEST-linked-external',post_type:'feed',published_at:'2026-09-02',observed_at:'2026-09-03'},...['2026-09-04','2026-09-05'].map((observed_at,i)=>({client_id:a,snapshot_id:i?snapshot:facebookSnapshot,provider:'zernio',platform:i?'instagram':'facebook',provider_post_id:'TEST-unlinked-external',post_type:'feed',title:`TEST external ${i}`,published_at:'2026-09-03T21:30:00Z',observed_at}))]);
 await save('social_performance_post_observations',{client_id:a,snapshot_id:latestSnapshot,provider:'zernio',platform:'instagram',provider_post_id:'TEST-unlinked-external',post_type:'feed',title:'TEST latest observation',published_at:'2026-09-03T21:30:00Z',observed_at:'2026-09-06'});
 const {loadAgencyContentData}=require('../src/lib/agency-content-server.ts');const {scheduleSection}=require('../src/lib/agency-content.ts');reading=true;const data=await loadAgencyContentData();reading=false;
 assert.ok(reads>=11);assert.equal(data.clients.find(c=>c.id===b).hidden,true);assert.equal(data.items.filter(i=>i.clientId===b).length,1005);
 assert.equal(data.items.filter(i=>i.clientId===a&&i.source==='planner').length,0);assert.equal(data.items.filter(i=>i.title==='TEST repeated Story').length,2);assert.equal(data.items.filter(i=>i.clientId===a&&i.source==='observed').length,2);
 assert.equal(data.items.find(i=>i.clientId===a&&i.source==='observed'&&i.platforms[0].name==='instagram').title,'TEST latest observation');
 assert.ok(data.items.filter(i=>i.source==='observed'&&i.clientId===a).every(i=>i.date==='2026-09-04'&&i.time==='01:30'));
 const published=data.items.find(i=>i.id===`publishing:${post}`);assert.equal(scheduleSection(published,'2026-09-06'),'past');assert.equal(published.time,'12:30');assert.equal(published.platforms[0].status,'Published');
 assert.equal(scheduleSection({date:null},'2026-09-06'),'undated');
 console.log('PASS: read-only loader, cross-client recap, archive visibility, 1,000+ rows, linked-plan/post dedupe, cached-post dedupe, repeated Story dates, real states and Dubai date rollover.');
}finally{reading=false;globalThis.fetch=realFetch;assert.ifError((await db.from('clients').delete().in('id',[a,b])).error);}

import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig} from './isolated-home-config.mjs';
const keys=localTestConfig();
const db=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY);
const client=randomUUID(),other=randomUUID(),source=randomUUID(),month=randomUUID(),item=randomUUID();
const content='TEST writing guide. Synthetic source only.';
const snapshot={version:'v1',status:'approved_for_captions',scope:'caption_style_only',document_sha256:createHash('sha256').update(content).digest('hex'),rules:{core_voice:'TEST warm voice',structure_length:'Flexible short paragraphs.'},examples:['TEST distinctive first line.']};
async function insert(table,value){assert.ifError((await db.from(table).insert(value)).error);}
async function call(){const r=await fetch('http://127.0.0.1:3101/api/social/publishing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate_offline_captions',clientId:client,itemId:item})});return {status:r.status,data:await r.json()};}
async function generations(){const r=await db.from('social_caption_generations').select('*').eq('client_id',client);assert.ifError(r.error);return r.data;}
try {
 await insert('clients',[{id:client,name:'TEST Writing Guide',status:'active',brain_architecture_version:'hospitality_restaurant_v2'},{id:other,name:'TEST Other Guide Client',status:'active',brain_architecture_version:'hospitality_restaurant_v2'}]);
 await insert('client_brain_v2_records',{id:source,client_id:client,stable_key:'test:writing-guide',top_section:'sources',subsection:'library',record_type:'source',knowledge_class:'source',title:'TEST writing guide',status:'current',content,metadata:{caption_writing_guide:snapshot}});
 await insert('social_caption_profiles',{client_id:client,footer:'TEST confirmed footer',fixed_hashtags:['#TEST'],caption_guidelines:{writing_guide_source_id:source,writing_guide_version:'v1'}});
 await insert('social_content_months',{id:month,client_id:client,month_start:'2026-09-01'});
 await insert('social_content_items',{id:item,client_id:client,social_content_month_id:month,content_kind:'feed',format:'feed',title:'TEST Caption Guide',content_context:{confirmed:{archetype:'food'}}});
 const result=await call();assert.equal(result.status,200,JSON.stringify(result));
 const rows=await generations();assert.equal(rows.length,1);const saved=rows[0];
 assert.equal(saved.provider,'offline-fixture');assert.equal(saved.cost,0);assert.equal(saved.input_tokens,0);
 assert.equal(saved.request_contract.input.writingGuide.recordId,source);assert.equal(saved.request_contract.input.writingGuide.version,'v1');
 assert.equal(saved.request_contract.input.writingGuide.rules.core_voice,'TEST warm voice');
 const options=await db.from('social_content_caption_options').select('rendered_caption').eq('client_id',client).eq('generation_id',saved.id);assert.ifError(options.error);assert.equal(options.data.length,5);assert.ok(options.data.every(x=>x.rendered_caption.includes('TEST confirmed footer')));
 const brandResponse=await fetch(`http://127.0.0.1:3101/api/clients/${client}/brain-v2?section=brand_guidelines`);
 const brand=await brandResponse.json();assert.equal(brandResponse.status,200,JSON.stringify(brand));
 const edit=brand.brandGuidelines.caption_intelligence.edit;
 const edited=await fetch(`http://127.0.0.1:3101/api/clients/${client}/brain-v2`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(edit)});
 assert.equal(edited.status,200,await edited.text());
 const configured=await db.from('social_caption_profiles').select('caption_guidelines').eq('client_id',client).single();assert.ifError(configured.error);
 assert.equal(configured.data.caption_guidelines.writing_guide_source_id,source);assert.equal(configured.data.caption_guidelines.writing_guide_version,'v1');
 assert.ifError((await db.from('client_brain_v2_records').update({content:content+' edited'}).eq('id',source).eq('client_id',client)).error);
 assert.equal((await call()).status,400);assert.equal((await generations()).length,1);
 const otherSource=randomUUID();
 await insert('client_brain_v2_records',{id:otherSource,client_id:other,stable_key:'test:other-writing-guide',top_section:'sources',subsection:'library',record_type:'source',knowledge_class:'source',title:'TEST other writing guide',status:'current',content,metadata:{caption_writing_guide:snapshot}});
 assert.ifError((await db.from('social_caption_profiles').update({caption_guidelines:{writing_guide_source_id:otherSource,writing_guide_version:'v1'}}).eq('client_id',client)).error);
 assert.equal((await call()).status,400);assert.equal((await generations()).length,1);
 console.log('PASS: existing HTTP generator loads a scoped guide, persists its snapshot and five fixture options, and rejects edited/cross-client guides without creating another generation. Provider calls: 0.');
} finally {
 assert.ifError((await db.from('clients').delete().in('id',[client,other]).like('name','TEST %Guide%')).error);
}

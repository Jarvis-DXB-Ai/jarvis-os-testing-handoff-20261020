import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const modules = new Map();
function load(path) {
  if(modules.has(path)) return modules.get(path);
  const output = {};
  modules.set(path,output);
  new Function('exports','require',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(output,name=>name.startsWith('@/')?load(`src/${name.slice(2)}.ts`):require(name));
  return output;
}
const {writingGuideSelection,resolveCaptionWritingGuide}=load('src/lib/caption-writing-guide.ts');
const {buildCaptionRequestContract,formatCaptionRequestPrompt,assembleCaption,assessCaptionOption,validateCaptionBatchQuality}=load('src/lib/social-publishing-caption.ts');
const {captionContextFrom}=load('src/lib/social-publishing-content-context.ts');
const id='a7604343-92d7-56ec-bf35-b272cac7f8b7';
const client='c8aef456-9613-5dd2-9a9e-2207708a7338';
const selection={id,version:'v1'};
const document='Fixture writing guide. Example: September pizza costs AED 99.';
const record=()=>({id,client_id:client,top_section:'sources',status:'current',superseded_by_id:null,updated_at:'2026-09-06T00:00:00Z',content:document,metadata:{caption_writing_guide:{version:'v1',status:'approved_for_captions',scope:'caption_style_only',document_sha256:createHash('sha256').update(document).digest('hex'),rules:{core_voice:'Warm and concrete.',structure_length:'Vary length naturally.',food:'Choose one verified culinary detail.',lifestyle_venue:'Make the occasion inviting.',activations:'Explain confirmed offer terms clearly.',drinks:'Use verified flavour detail.'},examples:['One bite and you’ll understand. 🍕']}}});
const profile=()=>({footer:'Verified booking footer',fixedHashtags:['#ClientFixed'],dynamicHashtagCount:2,toneOfVoice:'Existing voice',instructions:'Existing instruction',approvedPhrases:[],styleExamples:[],goldenCaptions:[],avoidPhrases:[],guidelines:{core_voice:'Legacy voice',food:'Legacy food',footer:'Canonical footer',hard_factual_guardrails:'Use verified facts.'}});
test('unconfigured clients keep existing behaviour; incomplete configuration fails',()=>{
 assert.equal(writingGuideSelection({}),null);
 for(const value of [{writing_guide_source_id:id},{writing_guide_version:'v1'},{writing_guide_source_id:'wrong',writing_guide_version:'v1'}]) assert.throws(()=>writingGuideSelection(value));
 assert.deepEqual(writingGuideSelection({writing_guide_source_id:id,writing_guide_version:'v1'}),selection);
});
test('missing, cross-client, inactive and superseded sources fail before prompt creation',()=>{
 for(const change of [null,{client_id:'other'},{id:'other'},{top_section:'assets'},{status:'needs_review'},{superseded_by_id:id}]) assert.throws(()=>resolveCaptionWritingGuide(client,selection,change===null?null:{...record(),...change}));
});
test('editing a document invalidates its reviewed snapshot; wrong version or scope fails',()=>{
 const base=record();
 assert.throws(()=>resolveCaptionWritingGuide(client,selection,{...base,content:document+' changed'}));
 for(const change of [{version:'v2'},{status:'draft'},{scope:'operations'},{document_sha256:'wrong'},{rules:{core_voice:'x'}},{examples:['x'.repeat(501)]}]) {
  const row=record(); Object.assign(row.metadata.caption_writing_guide,change);
  assert.throws(()=>resolveCaptionWritingGuide(client,selection,row));
 }
});
test('guide cannot override operational rules or add arbitrary prompt fields',()=>{
 for(const key of ['footer','hashtag_rules','hard_factual_guardrails','system']) {
  const row=record();row.metadata.caption_writing_guide.rules[key]='Changed';
  assert.throws(()=>resolveCaptionWritingGuide(client,selection,row));
 }
});
test('food, atmosphere and promotion requests use the guide and preserve factual isolation',()=>{
 const guide=resolveCaptionWritingGuide(client,selection,record());
 for(const [archetype,activation,key] of [['food',null,'food'],['lifestyle',null,'lifestyle_venue'],['promotion','Confirmed activation','activations']]) {
  const p={...profile(),writingGuide:guide};
  const context=captionContextFrom('feed',{confirmed:{archetype,activation}});
  const request=buildCaptionRequestContract({profile:p,context,visualCreativeContext:archetype==='food'?{foodVisible:['pasta']}:undefined});
  assert.equal(request.input.coreCaptionVoice.core_voice,'Warm and concrete.');
  assert.equal(request.input.postTypeSpecificRules[key],guide.rules[key]);
  assert.equal(request.input.hardClientFactsAndGuardrails.footer,'Canonical footer');
  assert.equal(JSON.stringify(request.input.verifiedContextPack).includes('AED 99'),false);
  assert.equal(formatCaptionRequestPrompt(request).includes(document),false);
  assert.equal(request.input.writingGuide.recordId,id);
  assert.equal(request.input.writingGuide.version,'v1');
  assert.match(request.input.writingGuide.snapshotSha256,/^[a-f0-9]{64}$/);
  assert.match(formatCaptionRequestPrompt(request),/STYLE ONLY/);
  assert.equal(request.providerRequestCount,1);assert.equal(request.noRetry,true);
  assert.equal(assembleCaption({body:'A sample body.'},p,context),assembleCaption({body:'A sample body.'},profile(),context));
 }
});
test('guide examples stay references and copied hooks require review',()=>{
 const p={...profile(),writingGuide:resolveCaptionWritingGuide(client,selection,record())};
 assert.equal(p.goldenCaptions.length,0);
 assert.ok(assessCaptionOption({body:'One bite and you will understand. 🍕\nA familiar thought for dinner.'},p).diagnostics.some(x=>x.code==='style_example_similarity'));
});
test('request retains its complete guide snapshot for later traceability',()=>{
 const guide=resolveCaptionWritingGuide(client,selection,record());
 const stored=JSON.parse(JSON.stringify(buildCaptionRequestContract({profile:{...profile(),writingGuide:guide},context:captionContextFrom('feed',{})})));
 guide.rules.core_voice='Later edit';
 assert.equal(stored.input.writingGuide.rules.core_voice,'Warm and concrete.');
 assert.equal(stored.input.writingGuide.sourceUpdatedAt,'2026-09-06T00:00:00Z');
});

test('selected guide permits natural short captions without compulsory emojis',()=>{
 const p={...profile(),writingGuide:resolveCaptionWritingGuide(client,selection,record())};
 const response={caption_options:['Dinner is calling.','Take another bite.','Meet us here.','Sharing seems fair.','Time for company.'].map(body=>({body}))};
 assert.doesNotThrow(()=>validateCaptionBatchQuality(response,{profile:p,context:captionContextFrom('feed',{})}));
});

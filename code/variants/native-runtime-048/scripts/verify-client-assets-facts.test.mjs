import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// Compile the real pure modules; no provider, database or substituted business logic.
const brain={exports:{}};
new Function('exports',ts.transpileModule(readFileSync('src/lib/client-brain-v2.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(brain.exports);
const model={exports:{}};
new Function('exports','require',ts.transpileModule(readFileSync('src/lib/client-assets-library.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(model.exports,()=>brain.exports);
const {assetLibraryFacts:facts,assetPreviewsNeedRefresh:due}=model.exports;
const record=(category='food',role='truth_reference',approval='approved',generation=true)=>({status:'approved',metadata:{asset_category:category,asset_category_source:'human_confirmed',approved_for_generation:generation},files:[{semantic_role:role,approval_status:approval,file_type:'image/png'}]});
test('category never promotes raw or generated files into truth',()=>{
 for(const role of ['raw_asset','generated_asset','approved_marketing_asset']) {
  const result=facts(record('food',role));assert.notEqual(result.lane,'truth');assert.notEqual(result.studioRole,'food_truth');
 }
});
test('staff never receives inferred identity mapping, even with approval',()=>{
 for(const approval of [false,true]) {const result=facts(record('staff','truth_reference','approved',approval));assert.equal(result.studioRole,null);assert.equal(result.readiness,'Needs review');}
});
test('record approval cannot substitute for file approval or generation permission',()=>{
 assert.equal(facts(record()).readiness,'Meets reference checks');
 for(const approval of ['draft','restricted',null]) assert.equal(facts(record('food','truth_reference',approval)).readiness,'Needs review');
 assert.equal(facts(record('food','truth_reference','approved',false)).readiness,'Needs review');
 const missing={...record(),files:[]};assert.equal(facts(missing).role,null);assert.equal(facts(missing).readiness,'Needs review');
 const inferred=record();delete inferred.metadata.asset_category_source;assert.equal(facts(inferred).category,'unclassified');assert.equal(facts(inferred).studioRole,null);
});
test('refresh occurs before expiry and on visible resume without refreshing hidden tabs',()=>{
 assert.equal(due(0,Date.now(),true),false,'Initial cold load must not be restarted by the minute timer or visibility resume');
 const start=1000;assert.equal(due(start,start+24*60000,true),false);
 assert.equal(due(start,start+25*60000,true),true);
 assert.equal(due(start,start+31*60000,false),false);
 assert.equal(due(start,start+31*60000,true),true);
 assert.equal(due(start+31*60000,start+31*60000,true),false);
});

test('empty and unsupported library views render without dereferencing a missing selection',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const view={exports:{}};
 const source=ts.transpileModule(readFileSync('src/components/clients/client-assets-library.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('exports','require',source)(view.exports,name=>name==='@/lib/client-assets-library'?model.exports:name.endsWith('.module.css')?{}:require(name));
 const render=supported=>renderToStaticMarkup(React.createElement(view.exports.ClientAssetsLibrary,{clientId:'TEST',initial:{supported,records:[],inspirations:[]}}));
 assert.match(render(true),/No assets yet/);assert.doesNotMatch(render(true),/Assets is not available/);
 assert.match(render(false),/Assets is not available for this client yet/);assert.doesNotMatch(render(false),/No assets yet/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createDesignInventory} from './lib/design-inventory.mjs';
const require=createRequire(import.meta.url);
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
function component(path) {
 const result={exports:{}};
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('exports','require',source)(result.exports,name=>name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})}:require(name));
 return result.exports;
}
test('source inventory preserves CSS module, responsive scope, line and important status',()=>{
 const inventory=createDesignInventory([{path:'src/global.css',css:':root {\n --green:#16a34a;\n --alias:var(--green);\n}\n@media (max-width: 400px) { .card { --green: #fff !important; }}'},{path:'src/home.module.css',css:'.root { --green:#4ade80; }'}]);
 const green=inventory.variants.find(row=>row.name==='--green');assert.equal(green.definitions.length,3);
 assert.equal(green.definitions[0].line,2);assert.equal(green.definitions[1].scope,'@media (max-width: 400px) → .card');assert.equal(green.definitions[1].important,true);
 assert.equal(green.definitions[2].module,true);assert.equal(inventory.definitions.find(row=>row.name==='--alias').value,'var(--green)');
});
test('identical definitions remain inspectable without being classified as different values',()=>{
 const input=[{path:'src/test.css',css:'.a {--same:red} .b {--same:red}'}];const inventory=createDesignInventory(input);
 assert.equal(inventory.repeated.length,1);assert.equal(inventory.variants.length,0);
 assert.equal(inventory.sourceHash,createDesignInventory(input).sourceHash);
 assert.notEqual(inventory.sourceHash,createDesignInventory([{...input[0],css:input[0].css+'\n/* changed */'}]).sourceHash);
});
test('shared briefing preserves the Home surface DOM and decorative layers',()=>{
 const {BriefingSurface}=component('src/components/design-system/briefing-surface.tsx');
 const actual=renderToStaticMarkup(React.createElement(BriefingSurface,{'aria-roledescription':'carousel'},React.createElement('p',null,'Example')));
 assert.equal(actual,'<section class="hero" aria-roledescription="carousel"><span aria-hidden="true" class="heroGrain"></span><span aria-hidden="true" class="heroSheen"></span><span aria-hidden="true" class="heroEdge"></span><div class="heroIn"><p>Example</p></div></section>');
});
test('shared actions retain link semantics, disabled state and safe button type',()=>{
 const {ClientAction,ClientActionLink}=component('src/components/design-system/client-action.tsx');
 const button=renderToStaticMarkup(React.createElement(ClientAction,{disabled:true,variant:'secondary'},'Unavailable'));
 assert.match(button,/type="button"/);assert.match(button,/disabled=""/);assert.match(button,/client-workspace-secondary/);
 const link=renderToStaticMarkup(React.createElement(ClientActionLink,{href:'/clients/example/brain'},'Brain'));
 assert.match(link,/<a /);assert.match(link,/href="\/clients\/example\/brain"/);assert.doesNotMatch(link,/role="button"/);
});

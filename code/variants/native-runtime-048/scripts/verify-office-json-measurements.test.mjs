import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {measureJsonArtifact,JSON_MEASUREMENT_MAX_CHARACTERS,JSON_MEASUREMENT_MAX_FIELD_RESPONSE_CHARACTERS} from './lib/office-json-measurements.mjs';
const fixture=name=>readFile(new URL('./fixtures/office-json-measurements/'+name,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');

test('preserved real author and QA wrappers remain invalid without inventing inner-string syntax errors',async()=>{
 for(const [file,expected] of [['author-native-failed.txt','0df14ee1ca6e686acc2070a2f6cd0f407d7aaa2b089f6471d9d742ed06e5b54c'],['qa-native-failed.txt','437c1eb8d196d059df6c1d85e67ef381aa2cb6092bbe911c855b6871ec7bffa2']]){
  const raw=await fixture(file),r=measureJsonArtifact(raw);assert.equal(sha(raw),expected);assert.equal(r.inputSha256,expected);assert.equal(r.jsonSyntax.valid,false);assert.equal(r.format.markdownFence,true);assert.equal(r.format.literalControlsInQuotedStrings.count,0);assert.deepEqual(r.stringFields.fields,[]);assert.equal(r.semanticApproval,'not_assessed');
 }
});
test('explicit inner object is a separately hashed artifact with measured original copy fields',async()=>{
 const raw=await fixture('author-native-failed.txt'),inner=raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1),r=measureJsonArtifact(inner),fields=new Map(r.stringFields.fields.map(f=>[f.pointer,f]));
 assert.notEqual(r.inputSha256,sha(raw));assert.equal(r.jsonSyntax.valid,true);assert.equal(r.jsonSyntax.rootType,'object');assert.equal(r.stringFields.complete,true);assert.equal(r.format.literalControlsInQuotedStrings.count,0);
 for(const [i,words,subject,preheader,title] of [[0,85,22,53,4],[1,72,38,78,6]]){assert.equal(fields.get(`/emails/${i}/body`).wordCount,words);assert.equal(fields.get(`/emails/${i}/body`).paragraphCount,2);assert.equal(fields.get(`/emails/${i}/subject`).characters,subject);assert.equal(fields.get(`/emails/${i}/preheader`).characters,preheader);assert.equal(fields.get(`/emails/${i}/title`).wordCount,title);}
});
test('separate escaped-newline regression parses and counts decoded paragraphs',()=>{
 const raw='{"body":"First paragraph.\\n\\nSecond paragraph."}',r=measureJsonArtifact(raw);assert.equal(r.jsonSyntax.valid,true);assert.equal(r.format.literalControlsInQuotedStrings.count,0);assert.equal(r.stringFields.fields[0].paragraphCount,2);assert.equal(r.stringFields.fields[0].wordCount,4);
});
test('true literal newline and escaped literal newline in strings are invalid controls',()=>{
 for(const raw of ['{"body":"First\nSecond"}','{"body":"First\\\nSecond"}']){const r=measureJsonArtifact(raw);assert.equal(r.jsonSyntax.valid,false);assert.equal(r.format.literalControlsInQuotedStrings.count,1);assert.equal(r.format.literalControlsInQuotedStrings.firstOffsets[0].codePoint,'U+000A');assert.deepEqual(r.stringFields.fields,[]);}
});
test('raw prose, fences, trailing self-certification and malformed JSON never silently extract',()=>{
 for(const raw of ['Here is JSON: {"body":"Text"}','```json\n{"body":"Text"}\n```','{"body":"Text"}\nAll checked.','{"body":"Text",}']){const r=measureJsonArtifact(raw);assert.equal(r.jsonSyntax.valid,false);assert.equal(r.stringFields.complete,false);assert.deepEqual(r.stringFields.fields,[]);}
});
test('word and character algorithms handle Unicode deterministically without manual counting claims',()=>{
 const r=measureJsonArtifact(JSON.stringify({text:'Hello—world co-operate O’Neil 2026 café 世界 مرحبا 👋',emoji:'A😀e\u0301'}));const f=new Map(r.stringFields.fields.map(f=>[f.pointer,f]));assert.equal(f.get('/text').wordCount,8);assert.equal(f.get('/emoji').characters,5);assert.equal(f.get('/emoji').unicodeCodePoints,4);assert.equal(f.get('/emoji').wordCount,2);assert.equal(r.stringFields.wordCountAlgorithm,'unicode-lexical-v1');
});
test('JSON Pointer escapes keys, primitive syntax validity does not imply requested object/schema pass',()=>{
 const r=measureJsonArtifact('{"a/b~c":"safe","__proto__":"plain data"}');assert.deepEqual(r.stringFields.fields.map(f=>f.pointer),['/a~1b~0c','/__proto__']);assert.equal({}.polluted,undefined);
 for(const [raw,type] of [['null','null'],['true','boolean'],['42','number'],['"text"','string'],['[]','array']]){const r=measureJsonArtifact(raw);assert.equal(r.jsonSyntax.valid,true);assert.equal(r.jsonSyntax.rootType,type);assert.equal(r.semanticApproval,'not_assessed');assert.ok(!Object.hasOwn(r,'pass'));}
});
test('exact UTF8 hash differs with whitespace and no string field values are echoed',()=>{
 const a='{"body":"sensitive draft"}',b=' '+a;const r=measureJsonArtifact(a);assert.equal(r.inputSha256,sha(a));assert.notEqual(r.inputSha256,measureJsonArtifact(b).inputSha256);assert.equal(JSON.stringify(r).includes('sensitive draft'),false);assert.equal(r.inputUtf8Bytes,Buffer.byteLength(a));
});
test('44k input bound and traversal bounds fail honestly rather than overclaim complete measurement',()=>{
 assert.throws(()=>measureJsonArtifact(null),TypeError);assert.throws(()=>measureJsonArtifact(' '.repeat(JSON_MEASUREMENT_MAX_CHARACTERS+1)),RangeError);assert.equal(measureJsonArtifact(' '.repeat(JSON_MEASUREMENT_MAX_CHARACTERS)).jsonSyntax.valid,false);
 const wide=measureJsonArtifact(JSON.stringify(Object.fromEntries(Array.from({length:300},(_,i)=>['f'+i,'x']))));assert.equal(wide.jsonSyntax.valid,true);assert.equal(wide.stringFields.complete,false);assert.ok(wide.stringFields.limitsReached.some(x=>['string_fields','response_characters'].includes(x)));
 const deep=measureJsonArtifact('['.repeat(40)+'"x"'+']'.repeat(40));assert.equal(deep.jsonSyntax.valid,true);assert.equal(deep.stringFields.complete,false);assert.ok(deep.stringFields.limitsReached.includes('depth'));
 const long=measureJsonArtifact(JSON.stringify({['x'.repeat(513)]:'x'}));assert.equal(long.stringFields.complete,false);assert.ok(long.stringFields.limitsReached.includes('pointer_characters'));
 const nodes=measureJsonArtifact('['+Array(5000).fill('0').join(',')+']');assert.equal(nodes.stringFields.complete,false);assert.ok(nodes.stringFields.limitsReached.includes('nodes'));
});

test('email method revisions retain every previous file hash and load only their additive current context',async()=>{
 const {roleSkillContext}=await import('./lib/office-skill-library.mjs');
 const {fileURLToPath}=await import('node:url');
 const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
 for(const [id,role] of [['office-email','email'],['office-email-qa','email-qa']]){
  const method=plan.skillLibrary.find(x=>x.id===id),previous=method.jsonMeasurementPrevious;
  assert.ok(previous);assert.equal(previous.id,id);assert.notEqual(method.ref,previous.ref);assert.equal(method.contextPath,'entry-2026-10-15-json-measurement.md');
  for(const [path,hash] of Object.entries(previous.fileHashes)){assert.equal(method.fileHashes[path],hash);assert.equal(sha(await readFile(new URL('../'+method.path+'/'+path,import.meta.url),'utf8')),hash);}
  for(const key of ['id','name','roles','department','repo','path','license','kind','packVersion','adaptation','sourceRefs','specialties','output'])assert.deepEqual(method[key],previous[key]);
  assert.equal(method.ref,sha(JSON.stringify(method.fileHashes)));
  const context=await roleSkillContext(role,[method],fileURLToPath(new URL('../skills/agent-roles',import.meta.url)));assert.equal(context.receipts.length,1);assert.equal(context.receipts[0].contextPath,method.contextPath);assert.ok(context.text.includes('unicode-lexical-v1'));assert.ok(context.text.includes('no preface')||context.text.includes('no preface,'));assert.ok(context.text.includes('HTML'));assert.ok(context.text.length<48000);
 }
});


test('wide and deep escaped keys cannot inflate serialized field response beyond12k',()=>{
 const wide=Object.fromEntries(Array.from({length:300},(_,i)=>['wide-'+String(i)+'-'+('x'.repeat(75)),'x']));
 let deep=Object.fromEntries(Array.from({length:100},(_,i)=>['leaf'+i,'x']));
 for(let i=0;i<20;i++)deep={['nested-key-'+i]:deep};
 const escaped=Object.fromEntries(Array.from({length:150},(_,i)=>['quoted"\\-key-'+i+'-'+('x'.repeat(60)),'x']));
 for(const input of [wide,deep,escaped]){
  const raw=JSON.stringify(input);assert.ok(raw.length<=44000);const measured=measureJsonArtifact(raw);
  assert.equal(measured.jsonSyntax.valid,true);assert.equal(measured.stringFields.complete,false);assert.ok(measured.stringFields.limitsReached.includes('response_characters'));
  assert.ok(JSON.stringify(measured.stringFields).length<=JSON_MEASUREMENT_MAX_FIELD_RESPONSE_CHARACTERS);assert.ok(JSON.stringify(measured).length<=15000);
 }
});

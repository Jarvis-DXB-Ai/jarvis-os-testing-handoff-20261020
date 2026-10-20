import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {zstdCompressSync,gzipSync} from 'node:zlib';
import {outputLengthLimits,assembledOutputContract,enforceOutputChecks,outputWordCount} from '../src/lib/office-output-checks.mjs';
import {verifyArtifactFormat} from './lib/office-artifact-format.mjs';
import {departmentReviewParts,specialistOutputContract,validateTask} from './lib/office-team-engine.mjs';
const vds='Output is only the900–1200word implementation contract. No invented rendering/export claim.';
const qa=criterion=>({pass:true,checks:[{criterion,pass:true,evidence:'Model marked pass.'}]});
test('actual compact VDS requirement rejects the observed 1306-word final despite a model pass',()=>{
 assert.deepEqual(outputLengthLimits(vds),{min:900,max:1200});
 assert.equal(enforceOutputChecks(qa(vds),'word '.repeat(1306)).pass,false);
 for(const n of [900,1200])assert.equal(enforceOutputChecks(qa(vds),'word '.repeat(n)).pass,true);
 assert.equal(enforceOutputChecks(qa(vds),'word '.repeat(899)).pass,false);
 assert.match(assembledOutputContract([vds]),/900–1200/);
 assert.match(specialistOutputContract({criteria:[vds],steps:[{},{}]},{assignment:'Return one part.'}),/600 words per specialist/);
});
test('all stages share a counter and larger explicit deliverables override the generic draft target',()=>{
 const output='A fact-check — one decision.\n# Next: don’t invent facts.';
 const part={id:'a',output,dependsOn:[]};
 assert.equal(departmentReviewParts([part])[0].wordCount,outputWordCount(output));
 assert.equal(departmentReviewParts([part])[0].wordCountAlgorithm,'unicode-lexical-v1');
 assert.match(assembledOutputContract(['The final deliverable contains between 1,800 and 2,400 words.']),/1800–2400/);
 assert.deepEqual(outputLengthLimits('The entire response must be under 60 words.'),{min:0,max:59});
 assert.equal(enforceOutputChecks(qa('The entire response must be under 60 words.'),'word '.repeat(60)).pass,false);
});
test('per-item and approximate guidance never becomes a global strict gate; existing rejection remains',()=>{
 for(const c of ['Each caption is at most 40 words.','The final output has each caption under 40 words.','The final response includes a title maximum 5 words.','The final output is at most 40 words per caption.','The final output is 20–40 words for each slide.','The entire response is about 100–140 words.'])assert.equal(outputLengthLimits(c),null,c);
 assert.deepEqual(outputLengthLimits('The final output is a 900–1200-word contract.'),{min:900,max:1200});
 assert.equal(enforceOutputChecks({...qa(vds),pass:false},'word '.repeat(1000)).pass,false);
 assert.throws(()=>assembledOutputContract(['Final output is 900–1200 words.','The entire response is at most 800 words.']),/contradict/);
 assert.throws(()=>validateTask({id:'a7604343-92d7-56ec-bf35-b272cac7f8b7',brief:'Draft a fixture',context:'Fixture',criteria:['Final output is 900–1200 words.','The entire response is at most 800 words.']}),/contradict/);
});
test('decode validation rejects renamed JPEGs and damaged PNGs while retaining exact format/dimension evidence',async()=>{
 const image=sharp({create:{width:37,height:19,channels:4,background:'#8a72c4'}});
 const png=await image.clone().png().toBuffer(),jpeg=await image.clone().jpeg().toBuffer();
 assert.deepEqual(await verifyArtifactFormat('card.png',png),{format:'png',width:37,height:19,decoded:true});
 await assert.rejects(verifyArtifactFormat('card.png',jpeg),/format mismatch/);
 await assert.rejects(verifyArtifactFormat('card.png',png.subarray(0,40)));
 await assert.rejects(verifyArtifactFormat('edit.json',Buffer.from('not json')));
 await assert.rejects(verifyArtifactFormat('scene.blend',png),/format mismatch/);
});
test('valid compressed Blender headers are checked after bounded decompression; arbitrary compressed payloads fail',async()=>{
 const header=Buffer.from('BLENDER17-01 synthetic header fixture');
 for(const [compression,bytes] of [['zstd',zstdCompressSync(header)],['gzip',gzipSync(header)]])assert.deepEqual(await verifyArtifactFormat('scene.blend',bytes),{format:'blend',headerChecked:true,compression});
 await assert.rejects(verifyArtifactFormat('scene.blend',zstdCompressSync(Buffer.from('{"not":"a scene"}'))),/format mismatch/);
 await assert.rejects(verifyArtifactFormat('scene.blend',Buffer.from([40,181,47,253,0])));
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {parseSpecialistResponse,specialistResponseArguments,specialistResponseSchema} from './lib/office-specialist-response.mjs';
import {outputWordCount} from '../src/lib/office-output-checks.mjs';
test('finished text/code is preserved byte for byte while optional process notes get separate hash evidence',()=>{
 const artifact='<!doctype html>\n<main>Before you send</main>\n';const raw=JSON.stringify({artifact,internalNotes:'No render or publication performed.'});const parsed=parseSpecialistResponse(raw);
 assert.equal(parsed.artifact,artifact);assert.equal(parsed.receipt.artifactSha256,createHash('sha256').update(artifact).digest('hex'));assert.equal(parsed.receipt.responseSha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(outputWordCount(parseSpecialistResponse(JSON.stringify({artifact:'A useful reply.',internalNotes:'word '.repeat(100)})).artifact),3);
});
test('malformed, extra-key, nested, empty and oversized responses fail closed without extracting a convenient substring',()=>{
 for(const raw of ['plain reply','{}','null','[]',JSON.stringify({artifact:' ',internalNotes:''}),JSON.stringify({artifact:'Reply',internalNotes:{note:'wrong'}}),JSON.stringify({artifact:'Reply',internalNotes:'',pass:true}),JSON.stringify({artifact:'Reply',internalNotes:''})+' trailing commentary',JSON.stringify({artifact:'x'.repeat(44001),internalNotes:''}),JSON.stringify({artifact:'Reply',internalNotes:'x'.repeat(4001)})])assert.throws(()=>parseSpecialistResponse(raw));
});
test('Claude receives the existing structured-output option; Codex still has server-enforced exact JSON validation',()=>{
 const args=specialistResponseArguments('claude_local');assert.equal(args[0],'--json-schema');assert.deepEqual(JSON.parse(args[1]),specialistResponseSchema());assert.deepEqual(specialistResponseArguments('codex_local'),[]);
});

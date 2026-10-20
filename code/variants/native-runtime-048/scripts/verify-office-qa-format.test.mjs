import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateQa,paperclipClient,departmentReviewParts} from './lib/office-team-engine.mjs';
const criteria=['Every assigned department part is complete and useful.','Claims and brand treatment match the supplied client evidence; unknowns remain explicit.','The department outputs satisfy their own assignments and are ready for a head summary.'];
const response=()=>({pass:true,checks:criteria.map(criterion=>({criterion:criterion.slice(0,-1),pass:true,evidence:'Actual supplied draft and source evidence.'}))});
test('a lost GET response body can be reread without replaying model dispatch or other writes',async()=>{
 let reads=0;const read=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async()=>({ok:true,json:async()=>{if(++reads===1)throw new TypeError('fetch failed while reading body');return {status:'succeeded'};}})});
 assert.deepEqual(await read('/heartbeat-runs/existing'),{status:'succeeded'});assert.equal(reads,2);
 for(const method of ['POST','PATCH','DELETE']){let writes=0;const api=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async()=>{writes++;return {ok:true,json:async()=>{throw new TypeError('lost acknowledgement body');}}}});await assert.rejects(api('/existing',{},method));assert.equal(writes,1);}
 let invalid=0;const api=paperclipClient(undefined,{readRetryMs:0,fetchImpl:async()=>{invalid++;return {ok:true,json:async()=>{throw new SyntaxError('Invalid JSON');}}}});await assert.rejects(api('/existing'));assert.equal(invalid,1);
});
test('live-failure-shaped QA with omitted full stops retains verdict/evidence and canonical criteria',()=>{
 // Regression shape captured from the live campaign QA on 14 October.
 // Keep private client evidence in the local report, not a test dependency.
 const parsed=response();
 const result=validateQa(parsed,criteria);
 assert.equal(result.pass,parsed.pass);assert.deepEqual(result.checks.map(c=>c.criterion),criteria);
 assert.deepEqual(result.checks.map(c=>c.evidence),parsed.checks.map(c=>c.evidence));
 assert.ok(parsed.checks.every(c=>!c.criterion.endsWith('.')));
});
test('format tolerance preserves material failure and rejects changed wording, order and absent evidence',()=>{
 const failed=response();failed.pass=false;failed.checks[1].pass=false;
 assert.equal(validateQa(failed,criteria).pass,false);
 for(const mutate of [
  x=>{x.checks[0].criterion='Every assigned part is useful';},
  x=>{[x.checks[0],x.checks[1]]=[x.checks[1],x.checks[0]];},
  x=>{x.checks.pop();},
  x=>{x.checks[0].evidence=' ';},
  x=>{x.checks[0].pass=false;},
  x=>{x.checks[0]=null;},
  x=>{x.checks[0].criterion+='..';},
 ]){const x=response();mutate(x);assert.throws(()=>validateQa(x,criteria));}
 const padded=response();padded.checks[0].criterion='  '+padded.checks[0].criterion+'  ';
 assert.deepEqual(validateQa(padded,criteria).checks.map(c=>c.criterion),criteria);
});

test('department reviewers receive exact draft hashes and dependency provenance even after a bounded correction',()=>{
 const corrected='Corrected draft';
 const parts=departmentReviewParts([{id:'source',assignment:'Write',output:corrected,dependsOn:[],coordinatorCorrection:{sourceSha256:'old-hash'}},{id:'head',assignment:'Review',output:'Head',dependsOn:['source']}]);
 assert.equal(parts[0].outputSha256.length,64);assert.equal(parts[0].wordCount,2);
 assert.deepEqual(parts[1].dependencies,[{id:'source',outputSha256:parts[0].outputSha256,priorOutputSha256:'old-hash'}]);
 assert.throws(()=>validateQa({pass:'revise',checks:[]},[]));
 assert.throws(()=>validateQa({pass:true,checks:[{criterion:null,pass:true,evidence:'x'}]},[null]));
});

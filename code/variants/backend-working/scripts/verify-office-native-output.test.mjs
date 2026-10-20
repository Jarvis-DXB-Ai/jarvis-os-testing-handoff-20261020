import {test} from 'node:test';import assert from 'node:assert/strict';
import {modelRunOutput} from './lib/office-review-schema.mjs';
const message=text=>JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}),completed=JSON.stringify({type:'turn.completed',usage:{}});
test('oversized image result uses the complete final native event, never the short summary or tool data',()=>{
 const full='Full reviewed answer\nExact source hash and limits.',run={status:'succeeded',resultJson:{truncated:true,stdoutTruncated:true,summary:'Full reviewed ans',stdout:'truncated image data'},stdoutExcerpt:'partial base64 prefix\n'+JSON.stringify({type:'item.completed',item:{type:'mcp_tool_call',result:{content:[{type:'text',text:'not a deliverable'}]}}})+'\n'+message(full)+'\n'+completed};
 assert.equal(modelRunOutput(run),full);assert.equal(modelRunOutput({...run,stdoutExcerpt:message('{"pass":true}')+'\n'+completed},{structured:true}),'{"pass":true}');
});
test('a missing, unfinished or failed final event cannot silently become a completed summary',()=>{
 for(const text of ['',message('partial'),message('prior')+'\n'+completed+'\n'+JSON.stringify({type:'turn.started'}),message('answer')+'\n'+JSON.stringify({type:'turn.failed'})])assert.throws(()=>modelRunOutput({status:'succeeded',resultJson:{truncated:true,summary:'looks complete'},stdoutExcerpt:text}),/truncated/);
 assert.throws(()=>modelRunOutput({status:'failed',resultJson:{truncated:true},stdoutExcerpt:message('answer')+'\n'+completed}),/not a completed/);
});
test('legacy and complete structured native responses retain their exact existing behavior',()=>{
 assert.equal(modelRunOutput({resultJson:{summary:'Legacy complete answer'}}),'Legacy complete answer');assert.equal(modelRunOutput({resultJson:{structured_output:{pass:true}}},{structured:true}),'{"pass":true}');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationHistoryMode,savedConversationHistoryMode,conversationHistoryPacket} from '../src/lib/office-conversation-history.mjs';
const jobs=[{id:'latest',brief:'Review the earlier defective artifact',status:'answered',output:'Earlier verdict and expected corrections'},{id:'older',brief:'First task',status:'failed'}];
test('fresh task omits prior outputs, verdicts and IDs without deleting saved conversations',()=>{
 const original=structuredClone(jobs),packet=conversationHistoryPacket(jobs,'fresh');assert.deepEqual(packet.historyIds,[]);assert.ok(!packet.context.includes('expected corrections'));assert.ok(!packet.context.includes('defective artifact'));assert.deepEqual(jobs,original);assert.equal(savedConversationHistoryMode(packet),'fresh');
});
test('recent context preserves bounded chronological history and its original default',()=>{
 assert.equal(conversationHistoryMode(undefined),'recent');const packet=conversationHistoryPacket(jobs,'recent');assert.deepEqual(packet.historyIds,['latest','older']);assert.ok(packet.context.indexOf('First task')<packet.context.indexOf('Review the earlier'));assert.equal(savedConversationHistoryMode(packet),'recent');assert.match(packet.context,/No saved reply/);
});
test('invalid history options cannot silently change task identity',()=>{for(const mode of [null,true,'reset','',{},[]])assert.throws(()=>conversationHistoryMode(mode));});

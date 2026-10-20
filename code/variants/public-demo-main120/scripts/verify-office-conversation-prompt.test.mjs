import {test} from 'node:test';import assert from 'node:assert/strict';
import {conversationReplyPrompt} from './lib/office-conversation-prompt.mjs';
test('current request and its artifact identities follow preserved historical context without reusing old digests',()=>{
 const old='a'.repeat(64),current='b'.repeat(64),history='Prior artifact ARTIFACT SHA256: '+old+' with 423 words; historical failure.';
 const prompt=conversationReplyPrompt({context:history,brief:'Review the new 448-word artifact. ARTIFACT SHA256: '+current},{name:'QA'},'ads-qa');
 assert.ok(prompt.includes(history));assert.ok(prompt.indexOf('Historical context:')<prompt.indexOf('Current owner message'));
 const tail=prompt.slice(prompt.indexOf('Current request artifact SHA256 identities:'));assert.ok(tail.includes(current));assert.ok(!tail.includes(old));
 assert.ok(prompt.includes('Pinned sources and actual tool grants still apply'));
});
test('ordinary questions and repeated or absent artifact markers preserve the actual request and grants',()=>{
 const brief='What source inputs do you need?',plain=conversationReplyPrompt({brief},{name:'Analyst',title:'Ads Analyst'},'ads-analyst');
 assert.ok(plain.endsWith(brief));assert.ok(!plain.includes('Current request artifact SHA256 identities:'));assert.ok(plain.includes('not a delegated team delivery'));assert.ok(plain.includes('does not overwrite the prior deliverable'));
 const digest='c'.repeat(64),tagged=conversationReplyPrompt({brief:`ARTIFACT SHA256: ${digest}\nARTIFACT SHA256: ${digest}`},{name:'QA'},'ads-qa');
 assert.equal(tagged.slice(tagged.indexOf('Current request artifact SHA256 identities:')).split(digest).length,2);
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveConversationContext} from '../src/lib/office-conversation-context.mjs';
const fixture=(status='draft')=>({readSetup:async()=>({id:'client-a',clientId:'client-a',status}),readConfirmed:async()=>({clientId:'client-a',foundationId:'confirmed-a'}),readPilot:async()=>({clientId:'client-a',foundationId:'audit-client-a',status:'audit_ready',executionMode:'audit_only',brandConfirmed:false,servicesConfirmed:false})});
test('draft dialogue uses only the validated internal audit allocation; ready clients keep confirmed scope',async()=>{
 assert.deepEqual(await resolveConversationContext('client-a',fixture()),{foundationId:'audit-client-a',taskType:'internal',mode:'draft'});
 const readers=fixture('ready');readers.readPilot=async()=>{throw Error('must not inspect fallback');};
 assert.deepEqual(await resolveConversationContext('client-a',readers),{foundationId:'confirmed-a',taskType:'internal',mode:'approved'});
});
test('missing or broken confirmed setup does not silently acquire draft access',async()=>{
 const r=fixture('ready');let pilotReads=0;r.readConfirmed=async()=>{throw Error('changed approved sources');};r.readPilot=async()=>{pilotReads++;};
 await assert.rejects(resolveConversationContext('client-a',r),/changed approved sources/);assert.equal(pilotReads,0);
 const d=fixture();d.readPilot=async()=>{throw Error('no audit allocation');};await assert.rejects(resolveConversationContext('client-a',d),/no audit allocation/);
});
test('other client identities, production allocations and fabricated approval flags fail closed',async()=>{
 for(const change of [{clientId:'client-b'},{foundationId:null},{foundationId:'production-a'},{executionMode:'production'},{status:'ready'},{brandConfirmed:true},{servicesConfirmed:true}]){
 const r=fixture(),original=r.readPilot;r.readPilot=async()=>({...await original(),...change});await assert.rejects(resolveConversationContext('client-a',r));
 }
 const r=fixture();r.readSetup=async()=>({id:'client-b',clientId:'client-b',status:'draft'});await assert.rejects(resolveConversationContext('client-a',r),/another client/);
});

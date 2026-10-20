import {test} from 'node:test';import assert from 'node:assert/strict';
import {modelTeamAllocation,modelKnowledgeContext} from './lib/office-model-context.mjs';
test('model allocation removes coordinator identity maps without mutating allocation, scope or permissions',()=>{
 const team={departments:[{id:'finance',headRoleId:'cfo',qaRoleId:'finance-qa',roles:['billing']}],sharedDepartments:[],roleIds:['billing'],maxConcurrentWorkers:2,permissions:{publish:false,spend:false},runtime:{roleAgents:{billing:'private-actor-id'},agentIds:['private-actor-id'],departments:{finance:{qaAgentId:'private-qa'}}},futureScopeField:{readOnly:true}};
 const before=structuredClone(team),mapped=modelTeamAllocation(team);
 assert.deepEqual(mapped,Object.fromEntries(Object.entries(team).filter(([k])=>k!=='runtime')));
 assert.deepEqual(team,before);assert.ok(!JSON.stringify(mapped).includes('private-actor-id'));assert.deepEqual(mapped.permissions,team.permissions);assert.deepEqual(mapped.futureScopeField,team.futureScopeField);
});
test('knowledge retains all sources, restrictions, facts, approved lessons and allocation boundaries',()=>{
 const full={scope:{clientId:'a'},mode:'draft',foundation:{revision:'v2',fields:{facts:'Verified source facts',restrictions:'No sends'}},sources:[{sha256:'source',path:'retained-file'}],assets:[{id:'asset'}],lessons:[{rule:'Approved rule'}],clientBrain:{executionMode:'audit_only',officeTeamRevision:'pinned',officeTeam:{roleIds:['billing'],permissions:{publish:false},runtime:{agentIds:['actor']}},intelligence:[{fields:{status:'unknown'}}],registeredNotes:[{text:'Evidence'}]},gaps:['unconfirmed services']};
 const before=structuredClone(full),mapped=modelKnowledgeContext(full);
 assert.deepEqual(mapped,{...full,clientBrain:{...full.clientBrain,officeTeam:{roleIds:['billing'],permissions:{publish:false}}}});assert.deepEqual(full,before);
 assert.equal(modelKnowledgeContext(null),null);assert.equal(modelTeamAllocation(null),null);const legacy={scope:{clientId:null},foundation:{fields:{facts:'historical'}}};assert.equal(modelKnowledgeContext(legacy),legacy);
});

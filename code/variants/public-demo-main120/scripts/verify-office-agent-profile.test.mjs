import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {officeAgentProfile,roleDescriptions,methodDescriptions} from '../src/lib/office-agent-profile.mjs';
import {departmentQaMethods} from '../src/lib/office-client-team.mjs';
import roleSkills from '../src/lib/office-role-skills.json' with {type:'json'};
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url)));
const actor=(blueprintRoleId,extra={})=>({name:'Specialist',blueprintRoleId,...extra});
test('all 65 active desks have a specific purpose, brief inputs and mapped methods with useful explanations',()=>{
 const roles=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active');assert.equal(roles.length,65);
 for(const role of roles){assert.ok(Object.hasOwn(roleDescriptions,role.id),role.id);const profile=officeAgentProfile(actor(role.id),plan,departmentQaMethods);assert.ok(profile.purpose.length>40);assert.equal(profile.inputs.length,3);assert.ok(profile.methods.length>0,role.id);assert.equal(profile.questions.length,4);assert.ok(profile.questions.every(q=>q.prompt.length>=12&&q.prompt.length<6000));}
 for(const method of plan.skillLibrary)assert.ok(Object.hasOwn(methodDescriptions,method.id),method.id);
});
test('skill lists match the executor mapping and never show unrelated methods to a specialist',()=>{
 const p=officeAgentProfile(actor('copy'),plan,departmentQaMethods);assert.deepEqual(p.methods.map(s=>s.id),plan.skillLibrary.filter(s=>s.roles.includes('copy')).map(s=>s.id));assert.ok(!p.methods.some(s=>s.id==='financial-close'));
 assert.equal(officeAgentProfile(actor('presentations'),plan,departmentQaMethods).questions[2].label,'Structure my deck');
 assert.notEqual(officeAgentProfile(actor('instagram'),plan,departmentQaMethods).questions[2].label,officeAgentProfile(actor('bookkeeping'),plan,departmentQaMethods).questions[2].label);
});
test('client department QA override describes and exposes only its own configured methods',()=>{
 const p=officeAgentProfile(actor('test',{clientSlot:'qa:email'}),plan,departmentQaMethods);
 assert.equal(p.departmentName,'Email Marketing');assert.match(p.purpose,/Email Marketing/);assert.deepEqual(new Set(p.methods.filter(s=>s.kind!=='supplement').map(s=>s.id)),new Set(departmentQaMethods.email));assert.equal(p.questions[2].label,'What will you check?');assert.deepEqual(p.methods.filter(s=>s.kind==='supplement').map(s=>s.id),['mc-delivery-loop','mc-context-handoff','jarvis-evidence-review']);
 assert.deepEqual(p.inputs,roleSkills.roles.find(r=>r.roleId==='email-qa').inputs);assert.notDeepEqual(p.inputs,roleSkills.roles.find(r=>r.roleId==='test').inputs);
 const metadata=officeAgentProfile(actor('test',{qaDepartment:'support'}),plan,departmentQaMethods);assert.match(metadata.purpose,/Customer Support/);
 const unknown=officeAgentProfile(actor('test',{qaDepartment:'unknown'}),plan,departmentQaMethods);assert.equal(unknown.methods.length,0);
});
test('unknown and historical identifiers fail to a clear description rather than inheriting an unrelated role',()=>{
 for(const id of ['unknown','__proto__',null]){const p=officeAgentProfile(actor(id),plan,departmentQaMethods);assert.equal(typeof p.purpose,'string');assert.match(p.purpose,/no configured role description/);assert.equal(p.methods.length,0);}
});

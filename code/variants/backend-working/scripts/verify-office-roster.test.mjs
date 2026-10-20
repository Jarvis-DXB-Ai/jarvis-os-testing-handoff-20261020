import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assignmentRoles,rosterDepartments,validateRoster} from './lib/office-roster.mjs';
import {departmentReports,validatePlan,savedAgentTaskContext} from './lib/office-team-engine.mjs';
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
test('reviewed roster gives every active role one accountable team and preserves merged identities',()=>{
  assert.equal(validateRoster(plan).length,65);
  assert.equal(rosterDepartments(plan).length,10);
  assert.equal(plan.roles.filter(r=>r.rosterStatus==='merged').length,8);
  for(const change of plan.rosterReview.merges) {
    assert.ok(plan.roles.some(r=>r.id===change.from));
    assert.ok(validateRoster(plan).some(r=>r.id===change.into));
  }
  const duplicate=structuredClone(plan);duplicate.supportDepartments[0].roles.push('copy');
  assert.throws(()=>validateRoster(duplicate),/one department/);
  const wrongHead=structuredClone(plan);wrongHead.supportDepartments[1].headRoleId='metadata';
  assert.throws(()=>validateRoster(wrongHead),/active head/);
});
test('new assignments reject merged roles and independent QA; old configurations still work',()=>{
  const build=roleId=>({summary:'Scoped work',tasks:[{id:'part',roleId,assignment:'Produce a grounded draft',dependsOn:[]}]});
  for(const role of ['capacity','metadata','repurpose','receipts','cash','model-cost','radar','skills','test'])assert.throws(()=>validatePlan(build(role),assignmentRoles(plan)),/permitted specialist catalogue/);
  for(const role of ['delivery','librarian','copy','bookkeeping','margin','subscriptions','evaluation','knowledge'])assert.equal(validatePlan(build(role),assignmentRoles(plan)).tasks[0].roleId,role);
  assert.deepEqual(assignmentRoles({roles:[{id:'copy'},{id:'test'}]}),[{id:'copy'}]);
});
test('department reports route moved responsibilities to their proper heads with full part coverage',()=>{
  const steps=['voice','proposal','pricing','librarian','media','implementation'].map(roleId=>({id:roleId,roleId}));
  const reports=departmentReports(steps,plan);
  const heads=Object.fromEntries(reports.flatMap(r=>r.stepIds.map(id=>[id,r.roleId])));
  assert.deepEqual(heads,{voice:'creative-director',proposal:'coo',pricing:'cfo',librarian:'knowledge',media:'video',implementation:'cto'});
  assert.equal(reports.flatMap(r=>r.stepIds).length,steps.length);
});
test('merging a role never transfers historical private work to its replacement identity',()=>{
  const oldJob={brief:'Old metadata assignment',steps:[{agentId:'old-metadata',assignment:'Tag supplied assets',output:'OWNED-HISTORY',status:'completed'}],departmentReports:[],calls:[]};
  assert.equal(savedAgentTaskContext(oldJob,'new-librarian'),null);
  assert.equal(savedAgentTaskContext(oldJob,'old-metadata').ownWork[0].output,'OWNED-HISTORY');
});

test('eight service departments have distinct heads and reserved independent QA',()=>{const expected=['social','content','design','web','ads','email','support','finance'];assert.deepEqual(plan.focusDepartments.map(d=>d.id),expected);assert.equal(new Set(plan.focusDepartments.map(d=>d.headRoleId)).size,8);assert.equal(new Set(plan.focusDepartments.map(d=>d.qaRoleId)).size,8);for(const d of plan.focusDepartments){assert.ok(d.core.includes(d.headRoleId));assert.ok(d.core.includes(d.qaRoleId));assert.ok(!assignmentRoles(plan).some(r=>r.id===d.qaRoleId));}for(const role of ['instagram','linkedin','facebook','videographer','presentations','web-research','meta-ads','linkedin-ads','youtube-ads','tiktok-ads','whatsapp','crm','bookings'])assert.ok(assignmentRoles(plan).some(r=>r.id===role));const bad=structuredClone(plan);bad.focusDepartments[1].qaRoleId=bad.focusDepartments[1].headRoleId;assert.throws(()=>validateRoster(bad),/independent QA/);});

test('a department QA conversation receives its own saved checks and no other department drafts',()=>{const job={brief:'Two department task',steps:[],calls:[],departmentReports:[{agentId:'head-a',departmentName:'Social Media',stepIds:['a'],output:'Head A',qa:{agentId:'qa-a',status:'completed',result:{pass:true,note:'OWN CHECKS'}}},{agentId:'head-b',departmentName:'Finance',stepIds:['b'],output:'PRIVATE FINANCE',qa:{agentId:'qa-b',status:'completed',result:{pass:true,note:'PRIVATE FINANCE CHECKS'}}}]};const own=savedAgentTaskContext(job,'qa-a');assert.equal(own.departmentQualityChecks[0].result.note,'OWN CHECKS');assert.ok(!JSON.stringify(own).includes('PRIVATE FINANCE'));assert.equal(savedAgentTaskContext(job,'unrelated'),null);});

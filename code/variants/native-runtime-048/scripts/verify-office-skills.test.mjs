import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {roleSkillContext,skillReadiness} from './lib/office-skill-library.mjs';
test('role skill loads only its pinned methodology, records content hash and does not grant tools',async()=>{
 const root=await mkdtemp(join(tmpdir(),'office-skills-'));
 try{
  await mkdir(join(root,'copywriting'));await writeFile(join(root,'copywriting','SKILL.md'),'# Writing\nUse approved facts.');
  const library=[{id:'copywriting',roles:['copy'],repo:'owner/repo',ref:'pinned',license:'MIT'}];
  const result=await roleSkillContext('copy',library,root);
  assert.equal(result.receipts[0].ref,'pinned');assert.match(result.receipts[0].sha256,/^[a-f0-9]{64}$/);assert.match(result.text,/cannot authorise tools/);
  assert.equal((await roleSkillContext('unrelated',library,root)).receipts.length,0);
  assert.equal((await skillReadiness(library,root))[0].installed,true);
  assert.equal((await skillReadiness([{...library[0],id:'missing'}],root))[0].installed,false);
  await assert.rejects(roleSkillContext('copy',[{...library[0],id:'../outside'}],root),/Invalid skill/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('role protocols load only their own reference, reject ambiguous routing, tampering and escaped references',async()=>{
 const root=await mkdtemp(join(tmpdir(),'office-role-protocol-')),hash=s=>createHash('sha256').update(s).digest('hex');
 try{
  await mkdir(join(root,'protocol','roles'),{recursive:true});
  const files={'SKILL.md':'# Common boundaries','roles/copy.md':'COPY-ONLY-PLAYBOOK','roles/test.md':'PRIVATE-QA-PLAYBOOK'};
  for(const [path,body] of Object.entries(files))await writeFile(join(root,'protocol',path),body);
  const skill={id:'protocol',roles:['copy','test'],repo:'Jarvis internal',ref:'reviewed',license:'Internal',kind:'protocol',roleReferences:true,fileHashes:Object.fromEntries(Object.entries(files).map(([p,t])=>[p,hash(t)]))};
  const context=await roleSkillContext('copy',[skill],root);
  assert.match(context.text,/COPY-ONLY-PLAYBOOK/);assert.ok(!context.text.includes('PRIVATE-QA-PLAYBOOK'));assert.deepEqual(context.receipts[0].references,['roles/copy.md']);
  await assert.rejects(roleSkillContext('copy',[skill,skill],root),/Ambiguous protocol/);
  await writeFile(join(root,'protocol','roles/copy.md'),'Changed after review');
  await assert.rejects(roleSkillContext('copy',[skill],root),/integrity failed/);assert.equal((await skillReadiness([skill],root))[0].installed,false);
  await writeFile(join(root,'outside.md'),'Escaped source');await symlink(join(root,'outside.md'),join(root,'protocol','escape.md'));
  await assert.rejects(roleSkillContext('copy',[{...skill,fileHashes:undefined,roleReferences:false,references:['escape.md']}],root),/escaped/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all role methods remain compact and isolated in the checked-in playbook',async()=>{
 const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
 const shared=await readFile(new URL('../skills/jarvis-office-protocol/SKILL.md',import.meta.url),'utf8');
 assert.match(shared,/text-only/);assert.match(shared,/only the assigned role reference/);
 for(const role of [...plan.roles,...plan.executives]){
  const reference=await readFile(new URL(`../skills/jarvis-office-protocol/roles/${role.id}.md`,import.meta.url),'utf8');
  assert.match(reference,/## Deliverable/);assert.match(reference,/## Method/);assert.match(reference,/## Acceptance/);assert.ok(reference.length<2300);
 }
});
test('eight service departments have distinct desks, paid ads and only mapped known specialists',async()=>{
 const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
 assert.equal(plan.focusDepartments.length,8);
 const core=plan.focusDepartments.flatMap(d=>d.core);
 assert.equal(new Set(core).size,core.length);
 assert.ok(plan.focusDepartments.find(d=>d.id==='ads').core.includes('paid-ads'));
 assert.ok(core.every(id=>[...plan.roles,...plan.executives].some(r=>r.id===id)));
 assert.equal(new Set(plan.skillLibrary.map(s=>s.id)).size,plan.skillLibrary.length);
 for(const role of [...plan.roles,...plan.executives]){assert.equal(plan.skillLibrary.filter(s=>s.kind==='protocol'&&s.roles.includes(role.id)).length,1);for(const kind of ['workflow','quality'])assert.ok(plan.skillLibrary.filter(s=>(s.kind??'workflow')===kind&&s.roles.includes(role.id)).length<=1);}
 assert.ok(['analytics','ads-analyst'].every(id=>plan.skillLibrary.find(s=>s.id==='office-'+id)?.roles.includes(id)));
 assert.deepEqual(plan.skillLibrary.find(s=>s.id==='performance-report').roles,[]);
 assert.ok(!plan.skillLibrary.find(s=>s.id==='ads').roles.includes('analytics'));
 assert.ok(!plan.skillLibrary.find(s=>s.id==='social').roles.includes('video'));
 assert.ok(plan.skillLibrary.every(s=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.ref)));
});

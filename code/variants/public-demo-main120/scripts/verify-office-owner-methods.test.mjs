import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import plan from '../src/lib/office-stack-plan.json' with {type:'json'};
import adoption from '../src/lib/office-owner-architecture.json' with {type:'json'};
import {roleSkillContext,skillReadiness} from './lib/office-skill-library.mjs';
import {createJob,executeJob} from './lib/office-team-engine.mjs';
import {installOwnerMethods} from './install-office-owner-methods.mjs';
import {emptyOnboarding,onboardingBrief} from '../src/lib/office-onboarding.mjs';

const reference='references/owner-architecture-2026-10-15.md';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const library=join(plan.storage.recordsRoot,'library/skills');

test('adapted methods load only the assigned role and preserve the earlier hashed files',async()=>{
 assert.ok((await skillReadiness(plan.skillLibrary,library)).every(s=>s.installed));
 for(const role of adoption.roles){
  const method=plan.skillLibrary.find(s=>s.id===role.skillId),c=await roleSkillContext(role.roleId,plan.skillLibrary,library);
  const receipt=c.receipts.find(s=>s.id===method.id);
  assert.ok(receipt.references.includes(reference));if(receipt.ref!==role.ref){assert.equal(method.deliveryContractPrevious?.ref,role.ref);for(const [path,sha] of Object.entries(method.deliveryContractPrevious.fileHashes))assert.equal(method.fileHashes[path],sha);}else assert.equal(receipt.ref,role.ref);
  assert.ok(!Object.hasOwn(method.ownerArchitecturePrevious.fileHashes,reference));
  assert.ok(!Object.hasOwn(method.ownerArchitecturePrevious.fileHashes,role.entryPath));
  assert.notEqual(method.ownerArchitecturePrevious.contextPath,role.entryPath);
  assert.ok(c.text.includes('# Owner architecture: '+role.roleId+'\n'));
  for(const other of adoption.roles.filter(x=>x.roleId!==role.roleId))assert.ok(!c.text.includes('# Owner architecture: '+other.roleId+'\n'));
  assert.ok(c.text.length<48000);
  for(const [path,expected] of Object.entries(method.ownerArchitecturePrevious.fileHashes))assert.equal(hash(await readFile(join(library,method.id,path))),expected);
 }
 // A retained role outside this adoption has no unrelated legacy department pack.
 const billing=await roleSkillContext('billing',plan.skillLibrary,library);
 assert.ok(!billing.text.includes('# Owner architecture:'));
});

test('every owner-source pin matches the retained original snapshot',async()=>{
 for(const source of adoption.sources)assert.equal(hash(await readFile(join(adoption.sourceSnapshotRoot,source.relativePath))),source.sha256);
 for(const role of adoption.roles)for(const pin of role.sources)assert.ok(adoption.sources.some(s=>s.relativePath===pin.relativePath&&s.sha256===pin.sha256));
});

test('installation is additive and idempotent and refuses a modified installed method before writing',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'owner-method-install-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const repository=join(temp,'repo'),records=join(temp,'SSD'),id='office-fixture',path='skills/agent-roles/'+id;
 await mkdir(join(repository,path,'references'),{recursive:true});await mkdir(join(records,'library/skills',id),{recursive:true});
 const files={'SKILL.md':'# Existing role\nNo new grants.','entry-2026-10-15-owner-architecture.md':'# Active version','references/owner-architecture-2026-10-15.md':'# Relevant owner method'};
 for(const [name,body] of Object.entries(files))await writeFile(join(repository,path,name),body);
 await writeFile(join(records,'library/skills',id,'SKILL.md'),files['SKILL.md']);
 const fixture={storage:{testing:true,recordsVolume:temp,recordsRoot:records},skillLibrary:[{id,path,roles:['fixture'],repo:'fixture',license:'Internal',kind:'workflow',ownerArchitectureRevision:'2026-10-15',ref:'a'.repeat(64),contextPath:'entry-2026-10-15-owner-architecture.md',references:[reference],fileHashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(v)]))}]};
 const preflight=await installOwnerMethods(fixture,repository);assert.equal(preflight.newFiles,3);
 assert.equal((await installOwnerMethods(fixture,repository,{apply:true})).legacyFilesOverwritten,0);
 assert.equal((await installOwnerMethods(fixture,repository,{apply:true})).newFiles,0);
 await writeFile(join(records,'library/skills',id,'SKILL.md'),'A local edit');
 await assert.rejects(()=>installOwnerMethods(fixture,repository,{apply:true}),/Installed method changed/);
 assert.equal(await readFile(join(records,'library/skills',id,'SKILL.md'),'utf8'),'A local edit');
});

for(const role of ['success','video','creative-director','ads-analyst'])test('actual executor archives the new '+role+' guidance without additional tools (mock model)',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'owner-method-executor-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const storage={testing:true,recordsVolume:temp,recordsRoot:join(temp,'SSD')},directory=join(temp,'jobs'),id=randomUUID(),agentId=randomUUID();await mkdir(directory);
 const skills=plan.skillLibrary.filter(s=>s.roles.includes(role));
 for(const skill of skills)await cp(join(library,skill.id),join(storage.recordsRoot,'library/skills',skill.id),{recursive:true});
 const actor={id:agentId,name:'Fixture '+role,status:'idle',metadata:{jarvisBlueprintRoleId:role,modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}};
 let issue,invocations=0;const runs=new Map();
 const api=async(path,body,verb)=>{
  if(path.endsWith('/agents'))return[actor];
  if(path.endsWith('/issues')){issue={...body,id:randomUUID()};return issue;}
  if(path.endsWith('/heartbeat/invoke')){invocations++;const runId=randomUUID();runs.set(runId,{id:runId,status:'succeeded',resultJson:{summary:'Synthetic reply. No external action or production quality verified.'},usageJson:{billingType:'subscription_included',model:'fixture'}});return{id:runId,status:'queued'};}
  if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);
  if(verb==='PATCH')return body;throw new Error('Unexpected fixture operation '+path);
 };
 await createJob({id,kind:'conversation',targetAgentId:agentId,brief:'Prepare the assigned part of a fictional onboarding campaign for owner review.',context:'FICTIONAL_CLIENT_ONLY: blue cup; quantities, performance and publishing approval unknown.',criteria:['Use supplied facts only.']},directory);
 const result=await executeJob(id,{...plan,storage,skillLibrary:skills,toolBridge:{enabled:false}},{directory,api,pollMs:1,modelPolicy:()=>true});
 assert.equal(result.status,'answered');assert.equal(invocations,1);assert.deepEqual(result.calls[0].tools,[]);
 assert.ok(issue.description.includes('# Owner architecture: '+role+'\n'));assert.match(issue.description,/FICTIONAL_CLIENT_ONLY/);
 const receipt=result.calls[0].skills.find(s=>s.id==='office-'+role);assert.ok(receipt.references.includes(reference));
 const manifest=JSON.parse(await readFile(join(storage.recordsRoot,'tasks',id,'manifest.json'),'utf8'));assert.ok(manifest.calls[0].skills.some(s=>s.id===receipt.id&&s.ref===receipt.ref&&s.contextSha256===receipt.contextSha256));assert.equal(result.archive.status,'synced');
});

test('the onboarding handoff preserves saved service scope and records unverified agreement as a requirement',()=>{
 const r=emptyOnboarding('fixture-client');r.services=['social'];r.intake.scope='Draft proposal quantity unresolved';r.departments.social.brief='Monthly calendar';
 const draft=onboardingBrief(r,{id:'fixture-client',title:'Fixture client',status:'draft',revision:'a'.repeat(64)}),context=JSON.parse(draft.context);
 assert.deepEqual(Object.keys(context.departments),['social']);assert.equal(context.intake.scope,r.intake.scope);assert.equal(draft.contextRequest.mode,'draft');
 assert.ok(context.readiness.every(d=>!d.ready));assert.match(context.handoffPolicy.scopeBasis,/notes alone do not prove agreement/);
 assert.match(context.handoffPolicy.missingInputs,/Continue independent work/);assert.match(draft.criteria,/quantity or unresolved quantity/);
});

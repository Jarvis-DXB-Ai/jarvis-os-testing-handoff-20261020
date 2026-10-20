import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import plan from '../src/lib/office-stack-plan.json' with {type:'json'};
import {roleSkillContext,skillReadiness} from './lib/office-skill-library.mjs';
import {clientDeskSkillContext} from './lib/office-client-methods.mjs';
import {createJob,executeJob} from './lib/office-team-engine.mjs';
const root=join(plan.storage.recordsRoot,'library/skills');
test('installed active roles each load exactly their own specialist workflow within the bounded context',async()=>{
 const roles=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active');
 assert.equal(roles.length,65);const readiness=await skillReadiness(plan.skillLibrary,root);assert.ok(readiness.every(s=>s.installed));
 for(const role of roles){const c=await roleSkillContext(role.id,plan.skillLibrary,root),specialists=c.receipts.filter(s=>s.id.startsWith('office-'));assert.deepEqual(specialists.map(s=>s.id),['office-'+role.id]);assert.ok(c.text.length<=48000);const own=plan.skillLibrary.find(s=>s.id==='office-'+role.id);assert.equal(own.kind,'workflow');assert.ok(own.sourceRefs.length>0);assert.ok(own.sourceRefs.every(s=>/^[a-f0-9]{40}$/.test(s.ref)&&/^[a-f0-9]{64}$/.test(s.sha256)));}
});
test('client QA uses the relevant departmental specialist pack rather than generic final-review or another department',async()=>{
 const expected={social:'social-qa',content:'content-qa',design:'creative-qc',web:'web-qa',ads:'ads-qa',email:'email-qa',support:'support-qa',finance:'finance-qa',operations:'operations-qa',knowledge:'research-qa'};
 for(const [department,role] of Object.entries(expected)){const c=await clientDeskSkillContext({metadata:{jarvisBlueprintRoleId:'test',jarvisClientSlot:'qa:'+department}},plan.skillLibrary,root);assert.deepEqual(c.receipts.filter(s=>s.id.startsWith('office-')).map(s=>s.id),['office-'+role]);assert.ok(!c.receipts.some(s=>s.id==='office-test'));assert.ok(c.text.length<=48000);}
});
test('the installed assignment reference is receipt-tracked and tampering fails before context can be used',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'office-practice-integrity-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const skill=plan.skillLibrary.find(s=>s.id==='office-instagram');assert.equal(skill.packVersion,2);
 await cp(join(root,skill.id),join(directory,skill.id),{recursive:true});
 const original=await roleSkillContext('instagram',[skill],directory);
 assert.ok(original.receipts[0].references.includes('references/practice.md'));
 const path=join(directory,skill.id,'references/practice.md');
 await writeFile(path,(await readFile(path,'utf8'))+'\nUnreviewed change.');
 await assert.rejects(()=>roleSkillContext('instagram',[skill],directory),/Skill integrity failed/);
});
test('actual conversation executor injects the installed specialist pack and saves its receipt with no new tool grant',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'office-role-skill-executor-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')},id=randomUUID(),agentId=randomUUID();
 const library=plan.skillLibrary.filter(s=>s.roles.includes('copy'));for(const s of library){const target=join(storage.recordsRoot,'library/skills',s.id);await mkdir(target,{recursive:true});await cp(join(root,s.id),target,{recursive:true});}
 const agent={id:agentId,name:'Fixture Copywriter',status:'idle',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}};
 let issue,invocations=0;const runs=new Map();
 const api=async(path,body,method)=>{if(path.endsWith('/agents'))return[agent];if(path.endsWith('/issues')){issue={...body,id:randomUUID()};return issue;}if(path.endsWith('/heartbeat/invoke')){invocations++;const runId=randomUUID();runs.set(runId,{id:runId,status:'succeeded',resultJson:{summary:'Synthetic complete copy using only the supplied fictional facts.'},usageJson:{billingType:'subscription_included',model:'fixture'}});return{id:runId,status:'queued'};}if(path.startsWith('/heartbeat-runs/'))return runs.get(path.split('/')[2]);if(method==='PATCH')return body;throw new Error('Unexpected mock operation '+path);};
 await createJob({id,kind:'conversation',targetAgentId:agentId,brief:'Write a complete fictional product caption.',context:'ALPHA_ONLY_INPUT: fictional cup, blue, price unknown.',criteria:['Use supplied facts only.']},directory);
 const result=await executeJob(id,{...plan,storage,skillLibrary:library,toolBridge:{enabled:false}},{directory,api,pollMs:1,modelPolicy:()=>true});
 assert.equal(result.status,'answered');assert.equal(invocations,1);assert.ok(result.calls[0].skills.some(s=>s.id==='office-copy'));assert.deepEqual(result.calls[0].tools,[]);
 assert.match(issue.description,/ALPHA_ONLY_INPUT/);assert.match(issue.description,/Assigned role: `copy`/);assert.match(issue.description,/Claim-to-source notes only where useful/);assert.ok(!issue.description.includes('Assigned role: `bookkeeping`'));assert.match(issue.description,/No tools are granted/);
 const manifest=JSON.parse(await readFile(join(storage.recordsRoot,'tasks',id,'manifest.json'),'utf8'));assert.ok(manifest.calls[0].skills.some(s=>s.id==='office-copy'&&s.references.includes('references/practice.md')));assert.equal(result.archive.status,'synced');
});

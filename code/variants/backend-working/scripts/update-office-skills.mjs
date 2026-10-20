import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {listJobs,activeStates} from './lib/office-team-engine.mjs';
import {roleSkillContext,skillReadiness} from './lib/office-skill-library.mjs';
const root=resolve(new URL('..',import.meta.url).pathname),planPath=join(root,'src/lib/office-stack-plan.json');
const plan=JSON.parse(await readFile(planPath,'utf8'));
if((await listJobs()).some(j=>activeStates.includes(j.status)))throw new Error('A team is active; apply skill revisions after it finishes.');
const libraryRoot=join(plan.storage.recordsRoot,'library/skills'),date='2026-10-13';
const digest=s=>createHash('sha256').update(s).digest('hex');
const roles=[...plan.executives,...plan.roles].map(r=>r.id);
for(const skill of plan.skillLibrary.filter(s=>!['jarvis-office-protocol','competitive-brief','performance-report','variance-analysis'].includes(s.id))){
 const folder=join(libraryRoot,skill.id);await mkdir(join(folder,'revisions',date),{recursive:true});
 for(const file of ['SKILL.md',...(skill.contextPath?[skill.contextPath]:[])]){
  try{await writeFile(join(folder,'revisions',date,file),await readFile(join(folder,file)),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 await copyFile(join(root,'skills/office-methods',`${skill.id}.md`),join(folder,'JARVIS-GUIDANCE.md'));
 skill.contextPath='JARVIS-GUIDANCE.md';skill.reviewedAt=date;skill.adaptation='Compact Jarvis method; original source retained. No scripts or extra references executed.';
}
const byId=id=>plan.skillLibrary.find(s=>s.id===id);
byId('social').roles=['grid-planner','scheduler','repurpose'];
byId('ads').roles=['paid-ads'];
byId('copywriting').roles=['copy','voice'];
byId('content-strategy').roles=['brand-strategist','proposal','audit','cmo'];
byId('journal-entry-prep').roles=[];
byId('humanizer').roles=['copy','voice','video','email','community','success'];
byId('mc-art-direction').roles=['creative-director','creative-qc','design-system','image-prompts'];
const additions=[
 {id:'jarvis-office-protocol',name:'Jarvis role playbook',roles,department:'shared',repo:'Jarvis OS internal guidance',path:'',ref:'',license:'Internal guidance',kind:'protocol',roleReferences:true},
 {id:'competitive-brief',name:'Competitor research',roles:['competitors'],department:'strategy',repo:'anthropics/knowledge-work-plugins',path:'marketing/skills/competitive-brief',ref:'02ffa99ff00ce4d3046ccebabb8357cb39f3ab06',license:'Apache-2.0',kind:'workflow'},
 {id:'performance-report',name:'Performance reporting',roles:['analytics'],department:'marketing',repo:'anthropics/knowledge-work-plugins',path:'marketing/skills/performance-report',ref:'02ffa99ff00ce4d3046ccebabb8357cb39f3ab06',license:'Apache-2.0',kind:'workflow'},
 {id:'variance-analysis',name:'Financial driver analysis',roles:['cfo','margin'],department:'accounting',repo:'anthropics/knowledge-work-plugins',path:'finance/skills/variance-analysis',ref:'02ffa99ff00ce4d3046ccebabb8357cb39f3ab06',license:'Apache-2.0',kind:'workflow'}
];
for(const skill of additions){
 const dest=join(libraryRoot,skill.id);await mkdir(dest,{recursive:true});
 const src=join(root,'skills',skill.id);
 for(const file of await readdir(src)){if(file.startsWith('._'))continue;if(file==='roles'){await mkdir(join(dest,file),{recursive:true});for(const role of roles)await copyFile(join(src,file,`${role}.md`),join(dest,file,`${role}.md`));}else await copyFile(join(src,file),join(dest,file));}
 if(skill.kind==='protocol')skill.ref=digest(await readFile(join(dest,'SKILL.md'),'utf8')+await Promise.all(roles.map(id=>readFile(join(dest,'roles',`${id}.md`),'utf8'))).then(t=>t.join('\n')));
 skill.reviewedAt=date;
 const index=plan.skillLibrary.findIndex(s=>s.id===skill.id);if(index<0)plan.skillLibrary.push(skill);else plan.skillLibrary[index]=skill;
}
for(const skill of plan.skillLibrary){
 const paths=['SKILL.md',...(skill.contextPath?[skill.contextPath]:[]),...(skill.references??[]),...(skill.roleReferences?roles.map(id=>`roles/${id}.md`):[])];
 skill.fileHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,digest(await readFile(join(libraryRoot,skill.id,path),'utf8'))])));
}
const readiness=await skillReadiness(plan.skillLibrary,libraryRoot);if(readiness.some(s=>!s.installed))throw new Error('Skill validation failed before routing update.');
const coverage=[];
for(const roleId of roles){const context=await roleSkillContext(roleId,plan.skillLibrary,libraryRoot);if(!context.receipts.some(s=>s.id==='jarvis-office-protocol'))throw new Error('Missing role playbook');coverage.push({roleId,methods:context.receipts.map(s=>s.id),contextCharacters:context.text.length,receipts:context.receipts});}
await writeFile(planPath,JSON.stringify(plan,null,2)+'\n');
const report={reviewedAt:date,roles:roles.length,libraryMethods:plan.skillLibrary.length,runtimeMaximumMethodsPerRole:3,coverage,limitations:'Method routing and integrity verified; output quality requires real-task evaluation. Text route cannot execute creative apps or external actions.'};
await writeFile(join(plan.storage.recordsRoot,'research',date+'-role-skill-audit','coverage.json'),JSON.stringify(report,null,2)+'\n');
// Save per-agent routing without changing historical task profiles or source grants.
const response=await fetch(`http://127.0.0.1:3100/api/companies/${plan.paperclipCompanyId}/agents`,{headers:{origin:'http://127.0.0.1:3100'}});
if(!response.ok)throw new Error('Routing installed; agent profile export needs Paperclip connection.');
for(const agent of await response.json()){
 if(agent.metadata?.jarvisSpawnedForTask)continue;
 const row=coverage.find(r=>r.roleId===agent.metadata?.jarvisBlueprintRoleId);if(!row)continue;
 const folder=join(plan.storage.recordsRoot,'agents',agent.id);await mkdir(folder,{recursive:true});await writeFile(join(folder,'skills-profile.json'),JSON.stringify({...row,agentId:agent.id,reviewedAt:date,scope:'Assigned role reference and selected methods only; no full archive access'},null,2)+'\n');
}
console.log(JSON.stringify({roles:roles.length,libraryMethods:plan.skillLibrary.length,maxContextCharacters:Math.max(...coverage.map(c=>c.contextCharacters)),scope:'Methods updated. No model jobs or tool actions.'}));

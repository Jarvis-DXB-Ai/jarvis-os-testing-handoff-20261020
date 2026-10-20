import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';import {createHash} from 'node:crypto';
import {listJobs,activeStates} from './lib/office-team-engine.mjs';
import {skillReadiness,roleSkillContext} from './lib/office-skill-library.mjs';
import {clientDeskSkillContext} from './lib/office-client-methods.mjs';
const root=process.cwd(),planPath=join(root,'src/lib/office-stack-plan.json'),before=await readFile(planPath,'utf8'),plan=JSON.parse(before),hash=b=>createHash('sha256').update(b).digest('hex');
if((await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER})).some(j=>activeStates.includes(j.status)||j.status==='recovery_required'))throw new Error('An existing Office task must be reconciled before changing its skill inputs.');
const definition=JSON.parse(await readFile(join(root,'skills/operating-methods/sahni-adaptations.json'),'utf8')),library=join(plan.storage.recordsRoot,'library/skills'),report=join(plan.storage.recordsRoot,'research/2026-10-14-sahni-guide'),backup=join(report,'installation-backup');await mkdir(backup,{recursive:true,mode:0o700});
const active=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active').map(r=>r.id),activeSet=new Set(active);
const mapping={
 'mc-delivery-loop':active,'mc-context-handoff':active,
 'mc-decision-review':['coo','cmo','creative-director','cto','cfo','brand-strategist','competitors','knowledge','pricing','margin','ads-lead','email-lead','support-lead','success','delivery'],
 'mc-file-library':['librarian','knowledge','delivery','bookkeeping','billing','media'],
 'mc-video-edit-plan':['media','video','videographer','content-qa'],
 'mc-operations-brief':['coo','delivery','success','support-lead','crm','bookings','cfo','billing','subscriptions'],
};
const installation=[];
for(const def of definition.skills){
 const source=join(root,'skills/operating-methods',def.id),files=['SKILL.md','references/source-review.md'],fileHashes={};for(const file of files)fileHashes[file]=hash(await readFile(join(source,file)));
 const destinations=[join(library,def.id),join(homedir(),'.codex/skills',def.id),join(homedir(),'.claude/skills',def.id)];
 for(const dest of destinations){let exists=true;try{await access(dest);}catch{exists=false;}if(exists){for(const file of files)if(hash(await readFile(join(dest,file)))!==fileHashes[file])throw new Error('Existing skill differs: '+dest+'. Preserve and reconcile it before installing.');}}
 const rows=await Promise.all(def.sources.map(async guide=>({url:'https://sahni.ai/guide/'+guide,repo:'sahni.ai',path:'guide/'+guide,sha256:hash(await readFile(join(report,guide+'.txt'))),ref:hash(await readFile(join(report,guide+'.txt'))),license:'Dated public guidance; original MC Studios adaptation'})));
 const skill={id:def.id,name:def.name,description:def.description,output:def.description,roles:mapping[def.id].filter(id=>activeSet.has(id)),department:'shared',repo:'MC Studios original adaptation',path:'skills/operating-methods/'+def.id,ref:hash(JSON.stringify(fileHashes)),license:'Internal original guidance; sources attributed',kind:'supplement',references:['references/source-review.md'],reviewedAt:'2026-10-14',adaptation:'Source-reviewed public methods adapted for Jarvis; no gated pack, canary suffix, permission or automatic retry added.',sourceRefs:rows,fileHashes};
 const existing=plan.skillLibrary.findIndex(s=>s.id===def.id);if(existing>=0)plan.skillLibrary[existing]=skill;else plan.skillLibrary.push(skill);
 installation.push({id:def.id,roles:skill.roles,source,destinations,fileHashes});
}
await writeFile(join(backup,'registry-before.json'),before,{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
for(const item of installation)for(const dest of item.destinations){await mkdir(dest,{recursive:true,mode:0o700});await cp(item.source,dest,{recursive:true,errorOnExist:false});}
const readiness=await skillReadiness(plan.skillLibrary,library);if(readiness.some(s=>!s.installed))throw new Error('Installed method integrity failed before registry activation.');
const contexts=[];for(const roleId of active){const c=await roleSkillContext(roleId,plan.skillLibrary,library);if(!c.receipts.some(s=>s.id==='mc-delivery-loop')||!c.receipts.some(s=>s.id==='mc-context-handoff'))throw new Error('Shared methods were not injected.');contexts.push({roleId,characters:c.text.length,methods:c.receipts.map(r=>r.id)});}
const qa=[];for(const department of ['social','content','design','web','ads','email','support','finance','operations','knowledge']){const c=await clientDeskSkillContext({metadata:{jarvisBlueprintRoleId:'test',jarvisClientSlot:'qa:'+department}},plan.skillLibrary,library);qa.push({department,characters:c.text.length,methods:c.receipts.map(r=>r.id)});}
plan.skillResearch.sahniGuideReview={checkedAt:'2026-10-14',guidesIndexed:15,publicGuidesReviewed:8,adaptedMethods:6,scope:'Original Jarvis adaptations; gated originals not unlocked',sourceRoot:report};
if(await readFile(planPath,'utf8')!==before)throw new Error('The skill registry changed during preparation. Reconcile before activating.');
await writeFile(planPath,JSON.stringify(plan,null,2)+'\n');
await writeFile(join(report,'installation.json'),JSON.stringify({checkedAt:new Date().toISOString(),installation,contexts,qa,verifiedMethods:readiness.length,maxContextCharacters:Math.max(...contexts.map(c=>c.characters),...qa.map(c=>c.characters)),verification:'Real local file installation, integrity and prompt/receipt routing; no live model call or performance benchmark.'},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({installed:installation.map(i=>i.id),verifiedMethods:readiness.length,activeRoles:contexts.length,qaScopes:qa.length,maxCharacters:Math.max(...contexts.map(c=>c.characters),...qa.map(c=>c.characters)),sourceRoot:report},null,2));

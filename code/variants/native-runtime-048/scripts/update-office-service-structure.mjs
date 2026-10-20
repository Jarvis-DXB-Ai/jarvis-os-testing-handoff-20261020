import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateRoster} from './lib/office-roster.mjs';
import {listJobs,activeStates} from './lib/office-team-engine.mjs';
import {roleSkillContext,skillReadiness} from './lib/office-skill-library.mjs';
const planPath=new URL('../src/lib/office-stack-plan.json',import.meta.url),plan=JSON.parse(await readFile(planPath,'utf8'));
const report=join(plan.storage.recordsRoot,'reports/department-structure-2026-10-13');
const additions=[
 ['instagram','Instagram Manager','grid-planner','Instagram calendar, feed/Reel/Story/Highlight adaptations and approved publishing handoff.'],
 ['linkedin','LinkedIn Manager','copy','LinkedIn page strategy, professional posts, executive content and community handoff.'],
 ['facebook','Facebook Manager','copy','Facebook page calendar, audience-specific copy, community context and publishing handoff.'],
 ['social-qa','Social Media QA','voice','Review social facts, voice, channel fit, captions, accessibility and calendar consistency.'],
 ['videographer','AI Videographer','video','Shot direction, storyboards, source-led scene production specifications and generation handoff.'],
 ['content-qa','Photo & Video QA','creative-qc','Review shot continuity, real product/venue geometry, source authenticity, framing, audio and final media evidence.'],
 ['presentations','Presentation Designer','design-system','Editable proposals, pitch decks, brand-guideline presentations and slide narrative with source-backed claims.'],
 ['web-designer','Web Designer','design-system','Responsive website layouts, conversion journeys, typography, interaction and design-system handoff.'],
 ['web-research','Web Researcher','audit','Evidence-led UX, competitor, content and technical discovery for the exact website brief.'],
 ['web-qa','Web & Backend QA','test','Review backend contracts, security boundaries, keyboard access, responsive behavior, errors and actual browser evidence.'],
 ['ads-lead','Head of Ads','paid-ads','Own paid-media strategy, channel allocation, measurement dependencies and department summaries.'],
 ['ads-analyst','Ads Analyst','analytics','Interpret sourced campaign reports, tracking quality, attribution limits and test outcomes.'],
 ['meta-ads','Meta Ads Specialist','paid-ads','Meta campaign structure, audiences, approved creative, measurement and launch-ready draft handoff.'],
 ['linkedin-ads','LinkedIn Ads Specialist','paid-ads','LinkedIn B2B audience, offer, campaign structure and creative testing handoff.'],
 ['youtube-ads','YouTube Ads Specialist','paid-ads','YouTube video-ad scripts, campaign structure, format-specific creative and measurement handoff.'],
 ['tiktok-ads','TikTok Ads Specialist','paid-ads','TikTok native creative hypotheses, hooks, campaign structure and measurement handoff.'],
 ['ads-qa','Ads & Tracking QA','analytics','Review offer/claim accuracy, targeting, creative, consent, tracking and approved budget before any launch.'],
 ['email-lead','Head of Email Marketing','email','Own lifecycle strategy, audience/consent dependencies, campaign priorities and email department summaries.'],
 ['email-design','Email Designer','design-system','Responsive email templates, hierarchy, visual brand consistency and implementation handoff.'],
 ['email-qa','Email Marketing QA','voice','Review subject/body/CTA, brand, links, consent, segment logic, mobile layout and send-readiness evidence.'],
 ['support-lead','Head of Customer Support & CRM','success','Own response policy, channel routing, escalation, CRM/booking handoffs and support summaries.'],
 ['whatsapp','WhatsApp Support Specialist','community','WhatsApp reply drafts and approved flows with channel-specific consent, FAQs and escalation.'],
 ['crm','CRM Specialist','success','Source-backed lead/contact stages, follow-up drafts, CRM hygiene and exact-client handoffs.'],
 ['bookings','Bookings Coordinator','success','Enquiry intake, availability gaps, booking follow-up drafts and verified booking-to-finance handoff.'],
 ['support-qa','Customer Support QA','voice','Review DM/WhatsApp replies, booking facts, response policies, private-data boundaries and correct escalation.'],
 ['finance-qa','Finance QA','evaluation','Independently reconcile recorded invoices, payments, bookings and assumptions; flag jurisdiction/accounting uncertainty.'],
 ['operations-qa','Operations QA','test','Review onboarding completeness, exact client/scope, delivery dependencies and approval handoffs.'],
 ['research-qa','Research & Learning QA','evaluation','Verify cited evidence, dates, contradictions, rights/provenance and scoped lesson proposals.'],
];
for(const [id,name,template,output] of additions){if(plan.roles.some(r=>r.id===id))continue;const source=plan.roles.find(r=>r.id===template);const {paperclipAgentId,...base}=source;void paperclipAgentId;plan.roles.push({...base,id,name,output,rosterStatus:'active',mergedInto:'',modelStatus:'Idle registration pending',reason:'Use the existing subscription-verified '+base.model+' model for this scoped specialty; tools and source evidence determine delivery readiness.'});}
const department=(id,name,head,qa,members,tools,purpose)=>({id,name,headRoleId:head,qaRoleId:qa,roles:[head,...members,qa],core:[head,qa,...members.slice(0,4)],color:'#94ba9f',purpose,inputs:'Exact client brief, approved brand, dated source evidence and service-specific access',outputs:'Complete scoped specialist outputs, independent department QA and head summary',tools,gaps:'Account access and tool execution must be verified separately; no publishing, sending or spending follows from role registration.'});
plan.focusDepartments=[
 department('social','Social Media','cmo','social-qa',['grid-planner','copy','instagram','linkedin','facebook','scheduler','analytics'],['zernio','meta','assets','review'],'Social strategy, copywriting, Instagram, LinkedIn, Facebook, publishing and reports'),
 department('content','Content','video','content-qa',['image-prompts','videographer','media'],['higgsfield','blender','ffmpeg','assets','review'],'Creative direction, AI photography, videography and video editing'),
 department('design','Graphic Design','creative-director','creative-qc',['design-system','presentations','voice'],['canva','sharp','pinterest','assets','review'],'Brand identity, visual systems, presentations and verbal brand guidance'),
 department('web','Web Design','cto','web-qa',['web-designer','implementation','web-research','audit','integrations'],['cloudflare','github','assets','review'],'Website design, backend engineering, research, SEO and technical quality'),
 department('ads','Ads','ads-lead','ads-qa',['paid-ads','ads-analyst','meta-ads','linkedin-ads','youtube-ads','tiktok-ads'],['meta','assets','review'],'Paid-media strategy, Meta, LinkedIn, YouTube, TikTok and measurement'),
 department('email','Email Marketing','email-lead','email-qa',['email','email-design'],['mailchimp','canva','assets','review'],'Email strategy, campaigns, automation, templates and lifecycle journeys'),
 department('support','Customer Support & CRM','support-lead','support-qa',['community','whatsapp','crm','bookings'],['manychat','zernio','assets','review'],'Social DMs, WhatsApp, enquiry handling, CRM and bookings'),
 department('finance','Finance','cfo','finance-qa',['bookkeeping','billing','margin','pricing','subscriptions'],['assets','review'],'Invoices, payment tracking, booking revenue handoffs, profitability and recorded spend'),
];
plan.supportDepartments=[
 department('operations','Client Onboarding & Operations','coo','operations-qa',['delivery','success','proposal','workflow-architect','reliability','test'],['assets','review'],'COO orchestration, onboarding, service scope, delivery coordination and final independent QA'),
 department('knowledge','Research & Learning','knowledge','research-qa',['brand-strategist','competitors','librarian','evaluation'],['github','pinterest','assets','review'],'Business/brand discovery, competitor analysis, source assets, reusable skills and reviewed lessons'),
];
const names={cmo:'Head of Social Media',video:'Content Creative Director','image-prompts':'AI Photographer',media:'Video Editor & Motion Designer','creative-director':'Graphic Design Creative Director','design-system':'Brand Identity & Visual Systems Designer',cto:'Head of Web Design',implementation:'Web & Backend Engineer',audit:'SEO & Website Auditor',community:'Social DM Support Specialist',email:'Email Copy & Automation Specialist',knowledge:'Head of Research & Learning',test:'Final Delivery QA'};
for(const d of [...plan.focusDepartments,...plan.supportDepartments])for(const id of d.roles){const r=[...plan.executives,...plan.roles].find(r=>r.id===id);if(!r)throw new Error('Missing roster member '+id);if(names[id])r.name=names[id];r.departmentId=d.id;r.department=d.name;r.reportsTo=id==='coo'?null:id===d.headRoleId?'coo':d.headRoleId;if(id===d.headRoleId)r.output='Own '+d.purpose.toLowerCase()+'. Assign useful work, resolve dependencies and summarize your department’s completed outputs and QA evidence for the COO.';}
plan.departmentQaEnabled=true;plan.rosterReview={...plan.rosterReview,version:'2026-10-13-services-r2',activeRoles:[...plan.roles,...plan.executives].filter(r=>r.rosterStatus==='active').length,decision:'Eight service departments with their own head and QA; two shared onboarding/research teams. Optional specialties, not always-running workers.',reviewPolicy:'Department QA roles do not author specialist outputs. Each gate reviews its own department before the head summary; final QA independently checks the assembled deliverable.',handoff:'Owner → COO → scoped department specialists → department QA → department heads → COO synthesis → final QA → owner review'};
validateRoster(plan);
const mapping={social:['instagram','linkedin','facebook'],ads:['ads-lead','meta-ads','linkedin-ads','youtube-ads','tiktok-ads'],copywriting:[], 'performance-report':['ads-analyst'],'content-strategy':['web-research'],'higgsfield-generate':['videographer'],'ffmpeg-video-editor':[],'design-system':['presentations','web-designer','email-design'],'email-lifecycle':['email-lead'],'support-response':['support-lead','whatsapp'],'client-onboarding':['crm','bookings']};
for(const [id,roles] of Object.entries(mapping)){const skill=plan.skillLibrary.find(s=>s.id===id);if(skill)skill.roles=[...new Set([...skill.roles,...roles])];}
plan.skillLibrary.find(s=>s.id==='humanizer').roles=[...new Set([...plan.skillLibrary.find(s=>s.id==='humanizer').roles,'instagram','linkedin','facebook','email-lead','support-lead','whatsapp','crm','bookings','videographer'])];
const protocol=plan.skillLibrary.find(s=>s.id==='jarvis-office-protocol');protocol.roles=[...plan.executives,...plan.roles].map(r=>r.id);
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',departments:plan.focusDepartments.map(d=>({name:d.name,head:d.headRoleId,qa:d.qaRoleId,roles:d.roles.length})),activeRoles:plan.rosterReview.activeRoles,newRoles:additions.length,modelsStarted:0}));
if(!process.argv.includes('--apply'))process.exit(0);
if((await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER})).some(j=>activeStates.includes(j.status)||j.status==='recovery_required'))throw new Error('Apply structure only while Office is idle.');
await mkdir(report,{recursive:true});try{await writeFile(join(report,'plan-before.json'),await readFile(planPath),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const local=new URL('../skills/jarvis-office-protocol/roles/',import.meta.url),runtime=join(plan.storage.recordsRoot,'library/skills/jarvis-office-protocol');
for(const r of [...plan.executives,...plan.roles]){
 const d=[...plan.focusDepartments,...plan.supportDepartments].find(d=>d.roles.includes(r.id));
 if(!d)continue;
 const quality=d.qaRoleId===r.id||r.id==='test',method=quality?'Independently inspect only the supplied outputs and evidence. Return concrete pass/fail checks, corrections and missing verification. Do not author the work you review, treat another agent’s confidence as evidence or invent tool use. Propose client- and department-scoped lessons for owner review.':'Use the approved brand and current client evidence, then apply your selected domain methods. Return the useful finished artifact or text with source references, unresolved facts and exact production dependencies. Channel specialists adapt the shared strategy to their platform; actual creation/sending/publishing requires verified tools and task authorization.';
 const text=`# ${r.name}\n\nRole: \`${r.id}\`\nDepartment: ${d.name}\n\n## Deliverable\n${r.output}\n\n## Method\n${method}\n\n## Acceptance\nExact client, scope and approved source versions; no invented metrics, bookings, balances or completed actions. Respect format, length and channel constraints. Distinguish draft, saved output, rendered evidence, quality review, owner approval and external delivery. An AI photographer/videographer creates AI work through generation tools; real-world capture requires human supplied material.\n\n## Ownership\nReporting lead: \`${r.reportsTo??'owner'}\`. ${d.headRoleId===r.id?'Summarize every covered part and saved department QA evidence for the COO.':quality?'Stay independent from this department’s authors.':'Hand completed work to this department’s QA and head.'} No new tools, access or approval are granted by this charter.\n`;
 await writeFile(new URL(r.id+'.md',local),text);await mkdir(join(runtime,'roles'),{recursive:true});const target=join(runtime,'roles',r.id+'.md');try{await copyFile(target,join(report,r.id+'-playbook-before.md'),1);}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}await writeFile(target,text);
}
const hash=b=>createHash('sha256').update(b).digest('hex');
protocol.fileHashes={...protocol.fileHashes};for(const id of protocol.roles)protocol.fileHashes['roles/'+id+'.md']=hash(await readFile(join(runtime,'roles',id+'.md')));
protocol.ref=hash((await readFile(join(runtime,'SKILL.md'),'utf8'))+(await Promise.all(protocol.roles.map(id=>readFile(join(runtime,'roles',id+'.md'),'utf8')))).join('\n'));
const library=join(plan.storage.recordsRoot,'library/skills');if((await skillReadiness(plan.skillLibrary,library)).some(s=>!s.installed))throw new Error('Method integrity failed.');
const coverage=[];for(const role of [...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active')){const c=await roleSkillContext(role.id,plan.skillLibrary,library);coverage.push({role:role.id,methods:c.receipts.map(r=>r.id),characters:c.text.length});}
await writeFile(join(report,'coverage.json'),JSON.stringify(coverage,null,2));await writeFile(planPath,JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({saved:true,activeRoles:plan.rosterReview.activeRoles,maxContext:Math.max(...coverage.map(c=>c.characters)),report,modelsStarted:0}));

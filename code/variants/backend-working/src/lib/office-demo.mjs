import {demoDepartmentCatalogue,demoTaskCatalogue,demoScenarios,demoCatalogueInfo} from './office-demo-catalogue.mjs';
/** Original scripted showroom. Pure projection: no providers, tools, persistence or network. */
const stage=(role,label,duration,detail,kind='work')=>({role,label,duration,detail,kind});
export const demoClient={id:'showroom-demo',name:'Demo',logoUrl:'/office-demo-mark.svg'};
export const demoConnections=[
 {id:'canva',name:'Canva',purpose:'Brand layouts, business carousels and campaign artwork.'},
 {id:'higgsfield',name:'Higgsfield',purpose:'Creative imagery and video concepts for the business campaign.'},
 {id:'zernio',name:'Zernio',purpose:'Channel previews, scheduled social posts and campaign reporting.'},
 {id:'manychat',name:'Manychat',purpose:'Social and WhatsApp enquiry handoffs into the sample project journey.'},
 {id:'mailchimp',name:'Mailchimp',purpose:'Newsletter design, audience checks and the sample email send.'},
 {id:'meta',name:'Meta',purpose:'Prepared ad variations, tracking checks and the approval-gated launch.'},
 {id:'pinterest',name:'Pinterest',purpose:'Moodboard references that inform the creative direction.'},
 {id:'cloud',name:'Cloudflare',purpose:'The sample website and enquiry journey.'},
];
// Playback advances only while visible and playing. Cap stalls to avoid sudden jumps.
export function demoPlaybackDelta(previous,timestamp,active=true){return active&&previous!==null?Math.min(.25,Math.max(0,(timestamp-previous)/1000)):0;}
export const demoReferences=[
 ['Brand foundation','Fictional business workday. All clients, projects, enquiries and amounts are illustrative. Use clear, confident language and the Jarvis dark navy, mint and amber system.'],
 ['Morning brief','Research the market, develop campaign ideas, prepare design and video assets, check the website, follow up enquiries and review project finances.'],
 ['Support policy','Routine information replies may proceed after QA in this scenario. Complaints, refunds and commitments need an owner decision.'],
 ['Invoice policy','Prepare an illustrative invoice only against an approved sample project and quote. No payment collection is simulated.'],
 ['Team scope','Social Media, Content, Graphic Design, Web Design, Ads, Email Marketing, Customer Support & CRM and Finance.'],
 ['Sample enquiry · DEMO-017','A fictional prospect asks about services and the next step. No name, contact information or personal data is included.'],
 ['Sample project · DEMO-P024','An approved fictional project linked to quote DEMO-Q024. Invoice DEMO-I024 is illustrative and never sent.'],
 ['Review and learning log','QA catches an unsupported “guaranteed results” claim, requests a revision and retains the source-checking lesson.'],
];
export const demoJobs=[
 {id:'brief',appIds:[],workload:'Coordination',department:'operations',title:'COO routes the morning brief',depends:[],start:0,outcome:'Eight departments have a scoped brief, references and handoff order.',stages:[stage('coo','Read the brief',5,'Load the fictional brand, services and standing approvals.'),stage('coo','Assign specialists',5,'Run independent work in parallel; make channels wait for approved assets.')]},
 {id:'support',appIds:['manychat'],workload:'Quick reply',department:'support',title:'Reply to a service enquiry',depends:['brief'],start:0,metric:'replies',outcome:'WhatsApp reply sent · sample enquiry DEMO-017. No real message.',stages:[stage('whatsapp','Draft enquiry reply',5,'Use only the sample business information; offer an onboarding handoff.'),stage('support-qa','Support QA',3,'Check tone, facts and the escalation policy.','qa'),stage('support-lead','Head summary',2,'One routine reply cleared; availability exceptions remain human-owned.','head'),stage('community','Check standing approval',1,'The fictional owner policy permits routine information replies.','policy'),stage('whatsapp','Send reply · simulated',2,'Simulated WhatsApp reply sent. No recipient or messaging API.','send')]},
 {id:'booking',appIds:['manychat'],workload:'Project verification',department:'support',title:'Complete a client onboarding handoff',depends:['support'],start:0,metric:'bookings',outcome:'CRM approved project DEMO-P024 confirmed in the simulation.',stages:[stage('crm','Update sample CRM',8,'Link the sample enquiry to a customer journey, with no real personal data.'),stage('bookings','Verify project approval',5,'Use an approved fictional project; do not invent live availability.'),stage('support-qa','Onboarding QA',4,'Match the sample confirmation and quote.','qa'),stage('support-lead','Hand off to Finance',3,'Project and quoted amount can now feed an invoice.','head')]},
 {id:'design',appIds:['canva', 'pinterest'],workload:'Multi-slide creative',department:'design',title:'Design a five-slide campaign carousel',depends:['brief'],start:0,outcome:'Five-slide campaign carousel approved internally; unsupported claim removed.',stages:[stage('design-system','Build carousel layouts',38,'Apply the fictional brand tokens and five distinct slide compositions.'),stage('creative-qc','QA requests a revision',6,'“Guaranteed results” has no source in the sample brief. Return it for correction.','revision'),stage('design-system','Remove unsupported claim',12,'Replace the line with source-backed business information.'),stage('creative-qc','Recheck corrected copy',8,'The unsupported claim is gone; contrast and mobile type pass.','qa'),stage('creative-director','Design head summary',5,'Carousel cleared. Lesson: verify business claims against the brand source.','head')]},
 {id:'content',appIds:['higgsfield'],workload:'Video production',department:'content',title:'Edit a short brand introduction',depends:['brief'],start:2,outcome:'Sample 15-second reel storyboard and edit checked.',stages:[stage('videographer','Plan the shot sequence',12,'Brand introduction, product details, service examples and a contact CTA; sample scenes only.'),stage('media','Assemble the reel',62,'Illustrate an edit with captions, licensed-music check and safe crops.'),stage('content-qa','Video QA',15,'Review pacing, caption readability and claims.','qa'),stage('video','Content head summary',6,'The sample walkthrough is ready for channel adaptation.','head')]},
 {id:'web',appIds:['cloud'],workload:'Website checks',department:'web',title:'Check the mobile enquiry journey',depends:['brief'],start:0,outcome:'Sample project CTA, form validation and mobile layout checked.',stages:[stage('audit','Audit the sample journey',18,'Check CTA clarity, mobile form fields and confirmation copy.'),stage('implementation','Update landing-page and contact copy',16,'Illustrate a sourced website update and clearer enquiry-date validation.'),stage('web-qa','Technical QA',10,'Recheck invalid dates, keyboard focus and narrow-screen layout.','qa'),stage('cto','Web head summary',5,'Sample enquiry flow is ready to receive campaign traffic.','head')]},
 {id:'social',appIds:['zernio', 'canva'],workload:'Channel adaptation',department:'social',title:'Prepare Instagram and LinkedIn posts',depends:['design','content','web'],start:0,metric:'posts',outcome:'Two sample channel posts scheduled under the fictional pre-approved calendar.',stages:[stage('copy','Adapt captions by channel',12,'Instagram tells the brand story; LinkedIn explains the service offering.'),stage('instagram','Build channel previews',9,'Use the cleared carousel and reel; attach the sample project link.'),stage('social-qa','Social QA',6,'Check crops, voice, alt text and the approved calendar.','qa'),stage('cmo','Social head summary',4,'Two channel versions passed internal checks.','head'),stage('scheduler','Schedule · simulated',3,'A pre-approved fictional calendar allows this sample scheduling event.','send')]},
 {id:'email',appIds:['mailchimp', 'canva'],workload:'Newsletter production',department:'email',title:'Prepare the weekly newsletter',depends:['design','web'],start:3,metric:'emails',outcome:'Campaign newsletter sent · sample opted-in audience. No real email.',stages:[stage('email','Write the newsletter',10,'Use a single campaign message and clear contact CTA.'),stage('email-design','Build responsive email',16,'Illustrate desktop/mobile layouts and accessible fallback text.'),stage('email-qa','Email QA',9,'Check sample links, consent, unsubscribe and sender identity.','qa'),stage('email-lead','Email head summary',4,'Ready for the fictional opted-in audience under standing campaign approval.','head'),stage('email','Send newsletter · simulated',3,'Simulated campaign sent. No subscriber list or email provider.','send')]},
 {id:'invoice',appIds:[],workload:'Document verification',department:'finance',title:'Prepare the project invoice',depends:['booking'],start:0,metric:'invoices',outcome:'Invoice DEMO-I024 issued · illustrative AED 2,400. No real invoice.',stages:[stage('billing','Draft sample invoice',6,'Match fictional approved project DEMO-P024 and quote DEMO-Q024: illustrative AED 2,400.'),stage('finance-qa','Finance QA',4,'Match project, quote and invoice total; no tax treatment or payment is inferred.','qa'),stage('cfo','Finance head summary',3,'Invoice matches the confirmed sample project.','head'),stage('billing','Verify standing approval',1,'The fictional owner permits invoices for approved project quotes.','policy'),stage('billing','Issue invoice · simulated',3,'Simulated invoice issued. No billing system, email address or collection.','send')]},
 {id:'ads',appIds:['meta', 'zernio'],workload:'Campaign setup',department:'ads',title:'Launch a Meta remarketing test',depends:['social','web'],start:0,outcome:'Sample ad launch approved in Demo; no spend or publishing.',stages:[stage('meta-ads','Prepare two ad variations',18,'Reuse cleared assets and the sample project destination.'),stage('ads-qa','Ads and tracking QA',12,'Check sample UTMs, destination and claims; never assume budget approval.','qa'),stage('ads-lead','Paid Media head summary',5,'Two variants are ready; the fictional launch still needs owner approval.','head'),stage('ads-lead','Waiting for your demo approval',0,'Approve this example to see the final handoff. No real budget is authorized.','approval'),stage('meta-ads','Launch · simulated',6,'Simulated launch only. No ad account, audience upload or spend.','send')]},
 {id:'summary',appIds:[],workload:'Reviewed handoff',department:'operations',title:'COO assembles the client update',depends:['social','email','invoice','ads'],start:0,outcome:'Client update assembled from department summaries, QA notes and the saved demo lesson.',stages:[stage('coo','Review department summaries',8,'Read each head report; retain approval state and the corrected claim.'),stage('coo','Prepare the client update',7,'Show what completed, what changed and what required human approval.','head')]},
];
export function demoFrame(seconds,approvals={}){
 const at=Math.max(0,Number.isFinite(seconds)?seconds:0),jobs=[],events=[];
 for(const job of demoJobs){
  const dependencies=job.depends.map(id=>jobs.find(j=>j.id===id));
  let cursor=Math.max(job.start,...dependencies.map(j=>j?.finishedAt??Infinity));
  const timeline=[];let current=null,finishedAt=null;
  for(const [index,s] of job.stages.entries()){
   const begin=cursor;
   if(s.kind==='approval')cursor=Object.hasOwn(approvals,job.id)&&Number.isFinite(approvals[job.id])&&approvals[job.id]>=begin?approvals[job.id]:Infinity;
   else cursor+=s.duration;
   const status=at<begin?'queued':at>=cursor?'done':s.kind==='approval'?'approval':'working';
   timeline.push({...s,index,begin,end:cursor,status});
   if(!current&&status!=='done')current=timeline.at(-1);
   if(status==='done'&&Number.isFinite(cursor))events.push({id:job.id+':'+index,jobId:job.id,role:s.role,at:cursor,title:s.label,detail:s.detail,kind:s.kind,department:job.department});
  }
  const done=timeline.every(s=>s.status==='done');if(done)finishedAt=cursor;
  const status=done?'done':current?.status==='approval'?'approval':current?.status==='working'?'working':'queued';
  const completed=timeline.filter(s=>s.status==='done').reduce((sum,s)=>sum+s.duration,0),total=job.stages.reduce((sum,s)=>sum+s.duration,0);
  const fraction=status==='working'&&current?.duration?Math.min(current.duration,at-current.begin):0;
  jobs.push({...job,timeline,current,status,finishedAt,progress:done?100:Math.min(99.9,(completed+fraction)/Math.max(1,total)*100)});
 }
 return {jobs,events:events.sort((a,b)=>b.at-a.at),working:jobs.filter(j=>j.status==='working'),done:jobs.filter(j=>j.status==='done'),waiting:jobs.filter(j=>j.status==='approval')};
}

/** Presenter checkpoints follow the same task graph; they never approve an action. */
export function demoWalkthrough(seconds,approvals={}){
 const at=Math.max(0,Number.isFinite(seconds)?seconds:0);
 const plan=demoFrame(Number.MAX_SAFE_INTEGER,approvals);
 const job=id=>plan.jobs.find(j=>j.id===id);
 const decision=job('ads').timeline.find(s=>s.kind==='approval');
 const end=job('summary').finishedAt;
 const checkpoints=[
  {at:job('brief').finishedAt,taskId:'brief',title:'Brief routed',detail:'The COO assigns eight departments. Independent work can run in parallel.'},
  {at:job('design').timeline.find(s=>s.kind==='revision').end,taskId:'design',title:'QA catches a claim',detail:'A separate reviewer rejects “guaranteed results”. The author must correct it before handoff.'},
  {at:job('design').finishedAt,taskId:'design',title:'Correction rechecked',detail:'The corrected design passes QA and its head. Social and email can use the cleared asset.'},
  {at:job('social').finishedAt,taskId:'social',title:'Department handoffs',detail:'Creative, web, social, email, support and finance report checked work to the COO.'},
  {at:decision.begin,taskId:'ads',title:Number.isFinite(decision.end)&&at>=decision.end?'Owner decision recorded':'Owner decision',detail:Number.isFinite(decision.end)&&at>=decision.end?'Your demo decision is recorded. The simulated launch and COO handoff can now finish.':'Ads QA and its head have checked the package. Only your demo approval unlocks the simulated launch.'},
  ...(end===null?[]:[{at:end,taskId:'summary',title:'COO handoff',detail:'All eleven tasks are complete. The update retains department reports, the corrected claim and your demo decision.'}]),
 ];
 const next=checkpoints.find(c=>c.at>at+.001)??null;
 const current=[...checkpoints].reverse().find(c=>c.at<=at+.001)??{title:'The owner brief',detail:'Follow the brief through specialists, independent QA, department heads, owner approval and the COO.'};
 return {next,current,limit:end??decision.begin,complete:end!==null&&at>=end,awaitingApproval:at>=decision.begin&&!Number.isFinite(decision.end)};
}

// Ongoing work is a finite, precomputed fictional schedule. Heads and reviewers
// are resources too: one person never runs two active stages at the same time.
export const demoLiveLanes=Object.freeze(demoDepartmentCatalogue.flatMap(d=>d.authors.map((author,variant)=>Object.freeze({...d,author,variant,titles:Object.freeze(demoTaskCatalogue[author].map(r=>r.title))}))));
export const demoTaskLimit=1000;
const mod=(n,d)=>(n%d+d)%d;
const sum=items=>items.reduce((total,s)=>total+s.duration,0);
const ownerRole='owner',queueRole='queue'; // Presentation markers, never registered agents.
function recipeStages(lane,recipe,scenario){
 const work=(label,weight,detail,kind='work',role=lane.author)=>({role,label,duration:weight,detail,kind});
 const checks=recipe.acceptanceCriteria.join('; ')+'.';
 const stages=[];
 if(['research','decision'].includes(recipe.workflow))stages.push(work('Read the supplied evidence',15,recipe.input+' '+scenario.context,'research'));
 if(recipe.workflow==='resource')stages.push(work('Confirm the input handoff',9,recipe.input,'brief'),work('Wait for the fictional reference pack',12,'Compressed scripted resource wait; no file, account or external service is being accessed.','resource-wait',queueRole));
 stages.push(work(recipe.title,recipe.workflow==='technical'?48:55,recipe.deliverable+' Input: '+recipe.input));
 if(recipe.workflow==='technical')stages.push(work('Check the deliverable contract',13,'Verify: '+checks,'check'));
 if(recipe.workflow==='revision')stages.push(work('Return the demonstrated defect',8,'The fictional input contains the stated defect. Reviewer requests this bounded correction: '+recipe.deliverable,'revision',lane.qa),work('Correct the flagged draft',16,recipe.outcome+' Preserve unaffected facts.','work'));
 stages.push(work('Review '+recipe.deliverable.replace(/\.$/,''),14,'Independent check: '+checks+' Scenario limits: '+scenario.context,'qa',lane.qa));
 if(lane.department==='operations')stages.push(work('Final delivery evidence check',7,'Final reviewer checks source references, actual draft status and unresolved owner decisions; no approval is inferred.','qa','test'));
 stages.push(work(lane.head==='coo'?'COO prioritises the next handoff':'Department head checks the handoff',8,recipe.outcome+' Report the exact deliverable and outstanding questions to the COO. No external delivery.','head',lane.head));
 if(recipe.workflow==='decision')stages.push(work('Prepare the owner decision question',6,'Record the unresolved choice in this draft. This stage does not grant approval or activate anything.','decision',lane.head));
 const total=sum(stages),seconds=recipe.playbackSeconds;
 return stages.map(s=>({...s,duration:s.duration/total*seconds}));
}
function normalizedRequests(requests){
 const ids=new Set(),titles=new Set(),result=[];
 for(const r of (Array.isArray(requests)?requests:[]).slice(-24)){
  const lane=demoLiveLanes.find(l=>l.department===r?.department),title=typeof r?.title==='string'?r.title.trim().slice(0,240):'';
  if(!lane||!title||typeof r.id!=='string'||!r.id.startsWith('request-')||ids.has(r.id)||titles.has(title.toLowerCase())||!Number.isFinite(r.start)||r.start<0)continue;
  ids.add(r.id);titles.add(title.toLowerCase());result.push({id:r.id,department:r.department,title,start:r.start});
 }
 return result;
}
function scheduleWork(requests,epoch=0){
 const free=new Map(),states=demoLiveLanes.map((lane,index)=>({lane,index,sequence:0,limit:demoTaskCatalogue[lane.author].length*demoScenarios.length,ready:0})),locals=requests.map(r=>({request:r,ready:epoch+r.start})),jobs=[],lanes=demoLiveLanes.map(()=>[]);
 // Each author visits every recipe/scenario pair once. Catalogue lengths may differ.
 while(states.some(s=>s.sequence<s.limit)||locals.length){
  let selected=null;
  for(const s of states)if(s.sequence<s.limit&&(!selected||s.ready<selected.ready))selected=s;
  for(const s of locals)if(!selected||s.ready<selected.ready)selected=s;
  let lane,job,rawStages;
  if(selected.request){
   const r=selected.request;lane=demoLiveLanes.find(l=>l.department===r.department);
   rawStages=[stage(lane.author,'Interpret your local brief',38,'Prepare a fictional draft response to: '+r.title+'. Missing facts stay explicit; no model or account action.'),stage(lane.qa,'Review the entered brief',15,'Check that the draft addresses the entered request, separates assumptions and makes no unsupported completion claim.','qa'),stage(lane.head,'Hand off the local draft',7,'Include the fictional draft and unresolved questions in the department report. Nothing is sent.','head')];
   job={id:r.id,department:r.department,title:r.title,appIds:lane.appIds,workload:'Your demo brief',taskType:'local:'+r.id,input:r.title,deliverable:'A fictional response draft addressing the entered brief, with unknowns and next questions.',acceptanceCriteria:['Addresses the entered brief','Unknown facts and external actions remain unverified'],outcome:'Local brief reviewed as a fictional draft; no account, delivery or owner approval is implied.',depends:[],arrivedAt:selected.ready,effortMinutes:null,timing:'Compressed demo pacing; no real work estimate for a free-text request.'};
   locals.splice(locals.indexOf(selected),1);
  }else{
   lane=selected.lane;const n=selected.sequence,recipes=demoTaskCatalogue[lane.author],recipe=recipes[n%recipes.length],scenario=demoScenarios[mod(Math.floor(n/recipes.length)+selected.index,demoScenarios.length)];
   rawStages=recipeStages(lane,recipe,scenario);
   job={id:`live-${selected.index}-${n}`,department:lane.department,title:recipe.title+' · '+scenario.name,appIds:lane.appIds,workload:recipe.title,taskType:recipe.id+'@'+scenario.id,recipeId:recipe.id,scenarioId:scenario.id,input:recipe.input+' '+scenario.context,deliverable:recipe.deliverable,acceptanceCriteria:[...recipe.acceptanceCriteria],outcome:recipe.outcome+' Fictional reviewed draft only; nothing sent, published, billed or activated.',depends:[],arrivedAt:Math.max(0,selected.ready-18),effortMinutes:[...recipe.effortMinutes],timing:demoCatalogueInfo.timing};
  }
  let cursor=selected.ready;const timeline=[];
  for(const s of rawStages){
   const begin=s.role===queueRole?cursor:Math.max(cursor,free.get(s.role)??0);
   if(begin>cursor+.000001)timeline.push(stage(queueRole,'Queued for '+s.label,begin-cursor,'The next assigned reviewer or specialist is occupied. This fictional item waits without double-booking that person.','resource-wait'));
   timeline.push(s);cursor=begin+s.duration;if(s.role!==queueRole)free.set(s.role,cursor);
  }
  let time=selected.ready;
  job.stages=timeline;job.timeline=timeline.map((s,index)=>{const begin=time;time+=s.duration;return {...s,index,begin,end:time};});job.start=selected.ready;job.finishedAt=time;job.playbackSeconds=sum(rawStages);jobs.push(job);
  if(!selected.request){lanes[selected.index].push(job);selected.ready=time+3+(selected.index%5);selected.sequence++;}
 }
 return {jobs,lanes,completions:jobs.map(j=>j.finishedAt).sort((a,b)=>a-b)};
}
const initialSchedule=scheduleWork([]);
const workdayEpoch=0; // Fresh visible workday: no seeded history or elapsed hidden work.
let scheduleCache={key:'[]',value:initialSchedule};
function workday(requests){
 const normalized=normalizedRequests(requests),key=JSON.stringify(normalized);
 if(key!==scheduleCache.key)scheduleCache={key,value:scheduleWork(normalized,workdayEpoch)};
 return scheduleCache.value;
}
const decisionPackets=[
 ['ads','Review a bounded campaign experiment','A fictional experiment has two variants but no approved spend.','Approve this demo version only; budget and account permissions remain untouched.'],
 ['content','Resolve an audio-rights release hold','A silent fictional preview is available; commercial-audio scope is still a question.','Record an illustrative direction only; no licence is purchased or inferred.'],
 ['operations','Choose a proposal scope boundary','A fictional proposal has two revision allowances for the owner to choose.','Choose this sample option only; no agreement is signed or sent.'],
 ['web','Review a preview activation decision','A fictional preview has internal checks; production access is unverified.','Record this demo choice only; no deployment or access change.'],
 ['design','Choose a visual direction sample','Two fictional campaign approaches are described in a direction packet.','The sample direction decision is not final approval of all artwork.'],
 ['finance','Review a renewal options packet','A fictional renewal has incomplete usage evidence and no cancellation instruction.','Record a sample decision only; no renewal or cancellation occurs.'],
 ['email','Review a lifecycle-message direction','A fictional follow-up journey has a proposed tone and unresolved response window.','Choose this draft direction only; no real audience or email send.'],
 ['knowledge','Review a learning-method proposal','A fictional QA log suggests a narrowly scoped source-check improvement.','Record a demo preference only; no skill or runtime is modified.'],
];
function ownerPlans(approvals){
 const jobs=[];let begin=12;
 for(let n=0;n<1000;n++){
  const id='live-approval-'+n,decision=Object.hasOwn(approvals,id)&&Number.isFinite(approvals[id])&&approvals[id]>=begin?approvals[id]:Infinity;
  const p=decisionPackets[n%decisionPackets.length],scenario=demoScenarios[Math.floor(n/decisionPackets.length)%demoScenarios.length];
  jobs.push({id,department:p[0],title:p[1]+' · '+scenario.name,appIds:[],workload:'Owner decision',taskType:'owner:'+n%64,input:p[2],deliverable:'A version-specific fictional owner decision record.',acceptanceCriteria:['Only this packet can be approved','No external action follows'],depends:[],start:begin,arrivedAt:begin,outcome:'This fictional packet has a recorded demo decision. No real approval, publishing, spend or delivery.',approvalScope:id,timing:'Compressed demo decision recording, not an estimate of owner response time.',stages:[stage(ownerRole,'Waiting for your demo decision',0,p[2]+' '+p[3],'approval'),stage(ownerRole,'Record the demo choice',10,p[3],'decision')],timeline:[{...stage(ownerRole,'Waiting for your demo decision',0,p[2]+' '+p[3],'approval'),index:0,begin,end:decision},{...stage(ownerRole,'Record the demo choice',10,p[3],'decision'),index:1,begin:decision,end:decision+10}],finishedAt:decision+10});
  if(!Number.isFinite(decision))break;begin=decision+100;
 }
 return jobs;
}
function normalizedApprovals(approvals){
 const result={};if(!approvals||typeof approvals!=='object')return result;
 for(let n=0;n<1000;n++){const id='live-approval-'+n;if(!Object.hasOwn(approvals,id))break;const at=approvals[id];if(!Number.isFinite(at))break;result[id]=at;}
 return result;
}
let endCache={key:null,value:0};
export function demoLiveCycleEnd(approvals={},requests=[]){
 const decisions=normalizedApprovals(approvals),scheduled=workday(requests),key=scheduleCache.key+'|'+JSON.stringify(decisions);
 if(endCache.key!==key){const ends=[...scheduled.completions.map(end=>end-workdayEpoch),...ownerPlans(decisions).map(j=>j.finishedAt).filter(Number.isFinite)].sort((a,b)=>a-b);endCache={key,value:ends[demoTaskLimit-1]};}
 return endCache.value;
}
function projected(job,at,offset=workdayEpoch){
 const start=job.start-offset,stages=job.stages,timeline=job.timeline.map(s=>{const begin=s.begin-offset,end=s.end-offset;return {...s,begin,end,status:at<begin?'queued':at>=end?'done':s.kind==='approval'?'approval':'working'};});
 const current=timeline.find(s=>s.status!=='done')??null,done=timeline.every(s=>s.status==='done'),status=done?'done':current?.status==='approval'?'approval':at<start?'queued':'working';
 const completed=timeline.filter(s=>s.status==='done').reduce((n,s)=>n+s.duration,0),fraction=status==='working'&&current?Math.max(0,Math.min(current.duration,at-current.begin)):0;
 return {...job,start,arrivedAt:job.arrivedAt-offset,timeline,current,status,finishedAt:done?job.finishedAt-offset:null,progress:done?100:status==='approval'?80:job.approvalScope?Math.max(80,Math.min(99.9,80+fraction/10*20)):Math.max(0,Math.min(99.9,(completed+fraction)/Math.max(1,sum(stages))*100))};
}
export function demoLiveFrame(seconds,approvals={},requests=[]){
 const decisions=normalizedApprovals(approvals),schedule=workday(requests),at=Math.min(demoLiveCycleEnd(decisions,requests),Math.max(0,Number.isFinite(seconds)?seconds:0)),absolute=at+workdayEpoch,visible=[];
 let completedTotal=0;
 for(const end of schedule.completions){if(end<=absolute)completedTotal++;else break;}
 for(const lane of schedule.lanes){
  const current=lane.findIndex(j=>j.finishedAt>absolute),index=current<0?lane.length:current;
  for(const job of lane.slice(Math.max(0,index-22),Math.min(lane.length,index+2)))visible.push(projected(job,at));
 }
 for(const job of schedule.jobs.filter(j=>j.id.startsWith('request-')&&j.arrivedAt<=absolute))visible.push(projected(job,at));
 const owners=ownerPlans(decisions).filter(j=>j.start<=at).map(j=>projected(j,at,0));completedTotal+=owners.filter(j=>j.status==='done').length;
 // One pending packet plus two recent decisions; it never blocks the work schedule.
 const ownerVisible=owners.slice(-3),active=visible.filter(j=>j.status!=='done'),history=visible.filter(j=>j.status==='done'&&j.finishedAt>=at-900).sort((a,b)=>b.finishedAt-a.finishedAt).slice(0,Math.min(240,Math.max(0,320-active.length-ownerVisible.length)));
 const jobs=[...active,...history,...ownerVisible],titles=new Set(jobs.filter(j=>!j.id.startsWith('request-')).map(j=>j.title));
 for(const job of jobs.filter(j=>j.id.startsWith('request-'))){if(titles.has(job.title))job.title='Owner brief · '+job.title+' · '+job.id; titles.add(job.title);}
 const events=[];
 for(const job of jobs){
  if(job.arrivedAt<=at)events.push({id:job.id+':arrival',jobId:job.id,role:job.stages[0].role,at:job.arrivedAt,title:'New task · '+job.title,detail:job.input,kind:'arrival',department:job.department});
  for(const s of job.timeline)if(s.status==='done')events.push({id:job.id+':'+s.index,jobId:job.id,role:s.role,at:s.end,title:s.label+' · '+job.title,detail:s.detail,kind:s.kind,department:job.department});
 }
 return {completedTotal:Math.min(demoTaskLimit,completedTotal),jobs,events:events.sort((a,b)=>b.at-a.at),working:jobs.filter(j=>j.status==='working'),done:jobs.filter(j=>j.status==='done'),waiting:jobs.filter(j=>j.status==='approval')};
}

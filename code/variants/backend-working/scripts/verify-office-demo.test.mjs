import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoFrame,demoJobs,demoWalkthrough,demoLiveFrame,demoLiveLanes,demoLiveCycleEnd,demoTaskLimit,demoPlaybackDelta,demoConnections} from '../src/lib/office-demo.mjs';
import {demoTaskCatalogue,demoRoleCoverage} from '../src/lib/office-demo-catalogue.mjs';
const nonDoneProgress=frame=>{for(const j of frame.jobs){assert(Number.isFinite(j.progress)&&j.progress>=0&&j.progress<=100,j.id);assert.equal(j.progress===100,j.status==='done',j.id+' completion/progress mismatch');}};

test('fresh/replayed workday has zero history and credible work in all current departments',()=>{
 const frame=demoLiveFrame(0);assert.equal(frame.completedTotal,0);assert.equal(frame.done.length,0);assert.equal(frame.events.filter(e=>e.kind!=='arrival').length,0);assert.equal(demoLiveLanes.length,43);assert.equal(frame.working.length,43);assert.equal(new Set(frame.working.map(j=>j.department)).size,10);
 assert(frame.jobs.every(j=>j.start>=0&&j.arrivedAt>=0&&j.finishedAt===null));assert(frame.jobs.every(j=>['queued','working'].includes(j.status)&&j.progress===0));assert.equal(demoLiveFrame(9.999).completedTotal,0);nonDoneProgress(frame);assert.deepEqual(demoLiveFrame(0),frame);
});

test('continuous playback introduces each retained job before Done and never completes a job in under ten seconds',()=>{
 const scenarios=[{approvals:{},requests:[]},{approvals:{'live-approval-0':12,'live-approval-1':112},requests:[{id:'request-timing-a',department:'social',title:'Check the fictional source guide',start:5},{id:'request-timing-b',department:'social',title:'Prepare a separate draft',start:5}]}];
 for(const {approvals,requests} of scenarios){const first=new Map(),end=demoLiveCycleEnd(approvals,requests);for(let at=0;at<end+5;at+=5){const frame=demoLiveFrame(at,approvals,requests);nonDoneProgress(frame);assert(frame.jobs.length<=320);assert(frame.done.filter(j=>!j.approvalScope).length<=240);for(const j of frame.jobs){if(!first.has(j.id)){assert.notEqual(j.status,'done',j.id+' first appeared Done at '+at);first.set(j.id,at);}if(j.status==='done'){assert(j.finishedAt-j.start>=10-1e-9,j.id+' completed too quickly');assert(at-first.get(j.id)>=10,j.id+' was not shown for ten sampled seconds');}}}assert(first.size>=1000);}
});

test('guided jobs also take at least ten seconds and reserve 100 percent for actual completion',()=>{
 const approvals={ads:200},complete=demoFrame(1000,approvals);assert.equal(complete.done.length,demoJobs.length);assert.equal(demoJobs.find(j=>j.id==='brief').stages.reduce((n,s)=>n+s.duration,0),10);assert.equal(demoFrame(9.999).jobs[0].status,'working');assert(demoFrame(9.999).jobs[0].progress<100);assert.equal(demoFrame(10).jobs[0].status,'done');
 for(const j of complete.jobs){assert(j.finishedAt-j.timeline[0].begin>=10,j.id);const before=demoFrame(j.finishedAt-.001,approvals).jobs.find(t=>t.id===j.id);assert.notEqual(before.status,'done');assert(before.progress<100);assert.equal(demoFrame(j.finishedAt,approvals).jobs.find(t=>t.id===j.id).progress,100);}
 for(let at=0;at<=240;at+=2){const f=demoFrame(at,approvals);nonDoneProgress(f);for(const j of f.jobs)if(j.status!=='queued')for(const id of j.depends)assert.equal(f.jobs.find(d=>d.id===id).status,'done');}
});

test('instant, late, invalid and future owner decisions respect the ten-second visible record phase',()=>{
 for(const accepted of[12,20,300]){const approvals={'live-approval-0':accepted},start=12,end=accepted+10;assert.equal(demoLiveFrame(start-.001,approvals).jobs.some(j=>j.approvalScope),false);const before=demoLiveFrame(end-.001,approvals).jobs.find(j=>j.approvalScope);assert.equal(before.status,'working');assert(before.progress<100);const done=demoLiveFrame(end,approvals).jobs.find(j=>j.approvalScope);assert.equal(done.status,'done');assert.equal(done.finishedAt,end);assert(end-done.start>=10);assert.equal(demoLiveFrame(accepted+100,approvals).waiting[0].id,'live-approval-1');}
 for(const a of[{},Object.create({'live-approval-0':12}),{'live-approval-0':0},{'live-approval-0':NaN},{'live-approval-0':Infinity}]){assert.equal(demoLiveFrame(300,a).waiting[0].id,'live-approval-0');assert(demoLiveFrame(600,a).completedTotal>demoLiveFrame(300,a).completedTotal);}
 assert.equal(demoLiveFrame(19,{'live-approval-0':20}).waiting[0].id,'live-approval-0');
});

test('catalogue, independent reviewers and heads remain varied and resource-safe',()=>{
 assert.equal(Object.values(demoTaskCatalogue).flat().length,204);assert.equal(demoRoleCoverage.filter(r=>r.mode!=='merged').length,65);const jobs=new Map(),end=demoLiveCycleEnd();for(let at=0;at<=end+50;at+=50)for(const j of demoLiveFrame(at).jobs)jobs.set(j.id,j);
 const intervals=new Map(),families=new Set();for(const j of jobs.values())if(j.recipeId){families.add(j.recipeId);const lane=demoLiveLanes.find(l=>l.department===j.department&&demoTaskCatalogue[l.author].some(r=>r.id===j.recipeId));assert(j.stages.some(s=>s.role===lane.qa&&s.kind==='qa'));assert(j.stages.some(s=>s.role===lane.head&&s.kind==='head'));
 const qa=j.timeline.filter(s=>s.role===lane.qa&&s.kind==='qa'),heads=j.timeline.filter(s=>s.kind==='head'),production=j.timeline.filter(s=>s.role===lane.author&&['work','research','brief','check'].includes(s.kind));
 assert.notEqual(lane.author,lane.qa,j.id+' self-review');assert.notEqual(lane.head,lane.qa,j.id+' head is reviewer');assert.notEqual(lane.head,lane.author,j.id+' author is head');
 assert(production.length&&qa.length&&heads.length,j.id+' missing production/review/handoff');
 assert(Math.max(...qa.map(s=>s.index))<Math.min(...heads.map(s=>s.index)),j.id+' independent QA must precede head');
 assert(Math.max(...production.map(s=>s.index))<qa.at(-1).index,j.id+' final QA must follow all production/corrections');
 assert(qa.at(-1).end<=heads[0].begin,j.id+' head starts before final QA ends');assert(j.stages.every(s=>!['send','publish','external'].includes(s.kind)),j.id+' external stage');
 for(const s of j.timeline)if(!['queue','owner'].includes(s.role)){if(!intervals.has(s.role))intervals.set(s.role,[]);intervals.get(s.role).push({...s,id:j.id});}}
 assert.equal(families.size,204);assert.equal(intervals.size,64);for(const [role,list] of intervals){list.sort((a,b)=>a.begin-b.begin);for(let i=1;i<list.length;i++)assert(list[i].begin>=list[i-1].end-1e-6,role+' double-booked');}
});

test('local briefs keep their fields and wait safely instead of entering as completed history',()=>{
 const requests=[{id:'request-local',department:'social',title:'  Plan the next fictional guide  ',start:5}];assert(!demoLiveFrame(4,{},requests).jobs.some(j=>j.id==='request-local'));const first=demoLiveFrame(5,{},requests).jobs.find(j=>j.id==='request-local');assert.equal(first.title,'Plan the next fictional guide');assert.equal(first.workload,'Your demo brief');assert.notEqual(first.status,'done');assert.equal(first.progress,0);
 const finish=first.timeline.at(-1).end;assert.notEqual(demoLiveFrame(finish-.001,{},requests).jobs.find(j=>j.id==='request-local').status,'done');const later=demoLiveFrame(finish,{},requests).jobs.find(j=>j.id==='request-local');assert.equal(later.status,'done');assert(later.finishedAt-first.arrivedAt>=10);assert.equal(later.progress,100);assert(later.stages.some(s=>s.kind==='qa'));assert(later.stages.some(s=>s.kind==='head'));
 const work=later.timeline.filter(s=>s.kind==='work'),qa=later.timeline.filter(s=>s.kind==='qa'),head=later.timeline.filter(s=>s.kind==='head');assert.equal(work.length,1);assert.equal(qa.length,1);assert.equal(head.length,1);assert.notEqual(work[0].role,qa[0].role);assert.notEqual(head[0].role,qa[0].role);assert.notEqual(head[0].role,work[0].role);assert(work[0].index<qa[0].index&&qa[0].index<head[0].index);assert(work[0].end<=qa[0].begin&&qa[0].end<=head[0].begin);assert(later.stages.every(s=>['work','qa','head','resource-wait'].includes(s.kind)), 'local brief gained an external/approval stage');
});

test('bounded replay still stops at exactly 1000 newly observed completions',()=>{
 assert.equal(demoTaskLimit,1000);for(const {approvals,requests} of[{approvals:{},requests:[]},{approvals:{'live-approval-0':12,'live-approval-1':112},requests:[{id:'request-cap',department:'social',title:'Check the fictional campaign',start:40}]}]){const end=demoLiveCycleEnd(approvals,requests);assert(Number.isFinite(end)&&end>180&&end<10000);assert.equal(demoLiveFrame(end-.001,approvals,requests).completedTotal,999);assert.equal(demoLiveFrame(end,approvals,requests).completedTotal,1000);assert.deepEqual(demoLiveFrame(end+9000,approvals,requests),demoLiveFrame(end,approvals,requests));}
});

test('guided walkthrough, rejected-claim correction and explicit approval gates remain intact',()=>{
 const gate=demoWalkthrough(0).limit;assert.equal(gate,174);const visited=[];let at=0;for(let n=0;n<8;n++){const next=demoWalkthrough(at).next;if(!next)break;visited.push(next.title);at=next.at;}assert.deepEqual(visited,['Brief routed','QA catches a claim','Correction rechecked','Department handoffs','Owner decision']);assert(demoWalkthrough(at).awaitingApproval);assert.equal(demoFrame(90000).jobs.find(j=>j.id==='summary').status,'queued');
 const finished=demoWalkthrough(at,{ads:at}).limit;assert(demoWalkthrough(finished,{ads:at}).complete);const frame=demoFrame(finished,{ads:at});assert.equal(frame.done.length,11);const design=frame.jobs.find(j=>j.id==='design'),correction=design.timeline.find(s=>s.label==='Remove unsupported claim'),qa=design.timeline.find(s=>s.label==='Recheck corrected copy');assert(qa.begin>=correction.end);for(const id of['social','email'])assert(frame.jobs.find(j=>j.id===id).timeline[0].begin>=design.finishedAt);
 for(const bad of[{ads:0},{ads:gate-.001},{ads:NaN},{ads:Infinity},Object.create({ads:gate})])assert.equal(demoFrame(1000,bad).jobs.find(j=>j.id==='ads').status,'approval');
});

test('visible-only playback remains deterministic, capped and paused without hidden-time accumulation',()=>{
 assert.equal(demoPlaybackDelta(null,10000),0);assert.equal(demoPlaybackDelta(100,150),.05);assert.equal(demoPlaybackDelta(100,999999,false),0);assert.equal(demoPlaybackDelta(100,999999),.25);assert.equal(demoPlaybackDelta(200,100),0);const approvals=Object.freeze({'live-approval-0':20});assert.deepEqual(demoLiveFrame(100,approvals),demoLiveFrame(100,approvals));assert.deepEqual(demoLiveFrame(NaN),demoLiveFrame(0));assert.deepEqual(demoLiveFrame(-10),demoLiveFrame(0));
});


test('guided review identities and simulated send gates remain independent and ordered',()=>{
 const approvals=Object.freeze({ads:200}),planned=demoFrame(1000,approvals);
 for(const job of planned.jobs.filter(j=>j.department!=='operations')){
  const authors=new Set(job.stages.filter(s=>s.kind==='work').map(s=>s.role)),qa=job.timeline.filter(s=>s.kind==='qa'),reviews=job.timeline.filter(s=>['qa','revision'].includes(s.kind)),heads=job.timeline.filter(s=>s.kind==='head');
  assert(authors.size&&qa.length&&heads.length,job.id+' missing author/QA/head');
  for(const review of reviews)assert(!authors.has(review.role),job.id+' author cannot independently review its work');
  for(const head of heads){assert(!authors.has(head.role),job.id+' author cannot be its own head');assert(reviews.every(r=>r.role!==head.role),job.id+' reviewer cannot be head');assert(head.index>qa.at(-1).index&&head.begin>=qa.at(-1).end,job.id+' head must follow independent QA');}
  for(const send of job.timeline.filter(s=>s.kind==='send')){
   assert(qa.some(s=>s.index<send.index),job.id+' send lacks earlier QA');assert(heads.some(s=>s.index<send.index),job.id+' send lacks earlier head');
   const required=job.timeline.filter(s=>s.index<send.index&&['qa','head','policy','approval'].includes(s.kind));
   for(const at of[send.begin,send.end-.001,send.end]){const actual=demoFrame(at,approvals).jobs.find(j=>j.id===job.id);for(const gate of required)assert.equal(actual.timeline[gate.index].status,'done',job.id+' send bypassed '+gate.kind);}
  }
 }
 const held=demoFrame(90000).jobs.find(j=>j.id==='ads');assert.equal(held.status,'approval');assert.equal(held.timeline.find(s=>s.kind==='send').status,'queued');
});

test('local validation rejects blank, invalid and future briefs while keeping duplicate rejection',()=>{
 const invalid=[{id:'request-blank',department:'social',title:'   ',start:0},{id:'request-type',department:'social',title:42,start:0},{id:'request-dept',department:'not-a-department',title:'Unknown route',start:0},{id:'wrong-prefix',department:'social',title:'Invalid identity',start:0},{id:42,department:'social',title:'Invalid ID type',start:0},{id:'request-negative',department:'social',title:'Invalid time',start:-1},{id:'request-nan',department:'social',title:'Invalid time',start:NaN},{id:'request-infinite',department:'social',title:'Invalid time',start:Infinity},{id:'request-future',department:'social',title:'Not arrived',start:500}];
 assert(demoLiveFrame(100,{},invalid).jobs.every(j=>!invalid.some(r=>r.id===j.id)),'invalid local brief was accepted');
 const duplicate=[{id:'request-unique',department:'social',title:'One supplied draft',start:0},{id:'request-unique',department:'social',title:'Repeated identity',start:0},{id:'request-title',department:'social',title:'  One supplied draft  ',start:0}];
 const accepted=demoLiveFrame(0,{},duplicate).jobs.filter(j=>j.id.startsWith('request-'));assert.equal(accepted.length,1);assert.equal(accepted[0].id,'request-unique');assert.equal(accepted[0].title,'One supplied draft');
});

test('projections preserve frozen inputs, unique identities and valid application references',()=>{
 const approvals=Object.freeze({'live-approval-0':20}),requests=Object.freeze([Object.freeze({id:'request-immutable',department:'social',title:'Use supplied facts',start:5})]),snapshot=JSON.stringify({approvals,requests}),apps=new Set(demoConnections.map(a=>a.id));
 for(const at of[0,20,100,600]){const frame=demoLiveFrame(at,approvals,requests);assert.deepEqual(frame,demoLiveFrame(at,approvals,requests));assert.equal(new Set(frame.jobs.map(j=>j.id)).size,frame.jobs.length);assert.equal(new Set(frame.events.map(e=>e.id)).size,frame.events.length);for(const job of frame.jobs)for(const app of job.appIds)assert(apps.has(app),job.id+' references an unknown app');}
 assert.equal(JSON.stringify({approvals,requests}),snapshot);assert.equal(new Set(demoJobs.map(j=>j.id)).size,demoJobs.length);for(const j of demoJobs)for(const app of j.appIds)assert(apps.has(app));for(const app of demoConnections)assert(demoJobs.some(j=>j.appIds.includes(app.id)),app.id+' lacks a guided workflow');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoFrame,demoJobs,demoClient,demoConnections,demoReferences,demoPlaybackDelta,demoWalkthrough,demoLiveFrame,demoLiveLanes,demoLiveCycleEnd,demoTaskLimit} from '../src/lib/office-demo.mjs';
test('scripted work respects dependencies and per-department QA before sending',()=>{
 for(let at=0;at<=300;at++){
  const f=demoFrame(at,{ads:95});
  for(const j of f.jobs){
   assert(j.progress>=0&&j.progress<=100);
   if(j.status!=='queued')for(const id of j.depends)assert.equal(f.jobs.find(d=>d.id===id).status,'done',`${j.id} started before ${id}`);
   for(const s of j.timeline.filter(s=>s.kind==='send'&&s.status!=='queued')){
    assert(j.timeline.slice(0,s.index).some(s=>s.kind==='qa'&&s.status==='done'),`${j.id} skipped QA`);
    assert(j.timeline.slice(0,s.index).some(s=>['policy','approval','head'].includes(s.kind)&&s.status==='done'));
   }
  }
 }
 assert.equal(new Set(demoJobs.filter(j=>j.department!=='operations').map(j=>j.department)).size,8);
 assert.equal(demoClient.id,'showroom-demo');
});
test('unapproved ads remain held and block the COO final report indefinitely',()=>{
 for(const at of [180,300,90000]){const f=demoFrame(at);assert.equal(f.jobs.find(j=>j.id==='ads').status,'approval');assert.equal(f.jobs.find(j=>j.id==='summary').status,'queued');assert(!f.events.some(e=>e.jobId==='ads'&&e.kind==='send'));}
 const waiting=demoFrame(180,{ads:180});assert.equal(waiting.jobs.find(j=>j.id==='ads').status,'working');
 const complete=demoFrame(220,{ads:180});assert.equal(complete.done.length,demoJobs.length);
 assert.equal(complete.jobs.find(j=>j.id==='ads').finishedAt,186);
 assert(complete.events.some(e=>e.jobId==='summary'&&e.kind==='head'));
});
test('source claim rejection is corrected and rechecked before channel handoffs',()=>{
 const f=demoFrame(220),design=f.jobs.find(j=>j.id==='design');
 const correction=design.timeline.find(s=>s.label==='Remove unsupported claim'),qa=design.timeline.find(s=>s.label==='Recheck corrected copy');
 assert(correction.begin>=design.timeline.find(s=>s.kind==='revision').end);
 assert(qa.begin>=correction.end);
 for(const id of ['email','social'])assert(f.jobs.find(j=>j.id===id).timeline[0].begin>=design.finishedAt);
 assert(f.events.some(e=>e.kind==='revision'&&e.detail.includes('source')));
});
test('projection is deterministic, retains supplied inputs and creates no external actions',()=>{
 const approvals=Object.freeze({ads:180});const first=demoFrame(220,approvals);assert.deepEqual(first,demoFrame(220,approvals));assert.deepEqual(approvals,{ads:180});
 assert.equal(demoFrame(NaN).done.length,0);assert.equal(demoFrame(-5).done.length,0);
 assert(first.done.some(j=>j.metric==='emails'));assert(first.done.some(j=>j.metric==='invoices'));assert(first.done.some(j=>j.metric==='replies'));
 assert(first.jobs.find(j=>j.id==='invoice').outcome.includes('illustrative'));
});

test('larger creative jobs take longer than replies and invoice checks',()=>{
 const duration=id=>demoJobs.find(j=>j.id===id).stages.reduce((sum,s)=>sum+s.duration,0);
 assert.ok(duration('content')>duration('design')&&duration('design')>duration('web'));
 assert.ok(duration('web')>duration('social')&&duration('social')>duration('invoice'));
 assert.ok(duration('content')>duration('support')*5);
 assert.ok(new Set(demoJobs.map(j=>duration(j.id))).size>=9);
});
test('fractional progress is continuous, duration-weighted and held at approvals',()=>{
 const first=demoFrame(8.5).jobs.find(j=>j.id==='content'),total=first.stages.reduce((sum,s)=>sum+s.duration,0);
 assert.ok(Math.abs(first.progress-.5/(total-2)*100)<.00001);
 let previous=0;
 for(let at=8;at<105;at+=.05){const task=demoFrame(at).jobs.find(j=>j.id==='content');assert.ok(task.progress>=previous);assert.ok(task.progress-previous<.1);previous=task.progress;}
 assert.equal(demoFrame(103).jobs.find(j=>j.id==='content').progress,100);
 const held=demoFrame(180).jobs.find(j=>j.id==='ads');assert.equal(held.status,'approval');assert.equal(demoFrame(299).jobs.find(j=>j.id==='ads').progress,held.progress);
});
test('playback pauses and caps stalls rather than producing one-second jumps',()=>{
 assert.equal(demoPlaybackDelta(null,10000),0);
 assert.equal(demoPlaybackDelta(100,150),.05);
 assert.equal(demoPlaybackDelta(100,20000,false),0);
 assert.equal(demoPlaybackDelta(null,20000),0);
 assert.equal(demoPlaybackDelta(100,20000),.25);
 assert.equal(demoPlaybackDelta(200,100),0);
});
test('every demo app has a workflow and uses registered local artwork',async()=>{
 const {readFile}=await import('node:fs/promises');const icons=JSON.parse(await readFile(new URL('../public/office-icons/sources.json',import.meta.url),'utf8')).icons;
 for(const app of demoConnections){assert.ok(icons.some(i=>i.id===app.id));assert.ok(demoJobs.some(j=>j.appIds.includes(app.id)),app.name+' has no workflow');}
 for(const job of demoJobs)for(const id of job.appIds)assert.ok(demoConnections.some(a=>a.id===id));
});

test('presenter walkthrough reaches every handoff and cannot skip owner approval',()=>{
 let at=0;const visited=[];
 for(let i=0;i<8;i++){const w=demoWalkthrough(at);assert.equal(w.limit,172);if(!w.next)break;assert(w.next.at>at);visited.push(w.next.title);at=w.next.at;}
 assert.deepEqual(visited,['Brief routed','QA catches a claim','Correction rechecked','Department handoffs','Owner decision']);
 assert.equal(demoWalkthrough(at).awaitingApproval,true);
 assert.equal(demoFrame(at).jobs.find(j=>j.id==='ads').status,'approval');
 assert.equal(demoWalkthrough(at).next,null);
 assert.equal(demoWalkthrough(at).complete,false);
 const approved=Object.freeze({ads:at}),finish=demoWalkthrough(at,approved).next;
 assert.equal(finish.title,'COO handoff');
 assert.equal(demoFrame(finish.at,approved).done.length,11);
 assert.equal(demoWalkthrough(finish.at,approved).complete,true);
 assert.equal(demoWalkthrough(finish.at,approved).next,null);
});
test('late owner decision survives previous rollover and preserves the completed report',()=>{
 const approvals={ads:90000},w=demoWalkthrough(90000,approvals);
 assert.equal(w.limit,90021);assert.equal(w.next.at,90021);
 assert.equal(demoFrame(90020,approvals).done.length,10);
 assert.equal(demoFrame(w.limit,approvals).done.length,11);
 assert.equal(demoWalkthrough(100000,approvals).complete,true);
 assert.equal(demoWalkthrough(300).awaitingApproval,true);
 assert.equal(demoWalkthrough(90000).awaitingApproval,true);
});
test('future, premature, inherited and invalid decisions cannot bypass the approval stage',()=>{
 for(const approvals of [{ads:0},{ads:171.99},{ads:NaN},{ads:Infinity},Object.create({ads:172})]){
  assert.equal(demoFrame(1000,approvals).jobs.find(j=>j.id==='ads').status,'approval');
 }
 assert.equal(demoFrame(172,{ads:200}).jobs.find(j=>j.id==='ads').status,'approval');
 assert.equal(demoFrame(200,{ads:200}).jobs.find(j=>j.id==='ads').status,'working');
 assert.equal(demoWalkthrough(NaN).current.title,'The owner brief');
});

test('each department has an independent QA role and a head before the final COO handoff',()=>{
 const done=demoFrame(193,{ads:172});
 for(const job of done.jobs.filter(j=>j.department!=='operations')){
  const review=job.stages.find(s=>s.kind==='qa'),head=job.stages.find(s=>s.kind==='head');
  assert(review&&head,job.id);assert.notEqual(review.role,job.stages[0].role);assert.notEqual(head.role,review.role);
  assert(job.stages.indexOf(review)<job.stages.indexOf(head));
  assert(job.finishedAt<=done.jobs.find(j=>j.id==='summary').timeline[0].begin);
 }
 assert.equal(demoWalkthrough(172,{ads:172}).current.title,'Owner decision recorded');
});

test('continuous demo matches a busy 35-task reference density with an ongoing queue',()=>{
 for(const at of [0,1,12,50,300,6000,90000]){
  const frame=demoLiveFrame(at);assert.equal(frame.working.filter(j=>!j.id.startsWith('live-approval')).length,35);
  assert.equal(frame.jobs.filter(j=>j.status==='queued').length,41);assert.ok(frame.done.length>=42&&frame.done.length<=240);
  assert.equal(new Set(frame.working.map(j=>j.department)).size,8);assert(frame.jobs.length<=320);
  assert(frame.jobs.every(j=>Number.isFinite(j.progress)&&j.progress>=0&&j.progress<=100));
 }
 assert.equal(demoLiveLanes.length,35);assert.equal(demoLiveFrame(0).completedTotal,42);assert(demoLiveFrame(300).completedTotal>42);
 const initial=new Set(demoLiveFrame(0).jobs.map(j=>j.id)),later=demoLiveFrame(60);
 assert(later.jobs.some(j=>!initial.has(j.id)));assert(later.events.some(e=>e.kind==='arrival'&&e.at>0));
});
test('ongoing demo preserves pending owner decisions while unrelated jobs keep arriving',()=>{
 for(const at of[12,300,90000]){const f=demoLiveFrame(at);assert.equal(f.waiting[0].id,'live-approval-0');assert.equal(f.waiting[0].timeline.at(-1).status,'queued');assert.equal(f.working.length,35);}
 const decisions=Object.freeze({'live-approval-0':300});const approved=demoLiveFrame(306,decisions);
 assert(approved.done.some(j=>j.id==='live-approval-0'));assert.equal(demoLiveFrame(396,decisions).waiting[0].id,'live-approval-1');
 for(const decisions of [{'live-approval-0':0},Object.create({'live-approval-0':12}),{'live-approval-0':Infinity}])assert.equal(demoLiveFrame(300,decisions).waiting[0].id,'live-approval-0');
 assert.deepEqual(demoLiveFrame(45),demoLiveFrame(45));
});
test('live drafts keep independent QA and head stages and simulated provenance',()=>{
 const frames=[demoLiveFrame(0),demoLiveFrame(75)];
 for(const frame of frames)for(const job of frame.jobs.filter(j=>!j.id.startsWith('live-approval'))){
  assert.notEqual(job.stages[0].role,job.stages[1].role);assert.notEqual(job.stages[1].role,job.stages[2].role);
  assert.equal(job.stages[1].kind,'qa');assert.equal(job.stages[2].kind,'head');assert.equal(job.stages.some(s=>s.kind==='send'),false);
  if(job.status==='done')assert(job.timeline.every(s=>s.status==='done'));
 }
});

test('entered demo briefs advance through specialist, independent QA and head without external stages',()=>{
 const requests=[{id:'request-1',department:'social',title:'  Plan the dinner campaign  ',start:5}];
 const first=demoLiveFrame(6,{},requests).jobs.find(j=>j.id==='request-1');
 assert.equal(first.title,'Plan the dinner campaign');assert.equal(first.status,'working');assert.equal(first.workload,'Your demo brief');
 assert.equal(demoLiveFrame(48,{},requests).jobs.find(j=>j.id==='request-1').current.kind,'qa');
 const done=demoLiveFrame(66,{},requests).jobs.find(j=>j.id==='request-1');assert.equal(done.status,'done');assert.equal(done.progress,100);
 assert.deepEqual(done.stages.map(s=>s.kind),['work','qa','head']);
 const invalid=[{id:'request-2',department:'unknown',title:'No',start:0},{id:'request-3',department:'social',title:' ',start:0},{id:'request-4',department:'social',title:'Future',start:90}];
 assert.ok(demoLiveFrame(6,{},invalid).jobs.every(j=>!j.id.startsWith('request-')));
});

test('live task titles have no numbered presentation suffixes while IDs remain unique',()=>{
 const jobs=demoLiveFrame(600).jobs;assert.ok(jobs.every(j=>! / · \d{3}$/.test(j.title)));assert.equal(new Set(jobs.map(j=>j.id)).size,jobs.length);
});

test('demo work and reference documents stay generic across all departments',()=>{
 assert.ok(!/restaurant|dining|democlientb|rooftop|plated.food/i.test(JSON.stringify([demoJobs,demoConnections,demoReferences,demoLiveFrame(120)])));
});


test('longer varied demo estimates top out at three minutes and show 100 before done',()=>{
 const initial=demoLiveFrame(0).working,estimates=initial.map(j=>j.stages.reduce((sum,s)=>sum+s.duration,0));
 assert.ok(Math.abs(Math.max(...estimates)-180)<1e-8);assert.ok(Math.min(...estimates)>=45-1e-8);assert.ok(new Set(estimates.map(Math.round)).size>12);
 for(const job of initial){const duration=job.stages.reduce((sum,s)=>sum+s.duration,0),at=job.start+duration-1;
  const finishing=demoLiveFrame(at).jobs.find(j=>j.id===job.id);assert.equal(finishing.progress,100);assert.equal(finishing.status,'working');
  const done=demoLiveFrame(at+1.01).jobs.find(j=>j.id===job.id);assert.equal(done.progress,100);assert.equal(done.status,'done');
  assert.ok(demoLiveFrame(at+121).jobs.some(j=>j.id===job.id&&j.status==='done'));
 }
 assert.ok(demoLiveFrame(600).done.length>42);
});


test('guided jobs and approved owner jobs hold 100 percent before completion',()=>{
 const approvals={ads:300},complete=demoFrame(1000,approvals);
 for(const job of complete.jobs){
  assert.equal(job.status,'done');
  const finishing=demoFrame(job.finishedAt-1,approvals).jobs.find(j=>j.id===job.id);
  assert.equal(finishing.status,'working',job.id);assert.equal(finishing.progress,100,job.id);
  assert.equal(demoFrame(job.finishedAt+.01,approvals).jobs.find(j=>j.id===job.id).status,'done');
 }
 const decision={'live-approval-0':20};
 assert.equal(demoLiveFrame(19,decision).jobs.find(j=>j.id==='live-approval-0').status,'approval');
 const finishing=demoLiveFrame(25,decision).jobs.find(j=>j.id==='live-approval-0');
 assert.equal(finishing.status,'working');assert.equal(finishing.progress,100);
 assert.equal(demoLiveFrame(26,decision).jobs.find(j=>j.id==='live-approval-0').status,'done');
});


test('a live run stops at exactly 1000 completions without accumulating later work',()=>{
 assert.equal(demoTaskLimit,1000);
 const variants=[{approvals:{},requests:[]},{approvals:{'live-approval-0':20,'live-approval-1':120},requests:[{id:'request-cap',department:'social',title:'Check the campaign',start:40}]}];
 for(const {approvals,requests} of variants){
  const end=demoLiveCycleEnd(approvals,requests);
  assert.ok(Number.isFinite(end)&&end>180&&end<10000);
  assert.equal(demoLiveFrame(end-.001,approvals,requests).completedTotal,999);
  const capped=demoLiveFrame(end,approvals,requests);assert.equal(capped.completedTotal,1000);
  assert.deepEqual(demoLiveFrame(end+10000,approvals,requests),capped);
  assert.deepEqual(demoLiveFrame(0,{},[]),demoLiveFrame(0));
 }
 assert.ok(demoLiveCycleEnd(variants[1].approvals,variants[1].requests)<demoLiveCycleEnd());
 assert.equal(demoLiveCycleEnd(Object.create({'live-approval-0':20})),demoLiveCycleEnd());
});

test('time away is discarded and a paused run resumes with a fresh baseline',()=>{
 let elapsed=15;
 elapsed+=demoPlaybackDelta(100,200,false);assert.equal(elapsed,15);
 elapsed+=demoPlaybackDelta(null,3600000);assert.equal(elapsed,15);
 elapsed+=demoPlaybackDelta(3600000,3600050);assert.equal(elapsed,15.05);
 assert.equal(demoLiveFrame(elapsed).completedTotal,demoLiveFrame(15.05).completedTotal);
});

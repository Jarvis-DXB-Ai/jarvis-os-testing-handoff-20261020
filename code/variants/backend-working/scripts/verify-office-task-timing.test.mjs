import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskTiming,formatWorkDuration} from '../src/lib/office-task-timing.mjs';
import {taskProgress} from '../src/lib/office-observations.mjs';
const start=Date.parse('2026-10-13T08:00:00Z'),iso=s=>new Date(start+s*1000).toISOString();
const models={coo:'opus',test:'gpt-5.6-sol'};
const current={id:'current',brief:'Write a short campaign caption.',context:'Approved fictional brand.',status:'working',createdAt:iso(0),updatedAt:iso(5),plan:{summary:'One copy part'},concurrency:1,steps:[{id:'copy',roleId:'copy',model:'sonnet',dependsOn:[],status:'running'}],calls:[],qa:null};
const completed=(id,seconds)=>({...current,id,status:'needs_review',qa:{pass:true},calls:[{stage:'planning',model:'opus',status:'succeeded',finishedAt:iso(10)},{stage:'qa',model:'gpt-5.6-sol',status:'succeeded',finishedAt:iso(seconds)}]});
test('time ranges require three distinct comparable completed teams and never advance saved progress',()=>{
 const history=[completed('a',60),completed('b',90),completed('c',120)];
 assert.equal(taskTiming(current,history.slice(0,2),start+20000,models).state,'learning');
 assert.equal(taskTiming(current,[history[0],history[0],history[1]],start+20000,models).state,'learning');
 const timing=taskTiming(current,history,start+20000,models);assert.deepEqual(timing.remaining,[40,100]);assert.equal(timing.sampleCount,3);
 assert.equal(current.steps[0].status,'running');assert.equal(taskProgress(current).percent,20);
});
test('wrong models, parallelism, dependencies, scope, failed QA, fixtures and conversations cannot train the estimate',()=>{
 const history=[completed('a',60),completed('b',90),completed('c',120)];
 for(const override of [{fixture:true},{kind:'conversation'},{qa:{pass:false}},{status:'failed'},{concurrency:2},{brief:'x'.repeat(3000)},{steps:[{...current.steps[0],model:'haiku'}]},{steps:[{...current.steps[0],dependsOn:['other']}]},{calls:[{stage:'qa',model:'other',finishedAt:iso(90)}]}]){
  assert.equal(taskTiming(current,[history[0],history[1],{...history[2],...override}],start+20000,models).state,'learning');
 }
 assert.equal(taskTiming({...current,plan:null},history,start+20000,models).remaining,null);
});
test('exceeded estimates flag overruns instead of returning zero or inventing another finish time',()=>{
 const timing=taskTiming(current,[completed('a',60),completed('b',90),completed('c',120)],start+130000,models);
 assert.equal(timing.state,'overdue');assert.equal(timing.remaining,null);assert.equal(timing.elapsedSeconds,130);
});
test('owner review and failures freeze the execution clock and never keep a loading countdown',()=>{
 const saved=completed('a',80),reviewed={...saved,status:'reviewed',updatedAt:iso(5000)};
 assert.equal(taskTiming(reviewed,[],start+9000000,models).elapsedSeconds,80);
 assert.equal(taskTiming(saved,[],start+9000000,models).state,'finished');
 assert.equal(taskTiming({...saved,status:'recovery_required'},[],start+9000000,models).state,'attention');
 assert.equal(taskTiming({...current,status:'queued',createdAt:'invalid'},[],start,models).elapsedSeconds,null);
});
test('durations use readable seconds, minutes and hours',()=>{
 assert.equal(formatWorkDuration(62),'1m 2s');assert.equal(formatWorkDuration(3661),'1h 1m');assert.equal(formatWorkDuration(null),'—');
});
test('department reporting time is active and old teams cannot train timing for the longer workflow',()=>{
 const reports=[{departmentId:'marketing',roleId:'cmo',model:'sonnet'}];
 const history=[completed('a',60),completed('b',90),completed('c',120)];
 const reporting={...current,status:'reporting',departmentReports:reports};
 assert.equal(taskTiming(reporting,history,start+20000,models).state,'learning');
 const comparable=history.map(t=>({...t,departmentReports:reports}));
 assert.equal(taskTiming(reporting,comparable,start+20000,models).state,'estimated');
 assert.equal(taskTiming(reporting,comparable,start+20000,models).elapsedSeconds,20);
});

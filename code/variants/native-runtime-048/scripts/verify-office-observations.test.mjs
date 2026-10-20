import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskProgress,historicalProgress,partProgress,partLane,departmentWork,appUse,usedApps} from '../src/lib/office-observations.mjs';
const step={id:'copy',roleId:'copy',agentId:'copy-agent',dependsOn:[],status:'completed',issueId:'i',startedAt:'2026-10-13',output:'Saved copy'};
const task={id:'task',status:'needs_review',plan:{summary:'plan'},steps:[step],output:'Draft',qa:{pass:true},reviewedAt:null,calls:[{agentId:'copy-agent',roleId:'copy',stage:'specialist:copy',runId:'run',status:'succeeded',model:'sonnet',usage:{model:'claude-sonnet-5'}}],archive:{status:'synced'}};
test('department summaries count only saved completed reports, while older tasks keep their original milestone count',()=>{
 const report={id:'department-marketing',departmentId:'marketing',roleId:'cmo',stepIds:[step.id],status:'running',output:null};
 const reporting={...task,status:'reporting',output:null,qa:null,departmentReports:[report]};
 assert.equal(taskProgress(task).total,5);
 assert.deepEqual([taskProgress(reporting).done,taskProgress(reporting).total],[2,6]);
 const saved={...reporting,departmentReports:[{...report,status:'completed',output:'Saved summary'}]};
 assert.equal(taskProgress(saved).done,3);assert.equal(taskProgress({...saved,departmentReports:[{...report,status:'failed',output:'Partial summary'}]}).done,2);
 assert.equal(departmentWork([saved],'marketing',[{id:'marketing',roles:[step.roleId]}]).reports.length,1);
});
test('progress measures accepted saved milestones and never equates a saved draft or rejected QA with final completion',()=>{
 assert.equal(taskProgress({...task,plan:null}).percent,null);
 assert.equal(taskProgress(task).percent,80);
 assert.equal(taskProgress({...task,qa:{pass:false},status:'failed'}).percent,60);
 assert.equal(taskProgress({...task,status:'reviewed',reviewedAt:'2026-10-13'}).percent,100);
 assert.equal(partProgress(step).percent,100);
 assert.equal(partProgress({...step,status:'queued',issueId:null,startedAt:null,output:null}).percent,0);
 assert.equal(partProgress({...step,status:'running',output:null}).percent,67);
});
test('department counts aggregate every team, keep support separate and preserve blocked dependency / QA review states',()=>{
 const departments=[{id:'marketing',roles:['copy']}],queued={...step,id:'next',status:'queued',output:null,issueId:null,startedAt:null,dependsOn:['missing']};
 const rows=[task,{...task,id:'blocked',status:'blocked',steps:[queued]},{...task,id:'support',steps:[{...step,roleId:'knowledge'}]}];
 const work=departmentWork(rows,'marketing',departments);assert.equal(work.counts.done,1);assert.equal(work.counts.waiting,1);assert.equal(work.waitingReview,1);
 assert.equal(departmentWork(rows,'support',departments).counts.done,1);
 assert.equal(partLane(queued,{...task,status:'failed',steps:[queued]}),'attention');
});
test('app use requires an acknowledged saved run; planned tools and stale live claims do not become execution evidence',()=>{
 const snapshot={status:'connected',agents:[{id:'copy-agent',name:'Copy',adapter:'claude_local'}]};
 assert.equal(appUse('higgsfield',[task],snapshot).length,0);
 assert.equal(appUse('claude',[task],snapshot)[0].name,'Copy');
 assert.equal(appUse('review',[task],snapshot)[0].name,'Jarvis archive coordinator');
 assert.deepEqual(usedApps(task,'copy-agent',snapshot),['paperclip','claude','review']);
 const remapped={...snapshot,agents:[{...snapshot.agents[0],adapter:'codex_local'}]};assert.deepEqual(usedApps(task,'copy-agent',remapped),['paperclip','claude','review']);
 const active={...task,status:'working',calls:[{...task.calls[0],status:'running'}]},liveSnapshot={...snapshot,runs:[{id:'run',status:'running'}]};assert.equal(appUse('claude',[active],liveSnapshot)[0].live,true);
 assert.equal(appUse('claude',[active],snapshot)[0].live,false);
 assert.equal(appUse('claude',[{...active,status:'recovery_required'}],liveSnapshot)[0].live,false);
 assert.equal(appUse('claude',[active],{...snapshot,status:'unavailable'})[0].live,false);
 assert.equal(appUse('claude',[{...task,calls:[{...task.calls[0],runId:null}]}],snapshot).length,0);
});

test('earlier jobs retain their own executor milestones and cannot become approved through a saved output alone',()=>{
 const job={steps:[{status:'completed',output:'draft'}],synthesis:'assembly',context_manifest:{qa:{pass:true}},status:'needs_review'};
 assert.equal(historicalProgress(job).percent,75);
 assert.equal(historicalProgress({...job,status:'reviewed'}).percent,100);
 assert.equal(historicalProgress({...job,context_manifest:{qa:{pass:false}},status:'failed'}).percent,50);
 assert.equal(historicalProgress({...job,steps:[{status:'unknown',output:null}],synthesis:null,context_manifest:{},status:'recovery_required'}).percent,0);
});

test('native app use requires completed non-fixture tool receipts, not a model tool grant',()=>{
 const snapshot={status:'connected',agents:[{id:'copy-agent',name:'Copy',adapter:'claude_local'}]};
 const granted={...task,calls:[{...task.calls[0],tools:['graphic_card','blender_scene']}]};
 assert.equal(appUse('sharp',[granted],snapshot).length,0);
 const receipt={id:'receipt',agentId:'copy-agent',roleId:'design-system',tool:'graphic_card',status:'completed',fixture:false,result:{}};
 const rendered={...granted,toolCalls:[receipt]};
 assert.equal(appUse('sharp',[rendered],snapshot)[0].stage,'graphic_card');
 assert.equal(appUse('bridge-media',[rendered],snapshot).length,1);
 assert.ok(usedApps(rendered,'copy-agent',snapshot).includes('sharp'));
 for(const excluded of [{...receipt,fixture:true},{...receipt,status:'failed'}]){
  assert.equal(appUse('sharp',[{...granted,toolCalls:[excluded]}],snapshot).length,0);
  assert.ok(!usedApps({...granted,toolCalls:[excluded]},'copy-agent',snapshot).includes('sharp'));
 }
 assert.equal(appUse('blender',[rendered],snapshot).length,0);
});

test('client progress counts department quality only when saved checks pass',()=>{const report={id:'email',departmentId:'email',roleId:'cmo',stepIds:[step.id],status:'queued',output:null,qa:{status:'running',result:null}};const job={...task,version:4,status:'reporting',output:null,qa:null,departmentReports:[report]};assert.deepEqual([taskProgress(job).done,taskProgress(job).total],[2,7]);const passed={...report,qa:{status:'completed',result:{pass:true}}};assert.equal(taskProgress({...job,departmentReports:[passed]}).done,3);assert.equal(taskProgress({...job,departmentReports:[{...passed,qa:{status:'failed',result:{pass:false}}}]}).done,2);});

test('customer support remains distinct from shared operations/research when both are present',()=>{const departments=[{id:'support',roles:['community']}],customer={...task,id:'dm',steps:[{...step,roleId:'community'}]},shared={...task,id:'assets',steps:[{...step,roleId:'librarian'}]};assert.equal(departmentWork([customer,shared],'support',departments).parts.length,1);assert.equal(departmentWork([customer,shared],'shared-support',departments).parts.length,1);assert.equal(departmentWork([customer,shared],'shared-support',departments).parts[0].task.id,'assets');});

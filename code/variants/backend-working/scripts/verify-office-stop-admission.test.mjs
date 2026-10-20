import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createJob,executeJob,readJob,stopJob} from './lib/office-team-engine.mjs';

test('owner stop during async admission prevents the next native invocation and leaves a terminal pre-dispatch receipt',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'office-stop-admission-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const id=randomUUID(),agentId=randomUUID();
 await createJob({id,brief:'Synthetic stopped conversation',context:'No network or native models.',criteria:['No native model call.'],kind:'conversation',targetAgentId:agentId},directory);
 const agent={id:agentId,status:'idle',name:'Fixture author',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture'}};
 const plan={paperclipCompanyId:'fixture-company',roles:[{id:'copy',name:'Fixture author',rosterStatus:'active',output:'Fixture text'}],executives:[],skillLibrary:[],toolBridge:{enabled:false}};
 let admitted,release,invocations=0,cancellations=0;
 const waiting=new Promise(resolve=>{admitted=resolve;}),held=new Promise(resolve=>{release=resolve;});
 const api=async(path,body,method)=>{
  if(path.endsWith('/agents'))return [agent];
  if(path.endsWith('/issues')&&body)return {id:randomUUID(),...body};
  if(path.endsWith('/heartbeat/invoke')){invocations++;return{id:randomUUID(),status:'queued'};}
  if(path.endsWith('/cancel')){cancellations++;return{};}
  if(method==='PATCH')return body;
  throw new Error('Unexpected fixture API '+path);
 };
 const execution=executeJob(id,plan,{directory,api,pollMs:1,modelPolicy:async()=>{admitted();await held;return true;}});
 await waiting;await stopJob(id,directory);release();
 const result=await execution;
 assert.equal(invocations,0,'A stop observed during admission must block the first invocation, not cancel it afterwards.');
 assert.equal(cancellations,0);assert.equal(result.status,'cancelled');
 assert.equal(result.calls.length,1);assert.equal(result.calls[0].status,'cancelled_before_dispatch');assert.equal(result.calls[0].runId,null);assert.equal(result.calls[0].usage,null);
 assert.equal((await readJob(id,directory)).status,'cancelled');
 await assert.rejects(access(join(directory,'active-team.lock')),{code:'ENOENT'});
});

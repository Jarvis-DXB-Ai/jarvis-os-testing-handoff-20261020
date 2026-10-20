import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,mkdir,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {workflowDigest,validateWorkflowManifest,consumeWorkflowGo,executeWorkflowHttp,assessWorkflowJob,checkWorkflowStop,coordinatingThreadId} from './lib/office-goal-workflow-proof.mjs';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function save(path,value){
 await mkdir(dirname(path),{recursive:true,mode:0o700});const temporary=path+'.'+randomUUID()+'.tmp';
 await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temporary,path);
}

function fixtureManifest(){
 const ids=Array.from({length:8},()=>randomUUID());
 const clients=[0,1].map(i=>({clientId:ids[i],foundationId:'client-'+ids[i],contextRevision:String(i+1).repeat(64),actorIds:[ids[i+2]],ownMarker:i?'BETA_PROOF_ONLY':'ALPHA_PROOF_ONLY',forbiddenMarkers:[i?'ALPHA_PROOF_ONLY':'BETA_PROOF_ONLY'],synthetic:true}));
 const jobs=clients.map((client,i)=>({id:ids[i+4],clientId:client.clientId,kind:'conversation',actorId:client.actorIds[0]}));
 const steps=jobs.map((job,i)=>{
  const body={id:job.id,clientId:job.clientId,agentId:job.actorId,historyMode:'fresh',message:'Return the current synthetic context marker only.'};
  return {name:'client-'+i,path:'/api/office/conversations',body,bodySha256:workflowDigest(body),expectedStatus:201,expect:{'job.id':job.id}};
 });
 return {version:1,runId:ids[6],baseUrl:'http://127.0.0.1:3101',companyId:ids[7],expiresAt:new Date(Date.now()+60000).toISOString(),clients,jobs,steps,retention:'Synthetic temp fixtures removed; real native artifacts retained for root inspection.'};
}
const fixtureGo=manifest=>({version:1,rootThreadId:coordinatingThreadId,runId:manifest.runId,manifestSha256:workflowDigest(manifest),expiresAt:manifest.expiresAt,maxPostRequests:manifest.steps.length,authorization:'Exact one-use HTTP workflow proof; existing per-call native policy remains mandatory.'});

/** Actual current engine/queue primitives, temp storage and fake transport only. Zero native calls. */
export async function selfTest(){
 const {createJob,readJob,listJobs,stopJob,reconcileJob,reviewJob,runDependencies,prepareDepartmentRevision}=await import('./lib/office-team-engine.mjs');
 const {drainOfficeQueue}=await import('./lib/office-task-queue.mjs');
 const directory=await mkdtemp(join(tmpdir(),'office-goal-proof-'));const results=[],observedDefects=[];
 const check=async(name,fn)=>{await fn();results.push({name,pass:true,evidenceKind:'synthetic'});};
 try{
  const manifest=fixtureManifest(),stopFile=join(directory,'STOP.json');
  await check('manifest pins distinct client/foundation/actor/request identities',async()=>{
   assert.deepEqual(validateWorkflowManifest(manifest),manifest);
   for(const change of [m=>m.clients[1].clientId=m.clients[0].clientId,m=>m.clients[1].actorIds=m.clients[0].actorIds,m=>m.steps[0].body.clientId=m.clients[1].clientId,m=>m.steps[0].body.message='Unhashed changed request',m=>m.steps[0].path='/api/office/client-intake',m=>m.steps[0].body.historyMode='continue']){
    const copy=structuredClone(manifest);change(copy);assert.throws(()=>validateWorkflowManifest(copy));
   }
  });
  await check('missing or serialized root grant cannot invoke transport',async()=>{
   let calls=0;await assert.rejects(executeWorkflowHttp(manifest,{grant:{runId:manifest.runId,consumed:true},checkpoint:async()=>{},fetchImpl:async()=>{calls++;}}),/in-process/);assert.equal(calls,0);
  });
  await check('root go binds exact body hashes, expiry and request count',async()=>{
   for(const change of [g=>g.manifestSha256='0'.repeat(64),g=>g.expiresAt='2020-01-01T00:00:00.000Z',g=>g.maxPostRequests++,g=>g.rootThreadId=randomUUID()]){
    const go=fixtureGo(manifest);change(go);await assert.rejects(consumeWorkflowGo(manifest,go,{consumedPath:join(directory,randomUUID()+'.consumed.json'),stopFile}));
   }
  });
  await check('one-use consumption persists before first HTTP and cannot replay',async()=>{
   const consumedPath=join(directory,'once.consumed.json'),grant=await consumeWorkflowGo(manifest,fixtureGo(manifest),{consumedPath,stopFile});
   await assert.rejects(consumeWorkflowGo(manifest,fixtureGo(manifest),{consumedPath,stopFile}),{code:'EEXIST'});
   let calls=0,checkpoints=0;
   const fetchImpl=async()=>{assert.equal((await json(consumedPath)).runId,manifest.runId);const step=manifest.steps[calls++];return new Response(JSON.stringify({job:{id:step.body.id}}),{status:201});};
   const events=await executeWorkflowHttp(manifest,{grant,fetchImpl,checkpoint:async()=>{checkpoints++;},stopFile});
   assert.equal(calls,2);assert.equal(checkpoints,4);assert.ok(events.every(e=>e.outcome==='matched'));
   await assert.rejects(executeWorkflowHttp(manifest,{grant,fetchImpl,checkpoint:async()=>{},stopFile}),/in-process/);assert.equal(calls,2);
  });
  await check('unknown HTTP outcome checkpoints and makes no retry or next request',async()=>{
   const grant=await consumeWorkflowGo(manifest,fixtureGo(manifest),{consumedPath:join(directory,'unknown.consumed.json'),stopFile});let calls=0,events;
   await assert.rejects(executeWorkflowHttp(manifest,{grant,stopFile,checkpoint:async e=>{events=structuredClone(e);},fetchImpl:async()=>{calls++;throw new Error('Synthetic lost acknowledgement');}}),/lost acknowledgement/);
   assert.equal(calls,1);assert.equal(events.length,1);assert.equal(events[0].outcome,'failed_or_unknown');
  });
  await check('malformed shared stop blocks before write and between requests',async()=>{
   await writeFile(stopFile,'');await assert.rejects(consumeWorkflowGo(manifest,fixtureGo(manifest),{consumedPath:join(directory,'stop.consumed.json'),stopFile}),/STOP/);await rm(stopFile);
   const grant=await consumeWorkflowGo(manifest,fixtureGo(manifest),{consumedPath:join(directory,'between.consumed.json'),stopFile});let calls=0;
   await assert.rejects(executeWorkflowHttp(manifest,{grant,stopFile,checkpoint:async()=>{},fetchImpl:async()=>{calls++;await writeFile(stopFile,'{malformed');return new Response(JSON.stringify({job:{id:manifest.jobs[0].id}}),{status:201});}}),/STOP/);assert.equal(calls,1);await rm(stopFile);
  });
  const task=(i)=>({id:manifest.jobs[i].id,brief:'Synthetic separate client task '+i,context:manifest.clients[i].ownMarker,criteria:['Return a synthetic draft only.'],contextRequest:{foundationId:manifest.clients[i].foundationId,taskType:'caption',mode:'draft'}});
  await check('two current-engine jobs preserve separate context receipts',async()=>{
   for(let i=0;i<2;i++)await createJob(task(i),directory,{queueManaged:true,knowledgeContext:{scope:{clientId:manifest.clients[i].clientId},revision:manifest.clients[i].contextRevision,foundationId:manifest.clients[i].foundationId}});
   const jobs=await listJobs(directory,{kind:'all'});assert.equal(jobs.length,2);
   for(const job of jobs){const i=manifest.jobs.findIndex(j=>j.id===job.id);assert.equal(job.context,manifest.clients[i].ownMarker);assert.ok(!JSON.stringify(job).includes(manifest.clients[1-i].ownMarker));}
  });
  await check('exact retry returns original job and changed identity/content conflicts',async()=>{
   const original=await readJob(task(0).id,directory),retry=await createJob(task(0),directory,{queueManaged:true});assert.equal(retry.created,false);assert.deepEqual(retry.job,original);
   await assert.rejects(createJob({...task(0),brief:'Different request with same ID'},directory),/different task/);
   await assert.rejects(createJob({...task(0),contextRequest:task(1).contextRequest},directory),/different task/);
  });
  await check('simultaneous same-ID creation cannot create two durable jobs',async()=>{
   const request={...task(0),id:randomUUID()},attempts=await Promise.allSettled([createJob(request,directory,{queueManaged:true}),createJob(request,directory,{queueManaged:true})]);
   assert.equal(attempts.filter(r=>r.status==='fulfilled'&&r.value.created).length,1);
   assert.equal((await listJobs(directory,{kind:'all'})).filter(j=>j.id===request.id).length,1);
   await stopJob(request.id,directory);
   results.push({name:'concurrent loser transport detail',pass:true,evidenceKind:'synthetic',outcomes:attempts.map(r=>r.status==='fulfilled'?r.value.created?'created':'replayed':r.reason.code??r.reason.message)});
  });
  await check('queued cancellation and concurrent dispatcher drain cause no duplicate consumption',async()=>{
   await stopJob(task(0).id,directory);let executions=0;
   const options={directory,execute:async id=>{executions++;await new Promise(r=>setTimeout(r,10));const j=await readJob(id,directory);j.status='needs_review';await writeFile(join(directory,id+'.json'),JSON.stringify(j));return j;}};
   const attempts=await Promise.all([drainOfficeQueue({},options),drainOfficeQueue({},options)]);assert.equal(executions,1);assert.ok(attempts.some(r=>r.status==='locked'));assert.equal((await readJob(task(0).id,directory)).status,'cancelled');
  });
  await check('unknown interrupted run blocks reconciliation until exact native run terminal',async()=>{
   const id=randomUUID(),runId=randomUUID();await createJob({...task(0),id},directory,{queueManaged:true});const job=await readJob(id,directory);
   Object.assign(job,{status:'working',ownerPid:2147483647,calls:[{runId,agentId:manifest.clients[0].actorIds[0],issueId:randomUUID(),status:'running'}]});await writeFile(join(directory,id+'.json'),JSON.stringify(job));
   assert.equal((await listJobs(directory,{kind:'all'})).find(j=>j.id===id).status,'recovery_required');
   await assert.rejects(reconcileJob(id,async()=>({status:'running'}),directory),/active/);assert.equal((await readJob(id,directory)).calls[0].status,'running');
   let invocations=0;const reconciled=await reconcileJob(id,async path=>{if(path.includes('invoke'))invocations++;return {status:'cancelled',finishedAt:new Date().toISOString()};},directory);
   assert.equal(reconciled.status,'failed');assert.equal(invocations,0);assert.equal(reconciled.calls.length,1);
  });
  await check('recovery blocks queue, safety hold preserves queued task',async()=>{
   for(const status of ['recovery_required','working']){let executions=0;await drainOfficeQueue({}, {directory,readJobs:async()=>[{id:randomUUID(),status},{id:randomUUID(),status:'queued',queueManaged:true,createdAt:'2026-01-01'}],execute:async()=>{executions++;}});assert.equal(executions,0);}
   assert.equal((await drainOfficeQueue({}, {directory,readJobs:async()=>[{id:randomUUID(),status:'queued',queueManaged:true,createdAt:'2026-01-01'}],canExecute:async()=>false,execute:async()=>assert.fail('Safety hold consumed work')})).status,'paused');
  });
  await check('independent tasks overlap with bounded dependency scheduling',async()=>{
   let concurrent=0,peak=0;const completed=[];
   await runDependencies([{id:'a',dependsOn:[]},{id:'b',dependsOn:[]},{id:'c',dependsOn:['a','b']}],2,async part=>{if(part.id==='c')assert.deepEqual(completed.sort(),['a','b']);concurrent++;peak=Math.max(peak,concurrent);await new Promise(r=>setTimeout(r,5));completed.push(part.id);concurrent--;});assert.equal(peak,2);
  });
  await check('owner review refuses incomplete output and failed QA',async()=>{
   const id=task(1).id,j=await readJob(id,directory);await assert.rejects(reviewJob(id,'Synthetic owner note',directory),/QA-passed/);
   j.qa={pass:false};j.output='Unapproved synthetic draft';await writeFile(join(directory,id+'.json'),JSON.stringify(j));await assert.rejects(reviewJob(id,'Synthetic owner note',directory),/QA-passed/);assert.equal((await readJob(id,directory)).reviewedAt,null);
  });
  await check('correction binds rejected part hash, retains original draft and resets QA',async()=>{
   const id=randomUUID();await createJob({...task(0),id},directory);const j=await readJob(id,directory),path=join(directory,id+'.json');
   Object.assign(j,{status:'failed',issueId:randomUUID(),plan:{tasks:[]},specialistResponseVersion:1,steps:[{id:'caption',status:'completed',output:'Synthetic incorrect term.',dependsOn:[]}],departmentReports:[{departmentId:'social',stepIds:['caption'],status:'failed',output:'Old head',qa:{status:'failed',result:{pass:false}}}]});await writeFile(path,JSON.stringify(j));
   const correction={partId:'caption',expectedOutputSha256:workflowDigest(j.steps[0].output),replacements:[{from:'incorrect',to:'correct'}]},input={departmentId:'social',note:'Correct the exact rejected synthetic term.',expectedUpdatedAt:j.updatedAt,corrections:[correction]};
   await assert.rejects(prepareDepartmentRevision(id,{...input,expectedUpdatedAt:'stale'},directory),/exact saved/);
   await assert.rejects(prepareDepartmentRevision(id,{...input,corrections:[{...correction,expectedOutputSha256:'0'.repeat(64)}]},directory),/exact rejected/);
   const revised=await prepareDepartmentRevision(id,input,directory);assert.equal(revised.status,'queued');assert.equal(revised.steps[0].output,'Synthetic correct term.');assert.equal(revised.steps[0].priorOutput,j.steps[0].output);assert.equal(revised.qa,null);assert.equal(revised.departmentReports[0].qa.result,null);assert.equal(revised.reviewedAt,null);assert.equal(revised.revisionHistory[0].patches[0].sourceSha256,correction.expectedOutputSha256);
   await assert.rejects(prepareDepartmentRevision(id,input,directory),/exact saved/);await stopJob(id,directory);
  });
  await check('scheduled retry reconciliation adversary records actual current behavior',async()=>{
   const id=randomUUID();await createJob({...task(0),id},directory,{queueManaged:true});const j=await readJob(id,directory);
   Object.assign(j,{status:'recovery_required',calls:[{runId:randomUUID(),issueId:randomUUID(),agentId:manifest.clients[0].actorIds[0],status:'scheduled_retry'}]});await writeFile(join(directory,id+'.json'),JSON.stringify(j));
   try{
    const reconciled=await reconcileJob(id,async()=>({status:'scheduled_retry',scheduledRetryAt:new Date(Date.now()+60000).toISOString()}),directory);
    observedDefects.push({id:'scheduled-retry-reconcile',severity:'P1',actual:reconciled.status,expected:'Reject while native run is scheduled_retry or scheduledRetryAt is future; preserve recovery hold.',reproduction:'Known runId branch of reconcileJob accepted synthetic scheduled_retry with future scheduledRetryAt; marked job failed, allowing queue recovery hold to clear.',evidenceKind:'synthetic'});
    assert.equal(reconciled.status,'failed');
   }catch(error){assert.match(error.message,/active|retry|terminal|scheduled/i);assert.deepEqual(await readJob(id,directory),j);}
  });
  await check('generic pilot actual server source binds own hashed packets and rejects wrong tenants/names',async()=>{
   const ts=(await import('typescript')).default,{runInNewContext}=await import('node:vm'),{readPilotSources,pilotDigest,pilotTaskTypes}=await import('./lib/office-client-pilot.mjs');
   const source=await readFile(new URL('../src/lib/office-client-pilot-server.ts',import.meta.url),'utf8'),sourceSha256=workflowDigest(source);
   const storage={recordsRoot:join(directory,'records'),recordsVolume:directory,testing:true};await mkdir(storage.recordsRoot);
   const clientId=randomUUID(),otherId=randomUUID(),name='TEST Office Proof '+clientId,marker='SECOND_CLIENT_ONLY_'+clientId,brand={positioning:'Synthetic',facts:marker,voice:'Synthetic',visual:'Synthetic',production:'Synthetic',restrictions:'Internal synthetic audit only; no approval.'},setup={id:clientId,name,revision:'draft-revision',brand};
   let state=null,sideEffects=[];
   async function packetFixture({owner=clientId,packName=name,empty=false}={}){
    const base=join(storage.recordsRoot,'clients',clientId,'sources'),sha256=workflowDigest(marker),path=join(base,'objects',sha256,'evidence.md');await mkdir(dirname(path),{recursive:true});await writeFile(path,marker);
    const manifest={clientId:owner,name:packName,executionMode:'audit_only',brandApproved:false,paidServicesConfirmed:false,services:['social'],workerCapacity:1,packets:empty?{}:{audit:{path,sha256}}},bytes=JSON.stringify(manifest)+'\n',revision=workflowDigest(bytes),manifestPath=join(base,'versions',revision,'manifest.json');await mkdir(dirname(manifestPath),{recursive:true});await writeFile(manifestPath,bytes);await writeFile(join(base,'current.json'),JSON.stringify({sha256:revision,path:manifestPath}));return {manifest,sha256:revision};
   }
   const db={from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:state?{content:JSON.stringify(state)}:null,error:null}),insert:async row=>{sideEffects.push({kind:'db-insert',row});state=JSON.parse(row.content);return {error:null};}};return query;}};
   const imports={
    'server-only':{},'node:fs/promises':{readFile},'./client-brain-v2-server-core':{clientBrainV2ServerClient:db},'./internal-api-request':{requireExistingClient:async()=>{}},'./office-client-intake-server':{clientIntake:async()=>setup,requireLocalClientOffice:()=>{}},'./office-client-team.mjs':{buildClientTeam:(services,capacity)=>({services,maxConcurrentWorkers:capacity,roleIds:['audit']})},'../../scripts/lib/office-client-pilot.mjs':{readPilotSources,pilotDigest,pilotTaskTypes},'../../scripts/lib/office-client-agents.mjs':{provisionClientAgents:async(_plan,id,label,team)=>{sideEffects.push({kind:'provision-mock',id,label});return team;}},'../../scripts/lib/office-foundations.mjs':{initialiseFoundations:async(_storage,foundations)=>{sideEffects.push({kind:'foundation-mock',foundations});}},'./office-stack-plan.json':{storage},
   };
   const module={exports:{}},code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
   runInNewContext(code,{exports:module.exports,module,require:id=>{assert.ok(Object.hasOwn(imports,id),'Unexpected server dependency '+id);return imports[id];}},{filename:'actual-pilot-server.synthetic.cjs'});
   const server=module.exports,input={id:clientId,expectedRevision:setup.revision};
   for(const fixture of [{owner:otherId},{packName:'WRONG CLIENT'}]){
    await packetFixture(fixture);await assert.rejects(server.prepareClientPilot(input),/belong|identity|match|audit/i);assert.equal(sideEffects.length,0);
   }
   await packetFixture({empty:true});
   try{await server.prepareClientPilot(input);observedDefects.push({id:'empty-pilot-packet-provision',severity:'P1',evidenceKind:'synthetic',sourceSha256,actualMockSideEffects:sideEffects.map(e=>e.kind),expected:'Reject before foundation creation, actor provisioning or DB insert when pinned packets are empty.'});}
   catch(error){assert.match(error.message,/packet|evidence|source/i);assert.equal(sideEffects.length,0);}
   state=null;sideEffects=[];await packetFixture();const ready=await server.prepareClientPilot(input);assert.equal(ready.clientId,clientId);assert.equal(ready.name,name);assert.equal(ready.brandConfirmed,false);assert.equal(ready.servicesConfirmed,false);assert.equal(ready.executionMode,'audit_only');
   const context=await server.clientPilotContext(clientId,ready.foundationId,{mode:'draft',taskType:'internal'});assert.equal(context.clientId,clientId);assert.equal(context.registeredNotes[0].text,marker);assert.ok(!JSON.stringify(context).includes('DemoClientA'));
   const row=sideEffects.find(e=>e.kind==='db-insert').row;if(JSON.stringify(row).includes('DemoClientA')||JSON.stringify(row).includes('8 department'))observedDefects.push({id:'generic-pilot-democlienta-metadata',severity:'P2',evidenceKind:'synthetic',sourceSha256,actual:{title:row.title,summary:row.summary,provenance:row.provenance},expected:'Use exact TEST client identity and neutral audit-only provenance/capacity; no fabricated DemoClientA history.'});
   for(const request of [{mode:'approved',taskType:'internal'},{mode:'draft',taskType:'caption'}])await assert.rejects(server.clientPilotContext(clientId,ready.foundationId,request),/only draft/);
   await packetFixture({empty:true});const altered={...state,sourceRevision:(await readPilotSources(storage,clientId)).sha256};delete altered.revision;state={...altered,revision:pilotDigest(altered)};await assert.rejects(server.clientPilotContext(clientId,ready.foundationId,{mode:'draft',taskType:'internal'}),/packet|evidence/i);
   results.push({name:'generic pilot source provenance',pass:true,evidenceKind:'synthetic',sourceSha256,transport:'Actual TypeScript server transpiled locally; actual hash/tenant file reader, fake DB/auth/provision/foundation dependencies; temp source objects only.'});
  });
  await check('proof distinguishes native provenance, foreign context and caller claims',async()=>{
   const client=manifest.clients[0],job={id:randomUUID(),kind:'conversation',targetAgentId:client.actorIds[0],status:'answered',historyIds:[],knowledgeContext:{scope:{clientId:client.clientId},foundationId:client.foundationId,revision:client.contextRevision},output:'Synthetic answer',calls:[{runId:randomUUID(),issueId:randomUUID(),agentId:client.actorIds[0],status:'succeeded'}]};
   job.steps=[{output:job.output}];const call=job.calls[0];call.returnedOutput=job.output;call.outputContract={status:'not_invoked',outputSha256:workflowDigest(job.output)};
   const bundle={revision:client.contextRevision,scope:{clientId:client.clientId},foundation:{id:client.foundationId},facts:client.ownMarker},runs=[{id:call.runId,agentId:call.agentId,companyId:manifest.companyId,status:'succeeded',contextSnapshot:{issueId:call.issueId},usageJson:{billingType:'subscription_included'},resultJson:{summary:job.output}}];
   const options={bundle,runs,companyId:manifest.companyId,evidenceKind:'synthetic'};assert.equal(assessWorkflowJob(job,client,options).pass,true);
   assert.equal(assessWorkflowJob(job,client,{...options,bundle:{...bundle,foreign:client.forbiddenMarkers[0]}}).pass,false);
   assert.equal(assessWorkflowJob(job,client,{...options,runs:[]}).pass,false);
   assert.equal(assessWorkflowJob(job,client,{...options,runs:[{...runs[0],agentId:randomUUID()}]}).pass,false);
   assert.equal(assessWorkflowJob(job,client,{...options,runs:[{...runs[0],usageJson:{billingType:'api'}}]}).pass,false);
   assert.equal(assessWorkflowJob({...job,output:'Fabricated saved answer'},client,options).pass,false);
   assert.equal(assessWorkflowJob(job,client,{...options,runs:[{...runs[0],resultJson:{summary:'Different native bytes'}}]}).pass,false);
  });
  return {version:1,evidenceKind:'synthetic',nativeCalls:0,httpRequestsToLiveServices:0,pass:true,applicationWorkflowComplete:false,at:new Date().toISOString(),results,observedDefects,limitations:['Fake HTTP/native transport; actual engine persistence and queue in temporary directory.','No actual client setup, native lifecycle, correction, interruption or deployment claim.']};
 }finally{await rm(directory,{recursive:true,force:true});}
}

export async function observe(manifest){
 validateWorkflowManifest(manifest);await checkWorkflowStop();
 const {readJob,paperclipClient}=await import('./lib/office-team-engine.mjs');
 const {readTaskContext}=await import('./lib/office-foundations.mjs');
 const plan=await json(fileURLToPath(new URL('../src/lib/office-stack-plan.json',import.meta.url)));
 assert.equal(plan.paperclipCompanyId,manifest.companyId,'Manifest company differs from intended existing service.');
 const reports=[];
 for(const expected of manifest.jobs){
  await checkWorkflowStop();const job=await readJob(expected.id),client=manifest.clients.find(c=>c.clientId===expected.clientId);
  assert.equal(job.kind??'team',expected.kind);if(expected.actorId)assert.equal(job.targetAgentId,expected.actorId);
  const bundle=job.knowledgeContext?await readTaskContext(plan.storage,job.id,job.knowledgeContext,{checkCurrent:false}):null;
  const runs=[],actors=[];for(const call of job.calls??[]){await checkWorkflowStop();if(call.runId)runs.push(await paperclipClient()('/heartbeat-runs/'+call.runId));if(!client.actorIds.includes(call.agentId)&&!actors.some(a=>a.id===call.agentId))actors.push(await paperclipClient()('/agents/'+call.agentId));}
  reports.push(assessWorkflowJob(job,client,{bundle,runs,actors,companyId:manifest.companyId}));
 }
 return {version:1,evidenceKind:'native-readback',runId:manifest.runId,manifestSha256:workflowDigest(manifest),at:new Date().toISOString(),pass:reports.every(r=>r.pass),jobs:reports,scope:'Read existing saved contexts and exact native receipts only; no actions or model invocations.',unproven:['Concurrency/interrupt/recovery/correction require their own before-and-after receipts.','Passing task checks do not establish owner approval, role craft certification or deployment.']};
}

async function main(args){
 const [mode,manifestPath,goPath,reportPath]=args;
 if(mode==='--self-test'){
  await checkWorkflowStop();const result=await selfTest();if(manifestPath)await save(resolve(manifestPath),result);console.log(JSON.stringify(result,null,2));return;
 }
 if(mode==='--validate'){
  const manifest=validateWorkflowManifest(await json(manifestPath));console.log(JSON.stringify({valid:true,manifestSha256:workflowDigest(manifest),postRequests:manifest.steps.length,liveRequests:0}));return;
 }
 if(mode==='--observe'){
  assert.ok(goPath,'Usage: --observe MANIFEST REPORT');const report=await observe(await json(manifestPath));await save(resolve(goPath),report);console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;return;
 }
 if(mode==='--run'){
  assert.ok(reportPath,'Usage: --run MANIFEST ROOT_GO REPORT');await checkWorkflowStop();
  const manifest=validateWorkflowManifest(await json(manifestPath)),go=await json(goPath),target=resolve(reportPath);
  await mkdir(dirname(target),{recursive:true,mode:0o700});
  const grant=await consumeWorkflowGo(manifest,go,{consumedPath:resolve(goPath)+'.consumed.json'});
  const base={version:1,evidenceKind:'actual-http',runId:manifest.runId,manifestSha256:workflowDigest(manifest),scope:'Exact authorized HTTP steps. Model/native outcomes require separate observe readback; no automatic retry.'};
  try{const events=await executeWorkflowHttp(manifest,{grant,checkpoint:events=>save(target,{...base,events})});await save(target,{...base,events,httpExpectationsPassed:true});console.log(JSON.stringify({report:target,httpExpectationsPassed:true,nativeLifecycleProven:false}));}
  catch(error){console.error('Stopped: '+error.message+' Inspect durable checkpoint and existing job before any new go.');process.exitCode=1;}return;
 }
 throw new Error('Choose --self-test [REPORT], --validate MANIFEST, --run MANIFEST ROOT_GO REPORT, or --observe MANIFEST REPORT. No default live execution.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});

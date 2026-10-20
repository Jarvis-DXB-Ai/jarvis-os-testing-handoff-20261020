import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cooMessageInput,cooRetrievalProfile,requireOfficeContextRevision,defaultCooCriteria,resolveCooFoundation} from '../src/lib/office-coo-message.mjs';
import {validateTask,createJob} from './lib/office-team-engine.mjs';
const contextRequest={foundationId:'client-fixture',taskType:'strategy',mode:'approved'};
const input=brief=>cooMessageInput({id:randomUUID(),brief,contextRequest});
test('a message alone supplies acceptance defaults and leaves team selection to the COO',()=>{
 const message=input('Plan our launch');assert.deepEqual(message.criteria,defaultCooCriteria);assert.equal(message.departmentId,null);assert.equal(message.autoContext,true);assert.equal(message.concurrency,undefined);assert.equal(message.contextRevision,undefined);
 const validated=validateTask(message);assert.equal(validated.departmentId,undefined);assert.equal(validated.concurrency,null);assert.equal(validated.kind,undefined);
 assert.equal(validateTask(input('Hi')).brief,'Hi');assert.throws(()=>input('  '),/Write a message/);assert.throws(()=>input('x'.repeat(6001)),/Write a message/);assert.throws(()=>validateTask({...input('Hello'),brief:' '}),/1–6000/);
});
test('automatic retrieval picks task context, combines cross-department briefs and preserves exact client binding',()=>{
 for(const [brief,profile] of [['Write a newsletter','email'],['Audit the website','web'],['Create Instagram carousels','caption'],['Check invoices','finance'],['Edit video footage','video'],['Review customer support','support'],['Develop branding guidelines','design'],['Plan ads','ads'],['Research competitors','strategy'],['Analyse metrics','report'],['Take product photographs','photo'],['Start onboarding','onboarding']])assert.equal(cooRetrievalProfile(brief),profile,brief);
 assert.equal(cooRetrievalProfile('Audit the website and plan Instagram stories'),'strategy');
 const message=input('Write a newsletter');assert.deepEqual(message.contextRequest,{...contextRequest,taskType:'email'});
 assert.equal(message.contextRequest.foundationId,'client-fixture');assert.equal(message.contextRequest.mode,'approved');
});
test('internal audit foundations never silently become production or lose their draft restrictions',()=>{
 const message=cooMessageInput({id:randomUUID(),brief:'Write a newsletter',contextRequest:{foundationId:'audit-fixture',taskType:'strategy',mode:'draft'}});
 assert.deepEqual(message.contextRequest,{foundationId:'audit-fixture',taskType:'strategy',mode:'draft'});
});
test('automatic pinning needs an explicit boolean; manual callers still need the current revision',()=>{
 const bundle={revision:'current-revision'};assert.doesNotThrow(()=>requireOfficeContextRevision({autoContext:true},bundle));
 for(const value of [{},null,{autoContext:'true'},{autoContext:1},{contextRevision:'stale'}])assert.throws(()=>requireOfficeContextRevision(value,bundle),/Context changed/);
 assert.doesNotThrow(()=>requireOfficeContextRevision({contextRevision:bundle.revision},bundle));
});
test('retries keep one saved job and reject changed text/scope rather than spawning duplicate work',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'coo-message-'));try{
  const message=input('Audit the website'),first=await createJob(message,directory),retry=await createJob(message,directory);
  assert.equal(first.created,true);assert.equal(retry.created,false);assert.equal(retry.job.id,first.job.id);assert.equal(retry.job.parallelismMode,'coo');assert.equal(retry.job.status,'queued');
  await assert.rejects(createJob({...message,brief:'Use a different message'},directory),/different task/);
  await assert.rejects(createJob({...message,contextRequest:{...message.contextRequest,foundationId:'another-client'}},directory),/different task/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('an explicit known client in the agency message loads its own foundation, never the interface identity',()=>{
 const foundation=(id,title,clientId,status='draft')=>({id,title,status,scope:{kind:clientId?'client':'internal',clientId}});
 const agency=foundation('jarvis-interface','Jarvis interface',null),client=foundation('audit-democlienta','DemoClientA · internal audit','democlienta-id');
 const initial={foundationId:agency.id,taskType:'email',mode:'draft'};
 const message=cooMessageInput({id:randomUUID(),brief:'create a tone of voice for democlienta',contextRequest:{...initial,taskType:'internal'}});assert.equal(message.contextRequest.taskType,'strategy');
 assert.deepEqual(resolveCooFoundation('create a tone of voice for democlienta',initial,[agency,client]),{foundationId:client.id,taskType:'strategy',mode:'draft'});
 assert.equal(resolveCooFoundation('Do internal work',initial,[agency,client]).foundationId,agency.id);
 assert.equal(resolveCooFoundation('Review DemoClientAised examples',initial,[agency,client]).foundationId,agency.id);
 const approved=foundation('client-democlienta','DemoClientA','democlienta-id','approved');
 assert.deepEqual(resolveCooFoundation('DemoClientA newsletter',initial,[agency,client,approved]),{foundationId:approved.id,taskType:'email',mode:'approved'});
});
test('ambiguity, another selected client and historical unbound clients cannot mix identities',()=>{
 const agency={id:'agency',title:'Agency',status:'draft',scope:{kind:'internal',clientId:null}};
 const a={id:'client-a',title:'DemoClientA',status:'approved',scope:{kind:'client',clientId:'a'}},b={id:'client-b',title:'Other Company',status:'approved',scope:{kind:'client',clientId:'b'}};
 const request={foundationId:agency.id,taskType:'strategy',mode:'draft'},foundations=[agency,a,b];
 assert.throws(()=>resolveCooFoundation('DemoClientA and Other Company campaign',request,foundations),/more than one client/);
 assert.throws(()=>resolveCooFoundation('Other Company campaign',{...request,foundationId:a.id},foundations),/different client/);
 assert.throws(()=>resolveCooFoundation('DemoClientA campaign',request,[agency,{...a,scope:{kind:'client',clientId:null}}]),/connected Office setup/);
 assert.throws(()=>resolveCooFoundation('DemoClientA campaign',request,[agency,a,{...a,id:'duplicate'}]),/unambiguous/);
 assert.throws(()=>resolveCooFoundation('Work',request,[]),/foundation is unavailable/);
});
test('saved automatic submissions retain their original request identity independently of the resolved foundation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'coo-message-replay-'));try{
  const message={...input('Create a DemoClientA brand voice'),cooRequestHash:'a'.repeat(64),contextRequest:{foundationId:'audit-democlienta',taskType:'strategy',mode:'draft'}};
  const saved=await createJob(message,directory);assert.equal(saved.job.cooRequestHash,message.cooRequestHash);
  assert.equal((await createJob(message,directory)).created,false);
  await assert.rejects(createJob({...message,cooRequestHash:'b'.repeat(64)},directory),/different COO message/);
  await assert.rejects(createJob({...message,cooRequestHash:undefined},directory),/different COO message/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

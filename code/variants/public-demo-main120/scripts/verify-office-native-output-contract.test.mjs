import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeOutputContract} from './lib/office-native-output-contract.mjs';
import {nativeDraftCheckReceipts,performTool} from './lib/office-tool-bridge.mjs';
import {createJob,executeJob} from './lib/office-team-engine.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');
const checked=(text,at='2026-10-15T12:00:01.000Z')=>({id:randomUUID().replaceAll('-',''),status:'completed',at,argumentHash:sha(JSON.stringify({artifact:text})),result:{jsonMeasurements:{inputSha256:sha(text)}}});

test('exact complete output passes; added count preamble, whitespace, Unicode normalization and fences fail',()=>{
 const body='Observed café result.\nExact evidence.';
 assert.equal(nativeOutputContract(body,[checked(body)]).status,'passed');
 for(const output of ['6 words, 35 characters\n\n'+body,' '+body,body+'\n','```\n'+body+'\n```',body.normalize('NFD')])assert.equal(nativeOutputContract(output,[checked(body)]).status,'rejected');
});
test('an earlier matching check cannot authorize changed final text after the latest successful check',()=>{
 const old=checked('Old body'),latest=checked('New body','2026-10-15T12:00:02.000Z');
 assert.equal(nativeOutputContract('Old body',[latest,old]).status,'rejected');
 assert.equal(nativeOutputContract('New body',[old,latest]).receiptId,latest.id);
 assert.equal(nativeOutputContract('Old body',[old,checked('New body',old.at)]).status,'rejected');
});
test('no check retains compatibility and an incomplete attempt cannot claim exact-check success',()=>{
 assert.equal(nativeOutputContract('Legacy plain response',[]).status,'not_invoked');
 assert.equal(nativeOutputContract('Response',[{id:'attempt',status:'incomplete'}]).status,'rejected');
 const receipt=checked('Response');delete receipt.result;
 assert.equal(nativeOutputContract('Response',[receipt]).status,'rejected');
});
test('structured transport is checked in full with no trusted extraction or serialization repair',()=>{
 const body='Exact artifact',transport=JSON.stringify({artifact:body,internalNotes:''});
 assert.equal(nativeOutputContract(transport,[checked(body)]).status,'rejected');
 assert.equal(nativeOutputContract(transport,[checked(transport)]).status,'passed');
 assert.equal(nativeOutputContract(' '+transport,[checked(transport)]).status,'rejected');
 for(const nativeFinalText of [null,'Preface\n'+transport,JSON.stringify(JSON.parse(transport),null,2)])assert.equal(nativeOutputContract(transport,[checked(transport)],{returnedOutputKind:'structured_output_projection',nativeFinalText}).status,'rejected');
 assert.equal(nativeOutputContract(transport,[checked(transport)],{returnedOutputKind:'structured_output_projection'}).status,'rejected');
 const exact=nativeOutputContract(transport,[checked(transport)],{returnedOutputKind:'structured_output_projection',nativeFinalText:transport});assert.equal(exact.status,'passed');assert.equal(exact.nativeFinalTextSha256,sha(transport));
});

async function harness(mode){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'office-exact-native-'))),agentId=randomUUID(),id=randomUUID(),runId=randomUUID();
 const body='Observed final evidence.\nNo approval inferred.',output=mode==='preamble'?'6 words checked.\n\n'+body:body;
 const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')};
 const agent={id:agentId,name:'Synthetic Copy',status:'idle',metadata:{jarvisBlueprintRoleId:'copy',modelBilling:'subscription_only'},adapterType:'claude_local',adapterConfig:{model:'fixture-never-provider'}};
 let toolReceipt=null,nativeCalls=0,done=false;
 const api=async(path,payload,method)=>{
  if(path.endsWith('/agents'))return [agent];
  if(path.endsWith('/issues'))return {...payload,id:randomUUID()};
  if(path.endsWith('/heartbeat/invoke')){nativeCalls++;return {id:runId,status:'queued'};}
  if(path.startsWith('/heartbeat-runs/')){
   if(!done&&mode!=='unchecked'){
    done=true;
    const ctx={storage,jobId:id,agentId,runId,roleId:'copy',partId:'reply',allowed:['draft_check'],fixture:false,job:{criteria:[]},check:async()=>{}};
    toolReceipt=await performTool(ctx,'draft_check',{artifact:body},1);
    const receiptPath=join(storage.recordsRoot,'tool-artifacts',id,toolReceipt.id,'receipt.json');
    if(mode==='stale'){
     const startPath=join(storage.recordsRoot,'tool-artifacts',id,toolReceipt.id,'started.json');
     const start=JSON.parse(await readFile(startPath,'utf8'));start.at='2020-01-01T00:00:00.000Z';toolReceipt.at=start.at;
     await writeFile(startPath,JSON.stringify(start));await writeFile(receiptPath,JSON.stringify(toolReceipt));
    }
    if(mode==='unreadable')await writeFile(receiptPath,'{broken-json');
    if(mode==='missing')await rm(receiptPath);
    if(mode==='foreign'){
     toolReceipt.agentId=randomUUID();await writeFile(receiptPath,JSON.stringify(toolReceipt));
    }
   }
   return {id:runId,status:'succeeded',resultJson:{summary:output},usageJson:{billingType:'subscription_included',model:'fixture-never-provider'}};
  }
  if(method==='PATCH')return payload;
  throw Error('Unexpected synthetic API path '+path);
 };
 try{
  await createJob({id,kind:'conversation',targetAgentId:agentId,brief:'Synthetic exact output test',context:'No provider calls; deterministic fake native output.',criteria:['Return exact final evidence.']},directory);
  const job=await executeJob(id,{paperclipCompanyId:'fixture',roles:[{id:'copy'}],storage,toolBridge:{enabled:true}},{api,directory,pollMs:1,modelPolicy:()=>true});
  const saved=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));
  assert.equal(nativeCalls,1);assert.equal(saved.calls[0].nativeRawOutput,output);assert.equal(saved.calls[0].status,'succeeded');
  assert.equal(saved.calls[0].outputContract.outputSha256,sha(output));
  return {job,saved,output,toolReceipt,manifest:JSON.parse(await readFile(join(storage.recordsRoot,'tasks',id,'manifest.json'),'utf8'))};
 }finally{await rm(directory,{recursive:true,force:true});}
}
test('engine rejects unchecked native preamble, retains complete raw evidence and never marks answered',async()=>{
 const {job,saved,output,manifest}=await harness('preamble');
 assert.equal(job.status,'failed');assert.equal(job.output,null);assert.equal(job.steps[0].status,'failed');assert.equal(saved.calls[0].outputContract.status,'rejected');
 assert.match(job.error,/complete native final output differs/);assert.equal(manifest.calls[0].nativeRawOutput,output);assert.equal(manifest.calls[0].outputContract.status,'rejected');
});
test('engine accepts exact final native text and archives its exact-check receipt without extraction',async()=>{
 const {job,output,toolReceipt,manifest}=await harness('exact');
 assert.equal(job.status,'answered');assert.equal(job.output,output);assert.equal(job.calls[0].outputContract.status,'passed');assert.equal(job.calls[0].outputContract.receiptId,toolReceipt.id);
 assert.equal(manifest.calls[0].nativeRawOutput,output);assert.equal(manifest.calls[0].outputContract.checkedInputSha256,sha(output));
});
test('engine retains existing unchecked conversation behavior without falsely claiming validation',async()=>{
 const {job}=await harness('unchecked');assert.equal(job.status,'answered');assert.equal(job.calls[0].outputContract.status,'not_invoked');
});
for(const mode of ['stale','unreadable','missing','foreign'])test('engine fails closed for '+mode+' native draft-check receipt',async()=>{
 const {job}=await harness(mode);assert.equal(job.status,'failed');assert.equal(job.output,null);assert.equal(job.calls[0].outputContract.status,'rejected');
});
test('strict reader ignores valid other-run receipts and rejects symlinked receipt evidence',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'office-receipt-scope-')));
 const storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'SSD')},jobId=randomUUID(),agentId=randomUUID(),runId=randomUUID(),call={agentId,runId,startedAt:'2026-10-15T12:00:00.000Z',finishedAt:'2026-10-15T12:00:05.000Z'};
 try{
  const folder=join(storage.recordsRoot,'tool-artifacts',jobId,'a'.repeat(32));await mkdir(folder,{recursive:true});
  const otherRun=randomUUID();await writeFile(join(folder,'started.json'),JSON.stringify({runId:otherRun,tool:'draft_check',at:call.startedAt}));
  await writeFile(join(folder,'receipt.json'),JSON.stringify({runId:otherRun,tool:'draft_check'}));
  assert.deepEqual(await nativeDraftCheckReceipts(storage,jobId,call),[]);
  await rm(join(folder,'receipt.json'));
  const {symlink}=await import('node:fs/promises');await symlink(join(folder,'started.json'),join(folder,'receipt.json'));
  await assert.rejects(nativeDraftCheckReceipts(storage,jobId,call),/cannot be read safely/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

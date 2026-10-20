import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {archiveJob,readScopedArtifact,prepareAgentWorkspace,storageReadiness} from './lib/office-archive.mjs';
test('archive grants own and declared dependency artifacts, denies peers/other tasks and preserves version history',async()=>{
 const volume=await mkdtemp(join(tmpdir(),'office-archive-')),config={testing:true,recordsVolume:volume,recordsRoot:join(volume,'Office')};
 try{
  const job={id:randomUUID(),createdAt:'now',updatedAt:'one',brief:'Fictional test',context:'Approved test only',criteria:['Facts'],status:'working',calls:[],steps:[{id:'source',agentId:'copy',roleId:'copy',assignment:'Source',dependsOn:[],status:'completed',output:'Source evidence'},{id:'dependent',agentId:'design',roleId:'design',assignment:'Design',dependsOn:['source'],status:'completed',output:'Design output'},{id:'other',agentId:'finance',roleId:'finance',assignment:'Finance',dependsOn:[],status:'completed',output:'Private finance output'}]};
  const first=await archiveJob(job,config);
  const manifest=JSON.parse(await readFile(join(first.taskPath,'manifest.json'),'utf8'));
  const source=manifest.steps[0].artifact.id,finance=manifest.steps[2].artifact.id;
  assert.equal(await readScopedArtifact(config,{agentId:'design',jobId:job.id,partId:'dependent',artifactId:source}),'Source evidence');
  await assert.rejects(readScopedArtifact(config,{agentId:'design',jobId:job.id,partId:'dependent',artifactId:finance}),/no grant/);
  await assert.rejects(readScopedArtifact(config,{agentId:'design',jobId:randomUUID(),partId:'dependent',artifactId:source}));
  await assert.rejects(readScopedArtifact(config,{agentId:'../finance',jobId:job.id,partId:'dependent',artifactId:source}),/identifier/);
  const workspace=await prepareAgentWorkspace(config,job,'design','dependent');assert.ok(workspace.includes('/agents/design/tasks/'));
  job.status='failed';job.updatedAt='two';job.qa={checks:[{criterion:'Facts',pass:false,evidence:'Invented claim'}]};
  await archiveJob(job,config);
  assert.equal((await readdir(join(first.taskPath,'versions'))).length,2);
  assert.equal(JSON.parse(await readFile(join(first.taskPath,'learning/candidate.json'),'utf8')).status,'candidate');
  const artifact=manifest.steps[0].artifact;
  await writeFile(join(config.recordsRoot,artifact.path),'tampered');
  await assert.rejects(readScopedArtifact(config,{agentId:'copy',jobId:job.id,partId:'source',artifactId:source}),/integrity/);
 }finally{await rm(volume,{recursive:true,force:true});}
});
test('archive rejects symlink escape and missing production SSD without internal fallback',async()=>{
 const volume=await mkdtemp(join(tmpdir(),'office-escape-')),outside=await mkdtemp(join(tmpdir(),'office-outside-'));
 try{
  await symlink(outside,join(volume,'Office'));
  assert.equal((await storageReadiness({testing:true,recordsVolume:volume,recordsRoot:join(volume,'Office')})).status,'unavailable');
  assert.equal((await storageReadiness({recordsVolume:'/Volumes/not-mounted-test',recordsRoot:'/Volumes/not-mounted-test/Office'})).status,'unavailable');
 }finally{await rm(volume,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

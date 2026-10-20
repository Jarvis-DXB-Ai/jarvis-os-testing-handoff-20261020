import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink,realpath,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {performTool,readToolFile,validateTool,roleTools,scopedNativeTools,authorizeToolActor,toolDefinitions} from './lib/office-tool-bridge.mjs';
import {artifactDigest,clientProfileHash,readClientBundle,editableBundle,prepareClientArtifact} from './lib/office-client-artifacts.mjs';
import {linkedArtifactScope,validateLinkedScope} from './lib/office-linked-artifacts.mjs';
import {artifactResponse} from './lib/office-artifact-response.mjs';
import {verifyArtifactFormat} from './lib/office-artifact-format.mjs';
const tools=['artifact_read','artifact_save','artifact_render','image_view'];
const html='<!doctype html><html lang="en"><meta charset="utf-8"><link rel="stylesheet" href="../master.css"><body><article class="canvas"><div class="head"><h1>Synthetic editable heading</h1><p>Fixture copy</p></div><div class="scene"><img src="../assets/image.png" alt="Synthetic square"></div><div class="bottom"></div></article></body></html>';
const css='.canvas{position:relative;width:64px;height:80px}.scene{display:grid;grid-template-columns:1fr 1fr}h1{font-size:12px}.scene img{width:16px}';
async function fixture(){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'office-client-artifacts-'))),root=join(dir,'sources'),recordsRoot=join(dir,'records');await mkdir(root);await mkdir(recordsRoot);await mkdir(join(root,'frames'));await mkdir(join(root,'assets'));
 const entries=[['frames/master.html',html],['master.css',css],['data.json','{"caption":"Synthetic only"}'],['assets/image.png',await sharp({create:{width:16,height:16,channels:3,background:'#aa3344'}}).png().toBuffer()]];
 const files=[];for(let i=0;i<entries.length;i++){const [path,value]=entries[i],bytes=Buffer.from(value);await writeFile(join(root,path),bytes);files.push({sourceId:'source-'+i,path,sha256:artifactDigest(bytes),status:i===2?'rejected':'draft'});}
 const clientId=randomUUID(),jobId=randomUUID(),agentId=randomUUID(),runId=randomUUID(),profile={id:'synthetic',enabled:true,clientId,workOrderId:'synthetic-order',root,files,masters:[{id:'fixture-master',htmlSourceId:'source-0',cssSourceId:'source-1',dataSourceId:'source-2',width:64,height:80}]};
 const call={agentId,runId,roleId:'design-system',status:'running',stage:'specialist:design',tools:[...tools],authority:{workOrderId:profile.workOrderId},artifactGrant:{profileId:profile.id,clientId,workOrderId:profile.workOrderId,profileSha256:clientProfileHash(profile)}};
 const job={id:jobId,status:'working',kind:'team',knowledgeContext:{scope:{clientId}},calls:[call],steps:[{id:'design',agentId,status:'working',dependsOn:[]}]};
 let stopped=false;const ctx={jobId,agentId,runId,roleId:call.roleId,partId:'design',allowed:[...tools],storage:{testing:true,recordsVolume:dir,recordsRoot},fixture:true,job,clientArtifactProfiles:{synthetic:profile},check:async()=>{if(stopped)throw Error('Owner stopped tool work.');}};
 const sourceArgs={profileId:profile.id,masterId:'fixture-master'},saveArgs={...sourceArgs,html,css,data:'{"caption":"Synthetic revision"}'};
 return {dir,root,ctx,call,profile,sourceArgs,saveArgs,stop:()=>{stopped=true;},read:(args=sourceArgs,id='read')=>performTool(ctx,'artifact_read',args,id),save:(args=saveArgs,id='save')=>performTool(ctx,'artifact_save',args,id)};
}
async function renderer(f,overrides={}){
 const png=await sharp({create:{width:64,height:80,channels:3,background:'#223344'}}).png().toBuffer();
 f.ctx.clientArtifactRenderer={contract:'office-local-bundle-v1',id:'fixture-renderer',sourceSha256:'a'.repeat(64),leaseId:'fixture-only',fixture:true,render:async c=>{
  assert.equal(c.network,'deny-except-exact-memory-resources');assert.match(c.csp,/connect-src 'none'/);assert.throws(()=>c.resource('https://example.com/asset.png'),/external/);assert.throws(()=>c.resource(c.origin+'/missing.png'),/undeclared/);assert.match(c.resource(c.entry).toString(),/Synthetic editable heading/);
  return {png,revisionSha256:c.revisionSha256,complete:true,fontsReady:true,layoutReady:true,networkDenied:true,errors:[],loadedResources:c.resourceNames,...overrides};
 }};
}
test('native bridge saves immutable editable files, preserves source states, downloads complete exact revision',async()=>{
 const f=await fixture(),before=await readFile(join(f.root,'frames/master.html'));
 const read=await f.read();assert.equal(read.result.sourcePins[2].status,'rejected');assert.match(read.result.html,/asset-[a-f0-9]{64}\.png/);
 const r=await f.save(),meta=r.result.clientArtifact;assert.equal(meta.status,'draft');assert.equal(r.runId,f.ctx.runId);assert.equal(r.files.length,6);assert.ok(!r.files.some(x=>x.name==='preview.png'));
 assert.deepEqual(await readToolFile(f.ctx.storage,f.ctx.jobId,r.id,'editable.html'),(await readClientBundle(f.ctx.storage,f.ctx.jobId,r.id)).files.get('editable.html'));
 const rb=await f.read({profileId:'synthetic',sourceCall:r.id,revisionSha256:meta.revisionSha256},'read-revision');assert.match(rb.result.html,/Fixture copy/);assert.deepEqual(await readFile(join(f.root,'frames/master.html')),before);
 assert.equal((await f.save()).id,r.id);await assert.rejects(f.save({...f.saveArgs,data:'{}'}),/replay/);
 const child=await f.save({...f.saveArgs,parent:{sourceCall:r.id,revisionSha256:meta.revisionSha256},html:html.replace('Fixture copy','Editable changed copy')},'child');assert.equal(child.result.clientArtifact.parent.sourceCall,r.id);
});
test('denies wrong client, run, role, work order, source/profile pins and stale saved grant',async()=>{
 for(const mutate of [f=>f.ctx.job.knowledgeContext.scope.clientId=randomUUID(),f=>f.ctx.runId=randomUUID(),f=>f.ctx.roleId='copy',f=>f.call.authority.workOrderId='different',f=>f.call.artifactGrant.profileSha256='f'.repeat(64),f=>f.profile.files[0].sha256='f'.repeat(64),f=>f.call.tools=[]]){
  const f=await fixture();mutate(f);await assert.rejects(f.save(),/grant|changed/);
 }
 const f=await fixture();f.ctx.check=async()=>({...f.ctx,allowed:[]});await assert.rejects(f.save(),/grant changed/);
});
test('source dependency change, source traversal and symlink fail closed',async()=>{
 const f=await fixture();await f.save();await writeFile(join(f.root,'assets/image.png'),'changed');await assert.rejects(f.save(),/dependency changed/);
 const g=await fixture();g.profile.files[0].path='../outside.html';g.call.artifactGrant.profileSha256=clientProfileHash(g.profile);await assert.rejects(g.save(),/pinned source/);
 const h=await fixture();await symlink(join(h.root,'frames'),join(h.root,'alias'));h.profile.files[0].path='alias/master.html';h.call.artifactGrant.profileSha256=clientProfileHash(h.profile);await assert.rejects(h.save(),/symlink/);
});
test('rejects inline scripts, encoded/external assets, HTML execution, CSS network/script and undeclared files',async()=>{
 const f=await fixture(),input=await prepareClientArtifact(f.ctx,f.sourceArgs,'artifact_read');
 for(const bad of ['<script>alert(1)</script>','<iframe src="https://example.com"></iframe>','<img src="https://example.com/a.png">','<img src="../assets/%69mage.png">','<img src="../assets/image.png" onerror="x()">','<meta http-equiv="refresh" content="0;url=https://example.com">','<a href="https://example.com">link</a>','<img src="missing.png">','<svg><script>x()</script></svg>'])assert.throws(()=>editableBundle(input,{...f.saveArgs,html:html.replace('</article>',bad+'</article>')}),/denied|Unsupported|unsupported|resource|dependency/);
 for(const bad of ['@import "https://example.com/x.css";','x{background:url(https://example.com/a.png)}','x{background:u\\72l(https://example.com/a.png)}','x{width:expression(alert(1))}','x{background:image-set("https://example.com/a.png" 1x)}','@font-face{font-family:X;src:local("Inter")}'])assert.throws(()=>editableBundle(input,{...f.saveArgs,css:bad}),/denied|Unsupported|unsupported|resource/);
 assert.throws(()=>validateTool('artifact_save',{...f.saveArgs,path:'/tmp/evil'}),/Unexpected/);assert.throws(()=>validateTool('artifact_save',{...f.saveArgs,data:'invalid'}));
});
test('renderer absent is explicit, unknown partial writes are not retried',async()=>{
 const f=await fixture(),r=await f.save(),args={profileId:'synthetic',sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256};
 await assert.rejects(performTool(f.ctx,'artifact_render',args,'unavailable'),/renderer.*unavailable/);
 await renderer(f);await assert.rejects(performTool(f.ctx,'artifact_render',args,'unavailable'),/incomplete|EEXIST/);await assert.rejects(performTool(f.ctx,'artifact_render',args,'new-request'),/reconciliation/);
});
test('fixture renderer binds preview to editable bytes, reviewer image_view reads and changed CSS invalidates preview',async()=>{
 const f=await fixture(),r=await f.save();await renderer(f);const render=await performTool(f.ctx,'artifact_render',{profileId:'synthetic',sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256},'render');
 assert.equal(render.fixture,true);assert.equal(render.files.length,8);assert.equal((await verifyArtifactFormat('preview.png',await readToolFile(f.ctx.storage,f.ctx.jobId,render.id,'preview.png'))).width,64);
 const qa=randomUUID();f.ctx.job.steps[0].status='completed';f.ctx.job.departmentReports=[{departmentId:'creative',stepIds:['design'],qa:{agentId:qa}}];f.ctx.job.calls.push({agentId:qa,runId:randomUUID(),roleId:'creative-qc',status:'running',stage:'department-qa:creative',tools:['image_view']});
 const c=f.ctx.job.calls.at(-1),reviewer={...f.ctx,agentId:qa,runId:c.runId,roleId:c.roleId,partId:c.stage,allowed:['image_view']};
 const viewed=await performTool(reviewer,'image_view',{sourceCall:render.id,fileName:'preview.png'},'qa-view');assert.equal(viewed.result.source.sha256,render.files.find(f=>f.name==='preview.png').sha256);
 await writeFile(join(f.ctx.storage.recordsRoot,'tool-artifacts',f.ctx.jobId,render.id,'editable.css'),css+'x{color:red}');await assert.rejects(readToolFile(f.ctx.storage,f.ctx.jobId,render.id,'preview.png'),/hash changed/);
});
test('rejects missing resources, incomplete render, mismatched revision/dimensions and stop before completion',async()=>{
 for(const overrides of [{complete:false},{revisionSha256:'f'.repeat(64)},{fontsReady:false},{layoutReady:false},{networkDenied:false},{loadedResources:[]},{errors:['missing image']},{png:Buffer.from('not PNG')}]){
  const f=await fixture(),r=await f.save();await renderer(f,overrides);await assert.rejects(performTool(f.ctx,'artifact_render',{profileId:'synthetic',sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256},'render'),/render|format/i);
 }
 const f=await fixture();f.stop();await assert.rejects(f.save(),/stopped/);const g=await fixture();g.ctx.allowed=[];await assert.rejects(g.save(),/no grant/);
 const h=await fixture(),r=await h.save();await renderer(h);const old=h.ctx.clientArtifactRenderer.render;h.ctx.clientArtifactRenderer.render=async c=>{const v=await old(c);h.stop();return v;};await assert.rejects(performTool(h.ctx,'artifact_render',{profileId:'synthetic',sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256},'render'),/stopped/);
});
test('saved parent must be allocated and match exact tenant/source/revision',async()=>{
 const f=await fixture(),r=await f.save(),parent={sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256};
 await assert.rejects(f.save({...f.saveArgs,parent:{...parent,revisionSha256:'f'.repeat(64)}},'bad-parent'),/revision changed/);
 const fresh=await fixture(),saved=await fresh.save();Object.assign(f,fresh);parent.sourceCall=saved.id;parent.revisionSha256=saved.result.clientArtifact.revisionSha256;const other=randomUUID();f.ctx.agentId=other;f.ctx.runId=randomUUID();f.ctx.job.calls.push({...f.call,agentId:other,runId:f.ctx.runId,stage:'specialist:other'});f.ctx.partId='other';f.ctx.job.steps.push({id:'other',agentId:other,dependsOn:[]});await assert.rejects(f.save({...f.saveArgs,parent},'unallocated'),/allocated/);
});
test('linked saved-task scope pins editable resources and rejects tampered tenant/file/receipt',async()=>{
 const f=await fixture(),r=await f.save();f.ctx.job.status='needs_review';f.call.status='succeeded';f.ctx.job.steps[0].status='completed';const actual={...r,fixture:false};const scope=linkedArtifactScope(f.ctx.job,f.ctx.agentId,f.profile.clientId,[actual]);assert.equal(scope.files.length,6);assert.ok(scope.files.some(f=>f.fileName==='bundle.json'));
 const target={kind:'conversation',targetAgentId:f.ctx.agentId,selectedTaskId:f.ctx.jobId,clientId:f.profile.clientId};validateLinkedScope(scope,target);
 assert.throws(()=>validateLinkedScope({...scope,clientId:randomUUID()},target));assert.throws(()=>validateLinkedScope({...scope,files:[{...scope.files[0],fileName:'../secret'}]},target));
 assert.equal(linkedArtifactScope(f.ctx.job,f.ctx.agentId,f.profile.clientId,[{...actual,result:{clientArtifact:{...actual.result.clientArtifact,clientId:randomUUID()}}}]).files.length,0);
});
test('actual actor authorization carries profiles but requires saved grants; schemas and inert transport stay bounded',async()=>{
 const f=await fixture(),jobs=join(f.dir,'jobs');await mkdir(jobs);await writeFile(join(jobs,f.ctx.jobId+'.json'),JSON.stringify(f.ctx.job));const plan={storage:f.ctx.storage,toolBridge:{clientArtifactProfiles:f.ctx.clientArtifactProfiles}};
 await assert.rejects(authorizeToolActor(plan,{JARVIS_OFFICE_JOB_ID:f.ctx.jobId,PAPERCLIP_AGENT_ID:f.ctx.agentId,PAPERCLIP_RUN_ID:f.ctx.runId},jobs,{readBinding:async()=>({version:2,authoritySha256:'f'.repeat(64)})}),/authority/);f.call.tools=['graphic_card'];await writeFile(join(jobs,f.ctx.jobId+'.json'),JSON.stringify(f.ctx.job));
 const actor=await authorizeToolActor(plan,{JARVIS_OFFICE_JOB_ID:f.ctx.jobId,PAPERCLIP_AGENT_ID:f.ctx.agentId,PAPERCLIP_RUN_ID:f.ctx.runId},jobs);assert.ok(actor.allowed.includes('graphic_card'));assert.deepEqual(actor.clientArtifactProfiles,plan.toolBridge.clientArtifactProfiles);
 assert.ok(roleTools('design-system').includes('artifact_save'));assert.ok(!roleTools('creative-qc').includes('artifact_save'));assert.ok(scopedNativeTools(plan,'design-system',f.profile.clientId).includes('artifact_save'));assert.ok(!scopedNativeTools(plan,'design-system',randomUUID()).includes('artifact_save'));assert.ok(toolDefinitions.some(t=>t.name==='artifact_save'));
 const response=artifactResponse('editable.html',Buffer.from(html));assert.match(response.headers['Content-Disposition'],/^attachment/);assert.equal(response.headers['Content-Security-Policy'],"sandbox; default-src 'none'");assert.throws(()=>artifactResponse('bad\"\r\nheader.html',Buffer.from(html)));
 await assert.rejects(verifyArtifactFormat('layout.js',Buffer.from('alert(1)')),/Unreviewed/);
});

test('revoked grant during write/renderer aborts completion; partial artifacts cannot be downloaded',async()=>{
 const f=await fixture();let checks=0;f.ctx.check=async()=>{checks++;return {...f.ctx,allowed:checks>=3?[]:f.ctx.allowed};};
 await assert.rejects(f.save(),/grant changed/);const id=artifactDigest(`${f.ctx.runId}:save:artifact_save`).slice(0,32);await assert.rejects(readToolFile(f.ctx.storage,f.ctx.jobId,id,'editable.html'));
});
test('changed source version cannot inherit a parent and output path symlinks stay denied',async()=>{
 const f=await fixture(),r=await f.save();await writeFile(join(f.root,'master.css'),css+'p{color:blue}');f.profile.files[1].sha256=artifactDigest(css+'p{color:blue}');f.call.artifactGrant.profileSha256=clientProfileHash(f.profile);
 await assert.rejects(f.save({...f.saveArgs,parent:{sourceCall:r.id,revisionSha256:r.result.clientArtifact.revisionSha256}},'new-source'),/source.*mismatch/);
 const path=join(f.ctx.storage.recordsRoot,'tool-artifacts',f.ctx.jobId,r.id,'editable.css');await rename(path,join(f.dir,'moved.css'));await symlink(join(f.dir,'moved.css'),path);await assert.rejects(readToolFile(f.ctx.storage,f.ctx.jobId,r.id,'editable.html'),/symlink/);
});
test('render receipt cannot substitute a different editable revision even with matching file hash',async()=>{
 const f=await fixture(),saved=await f.save();await renderer(f);const r=await performTool(f.ctx,'artifact_render',{profileId:'synthetic',sourceCall:saved.id,revisionSha256:saved.result.clientArtifact.revisionSha256},'render');
 const dir=join(f.ctx.storage.recordsRoot,'tool-artifacts',f.ctx.jobId,r.id),bad=JSON.parse(await readFile(join(dir,'render.json')));bad.revisionSha256='f'.repeat(64);const bytes=Buffer.from(JSON.stringify(bad));await writeFile(join(dir,'render.json'),bytes);const pin=r.files.find(f=>f.name==='render.json');pin.sha256=artifactDigest(bytes);pin.bytes=bytes.length;await writeFile(join(dir,'receipt.json'),JSON.stringify(r));await assert.rejects(readToolFile(f.ctx.storage,f.ctx.jobId,r.id,'preview.png'),/revision mismatch/);
});
test('exact selected saved editable bundle can be read; forged receipt pin or foreign actor is refused',async()=>{
 const f=await fixture(),r=await f.save(),meta=r.result.clientArtifact,oldJob=f.ctx.job;
 f.ctx.jobId=randomUUID();f.ctx.runId=randomUUID();const scope={version:1,jobId:oldJob.id,agentId:f.ctx.agentId,clientId:f.profile.clientId,files:r.files.map(file=>({sourceCall:r.id,fileName:file.name,sha256:file.sha256,bytes:file.bytes,receiptSha256:artifactDigest(JSON.stringify(r)),clientId:f.profile.clientId,workOrderId:meta.workOrderId,revisionSha256:meta.revisionSha256,url:`/api/office/tool-artifacts/${oldJob.id}/${r.id}/${file.name}`}))};
 f.ctx.job={...oldJob,id:f.ctx.jobId,kind:'conversation',targetAgentId:f.ctx.agentId,selectedTaskId:oldJob.id,selectedArtifacts:scope,calls:[{...f.call,runId:f.ctx.runId,stage:'conversation'}]};
 const args={profileId:'synthetic',sourceCall:r.id,revisionSha256:meta.revisionSha256};assert.match((await f.read(args,'saved')).result.html,/Synthetic editable heading/);
 scope.files.find(f=>f.fileName==='bundle.json').receiptSha256='f'.repeat(64);await assert.rejects(f.read(args,'bad-pin'),/not selected/);scope.agentId=randomUUID();await assert.rejects(f.read(args,'wrong-actor'),/scope|another actor/);
});

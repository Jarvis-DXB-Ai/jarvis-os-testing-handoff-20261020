import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {linkedArtifactScope,validateLinkedScope} from './lib/office-linked-artifacts.mjs';
import {performTool} from './lib/office-tool-bridge.mjs';
import {createJob,readJob} from './lib/office-team-engine.mjs';
import {conversationReplyPrompt} from './lib/office-conversation-prompt.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'office-linked-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const clientId=randomUUID(),agentId=randomUUID(),jobId=randomUUID(),runId=randomUUID(),id='a'.repeat(32),bytes=await sharp({create:{width:800,height:400,channels:3,background:'#8040c0'}}).png().toBuffer();
 const job={id:jobId,status:'answered',updatedAt:new Date().toISOString(),knowledgeContext:{scope:{clientId}},steps:[{id:'reply',agentId,status:'completed'}],calls:[{agentId,runId,status:'succeeded',stage:'conversation',tools:['draft_video']}]};
 const receipt={id,jobId,runId,agentId,partId:'conversation',tool:'draft_video',status:'completed',fixture:false,files:[{name:'contact-sheet.png',bytes:bytes.length,sha256:hash(bytes)}]};
 const storage={testing:true,recordsRoot:join(root,'records'),recordsVolume:root},folder=join(storage.recordsRoot,'tool-artifacts',jobId,id);await mkdir(folder,{recursive:true});await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt));await writeFile(join(folder,'contact-sheet.png'),bytes);
 const scope=linkedArtifactScope(job,agentId,clientId,[receipt]),newJob={id:randomUUID(),kind:'conversation',targetAgentId:agentId,selectedTaskId:job.id,selectedArtifacts:scope,knowledgeContext:job.knowledgeContext};
 const ctx={storage,job:newJob,jobId:newJob.id,agentId,runId:randomUUID(),partId:'conversation',roleId:'media',allowed:['image_view'],fixture:true,check:async()=>{}};
 return {root,job,receipt,bytes,scope,ctx,folder,clientId,agentId};
}
test('selected previous task returns actual pinned pixels and replay rechecks their exact bytes',async t=>{
 const f=await fixture(t),url=f.scope.files[0].url;
 const viewed=await performTool(f.ctx,'image_view',{sourceCall:url,maxEdge:512},'review');
 assert.equal(viewed.result.source.jobId,f.job.id);assert.equal(viewed.result.source.sha256,hash(f.bytes));assert.equal(viewed.result.width,512);
 const png=await readFile(join(f.ctx.storage.recordsRoot,'tool-artifacts',f.ctx.jobId,viewed.id,'inspection.png'));assert.equal((await sharp(png).metadata()).format,'png');
 assert.equal((await performTool(f.ctx,'image_view',{sourceCall:url,maxEdge:512},'review')).id,viewed.id);
 await writeFile(join(f.folder,'contact-sheet.png'),Buffer.alloc(f.bytes.length));await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url,maxEdge:512},'review'),/output changed/);
});
test('no historical access follows ordinary chat history, foreign selection, wrong actor, guessed file or modified receipt',async t=>{
 const f=await fixture(t),url=f.scope.files[0].url;
 const noScope={...f.ctx,job:{...f.ctx.job,selectedArtifacts:undefined,historyIds:[f.job.id]}};
 await assert.rejects(performTool(noScope,'image_view',{sourceCall:url},'history'),/within this task/);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url.replace(f.job.id,randomUUID())},'foreign'),/within this task/);
 await assert.rejects(performTool({...f.ctx,agentId:randomUUID()},'image_view',{sourceCall:url},'actor'),/another actor/);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url.replace('contact-sheet','frame-1')},'guessed'),/within this task/);
 await writeFile(join(f.folder,'receipt.json'),JSON.stringify({...f.receipt,reviewStatus:'invented approval'}));await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url},'receipt'),/receipt changed/);
});
test('allocation pins department only and excludes running/foreign/fixture/ungranted runs',async t=>{
 const f=await fixture(t),reviewer=randomUUID();
 assert.throws(()=>linkedArtifactScope(f.job,f.agentId,randomUUID(),[f.receipt]),/client scope/);
 assert.throws(()=>linkedArtifactScope({...f.job,status:'working'},f.agentId,f.clientId,[f.receipt]),/terminal/);
 assert.throws(()=>linkedArtifactScope(f.job,reviewer,f.clientId,[f.receipt]),/not allocated/);
 for(const change of [{fixture:true},{jobId:randomUUID()},{runId:randomUUID()},{tool:'not-granted'}])assert.equal(linkedArtifactScope(f.job,f.agentId,f.clientId,[{...f.receipt,...change}]).files.length,0);
 const job={...f.job,steps:[{id:'design',agentId:f.agentId,status:'completed'}],departmentReports:[{agentId:randomUUID(),qa:{agentId:reviewer},stepIds:['design']}]},receipt={...f.receipt,partId:'design'};
 assert.equal(linkedArtifactScope(job,reviewer,f.clientId,[receipt]).files.length,1);
 job.departmentReports[0].stepIds=['other'];assert.equal(linkedArtifactScope(job,reviewer,f.clientId,[receipt]).files.length,0);
});
test('server-created scope persists into the job and archive context; raw request fields cannot grant it',async t=>{
 const f=await fixture(t),directory=join(f.root,'jobs'),input={id:f.ctx.jobId,kind:'conversation',targetAgentId:f.agentId,selectedTaskId:f.job.id,brief:'Inspect the selected existing draft.',criteria:['Direct reply.'],selectedArtifacts:f.scope};
 const raw=await createJob({...input,id:randomUUID()},directory);assert.equal(raw.job.selectedArtifacts,undefined);
 const created=await createJob(input,directory,{knowledgeContext:f.job.knowledgeContext,selectedArtifacts:f.scope});assert.deepEqual((await readJob(created.job.id,directory)).selectedArtifacts,f.scope);
 await assert.rejects(createJob({...input,selectedTaskId:randomUUID()},directory),/different selected task/);
 assert.throws(()=>validateLinkedScope(f.scope,{...input,clientId:randomUUID()}),/scope/);
 assert.throws(()=>validateLinkedScope({...f.scope,files:[...f.scope.files,...f.scope.files]},{...input,clientId:f.clientId}),/file pin/);
 const prompt=conversationReplyPrompt(created.job,{name:'Editor'},'media');assert.ok(prompt.includes(f.scope.files[0].url));assert.ok(prompt.includes('never rerender'));assert.ok(prompt.includes('No full video/audio'));
});
test('symlinked historical output remains denied',async t=>{
 const f=await fixture(t),file=join(f.folder,'contact-sheet.png');await rm(file);await writeFile(join(f.root,'elsewhere.png'),f.bytes);await symlink(join(f.root,'elsewhere.png'),file);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:f.scope.files[0].url},'symlink'),/not scoped/);
});

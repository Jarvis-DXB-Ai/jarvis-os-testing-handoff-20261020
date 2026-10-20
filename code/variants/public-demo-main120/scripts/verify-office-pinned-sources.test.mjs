import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink,unlink}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{randomUUID,createHash}from'node:crypto';
import{initialiseFoundations,buildTaskContext,persistTaskContext}from'./lib/office-foundations.mjs';import{listPinnedSources,readPinnedText}from'./lib/office-pinned-sources.mjs';import{performTool,validateTool}from'./lib/office-tool-bridge.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{bytes=Buffer.from('Price evidence\n'+'x'.repeat(13000)),name='offer.md',linked=false,foreign=false}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'office-text-')));t.after(()=>rm(root,{recursive:true,force:true}));const storage={testing:true,recordsRoot:join(root,'records'),recordsVolume:root},clientId=randomUUID(),id=randomUUID(),media=join(root,'client-media');await mkdir(media);const file=join(foreign?root:media,name);await writeFile(file,bytes);const path=linked?join(media,'link.md'):file;if(linked)await symlink(file,path);
 const source={id:'src-'+hash(bytes).slice(0,16),canonical_path:path,snapshot_path:null,sha256:hash(bytes),bytes:bytes.length,family:'proposal',status:'Synthetic draft evidence'};
 const manifest={clientId,executionMode:'audit_only',brandApproved:false,paidServicesConfirmed:false,sourceRoot:media,proposalRoot:media,packets:{},sources:[source]},serialized=JSON.stringify(manifest),sha=hash(serialized),base=join(storage.recordsRoot,'clients',clientId,'sources'),version=join(base,'versions',sha);await mkdir(version,{recursive:true});const manifestPath=join(version,'manifest.json');await writeFile(manifestPath,serialized);await writeFile(join(base,'current.json'),JSON.stringify({sha256:sha,path:manifestPath}));
 await initialiseFoundations(storage,[{id:'audit-text',title:'Fixture',scope:{kind:'client',id:'audit-text',clientId},fields:Object.fromEntries(['positioning','facts','voice','visual','production','restrictions'].map(k=>[k,'Fixture'])),sources:[{id:'audit-register',title:'Pinned register',path:manifestPath,sha256:sha}],assets:[],gaps:[]}]);
 const bundle=await buildTaskContext(storage,{foundationId:'audit-text',taskType:'internal',mode:'draft'},{clientBrain:{executionMode:'audit_only'}}),job={id,knowledgeContext:await persistTaskContext(storage,id,bundle)},ctx={storage,job,jobId:id,agentId:randomUUID(),runId:randomUUID(),roleId:'finance-qa',knowledgeRoleId:'finance-qa',partId:'reply',allowed:['source_list','source_read'],fixture:true,check:async()=>{}};return{storage,job,source,file,ctx,bytes,base};
}
test('scoped registered text is paginated with full-byte evidence and no absolute path disclosure',async t=>{
 const f=await fixture(t),list=await listPinnedSources(f.storage,f.job,'finance-qa','OFFER');assert.equal(list.total,1);assert.ok(!JSON.stringify(list).includes(f.file));const a=await readPinnedText(f.storage,f.job,'finance-qa',f.source.id);assert.equal(a.text.length,12000);assert.equal(a.nextOffset,12000);assert.equal(a.source.sha256,f.source.sha256);const b=await readPinnedText(f.storage,f.job,'finance-qa',f.source.id,a.nextOffset);assert.equal(a.text+b.text,f.bytes.toString());assert.equal(b.nextOffset,null);await assert.rejects(readPinnedText(f.storage,f.job,'finance-qa',f.source.id,99999),/offset/);assert.deepEqual(await readFile(f.file),f.bytes);
});
test('unregistered, unsupported, malformed, oversized and escaping sources fail closed',async t=>{
 const f=await fixture(t);await assert.rejects(readPinnedText(f.storage,f.job,'finance-qa','src-0000000000000000'),/not registered/);await assert.rejects(readPinnedText(f.storage,{id:f.job.id},'finance-qa',f.source.id),/no pinned/);
 for(const [opts,message]of [[{linked:true},/symlink/],[{foreign:true},/outside/],[{name:'.env'},/not registered/],[{bytes:Buffer.from([255,254,255])},/UTF-8/],[{bytes:Buffer.alloc(1024*1024+1,97)},/read limit/]]){const x=await fixture(t,opts);await assert.rejects(readPinnedText(x.storage,x.job,'finance-qa',x.source.id),message);}
 assert.throws(()=>validateTool('source_read',{sourceId:f.source.id,path:'/etc/passwd'}));assert.throws(()=>validateTool('source_read',{}));
});
test('read receipt replay revalidates source bytes, task pin and stop state',async t=>{
 const f=await fixture(t),a=await performTool(f.ctx,'source_read',{sourceId:f.source.id},'read');assert.equal(a.result.source.sha256,f.source.sha256);assert.equal(a.files.length,0);assert.equal(a.reviewStatus,'read-only-check');assert.equal((await performTool(f.ctx,'source_read',{sourceId:f.source.id},'read')).id,a.id);
 await writeFile(f.file,Buffer.alloc(f.bytes.length,65));await assert.rejects(performTool(f.ctx,'source_read',{sourceId:f.source.id},'read'),/bytes changed/);const g=await fixture(t);await writeFile(join(g.base,'current.json'),JSON.stringify({sha256:'a'.repeat(64),path:'/foreign'}));await assert.rejects(listPinnedSources(g.storage,g.job,'finance-qa'));f.ctx.check=async()=>{throw Error('Owner stopped')};await assert.rejects(performTool(f.ctx,'source_read',{sourceId:f.source.id},'new'),/Owner stopped/);
});
test('unfinished source activation fences block fresh reads and saved tool replay until reconciled',async t=>{
 const f=await fixture(t),receipt=await performTool(f.ctx,'source_read',{sourceId:f.source.id},'before-refresh'),fence=join(f.base,'activation-fence.json');
 await writeFile(fence,'{incomplete journal marker');
 await assert.rejects(listPinnedSources(f.storage,f.job,'finance-qa'),/activation is pending/);
 await assert.rejects(readPinnedText(f.storage,f.job,'finance-qa',f.source.id),/activation is pending/);
 await assert.rejects(performTool(f.ctx,'source_read',{sourceId:f.source.id},'before-refresh'),/activation is pending/);
 await unlink(fence);
 assert.equal((await performTool(f.ctx,'source_read',{sourceId:f.source.id},'before-refresh')).id,receipt.id);
});

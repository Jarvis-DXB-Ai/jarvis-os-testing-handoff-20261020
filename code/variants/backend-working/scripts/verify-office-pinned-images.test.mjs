import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID,createHash,randomBytes} from 'node:crypto';import sharp from 'sharp';
import {initialiseFoundations,buildTaskContext,persistTaskContext} from './lib/office-foundations.mjs';
import {listPinnedImages,readPinnedImage} from './lib/office-pinned-images.mjs';
import {performTool,validateTool} from './lib/office-tool-bridge.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{linked=false,transparent=false,paddedBytes=0,imageBytes=null}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'office-pinned-image-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const storage={testing:true,recordsRoot:join(root,'records'),recordsVolume:root},clientId=randomUUID(),id=randomUUID(),media=join(root,'client-media');await mkdir(media);
 const png=imageBytes??await sharp({create:{width:1800,height:900,channels:transparent?4:3,background:transparent?{r:255,g:255,b:255,alpha:0}:'#2244aa'}}).png().toBuffer();
 const bytes=paddedBytes?Buffer.concat([png,Buffer.alloc(paddedBytes-png.length)]):png;const file=join(media,'reference.png');await writeFile(file,bytes);const path=linked?join(media,'link.png'):file;if(linked)await symlink(file,path);
 const source={id:'src-'+hash(bytes).slice(0,16),canonical_path:path,snapshot_path:null,sha256:hash(bytes),bytes:bytes.length,family:'content',status:'Synthetic working reference; not approved'};
 const manifest={clientId,executionMode:'audit_only',brandApproved:false,paidServicesConfirmed:false,sourceRoot:media,proposalRoot:media,packets:{},sources:[source]},serialized=JSON.stringify(manifest),sha=hash(serialized),base=join(storage.recordsRoot,'clients',clientId,'sources'),version=join(base,'versions',sha);await mkdir(version,{recursive:true});const manifestPath=join(version,'manifest.json');await writeFile(manifestPath,serialized);await writeFile(join(base,'current.json'),JSON.stringify({sha256:sha,path:manifestPath}));
 await initialiseFoundations(storage,[{id:'audit-fixture',title:'Fixture',scope:{kind:'client',id:'audit-fixture',clientId},fields:Object.fromEntries(['positioning','facts','voice','visual','production','restrictions'].map(k=>[k,'Fixture'])),sources:[{id:'audit-register',title:'Pinned register',path:manifestPath,sha256:sha}],assets:[],gaps:[]}]);
 const bundle=await buildTaskContext(storage,{foundationId:'audit-fixture',taskType:'internal',mode:'draft'},{clientBrain:{executionMode:'audit_only'}}),knowledgeContext=await persistTaskContext(storage,id,bundle),job={id,knowledgeContext};
 const ctx={storage,job,jobId:id,agentId:randomUUID(),runId:randomUUID(),roleId:'web-qa',knowledgeRoleId:'web-qa',partId:'reply',allowed:['image_list','image_view'],fixture:true,check:async()=>{}};
 return{storage,job,source,file,ctx,bytes,base};
}
test('only pinned visual client references can be listed/read; bytes and source state remain unchanged',async t=>{
 const f=await fixture(t),listed=await listPinnedImages(f.storage,f.job,'web-qa');assert.equal(listed.total,1);assert.equal(listed.images[0].sourceId,f.source.id);assert.ok(!JSON.stringify(listed).includes(f.file));
 const read=await readPinnedImage(f.storage,f.job,'web-qa',f.source.id);assert.deepEqual(read.bytes,f.bytes);assert.equal(read.source.sha256,f.source.sha256);
 await assert.rejects(listPinnedImages(f.storage,f.job,'finance-qa'),/no pinned visual/);await assert.rejects(readPinnedImage(f.storage,f.job,'web-qa','src-0000000000000000'),/not registered/);
 await writeFile(f.file,Buffer.alloc(f.bytes.length));await assert.rejects(readPinnedImage(f.storage,f.job,'web-qa',f.source.id),/bytes changed/);
});
test('registered symlink and a changed source-pack pin fail closed',async t=>{
 const f=await fixture(t,{linked:true});await assert.rejects(readPinnedImage(f.storage,f.job,'web-qa',f.source.id),/symlink/);
 const clean=await fixture(t);await writeFile(join(clean.base,'current.json'),JSON.stringify({sha256:'a'.repeat(64),path:'/unrelated-client/manifest.json'}));await assert.rejects(listPinnedImages(clean.storage,clean.job,'web-qa'));
});
test('large source images retain exact hashes at 32 MiB while previews stay bounded; one extra byte is refused',async t=>{
 const accepted=await fixture(t,{paddedBytes:32*1024*1024});
 const read=await readPinnedImage(accepted.storage,accepted.job,'web-qa',accepted.source.id);
 assert.equal(read.bytes.length,32*1024*1024);assert.equal(hash(read.bytes),accepted.source.sha256);
 const preview=await performTool(accepted.ctx,'image_view',{sourceId:accepted.source.id,maxEdge:512},'large');
 assert.equal(preview.result.width,512);assert.equal(preview.result.height,256);
 assert.ok(preview.files.every(f=>f.bytes<=8*1024*1024));
 const refused=await fixture(t,{paddedBytes:32*1024*1024+1});
 await assert.rejects(readPinnedImage(refused.storage,refused.job,'web-qa',refused.source.id),/exceeds the read limit/);
 await assert.rejects(performTool(refused.ctx,'image_view',{sourceId:refused.source.id,maxEdge:512},'oversize'),/exceeds the read limit/);
});
test('image previews are bounded actual pixels; replay revalidates source and no path/dual selector can be granted',async t=>{
 const f=await fixture(t);assert.throws(()=>validateTool('image_view',{}));assert.throws(()=>validateTool('image_view',{sourceId:f.source.id,sourceCall:'a'.repeat(32)}));assert.throws(()=>validateTool('image_view',{path:'/etc/passwd'}));
 const result=await performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'view');assert.equal(result.result.width,512);assert.equal(result.result.height,256);assert.equal(result.reviewStatus,'read-only-image-not-approval');
 const file=result.files[0],image=await readFile(join(f.storage.recordsRoot,'tool-artifacts',f.job.id,result.id,file.name));assert.equal((await sharp(image).metadata()).format,'png');assert.deepEqual(await readFile(f.file),f.bytes);
 const replay=await performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'view');assert.equal(replay.id,result.id);await writeFile(f.file,Buffer.alloc(f.bytes.length));await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'view'),/bytes changed/);
});
test('task PNG inspection respects own/dependency/department allocation and rejects unrelated outputs or changed source',async t=>{
 const f=await fixture(t),producer={...f.ctx,agentId:randomUUID(),partId:'design',roleId:'media',allowed:['graphic_card','image_view']};
 const card=await performTool(producer,'graphic_card',{title:'Fixture source'},'create');
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:card.id},'foreign'),/not an allocated/);
 f.ctx.job.steps=[{id:'reply',agentId:f.ctx.agentId,dependsOn:['design']}];const dep=await performTool(f.ctx,'image_view',{sourceCall:card.id},'dep');assert.equal(dep.result.source.partId,'design');
 f.ctx.job.steps=[];f.ctx.job.calls=[{runId:f.ctx.runId,agentId:f.ctx.agentId,stage:'department-qa:design'}];f.ctx.job.departmentReports=[{departmentId:'design',stepIds:['design'],qa:{agentId:f.ctx.agentId}}];
 const review=await performTool(f.ctx,'image_view',{sourceCall:card.id},'department');assert.equal(review.result.source.sha256,card.files.find(f=>f.name==='card.png').sha256);
 f.ctx.job.calls[0].stage='department-parts-qa:design';await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:card.id},'raw-unassigned'),/not an allocated/);
 f.ctx.job.departmentReports[0].partsQa={agentId:f.ctx.agentId};const rawReview=await performTool(f.ctx,'image_view',{sourceCall:card.id},'raw-department');assert.equal(rawReview.result.source.sha256,card.files.find(f=>f.name==='card.png').sha256);
 f.ctx.job.departmentReports[0].partsQa.agentId=randomUUID();await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:card.id},'raw-foreign'),/not an allocated/);
 f.ctx.job.calls[0].stage='department-qa:web';await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:card.id},'wrong-department'),/not an allocated/);
 f.ctx.job.calls[0].stage='department-qa:design';await writeFile(join(f.storage.recordsRoot,'tool-artifacts',f.job.id,card.id,'card.png'),'changed');await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:card.id},'department'),/changed/);
});
test('four-image budget and stop checks bound repeated visual reads without generating client actions',async t=>{
 const f=await fixture(t);for(let i=0;i<4;i++)await performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'image-'+i);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'extra'),/budget reached/);
 f.ctx.check=async()=>{throw Error('Owner stopped task');};await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'image-0'),/Owner stopped/);
});

test('transparent hidden RGB never appears as visible artwork; light/dark compositing is labelled and leaves source alpha unchanged',async t=>{
 const f=await fixture(t,{transparent:true});
 for(const [background,rgb]of [['dark',[22,22,22]],['light',[245,245,245]]]){
  const receipt=await performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512,background},background);
  assert.equal(receipt.result.sourceHasAlpha,true);assert.equal(receipt.result.previewBackground,background==='dark'?'#161616':'#F5F5F5');
  const image=await readFile(join(f.storage.recordsRoot,'tool-artifacts',f.job.id,receipt.id,'inspection.png'));const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,3);assert.deepEqual([...data.subarray(0,3)],rgb);
 }
 assert.deepEqual(await readFile(f.file),f.bytes);assert.throws(()=>validateTool('image_view',{sourceId:f.source.id,background:'arbitrary'}));
});

test('returned relative PNG URLs resolve the exact allocated image without network or cross-task access',async t=>{
 const f=await fixture(t),producer={...f.ctx,roleId:'media',allowed:['graphic_card']},card=await performTool(producer,'graphic_card',{title:'Reference fixture'},'card');
 const png=card.files.find(x=>x.name==='card.png'),url=png.url,read=await performTool(f.ctx,'image_view',{sourceCall:url},'url');assert.equal(read.result.source.sha256,png.sha256);assert.equal(read.result.source.name,'card.png');
 assert.equal((await performTool(f.ctx,'image_view',{sourceCall:card.id,fileName:'card.png'},'url')).id,read.id);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url.replace(f.ctx.jobId,randomUUID())},'foreign'),/within this task/);
 await assert.rejects(performTool(f.ctx,'image_view',{sourceCall:url,fileName:'render.png'},'ambiguous'),/unambiguous/);
 assert.throws(()=>validateTool('image_view',{sourceCall:'https://example.com'+url}));assert.throws(()=>validateTool('image_view',{sourceId:f.source.id,fileName:'card.png'}));
});

test('region requires exactly four safe integers and preserves existing selectors and limits',()=>{
 const sourceId='src-0000000000000000';
 for(const region of [null,[],{}, {left:0,top:0,width:1},{left:'0',top:0,width:1,height:1},{left:0.5,top:0,width:1,height:1},{left:-1,top:0,width:1,height:1},{left:0,top:0,width:0,height:1},{left:0,top:0,width:1,height:Number.MAX_SAFE_INTEGER+1},{left:0,top:0,width:1,height:1,path:'/etc/passwd'}])assert.throws(()=>validateTool('image_view',{sourceId,region}));
 assert.deepEqual(validateTool('image_view',{sourceId,region:{left:0,top:0,width:1,height:1}}).region,{left:0,top:0,width:1,height:1});
 assert.throws(()=>validateTool('image_view',{sourceId,region:{left:0,top:0,width:1,height:1},maxEdge:2049}));
 assert.throws(()=>validateTool('image_view',{sourceId,sourceCall:'a'.repeat(32),region:{left:0,top:0,width:1,height:1}}));
});
const regionColors=[[255,0,0],[0,255,0],[0,0,255],[0,255,255],[255,0,255],[255,255,0]];
const orientationMatrices={1:[0,1,2,3,4,5],2:[2,1,0,5,4,3],3:[5,4,3,2,1,0],4:[3,4,5,0,1,2],5:[0,3,1,4,2,5],6:[3,0,4,1,5,2],7:[5,2,4,1,3,0],8:[2,5,1,4,0,3]};
async function regionGrid(orientation=1){return sharp(Buffer.from(regionColors.flat()),{raw:{width:3,height:2,channels:3}}).withMetadata({orientation}).png().toBuffer();}
async function inspectedBytes(f,receipt){return readFile(join(f.storage.recordsRoot,'tool-artifacts',f.job.id,receipt.id,'inspection.png'));}
test('actual bridge crops all8 EXIF orientations in oriented source pixels with independently specified colors',async t=>{
 for(let orientation=1;orientation<=8;orientation++){
  const f=await fixture(t,{imageBytes:await regionGrid(orientation)}),width=orientation>=5?2:3,height=orientation>=5?3:2,region={left:0,top:0,width:1,height};
  const receipt=await performTool(f.ctx,'image_view',{sourceId:f.source.id,region},'oriented-column'),output=await inspectedBytes(f,receipt),raw=await sharp(output).removeAlpha().raw().toBuffer();
  assert.deepEqual([...raw],orientationMatrices[orientation].filter((_,i)=>i%width===0).flatMap(i=>regionColors[i]),'EXIF'+orientation);
  assert.equal(receipt.result.sourceWidth,3);assert.equal(receipt.result.sourceHeight,2);assert.equal(receipt.result.orientation,orientation);assert.equal(receipt.result.orientedSourceWidth,width);assert.equal(receipt.result.orientedSourceHeight,height);assert.equal(receipt.result.coordinateSpace,'oriented-source-pixels');assert.deepEqual(receipt.result.region,region);assert.deepEqual(receipt.result.previewScale,{x:1,y:1});assert.equal(receipt.result.previewResampled,false);assert.equal(receipt.result.source.sha256,f.source.sha256);assert.equal(receipt.reviewStatus,'read-only-image-not-approval');assert.deepEqual(await readFile(f.file),f.bytes);
 }
});
test('bounds use oriented dimensions, reject overflows rather than clamping and accept exact last pixel',async t=>{
 const f=await fixture(t,{imageBytes:await regionGrid(6)});
 for(const region of [{left:2,top:0,width:1,height:1},{left:0,top:3,width:1,height:1},{left:1,top:1,width:2,height:1},{left:0,top:2,width:1,height:2},{left:Number.MAX_SAFE_INTEGER,top:0,width:1,height:1}]){const invalid=await fixture(t,{imageBytes:await regionGrid(6)});await assert.rejects(performTool(invalid.ctx,'image_view',{sourceId:invalid.source.id,region},'bad'),/oriented source bounds/);}
 const receipt=await performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:1,top:2,width:1,height:1}},'last-pixel');assert.deepEqual([...await sharp(await inspectedBytes(f,receipt)).removeAlpha().raw().toBuffer()],[0,0,255]);
});
test('crop precedes reduction, small crops retain source pixels and whole-preview legacy pixels stay unchanged',async t=>{
 const f=await fixture(t),whole=await performTool(f.ctx,'image_view',{sourceId:f.source.id,maxEdge:512},'whole'),legacy=await sharp(f.bytes,{limitInputPixels:64000000,failOn:'warning'}).rotate().resize(512,512,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer();assert.deepEqual(await inspectedBytes(f,whole),legacy);assert.equal(whole.result.region,null);assert.equal(whole.result.previewResampled,true);assert.deepEqual(whole.result.previewScale,{x:512/1800,y:256/900});
 const region={left:900,top:400,width:300,height:200},crop=await performTool(f.ctx,'image_view',{sourceId:f.source.id,region,maxEdge:512},'crop');assert.equal(crop.result.width,300);assert.equal(crop.result.height,200);assert.equal(crop.result.previewResampled,false);assert.deepEqual(crop.result.previewScale,{x:1,y:1});
});
test('region alpha compositing remains labelled and never exposes hiddenRGB or changes source alpha',async t=>{
 const bytes=await sharp(Buffer.from([255,255,255,0,255,0,0,255]),{raw:{width:2,height:1,channels:4}}).png().toBuffer(),f=await fixture(t,{imageBytes:bytes});
 for(const[background,rgb]of[['dark',[22,22,22]],['light',[245,245,245]]]){const r=await performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:0,top:0,width:1,height:1},background},background),raw=await sharp(await inspectedBytes(f,r)).raw().toBuffer({resolveWithObject:true});assert.equal(raw.info.channels,3);assert.deepEqual([...raw.data],rgb);assert.equal(r.result.previewBackground,background==='dark'?'#161616':'#F5F5F5');}
 assert.deepEqual(await readFile(f.file),bytes);assert.equal((await sharp(f.bytes).metadata()).hasAlpha,true);
});
test('replay binds every normalized region coordinate and rechecks source hash/client pin/stop state',async t=>{
 const f=await fixture(t),args={sourceId:f.source.id,region:{left:10,top:10,width:100,height:100}},first=await performTool(f.ctx,'image_view',args,'crop');assert.equal((await performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{height:100,width:100,top:10,left:10}},'crop')).id,first.id);
 for(const k of ['left','top','width','height'])await assert.rejects(performTool(f.ctx,'image_view',{...args,region:{...args.region,[k]:args.region[k]+1}},'crop'),/different arguments/);
 await writeFile(f.file,Buffer.alloc(f.bytes.length));await assert.rejects(performTool(f.ctx,'image_view',args,'crop'),/bytes changed/);
 const g=await fixture(t),r=await performTool(g.ctx,'image_view',{sourceId:g.source.id,region:{left:0,top:0,width:1,height:1}},'pin');await writeFile(join(g.base,'current.json'),JSON.stringify({sha256:'a'.repeat(64),path:'/foreign'}));await assert.rejects(performTool(g.ctx,'image_view',{sourceId:g.source.id,region:r.result.region},'pin'));
 const h=await fixture(t);await performTool(h.ctx,'image_view',{sourceId:h.source.id,region:{left:0,top:0,width:1,height:1}},'stopped');h.ctx.check=async()=>{throw Error('Owner stopped')};await assert.rejects(performTool(h.ctx,'image_view',{sourceId:h.source.id,region:{left:0,top:0,width:1,height:1}},'stopped'),/Owner stopped/);
});
test('regions count toward unchanged four-preview budget and retain task-output allocation gates',async t=>{
 const f=await fixture(t);for(let i=0;i<4;i++)await performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:i,top:0,width:1,height:1}},'region-'+i);await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:4,top:0,width:1,height:1}},'fifth'),/budget reached/);
 const g=await fixture(t),producer={...g.ctx,agentId:randomUUID(),partId:'design',roleId:'media',allowed:['graphic_card']},card=await performTool(producer,'graphic_card',{title:'Synthetic crop reference'},'source'),args={sourceCall:card.id,region:{left:0,top:0,width:20,height:10}};
 await assert.rejects(performTool(g.ctx,'image_view',args,'foreign'),/not an allocated/);g.ctx.job.steps=[{id:'reply',agentId:g.ctx.agentId,dependsOn:['design']}];const crop=await performTool(g.ctx,'image_view',args,'dependency');assert.equal(crop.result.width,20);assert.equal(crop.result.source.sourceCall,card.id);assert.equal(crop.result.source.sha256,card.files.find(f=>f.name==='card.png').sha256);assert.deepEqual(crop.result.region,args.region);
});

test('a small crop cannot bypass the unchanged full-source64MP decode cap',async t=>{
 const bytes=Buffer.from(await regionGrid());bytes.writeUInt32BE(8001,16);bytes.writeUInt32BE(8000,20);
 let crc=0xffffffff;for(const b of bytes.subarray(12,29)){crc^=b;for(let j=0;j<8;j++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}bytes.writeUInt32BE((crc^0xffffffff)>>>0,29);
 const f=await fixture(t,{imageBytes:bytes});await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:0,top:0,width:1,height:1}},'oversized-source'),/pixel limit/);
});
test('region preview remains capped at8MiB even when source and2048 dimensions are allowed',async t=>{
 const bytes=await sharp(randomBytes(2048*2048*3),{raw:{width:2048,height:2048,channels:3}}).png().toBuffer(),f=await fixture(t,{imageBytes:bytes});
 await assert.rejects(performTool(f.ctx,'image_view',{sourceId:f.source.id,region:{left:0,top:0,width:2048,height:2048},maxEdge:2048},'large-preview'),/Preview exceeds the image transport limit/);
});

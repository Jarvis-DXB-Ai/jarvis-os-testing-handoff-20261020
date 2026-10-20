import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {bridgeSourceHash} from './lib/office-tool-bridge.mjs';
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
const proc=spawn(process.execPath,['scripts/office-tools-mcp.mjs','--verification'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});let counter=0;const pending=new Map();
createInterface({input:proc.stdout}).on('line',line=>{let v;try{v=JSON.parse(line);}catch{return;}const entry=pending.get(v.id);if(entry){clearTimeout(entry.timer);pending.delete(v.id);if(v.error)entry.reject(new Error(v.error.message));else entry.resolve(v.result);}});
proc.stderr.on('data',()=>{});proc.on('exit',()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('Tool MCP exited before its reply.'));}});
const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tool test deadline reached.'));},90000);pending.set(id,{resolve,reject,timer});proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const results=[];
try{
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'jarvis-owner-fixture-test',version:'1'}});proc.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const listed=await rpc('tools/list',{}),expected=['cloudflare_status','graphic_card','video_from_card','blender_scene','github_search','workspace_list','workspace_read','draft_check','image_list','image_view','source_list','source_read','draft_video'].sort();if(JSON.stringify(listed.tools.map(t=>t.name).sort())!==JSON.stringify(expected))throw new Error('Expected five native operations, scoped folder/draft readers and scoped image/text-source tools; no other tools.');
 const call=async(name,args)=>{const response=await rpc('tools/call',{name,arguments:args});if(response.isError)throw new Error(`Tool test failed: ${name}`);const r=JSON.parse(response.content[0].text);if(r.status!=='completed'||!r.fixture)throw new Error('Missing labelled completed fixture receipt.');results.push(r);console.log(JSON.stringify({tool:name,status:r.status,fixture:r.fixture,files:r.files.map(f=>f.name)}));return r;};
 const unpinned=await rpc('tools/call',{name:'source_read',arguments:{sourceId:'src-0000000000000000'}});if(!unpinned.isError)throw Error('Unpinned source reader leaked fixture files');
 const unscopedDraft=await rpc('tools/call',{name:'draft_video',arguments:{profileId:'democlienta-v2',scenes:[{sourceId:'src-0000000000000000',title:'One'},{sourceId:'src-1111111111111111',title:'Two'}]}});if(!unscopedDraft.isError)throw Error('Unallocated author render was permitted');
 const cloud=await call('cloudflare_status',{});if(cloud.result.status!=='connected')throw new Error('Cloudflare OAuth read not connected.');
 const card=await call('graphic_card',{title:'Office connection fixture',lines:['Synthetic local tool verification','Not client artwork or an approved delivery']});
 const image=await rpc('tools/call',{name:'image_view',arguments:{sourceCall:card.files.find(f=>f.name==='card.png').url}});if(image.isError)throw Error('Image transport rejected');const pixels=image.content.find(c=>c.type==='image');if(pixels?.mimeType!=='image/png'||!Buffer.from(pixels.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('MCP response has no real PNG pixels');const viewed=JSON.parse(image.content[0].text);results.push(viewed);if(viewed.result.source.sha256!==card.files.find(f=>f.name==='card.png').sha256)throw Error('Preview source hash mismatch');
 await call('video_from_card',{sourceCall:card.id,seconds:2});
 await call('blender_scene',{primitive:'cube',color:'#4ade80'});
 const repo=await call('github_search',{query:'ffmpeg'});if(!repo.result.sources?.length)throw new Error('Public repository query returned no verification sources.');
 const rejected=await rpc('tools/call',{name:'blender_scene',arguments:{python:'print(1)'}});if(!rejected.isError)throw new Error('Arbitrary Python was not rejected.');
 const app={cloudflare_status:'cloud',graphic_card:'sharp',video_from_card:'ffmpeg',blender_scene:'blender',github_search:'github',image_view:'sharp'};
 const proof={at:new Date().toISOString(),sourceHash:await bridgeSourceHash(),transport:'stdio MCP',fixture:true,tools:results.map(r=>r.tool),receipts:results.map(r=>({id:r.id,jobId:r.jobId,tool:r.tool,fixture:true})),files:results.flatMap(r=>r.files.map(f=>({...f,appId:app[r.tool]})))};
 await writeFile(join(plan.storage.recordsRoot,'tool-verification/latest.json'),JSON.stringify(proof,null,2));console.log('Verified five core native tools and actual MCP image content through the same protocol; no language-model run or deployment.');
}finally{proc.stdin.end();proc.kill('SIGTERM');}

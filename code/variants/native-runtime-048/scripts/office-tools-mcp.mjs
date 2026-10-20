import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {authorizeToolActor,performTool,toolDefinitions,readToolFile} from './lib/office-tool-bridge.mjs';
const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
let ctx;
if(process.argv[2]==='--verification'){
 // Owner-only fixed local fixture harness; never supplied in Office worker configs.
 const id=randomUUID();await mkdir(join(plan.storage.recordsRoot,'tool-verification'),{recursive:true});
 ctx={jobId:id,agentId:'owner-fixture-verifier',runId:id,roleId:'fixture',partId:'fixture',allowed:toolDefinitions.map(t=>t.name),fixture:true,storage:plan.storage,job:{steps:[]},check:async()=>{}};
}else ctx=await authorizeToolActor(plan);
let queue=Promise.resolve();
const lines=createInterface({input:process.stdin});
const send=v=>process.stdout.write(JSON.stringify(v)+'\n');
lines.on('line',line=>{queue=queue.then(async()=>{
 let req;try{if(line.length>32000)throw new Error();req=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request.'}});return;}
 if(req.id===undefined)return;
 try{
  await ctx.check();let result;
  if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'jarvis-office-scoped-tools',version:'1.0.0'}};
  else if(req.method==='ping')result={};
  else if(req.method==='tools/list')result={tools:toolDefinitions.filter(t=>ctx.allowed.includes(t.name))};
  else if(req.method==='tools/call'){try{const value=await performTool(ctx,req.params?.name,req.params?.arguments??{},req.id);const content=[{type:'text',text:JSON.stringify(value)}];if(value.tool==='image_view'){const bytes=await readToolFile(ctx.storage,value.jobId,value.id,'inspection.png');await ctx.check();content.push({type:'image',mimeType:'image/png',data:bytes.toString('base64')});}result={content};}catch{result={isError:true,content:[{type:'text',text:'Office tool refused or failed. Check role grant, task state, scoped input and saved tool receipt. No automatic retry was made.'}]};}}
  else throw new Error();
  send({jsonrpc:'2.0',id:req.id,result});
 }catch{send({jsonrpc:'2.0',id:req.id,error:{code:-32602,message:'Office tool session unavailable or method unsupported.'}});}
 }).catch(()=>send({jsonrpc:'2.0',id:null,error:{code:-32603,message:'Office tool session failed.'}}));});

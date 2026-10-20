import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {officeRunTurnLimit} from './lib/office-run-budget.mjs';
import {workspaceTools,performTool} from './lib/office-tool-bridge.mjs';

test('no-tool Claude3 and Codex1 retain the existing bounded defaults',()=>{
 assert.equal(officeRunTurnLimit('claude_local',[],workspaceTools),3);
 assert.equal(officeRunTurnLimit('codex_local',[],workspaceTools),1);
 assert.equal(officeRunTurnLimit('other-existing-adapter',[],workspaceTools),1);
});
test('actual bridge workspace classification shares one24-call group, not24 per tool',()=>{
 const granted=Object.freeze([...workspaceTools,...workspaceTools]),classification=Object.freeze([...workspaceTools]);
 assert.equal(officeRunTurnLimit('claude_local',granted,classification),25);
 assert.equal(officeRunTurnLimit('codex_local',['source_read'],workspaceTools),25);
 assert.deepEqual(granted,[...workspaceTools,...workspaceTools]);
});
test('production6 plus final and mixed30 plus final remain bounded independently of tool count',()=>{
 assert.equal(officeRunTurnLimit('claude_local',['graphic_card'],workspaceTools),7);
 assert.equal(officeRunTurnLimit('codex_local',['graphic_card','github_search'],workspaceTools),7);
 assert.equal(officeRunTurnLimit('claude_local',[...workspaceTools,'graphic_card','github_search'],workspaceTools),31);
});
test('malformed/HTTP-shaped inputs cannot supply an arbitrary numeric turn override',()=>{
 for(const args of [[null,[],workspaceTools],['claude_local',{maxTurns:999},workspaceTools],['claude_local',[''],workspaceTools],['claude_local',['source_read'],[]],['claude_local',['source_read'],999],['claude_local',Array(65).fill('source_read'),workspaceTools]])assert.throws(()=>officeRunTurnLimit(...args),/required/);
});

async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'office-run-budget-')));t.after(()=>rm(root,{recursive:true,force:true}));
 return {storage:{recordsRoot:root},jobId:'a7604343-92d7-56ec-bf35-b272cac7f8b7',agentId:'c8aef456-9613-5dd2-9a9e-2207708a7338',runId:'64318790-4907-53cb-ad3f-7b547855c242',partId:'reply',roleId:'copy',allowed:['draft_check','graphic_card'],fixture:true,job:{criteria:[]},check:async()=>true};
}
test('serial24 actual workspace calls plus final fit25 native turns; tool25 is still refused',async t=>{
 const ctx=await fixture(t),limit=officeRunTurnLimit('claude_local',ctx.allowed,workspaceTools);
 // This fixture grants both groups: scope this particular native stage to the
 // existing read-only grant, exactly as the V4 editorial task does.
 ctx.allowed=['draft_check'];assert.equal(officeRunTurnLimit('claude_local',ctx.allowed,workspaceTools),25);assert.equal(limit,31);
 async function serial(turnCap,execute){let turns=0;for(let i=0;i<24;i++){if(turns>=turnCap)throw Error('native turn limit before required read');await execute(i);turns++;}if(turns>=turnCap)throw Error('native turn limit before final');return turns+1;}
 await assert.rejects(serial(6,async()=>{}),/before required read/);
 assert.equal(await serial(officeRunTurnLimit('claude_local',ctx.allowed,workspaceTools),i=>performTool(ctx,'draft_check',{artifact:'Synthetic bounded artifact '+i},'serial-'+i)),25);
 await assert.rejects(performTool(ctx,'draft_check',{artifact:'Synthetic extra attempt'},'serial-extra'),/Tool budget reached/);
 const directory=join(ctx.storage.recordsRoot,'tool-artifacts',ctx.jobId),entries=await readdir(directory);
 const started=await Promise.all(entries.map(name=>readFile(join(directory,name,'started.json')).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;})));
 assert.equal(started.filter(Boolean).length,24); // rejected attempt creates no started receipt
});
test('actual production counter remains6 without executing a production operation',async t=>{
 const ctx=await fixture(t);ctx.allowed=['graphic_card'];
 for(let i=0;i<6;i++){const folder=join(ctx.storage.recordsRoot,'tool-artifacts',ctx.jobId,String(i).padStart(32,'0'));await mkdir(folder,{recursive:true});await writeFile(join(folder,'started.json'),JSON.stringify({runId:ctx.runId,tool:'graphic_card'}));}
 assert.equal(officeRunTurnLimit('claude_local',ctx.allowed,workspaceTools),7);
 await assert.rejects(performTool(ctx,'graphic_card',{title:'Synthetic unexecuted operation'},'production-extra'),/Tool budget reached/);
});

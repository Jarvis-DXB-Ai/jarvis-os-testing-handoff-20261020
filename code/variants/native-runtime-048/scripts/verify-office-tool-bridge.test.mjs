import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,readFile,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {roleTools,validateTool,safeToolPath,authorizeToolActor,toolAdapterOptions,performTool} from './lib/office-tool-bridge.mjs';
const temp=async prefix=>realpath(await mkdtemp(join(tmpdir(),prefix)));
const jobId='a7604343-92d7-56ec-bf35-b272cac7f8b7',agentId='c8aef456-9613-5dd2-9a9e-2207708a7338',runId='64318790-4907-53cb-ad3f-7b547855c242';
test('empty list prefix matches the optional unfiltered workspace request without permitting empty read paths',()=>{
 assert.deepEqual(validateTool('workspace_list',{prefix:''}),{prefix:''});
 assert.deepEqual(validateTool('workspace_list',{}),{});
 assert.deepEqual(validateTool('workspace_list',{prefix:'library-'}),{prefix:'library-'});
 assert.throws(()=>validateTool('workspace_list',{prefix:' '}));
 assert.throws(()=>validateTool('workspace_list',{path:'/other-client'}));
 assert.throws(()=>validateTool('workspace_read',{path:''}));
 assert.throws(()=>validateTool('graphic_card',{title:''}));
});
test('bridge permits only role-specific bounded operations and rejects commands, remote inputs and unscoped paths',()=>{
 assert.deepEqual(roleTools('bookkeeping'),[]);assert.ok(roleTools('media').includes('blender_scene'));assert.equal(roleTools('copy').includes('cloudflare_status'),false);
 assert.throws(()=>validateTool('cloudflare_status',{command:'deploy'}));assert.throws(()=>validateTool('blender_scene',{python:'import os'}));assert.throws(()=>validateTool('github_search',{query:'is:private'}));assert.throws(()=>validateTool('video_from_card',{sourceCall:'../secret',seconds:2}));assert.throws(()=>validateTool('video_from_card',{sourceCall:'a'.repeat(32),seconds:50}));
});
test('actor requires a live saved run, explicit tool grant, correct role and mounted scoped storage; owner stop revokes access',async()=>{
 const volume=await temp('office-tools-auth-'),recordsRoot=join(volume,'records'),directory=join(volume,'operational');await mkdir(recordsRoot);await mkdir(directory);
 const plan={storage:{testing:true,recordsVolume:volume,recordsRoot}},env={JARVIS_OFFICE_JOB_ID:jobId,PAPERCLIP_AGENT_ID:agentId,PAPERCLIP_RUN_ID:runId};
 const job={id:jobId,status:'working',steps:[],calls:[{agentId,runId,roleId:'design-system',status:'running',stage:'specialist:design',tools:['graphic_card','cloudflare_status']}]};
 await writeFile(join(directory,jobId+'.json'),JSON.stringify(job));const actor=await authorizeToolActor(plan,env,directory);assert.deepEqual(actor.allowed,['graphic_card']);
 await assert.rejects(authorizeToolActor(plan,{...env,PAPERCLIP_AGENT_ID:runId},directory));await writeFile(join(directory,jobId+'.stop'),'stop');await assert.rejects(actor.check());
});
test('symlink escapes are denied before input or output access',async()=>{
 const dir=await temp('office-tools-path-'),external=await temp('office-tools-other-');await symlink(external,join(dir,'linked'));
 await assert.rejects(safeToolPath(dir,['linked','file.png'],{create:true}));await assert.rejects(safeToolPath(dir,['..','secret']));
});
test('model adapter config is scoped to this server and tool list without changing monthly authentication or disabling sandboxes',async()=>{
 const dir=await temp('office-tools-config-'),plan={toolBridge:{enabled:true}};
 const claude=await toolAdapterOptions(plan,{metadata:{jarvisBlueprintRoleId:'design-system'},adapterType:'claude_local'},dir);assert.ok(claude.extraArgs.includes('--strict-mcp-config'));assert.ok(claude.extraArgs.includes('mcp__office__graphic_card'));assert.equal(claude.extraArgs.includes('--dangerously-skip-permissions'),false);
 const cfg=JSON.parse(await readFile(join(dir,'office-tools.mcp.json'),'utf8'));assert.equal(Object.keys(cfg.mcpServers).length,1);
 assert.ok(claude.extraArgs.includes('--disallowedTools'));
 assert.ok(claude.extraArgs.includes('mcp__Paperclip_projects__create_task'));
 assert.ok(claude.extraArgs.includes('mcp__Paperclip_connections__connection_request'));
 assert.equal(claude.extraArgs.includes('--append-system-prompt'),false);
 assert.equal(claude.extraArgs.includes('--append-system-prompt-file'),false);
 assert.ok(claude.note.includes('do not reread their folder copies'));
 assert.ok(claude.note.includes('never create placeholder Paperclip tasks'));
 const codex=await toolAdapterOptions(plan,{metadata:{jarvisBlueprintRoleId:'media'},adapterType:'codex_local'},dir);assert.ok(codex.extraArgs.some(x=>x.startsWith('mcp_servers.office.enabled_tools=')));assert.equal(codex.extraArgs.some(x=>x.includes('API_KEY')||x.includes('dangerously')),false);
 assert.equal((await toolAdapterOptions(plan,{metadata:{jarvisBlueprintRoleId:'coo'}},dir)).tools.length,0);
});
test('graphic output is editable, escapes user text, keeps hashes and replays a tool receipt without generating a second version',async()=>{
 const recordsRoot=await temp('office-tools-render-'),ctx={jobId,agentId,runId,partId:'design',roleId:'design-system',allowed:['graphic_card'],fixture:true,storage:{recordsRoot},job:{steps:[]},check:async()=>{}};
 const args={title:'<script>draft</script>',lines:['A & B']},r=await performTool(ctx,'graphic_card',args,'1');assert.equal(r.fixture,true);assert.equal(r.files.length,3);assert.ok(r.files.every(f=>f.sha256.length===64));
 const svg=await readFile(join(recordsRoot,'tool-artifacts',jobId,r.id,'card.svg'),'utf8');assert.ok(svg.includes('&lt;script&gt;'));assert.equal(svg.includes('<script>'),false);
 assert.deepEqual(await performTool(ctx,'graphic_card',args,'1'),r);await assert.rejects(performTool(ctx,'graphic_card',{title:'changed'},'1'));await assert.rejects(performTool(ctx,'blender_scene',{},'2'));
});

test('video inputs deny unrelated agents and changed artifacts before executing FFmpeg',async()=>{
 const recordsRoot=await temp('office-tools-dependency-');
 const designer={jobId,agentId,runId,partId:'design',roleId:'design-system',allowed:['graphic_card'],fixture:true,storage:{recordsRoot},job:{steps:[]},check:async()=>{}};
 const card=await performTool(designer,'graphic_card',{title:'Dependency fixture'},'card');
 const videoAgent='4f871043-0c72-533f-9186-8a26502782e1';
 const editor={...designer,agentId:videoAgent,runId:'e5a954de-5e5c-596b-be89-c82e211cadce',partId:'edit',roleId:'video',allowed:['video_from_card'],job:{steps:[{id:'edit',agentId:videoAgent,dependsOn:[]}]}};
 await assert.rejects(performTool(editor,'video_from_card',{sourceCall:card.id,seconds:1},'unrelated'),/declared dependency/);
 editor.job.steps[0].dependsOn=['design'];
 await writeFile(join(recordsRoot,'tool-artifacts',jobId,card.id,'card.png'),'changed');
 await assert.rejects(performTool(editor,'video_from_card',{sourceCall:card.id,seconds:1},'changed'),/hash changed/);
 // A failed started operation cannot silently execute again with the same request.
 await assert.rejects(performTool(editor,'video_from_card',{sourceCall:card.id,seconds:1},'changed'),/EEXIST/);
});

test('completed receipt replay rechecks bytes and rejects wrong-format historical PNG even when its hash matches',async()=>{
 const {createHash}=await import('node:crypto');const sharp=(await import('sharp')).default;
 const recordsRoot=await temp('office-tools-format-');
 const ctx={jobId,agentId,runId,partId:'design',roleId:'design-system',allowed:['graphic_card'],fixture:true,storage:{recordsRoot},job:{steps:[]},check:async()=>{}};
 const args={title:'Saved fixture'},r=await performTool(ctx,'graphic_card',args,'format');
 const folder=join(recordsRoot,'tool-artifacts',jobId,r.id);
 const wrong=await sharp({create:{width:640,height:360,channels:3,background:'#333'}}).jpeg().toBuffer();
 await writeFile(join(folder,'card.png'),wrong);
 const receipt=JSON.parse(await readFile(join(folder,'receipt.json'),'utf8'));
 receipt.files.find(f=>f.name==='card.png').sha256=createHash('sha256').update(wrong).digest('hex');
 await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt));
 await assert.rejects(performTool(ctx,'graphic_card',args,'format'),/format mismatch/);
 const {readToolFile}=await import('./lib/office-tool-bridge.mjs');
 await assert.rejects(readToolFile({recordsRoot,recordsVolume:dirname(recordsRoot),testing:true},jobId,r.id,'card.png'),/format mismatch/);
});

test('draft checker measures lexical words without granting files, rewriting criteria or approving a draft',async()=>{
 const recordsRoot=await temp('office-draft-check-');
 const ctx={jobId,agentId,runId,partId:'copy',roleId:'copy',allowed:['draft_check'],fixture:true,storage:{recordsRoot},job:{criteria:['The entire response is maximum 5 words.'],steps:[{},{}]},check:async()=>{}};
 const r=await performTool(ctx,'draft_check',{artifact:'A fact-check — don’t invent facts.'},'measure');
 assert.equal(r.result.wordCount,5);assert.deepEqual(r.files,[]);assert.deepEqual(r.result.wholeDeliverableLimits,[{min:0,max:5}]);assert.match(r.result.scope,/not automatic per-part caps/);assert.equal(r.result.pass,undefined);
 await assert.rejects(performTool(ctx,'draft_check',{artifact:'text',path:'/other-client'},'path'));
 assert.throws(()=>validateTool('draft_check',{artifact:'x'.repeat(44001)}));
});
test('draft checker binds whole raw syntax and decoded field measurements without extracting wrappers or approving copy',async()=>{
 const recordsRoot=await temp('office-draft-json-');
 const ctx={jobId,agentId,runId,partId:'copy',roleId:'copy',allowed:['draft_check'],fixture:true,storage:{recordsRoot},job:{criteria:[]},check:async()=>{}};
 const valid='{"body":"First paragraph.\\n\\nSecond paragraph."}';
 const good=await performTool(ctx,'draft_check',{artifact:valid},'valid-json');
 assert.equal(good.result.jsonMeasurements.jsonSyntax.valid,true);assert.equal(good.result.jsonMeasurements.stringFields.fields[0].paragraphCount,2);assert.equal(good.result.jsonMeasurements.stringFields.fields[0].wordCount,4);assert.equal(good.result.jsonMeasurements.semanticApproval,'not_assessed');
 const raw='Here is the checked draft:\n```json\n'+valid+'\n```';
 const bad=await performTool(ctx,'draft_check',{artifact:raw},'raw-wrapper');
 assert.equal(bad.result.jsonMeasurements.jsonSyntax.valid,false);assert.deepEqual(bad.result.jsonMeasurements.stringFields.fields,[]);assert.equal(bad.result.jsonMeasurements.format.literalControlsInQuotedStrings.count,0);assert.notEqual(bad.result.jsonMeasurements.inputSha256,good.result.jsonMeasurements.inputSha256);assert.deepEqual(bad.files,[]);
 const literal=await performTool(ctx,'draft_check',{artifact:'{"body":"First\nSecond"}'},'literal-newline');assert.equal(literal.result.jsonMeasurements.jsonSyntax.valid,false);assert.equal(literal.result.jsonMeasurements.format.literalControlsInQuotedStrings.count,1);
});

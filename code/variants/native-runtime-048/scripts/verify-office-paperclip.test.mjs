import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {createPaperclipSnapshotReader} from './lib/office-paperclip-snapshot.mjs';
import { subscriptionSession, modelWorkerEnvironment, subscriptionArguments } from './office-subscription-runner.mjs';
function load(path, overrides = {}) {
  const url = new URL(path, import.meta.url);
  const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  const require = createRequire(url);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { projectPaperclipSnapshot } = load('../src/lib/office-paperclip.ts');
const { blueprintRoster, officeDepartmentRooms } = load('../src/lib/office.ts');
const { requireCodexSubscription, officeMockProviderAllowed } = load('../src/lib/office-subscription-policy.ts');
test('admission verifies coordinator health and full roster without optional history, with separate cache scope', async()=>{
 const companyId='013ec13f-583a-525c-b113-c2651409f3a5',calls=[];
 let rosterFails=false;
 const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,wait:async()=>{},fetchImpl:async url=>{
  const path=new URL(url).pathname;calls.push(String(url));
  if(path.endsWith('/issues')||path.endsWith('/heartbeat-runs'))return {ok:false,status:503};
  if(rosterFails&&path.endsWith('/agents'))throw new Error('Roster read unavailable.');
  return {ok:true,json:async()=>path==='/api/health'?{status:'ok'}:path.endsWith('/agents')?[{id:'agency-agent',metadata:{jarvisBlueprintRoleId:'coo'},adapterConfig:{model:'subscription'}}]:{id:companyId}};
 }});
 const config={base:'http://127.0.0.1:3100',companyId,local:true};
 assert.equal((await reader({...config,includeHistory:false})).status,'connected');
 assert.equal(calls.length,3);assert.ok(!calls.some(p=>p.includes('/issues')||p.includes('/heartbeat-runs')));
 assert.equal((await reader(config)).status,'unavailable');
 assert.ok(calls.some(p=>p.includes('summary=true')));
 assert.equal((await reader({...config,includeHistory:false})).status,'connected');
 rosterFails=true;
 const denying=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,wait:async()=>{},fetchImpl:async()=>{throw new Error('Connection unavailable.');}});
 assert.equal((await denying({...config,includeHistory:false})).status,'unavailable');
});
test('worker requires subscription auth and excludes paid-provider overrides', () => {
  assert.equal(subscriptionSession('claude', JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', apiProvider: 'firstParty' })), true);
  assert.equal(subscriptionSession('claude', JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', apiProvider: 'firstParty', apiKeySource: '/login managed key' })), false);
  assert.equal(subscriptionSession('claude', 'Not logged in'), false);
  assert.equal(subscriptionSession('codex', 'Logged in using an API key'), false);
  const env = modelWorkerEnvironment({ OPENAI_API_KEY: 'paid', CODEX_API_KEY: 'paid', ANTHROPIC_API_KEY: 'paid', ANTHROPIC_AUTH_TOKEN: 'paid', CLAUDE_CODE_OAUTH_TOKEN: 'override', CLAUDE_CODE_USE_BEDROCK: '1', PAPERCLIP_API_KEY: 'REPLACE_WITH_TEST_CREDENTIAL', HOME: '/tmp/worker' });
  assert.deepEqual(env, { PAPERCLIP_API_KEY: 'REPLACE_WITH_TEST_CREDENTIAL', HOME: '/tmp/worker' });
});
test('Codex non-Git workspace arguments retain the assigned sandbox and do not affect other commands', () => {
  const args = ['exec', '--sandbox', 'read-only', '--json', 'test'];
  assert.deepEqual(subscriptionArguments('codex', args), ['exec', '--skip-git-repo-check', '--ignore-user-config', ...args.slice(1)]);
  assert.deepEqual(args, ['exec', '--sandbox', 'read-only', '--json', 'test']);
  assert.deepEqual(subscriptionArguments('codex', ['exec', '--skip-git-repo-check', '--ignore-user-config']), ['exec', '--skip-git-repo-check', '--ignore-user-config']);
  assert.deepEqual(subscriptionArguments('codex', ['login', 'status']), ['login', 'status']);
  assert.deepEqual(subscriptionArguments('claude', ['-p', 'test']), ['-p', 'test']);
});
test('subscription-only policy refuses API login and permits only an isolated loopback mock', () => {
  requireCodexSubscription('Logged in using ChatGPT\n');
  assert.throws(() => requireCodexSubscription('Logged in using an API key'));
  assert.throws(() => requireCodexSubscription('Not logged in'));
  const env = { JARVIS_ISOLATED_TEST: '1', JARVIS_OFFICE_TEST_PROVIDER_MOCK: '1', ANTHROPIC_API_KEY: 'REPLACE_WITH_TEST_CREDENTIAL', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4321' };
  assert.equal(officeMockProviderAllowed(env), true);
  assert.equal(officeMockProviderAllowed({ ...env, JARVIS_ISOLATED_TEST: '0' }), false);
  assert.equal(officeMockProviderAllowed({ ...env, ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }), false);
  assert.equal(officeMockProviderAllowed({ ...env, ANTHROPIC_API_KEY: 'REPLACE_WITH_TEST_CREDENTIAL' }), false);
});
test('browser projection excludes credentials and private traces without inventing costs', () => {
  const result = projectPaperclipSnapshot({ status: 'ok', version: 'test' }, { id: 'company', name: 'test', secret: 'sensitive' }, [{ id: 'agent', name: 'worker', adapterConfig: { model: 'test-model', env: { API_KEY: 'sensitive' }, promptTemplate: 'private-prompt' }, metadata: { jarvisBlueprintRoleId: 'copy', privateNote: 'sensitive' } }], [{ id: 'task', title: 'test', description: 'private-prompt' }], [{ id: 'run', agentId: 'agent', usageJson: { inputTokens: 15, outputTokens: 4, billingType: 'subscription_included' }, providerTrace: 'sensitive' }]);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  assert.ok(!JSON.stringify(result).includes('private-prompt'));
  assert.equal(result.runs[0].costUsd, null);
  assert.equal(result.runs[0].cachedInputTokens, null);
  assert.equal(result.agents[0].blueprintRoleId, 'copy');
  assert.throws(() => projectPaperclipSnapshot({ status: 'bad' }, { id: 'company' }, [], [], []));
  assert.throws(() => projectPaperclipSnapshot({ status: 'ok' }, { id: 'company' }, { error: 'unavailable' }, [], []));
  assert.throws(() => projectPaperclipSnapshot({ status: 'ok' }, { id: 'company' }, [{}], [], []));
  assert.equal(result.agents[0].status, 'unknown');
});
test('server wrapper recovers promptly from unknown reads and retains its production isolation guard', async () => {
  const envKeys = ['NODE_ENV', 'JARVIS_ISOLATED_TEST', 'JARVIS_PAPERCLIP_URL', 'JARVIS_PAPERCLIP_COMPANY_ID', 'JARVIS_PAPERCLIP_TOKEN'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  let now = 1_000, requests = 0, fail = true;
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.NODE_ENV = 'development'; process.env.JARVIS_ISOLATED_TEST = '1';
    const fetchImpl=async url=>{requests++;const path=new URL(url).pathname;if(fail&&path==='/api/health')throw new Error('network unavailable');return {ok:true,json:async()=>path==='/api/health'?{status:'ok'}:path.endsWith('/api/companies/013ec13f-583a-525c-b113-c2651409f3a5')?{id:'013ec13f-583a-525c-b113-c2651409f3a5',name:'Jarvis Office'}:[]};};
    const { loadPaperclipOfficeSnapshot } = load('../src/lib/office-paperclip-server.ts', {
      'server-only': {}, './office-paperclip': {projectPaperclipSnapshot}, './office-stack-plan.json': {paperclipCompanyId:'013ec13f-583a-525c-b113-c2651409f3a5'},
      '../../scripts/lib/office-paperclip-snapshot.mjs':{createPaperclipSnapshotReader:options=>createPaperclipSnapshotReader({...options,fetchImpl,clock:()=>now,wait:async()=>{}})}
    });
    assert.equal((await loadPaperclipOfficeSnapshot()).status, 'unavailable');assert.equal(requests,6);
    fail=false;assert.equal((await loadPaperclipOfficeSnapshot()).status,'unavailable');assert.equal(requests,6);
    now+=1001;assert.equal((await loadPaperclipOfficeSnapshot()).status,'connected');assert.equal(requests,11);
    process.env.NODE_ENV='production';assert.equal((await loadPaperclipOfficeSnapshot()).status,'not_configured');assert.equal(requests,11);
  } finally {for(const key of envKeys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});
test('all canonical roles appear in distinct department rooms including COO reports', () => {
  const roster = blueprintRoster(), rooms = officeDepartmentRooms(roster);
  assert.equal(roster.agents.length, 40);
  assert.equal(roster.departments.length, 13);
  assert.equal(new Set(rooms.flatMap(room => room.agents.map(a => a.id))).size, 40);
  assert.ok(rooms.every(room => room.agents.every(a => a.departmentId === room.departmentId)));
  assert.ok(rooms.some(room => room.departmentId === 'client-operations'));
  assert.throws(() => officeDepartmentRooms(roster, 'all', 0));
});

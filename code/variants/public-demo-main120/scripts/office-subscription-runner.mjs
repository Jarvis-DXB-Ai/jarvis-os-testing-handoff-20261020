import { spawn, spawnSync } from 'node:child_process';
import { readFile, open, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
const jobDirectory=join(homedir(),'.paperclip/instances/default/jarvis-office-teams');


const privateRoot=join(homedir(),'Library','Application Support','Jarvis Office','private-pilot');
const reviewedRoot=join(privateRoot,'releases','release-democlienta-recovery-20261016');
const reviewedPins={"scripts/lib/office-goal-bounded-authority.mjs": "f082298631b71ba0b202f7dea9854e3872b8f54fde11c794e494a4250b9c3376", "scripts/lib/office-team-engine.mjs": "03028f02d7ecfed59d284002fd6c40367b2d347291251cbe33cbbc57b4d26869"};
export async function loadReviewedOfficeRuntime(){
 const path=join(privateRoot,'config.json'),f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let raw;
 try{const a=await f.stat();if(!a.isFile()||a.nlink!==1||a.uid!==process.getuid()||(a.mode&0o777)!==0o600)throw Error('Private runtime configuration is unavailable.');raw=await f.readFile('utf8');const b=await lstat(path);if(b.ino!==a.ino||b.dev!==a.dev||b.mtimeMs!==a.mtimeMs||b.size!==a.size)throw Error('Private runtime configuration changed.');}finally{await f.close();}
 const config=JSON.parse(raw);if(config.release!==reviewedRoot||await realpath(reviewedRoot)!==reviewedRoot)throw Error('The active Office release is not this reviewed runtime.');
 for(const [relative,hash] of Object.entries(reviewedPins)){const file=join(reviewedRoot,relative);if(await realpath(file)!==file||createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw Error('Reviewed Office runtime source changed.');}
 const module=relative=>import(pathToFileURL(join(reviewedRoot,relative)).href);
 const [engine,authority,policy,foundations,budget]=await Promise.all(['scripts/lib/office-team-engine.mjs','scripts/lib/office-goal-bounded-authority.mjs','scripts/lib/office-goal-native-policy.mjs','scripts/lib/office-foundations.mjs','scripts/lib/office-goal-budget.mjs'].map(module));
 const plan=JSON.parse(await readFile(join(reviewedRoot,'src/lib/office-stack-plan.json'),'utf8'));
 return {engine,authority,policy,foundations,budget,plan,async recheckRelease(){if(await readFile(path,'utf8')!==raw)throw Error('Active Office release changed before provider launch.');for(const [relative,hash] of Object.entries(reviewedPins))if(createHash('sha256').update(await readFile(join(reviewedRoot,relative))).digest('hex')!==hash)throw Error('Reviewed Office runtime source changed.');}};
}
/** Read/validate only: never reserve, grant, reset, acknowledge or dispatch another attempt. */
export async function validateOfficeModelRun(provider,env,{directory=jobDirectory,loadRuntime=loadReviewedOfficeRuntime}={}){
 const runtime=await loadRuntime(),{engine,authority,policy,foundations,budget,plan}=runtime;
 const job=await engine.readJob(env.JARVIS_OFFICE_JOB_ID,directory),call=job.calls?.find(c=>c.runId===env.PAPERCLIP_RUN_ID&&c.agentId===env.PAPERCLIP_AGENT_ID);
 if(!['planning','working','reporting','synthesising','checking'].includes(job.status)||!call||!['queued','running','dispatching'].includes(call.status)||call.adapterType!==(provider==='claude'?'claude_local':'codex_local')||call.billing!=='subscription_only'||!call.authority?.reservationId||plan.paperclipCompanyId!==env.PAPERCLIP_COMPANY_ID)throw Error('The final provider call identity is not authorised.');
 const context=await foundations.readTaskContext(plan.storage,job.id,job.knowledgeContext),task=engine.validateTask({...job,concurrency:job.requestedConcurrency??null});
 const binding=await policy.readGoalNativeBinding(join(homedir(),'Library','Application Support','Jarvis Office','goal-control'));
 if(call.authority.authoritySha256!==binding.authoritySha256)throw Error('The saved provider authority root changed.');
 const meta={task,context,plan:job.plan,concurrency:job.concurrency,agentId:call.agentId,roleId:call.roleId,adapterType:call.adapterType,model:call.model,billing:call.billing,stage:call.stage,issueId:call.issueId,companyId:env.PAPERCLIP_COMPANY_ID,tools:call.tools,methods:call.skills,methodRoot:join(plan.storage.recordsRoot,'library/skills'),workspace:call.workspace??null,artifactGrant:call.artifactGrant??null,runId:call.runId,reservationId:call.authority.reservationId};
 const inspected=await authority.createBoundedOfficeAuthority(binding).inspect(meta),g=inspected.grant;
 await budget.recheckSingleTaskQuota({goalId:binding.goalId,ledgerPath:binding.ledgerPath,nowMs:Date.now(),singleTaskScope:{goalId:binding.goalId,workOrderId:g.workOrderId,jobId:job.id,authoritySha256:binding.authoritySha256,requestSha256:inspected.requestSha256,contextRevision:g.contextRevision,maxJobs:g.maxJobs,maxDispatchAttempts:g.maxDispatchAttempts,maxConcurrentRuns:g.maxConcurrentRuns,expiresAt:g.expiresAt}});
 const current=await engine.readJob(job.id,directory);if(JSON.stringify(current.calls.find(c=>c.runId===call.runId))!==JSON.stringify(call))throw Error('The saved provider call changed before launch.');
 await runtime.recheckRelease();
 try{await readFile(join(directory,`${job.id}.stop`));throw Error('Owner stopped this task before provider launch.');}catch(error){if(error.code!=='ENOENT')throw error;}
}

export async function claimOfficeModelRun(provider, args, env, { directory = jobDirectory, waitMs = 5000, validate = validateOfficeModelRun } = {}) {
  const invokesModel = provider === 'codex' ? args[0] === 'exec' : args.includes('--print') || args.includes('-p');
  if (!invokesModel || env.PAPERCLIP_COMPANY_ID !== '013ec13f-583a-525c-b113-c2651409f3a5') return;
  const valid = /^[0-9a-f-]{36}$/i;
  const id = env.JARVIS_OFFICE_JOB_ID, runId = env.PAPERCLIP_RUN_ID;
  if (!valid.test(id ?? '') || !valid.test(runId ?? '')) throw new Error('This Office model run was not issued by the Jarvis COO dispatcher. Automatic recovery calls are blocked.');
  const deadline = Date.now() + waitMs;
  while (true) {
    let stopped = false; try { await readFile(join(directory,`${id}.stop`)); stopped = true; } catch {}
    if (stopped) throw new Error('Owner stopped this task before the model started.');
    let job; try { job = JSON.parse(await readFile(join(directory,`${id}.json`),'utf8')); } catch {}
    const call = job?.calls?.find(c => c.runId === runId && c.agentId === env.PAPERCLIP_AGENT_ID);
    if (call && ['queued','running','dispatching'].includes(call.status)) break;
    if (Date.now() >= deadline) throw new Error('No saved coordinator receipt authorises this model run. Inspect the task before retrying.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // Native Paperclip retries and adapter relaunches must not consume the same grant twice.
  // The coordinator saves the run ID just before journal acknowledgement. Wait only
  // for that known acknowledgement race; all other final validation failures close.
  while(true){try{await validate(provider,env,{directory});break;}catch(error){if(error.message!=='work_order_artifact_run'||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
  const grant = await open(join(directory,`${id}.${runId}.model-once`),'wx',0o600).catch(() => { throw new Error('This model run grant was already consumed; automatic relaunch is blocked.'); });
  await grant.close();
  return async()=>{try{await readFile(join(directory,`${id}.stop`));throw Error('Owner stopped this task before provider launch.');}catch(error){if(error.code!=='ENOENT')throw error;}await validate(provider,env,{directory});};
}

export function subscriptionSession(provider, output) {
  if (provider === 'codex') return /^Logged in using ChatGPT\s*$/i.test(output.trim());
  try {
    const auth = JSON.parse(output);
    return auth.loggedIn === true && auth.authMethod === 'claude.ai'
      && typeof auth.subscriptionType === 'string' && auth.subscriptionType.length > 0
      && !auth.apiKeySource && auth.apiProvider === 'firstParty';
  } catch { return false; }
}

export function modelWorkerEnvironment(source) {
  const env = { ...source };
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key];
  return env;
}

export function subscriptionArguments(provider, args) {
  // Paperclip creates per-role workspaces outside Git. Keep its sandbox/approval
  // arguments; only remove dependence on the owner's repository and CLI defaults.
  if (provider !== 'codex' || args[0] !== 'exec') return [...args];
  const defaults = ['--skip-git-repo-check', '--ignore-user-config'];
  return [args[0], ...defaults.filter(flag => !args.includes(flag)), ...args.slice(1)];
}

// Paperclip's legacy adapter otherwise starts a second model run immediately
// after a successful reply, before the coordinator's polling loop can record
// disposition. Only the existing one-use grant may hand its own issue back to
// the coordinator. A named verification blocker avoids the native "in_review
// without a reviewer" recovery path. It never records QA or owner approval.
export async function recordOfficeReplyForReview(env, {directory=jobDirectory,api}={}) {
  if(env.PAPERCLIP_COMPANY_ID!=='013ec13f-583a-525c-b113-c2651409f3a5')return;
  const valid=/^[0-9a-f-]{36}$/i,id=env.JARVIS_OFFICE_JOB_ID,runId=env.PAPERCLIP_RUN_ID;
  if(!valid.test(id??'')||!valid.test(runId??''))throw new Error('No issued Office reply grant.');
  await readFile(join(directory,`${id}.${runId}.model-once`));
  const job=JSON.parse(await readFile(join(directory,`${id}.json`),'utf8'));
  const call=job.calls?.find(c=>c.runId===runId&&c.agentId===env.PAPERCLIP_AGENT_ID);
  if(!call||!valid.test(call.issueId??'')||!['queued','running','dispatching'].includes(call.status))throw new Error('The reply no longer belongs to an active issued call.');
  api??=(await loadReviewedOfficeRuntime()).engine.paperclipClient();
  const issue=await api('/issues/'+call.issueId);
  if(issue.companyId!==env.PAPERCLIP_COMPANY_ID||issue.assigneeAgentId!==call.agentId||issue.assigneeAdapterOverrides?.adapterConfig?.env?.JARVIS_OFFICE_JOB_ID!==id)throw new Error('The reply issue binding changed.');
  if(['backlog','todo','in_progress'].includes(issue.status))await api('/issues/'+call.issueId,{status:'blocked',unblockDescriptor:{owner:'board',action:'Jarvis coordinator must validate the returned model reply and record its next team stage or owner review. Do not start another model run.'}},'PATCH');
}

export async function runSubscriptionCli(provider, args) {
  const command = provider === 'claude' ? '/ABSOLUTE/TEST/OWNER/.local/bin/claude' : '/opt/homebrew/bin/codex';
  const env = modelWorkerEnvironment(process.env);
  const probe = spawnSync(command, provider === 'claude' ? ['auth', 'status'] : ['login', 'status'], { env, encoding: 'utf8', timeout: 10_000, maxBuffer: 32_000 });
  if (probe.status !== 0 || !subscriptionSession(provider, `${probe.stdout ?? ''}${probe.stderr ?? ''}`)) {
    console.error(`Jarvis Office: ${provider} subscription login is required. Model API-key fallback is disabled.`);
    process.exitCode = 78;
    await discardRejectedInput();
    return;
  }
  try { const finalRecheck=await claimOfficeModelRun(provider, args, env);await finalRecheck?.(); }
  catch (error) { console.error(`Jarvis Office: ${error.message}`); process.exitCode = 78; await discardRejectedInput(); return; }
  const child = spawn(command, subscriptionArguments(provider, args), { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Jarvis Office: model CLI could not start.'); process.exitCode = 70; });
  child.on('exit', async code => {
    process.exitCode = code ?? 1;
    if(code===0&&(provider==='codex'?args[0]==='exec':args.includes('--print')||args.includes('-p'))){
      try{await recordOfficeReplyForReview(env);}
      catch{console.error('Jarvis Office: reply disposition was not recorded. Preserve this result; inspect native recovery before another model run.');}
    }
  });
}

// Paperclip can still be streaming a large prompt when a grant is rejected.
// Consume and discard it before exiting so its writer does not receive EPIPE.
// Never log, retain, interpret, or forward rejected input to a model.
export async function discardRejectedInput() {
  if(process.stdin.isTTY||process.stdin.readableEnded||process.stdin.destroyed)return;
  for await(const chunk of process.stdin){void chunk;}
}

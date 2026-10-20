import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {userInfo} from 'node:os';
import {join} from 'node:path';
import plan from './office-stack-plan.json';
import {loadPaperclipOfficeSnapshot} from './office-paperclip-server';
import {storageReadiness} from '../../scripts/lib/office-archive.mjs';
import {skillReadiness} from '../../scripts/lib/office-skill-library.mjs';
import {knowledgeCatalog} from '../../scripts/lib/office-foundations.mjs';
import {listJobs} from '../../scripts/lib/office-team-engine.mjs';
import {assessOfficeReadiness,untrackedRunningAgents,type OfficeReadinessCheck} from './office-readiness.mjs';
import {readBrainStructure} from '../../scripts/lib/office-brain.mjs';
const run=promisify(execFile);
let authCache:{at:number;checks:OfficeReadinessCheck[]}|null=null;
async function subscriptions(fresh:boolean):Promise<OfficeReadinessCheck[]> {
  if(!fresh&&authCache&&Date.now()-authCache.at<60000)return authCache.checks;
  const checks=await Promise.all(['claude','codex'].map(async provider=>{
    let ready=false;
    try {
      const result=await run(provider==='claude'?'/ABSOLUTE/TEST/OWNER/.local/bin/claude':'/opt/homebrew/bin/codex',provider==='claude'?['auth','status']:['login','status'],{timeout:10000,maxBuffer:32000,encoding:'utf8',env:{USER:userInfo().username,...Object.fromEntries(['HOME','PATH','TMPDIR','LANG','USER','LOGNAME','SHELL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]))} as unknown as NodeJS.ProcessEnv});
      if(provider==='claude'){const v=JSON.parse(result.stdout);ready=v.loggedIn===true&&v.authMethod==='claude.ai'&&!!v.subscriptionType&&!v.apiKeySource&&v.apiProvider==='firstParty';}
      else ready=/^Logged in using ChatGPT\s*$/i.test((result.stdout+result.stderr).trim());
    }catch{}
    return {id:provider,title:provider==='claude'?'Claude subscription':'Codex subscription',ready,detail:ready?'Subscription login verified; available quota is checked when a model runs.':`Reconnect the ${provider==='claude'?'Claude Code':'Codex'} subscription on this Mac. No paid API fallback is enabled.`};
  }));
  authCache={at:Date.now(),checks};return checks;
}
export async function officeReadiness({fresh=false}={}) {
  if(!localOfficeEnabled())throw new Error('Readiness checks require the private local Office.');
  const [board,storage,skills,knowledge,jobs,auth,brain]=await Promise.all([loadPaperclipOfficeSnapshot({includeHistory:false}),storageReadiness(plan.storage),skillReadiness(plan.skillLibrary,join(plan.storage.recordsRoot,'library/skills')),knowledgeCatalog(plan.storage).catch(()=>null),listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER}),subscriptions(fresh),readBrainStructure(plan.storage).catch(()=>null)]);
  const activeRoles=[...plan.executives,...plan.roles].filter(r=>r.rosterStatus==='active');
  const missing=activeRoles.filter(r=>!board.agents.some(a=>a.blueprintRoleId===r.id&&!a.clientId&&!a.spawnedForTask&&!['paused','terminated'].includes(a.status)&&a.model===r.model&&a.adapter===(r.provider==='Claude Code'?'claude_local':'codex_local')));
  const untrackedRunning=untrackedRunningAgents(board.agents,jobs);
  const checks:OfficeReadinessCheck[]=[
    {id:'workers',title:'Worker state',ready:untrackedRunning.length===0,detail:untrackedRunning.length?'Paperclip reports a running agent outside an active Office task. Inspect its saved runs and reconcile its state before starting work.':'No untracked running agents are blocking work.'},
    {id:'paperclip',title:'Office coordinator',ready:board.status==='connected',detail:board.status==='connected'?'Paperclip is connected on this Mac.':board.message},
    {id:'storage',title:'Work and context storage',ready:storage.status==='connected',detail:storage.status==='connected'?'MAC SSD is mounted and the scoped work archive is available.':storage.message},
    {id:'roster',title:'Agent roster',ready:board.status==='connected'&&!missing.length,detail:board.status!=='connected'?'Agent registrations cannot be verified while the coordinator connection is unavailable.':missing.length?`${missing.length} active role registrations or models need attention in People.`:`${activeRoles.length} active roles match their configured runtimes.`},
    {id:'skills',title:'Role instructions',ready:skills.every(s=>s.installed),detail:skills.every(s=>s.installed)?`${skills.length} methods pass their stored integrity checks.`:'Restore or review the changed role methods before starting work.'},
    {id:'brain',title:'Brain operating structure',ready:!!brain?.matchesCurrent,detail:brain?.matchesCurrent?'Versioned Brain structure matches the current role and task policies.':'Restore or review the Brain operating structure before new assignments.'},
    {id:'context',title:'Task foundations',ready:!!knowledge?.foundations.some(f=>f.status!=='retired'),detail:knowledge?.foundations.length?'Foundations are available. Preview the exact scope for each task.':'Create a foundation in Foundations before starting a team task.'},...auth];
  return assessOfficeReadiness({checks,jobs,knowledge:{foundations:knowledge?.foundations.length??0,approvedFoundations:knowledge?.foundations.filter(f=>f.status==='approved').length??0,approvedLessons:knowledge?.lessons.filter(l=>l.status==='approved').length??0}});
}

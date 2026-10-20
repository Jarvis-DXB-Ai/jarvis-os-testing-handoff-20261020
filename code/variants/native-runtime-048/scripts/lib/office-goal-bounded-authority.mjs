import {clientProfileHash,validateClientArtifactProfile} from './office-client-artifacts.mjs';
import {constants} from 'node:fs';
import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,slug=/^[A-Za-z0-9][-A-Za-z0-9]{0,79}$/;
const stageKinds=new Set(['planning','specialist','department-parts-qa','department','department-qa','synthesis','coo-release','qa']);
const internalTools=new Set(['workspace_list','workspace_read','source_list','source_read','image_list','image_view','draft_check','artifact_read','artifact_save','artifact_render']);
export const boundedCanonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const boundedSha256=value=>createHash('sha256').update(typeof value==='string'?value:boundedCanonical(value)).digest('hex');
const denialCategories=new Set(('guard_unavailable authority_schema authority_path authority_cap authority_directory authority_file_type authority_file_links authority_file_size authority_file_permissions authority_snapshot_changed authority_changed authority_pin_changed authority_pin config_disabled_or_mismatch goal_private_domain authority_identity authority_scope authority_pins authority_expiry external_actions_ungranted owner_direction_required authority_plan authority_stages authority_stage authority_stage_duplicate authority_registry_changed authority_registry authority_duplicate trusted_task_context_required work_order_missing_or_ambiguous work_order_expired work_order_sources work_order_stage_identity work_order_method_paths work_order_plan work_order_specialist authority_initialization_missing authority_initialization_invalid authority_already_initialized authority_journal_missing authority_journal_invalid authority_journal_relationship authority_journal_events authority_journal_cap authority_journal_readback authority_journal_busy work_order_job_binding work_order_unknown_dispatch work_order_job_cap work_order_attempt_cap work_order_concurrency work_order_issue_replayed work_order_plan_changed work_order_reservation_missing work_order_reservation_changed work_order_ack work_order_already_dispatched work_order_terminal_unverified goal_binding_version goal_binding_changed usage_meter_unavailable usage_meter_stale usage_accounting_hold usage_margin_exhausted usage_guard_unavailable usage_config_changed usage_checkpoint_unavailable usage_config_disabled_or_mismatch work_order_artifact_grant work_order_artifact_source work_order_artifact_run').split(' '));
/** A closed category set: no paths, source text, provider strings or secret-bearing messages. */
export function boundedDenialReceipt(decision,{stage='modelPolicy'}={}){
 const fileClasses=['authority_registry','authority_journal','authority_initialization','source_pin','method_pin','binding','usage_ledger','unknown'],phases=['read_snapshot','journal_validation','admission','modelPolicy','final_recheck'];
 return {version:1,decisionId:uuid.test(decision?.id??'')?decision.id:null,stage:typeof stage==='string'?stage.slice(0,256):'modelPolicy',reason:denialCategories.has(decision?.reason)?decision.reason:'guard_unavailable',checkpointSaved:decision?.checkpointSaved===true,fileClass:fileClasses.includes(decision?.fileClass)?decision.fileClass:'unknown',validationPhase:phases.includes(decision?.validationPhase)?decision.validationPhase:'modelPolicy'};
}
export function boundedRequestSha256(task){const {id:_id,cooRequestHash:_hash,...request}=task;void _id;void _hash;return boundedSha256(request);}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.split(',').sort().join(','))throw Error('authority_schema');}
function absolute(path){if(typeof path!=='string'||path.includes('\0')||resolve(path)!==path)throw Error('authority_path');return path;}
function count(n){if(!Number.isSafeInteger(n)||n<1||n>10000)throw Error('authority_cap');}
async function directory(path,privateMode=false){for(let p=absolute(path);;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||p===path&&privateMode&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))throw Error('authority_directory');if(dirname(p)===p)break;}if(await realpath(path)!==path)throw Error('authority_path');}
async function bytes(path,privateMode=false,max=32*1024*1024,fileClass='source_pin'){
 for(let attempt=0;attempt<3;attempt++){
  await directory(dirname(path),privateMode);const f=await open(absolute(path),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const a=await f.stat(),current=await lstat(path),replaced=a.ino!==current.ino||a.dev!==current.dev;
   if(!a.isFile()||!current.isFile()||current.isSymbolicLink())throw Error('authority_file_type');
   if(a.nlink===0&&replaced){if(attempt<2)continue;throw Error('authority_snapshot_changed');}
   if(a.nlink!==1||current.nlink!==1)throw Error('authority_file_links');
   if(a.size>max)throw Error('authority_file_size');
   if(privateMode&&(a.uid!==process.getuid()||(a.mode&0o7777)!==0o600))throw Error('authority_file_permissions');
   const data=await f.readFile(),b=await f.stat(),c=await lstat(path);
   if(!c.isFile()||c.isSymbolicLink()||c.nlink!==1)throw Error('authority_file_links');
   if(c.ino!==a.ino||c.dev!==a.dev){if(attempt<2)continue;throw Error('authority_snapshot_changed');}
   if([b,c].some(v=>v.ino!==a.ino||v.dev!==a.dev||v.size!==a.size||v.mtimeMs!==a.mtimeMs||v.ctimeMs!==a.ctimeMs)||data.length!==a.size)throw Error('authority_changed');
   return data;
  }catch(error){error.fileClass=fileClass;error.validationPhase='read_snapshot';throw error;}finally{await f.close();}
 }
 throw Error('authority_snapshot_changed');
}
async function pin(value){exact(value,'path,sha256');if(!sha.test(value.sha256)||createHash('sha256').update(await bytes(value.path)).digest('hex')!==value.sha256)throw Error('authority_pin_changed');}
function pinShape(value){exact(value,'path,sha256');absolute(value.path);if(!sha.test(value.sha256))throw Error('authority_pin');}
export function validateGoalV2Binding(c,directoryPath){
 exact(c,'version,enabled,goalId,ledgerPath,authorityPath,authoritySha256');
 if(c.version!==2||c.enabled!==true||!slug.test(c.goalId)||!sha.test(c.authoritySha256))throw Error('config_disabled_or_mismatch');
 const root=join(absolute(directoryPath),c.goalId);
 if(absolute(c.ledgerPath)!==join(root,'usage-ledger.json')||absolute(c.authorityPath)!==join(root,'authority-registry.json'))throw Error('goal_private_domain');
 return c;
}
function grantShape(g){
 exact(g,'authorityId,ownerAuthorizationRef,workOrderId,companyId,scope,requestSha256,contextRevision,sourcePins,methodPins,allowedStages,planPolicy,notBefore,expiresAt,maxJobs,maxDispatchAttempts,maxConcurrentRuns,externalActions,directionGate,publicationGate'+(g.artifactProfile!==undefined?',artifactProfile':''));
 if(!slug.test(g.authorityId)||!slug.test(g.workOrderId)||!uuid.test(g.companyId??'')||!sha.test(g.requestSha256)||!sha.test(g.contextRevision))throw Error('authority_identity');
 exact(g.scope,'kind,clientId');if(!['agency','client'].includes(g.scope.kind)||(g.scope.kind==='client'?!uuid.test(g.scope.clientId??''):g.scope.clientId!==null))throw Error('authority_scope');
 pinShape(g.ownerAuthorizationRef);for(const list of [g.sourcePins,g.methodPins]){if(!Array.isArray(list)||list.length>200)throw Error('authority_pins');list.forEach(pinShape);if(new Set(list.map(p=>p.path)).size!==list.length)throw Error('authority_pins');}
 [g.maxJobs,g.maxDispatchAttempts,g.maxConcurrentRuns].forEach(count);if(g.maxConcurrentRuns>g.maxDispatchAttempts)throw Error('authority_cap');
 if(!Number.isFinite(Date.parse(g.notBefore))||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.parse(g.notBefore))throw Error('authority_expiry');
 if(!Array.isArray(g.externalActions)||g.externalActions.length||g.publicationGate!=='owner_exact_version_required')throw Error('external_actions_ungranted');
 exact(g.directionGate,'phase,directionApproval,sampleApproval');const d=g.directionGate;
 if(!['direction','sample','production'].includes(d.phase)||d.phase!=='direction'&&!d.directionApproval||d.phase==='production'&&!d.sampleApproval)throw Error('owner_direction_required');
 for(const p of [d.directionApproval,d.sampleApproval])if(p!==null)pinShape(p);
 exact(g.planPolicy,'allowedRoleIds,maxTasks,maxConcurrency');count(g.planPolicy.maxTasks);count(g.planPolicy.maxConcurrency);
 if(!Array.isArray(g.planPolicy.allowedRoleIds)||!g.planPolicy.allowedRoleIds.length||g.planPolicy.allowedRoleIds.some(r=>!slug.test(r))||g.planPolicy.maxConcurrency>g.maxConcurrentRuns)throw Error('authority_plan');
 if(!Array.isArray(g.allowedStages)||!g.allowedStages.length||g.allowedStages.length>500)throw Error('authority_stages');
 for(const r of g.allowedStages){exact(r,'kind,roleId,agentId,adapterType,model,tools,methodsSha256,maxAttempts');count(r.maxAttempts);if(!stageKinds.has(r.kind)||!slug.test(r.roleId)||!uuid.test(r.agentId)||!['claude_local','codex_local'].includes(r.adapterType)||typeof r.model!=='string'||!r.model||!sha.test(r.methodsSha256)||!Array.isArray(r.tools)||r.tools.some(t=>!internalTools.has(t))||new Set(r.tools).size!==r.tools.length)throw Error('authority_stage');}
 const artifact=g.allowedStages.some(r=>r.tools.some(t=>t.startsWith('artifact_')));
 if(artifact&&!g.artifactProfile)throw Error('work_order_artifact_grant');
 if(g.artifactProfile!==undefined){const p=g.artifactProfile;exact(p,'path,sha256,profileId,profileSha256');pinShape({path:p.path,sha256:p.sha256});if(g.scope.kind!=='client'||!/^[-a-z0-9]{1,64}$/.test(p.profileId??'')||!sha.test(p.profileSha256??'')||!g.sourcePins.some(s=>s.path===p.path&&s.sha256===p.sha256))throw Error('work_order_artifact_grant');}
 if(g.allowedStages.some(r=>r.tools.some(t=>['artifact_save','artifact_render'].includes(t))&&(r.kind!=='specialist'||g.directionGate.phase==='direction')))throw Error('work_order_artifact_grant');
 if(new Set(g.allowedStages.map(r=>r.kind+':'+r.roleId)).size!==g.allowedStages.length)throw Error('authority_stage_duplicate');
}
function validatePlanEvidence(evidence,policy){
 exact(evidence,'plan,concurrency');const plan=evidence.plan;
 if(!plan||!Array.isArray(plan.tasks)||!plan.tasks.length||plan.tasks.length>policy.maxTasks||!Number.isSafeInteger(evidence.concurrency)||evidence.concurrency<1||evidence.concurrency>policy.maxConcurrency)throw Error('work_order_plan');
 const ids=new Set();
 for(const t of plan.tasks){exact(t,'id,roleId,assignment,dependsOn');if(typeof t.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(t.id)||ids.has(t.id)||!policy.allowedRoleIds.includes(t.roleId)||typeof t.assignment!=='string'||!t.assignment.trim()||t.assignment.length>3000||!Array.isArray(t.dependsOn)||new Set(t.dependsOn).size!==t.dependsOn.length||t.dependsOn.some(id=>typeof id!=='string'))throw Error('work_order_plan');ids.add(t.id);}
 const done=new Set();while(done.size<ids.size){const ready=plan.tasks.filter(t=>!done.has(t.id)&&t.dependsOn.every(id=>ids.has(id)&&done.has(id)));if(!ready.length)throw Error('work_order_plan');for(const t of ready)done.add(t.id);}
 if(plan.parallelism!==undefined&&(!Number.isSafeInteger(plan.parallelism)||plan.parallelism!==evidence.concurrency||plan.parallelism>plan.tasks.length))throw Error('work_order_plan');
 return boundedSha256(plan);
}
function completeStage(stage,roleId,evidence){
 if(typeof stage!=='string')return false;
 if(['planning','synthesis','coo-release','qa'].includes(stage))return true;
 const specialist=/^specialist:([a-z0-9-]{1,40})$/.exec(stage);
 if(specialist)return !!evidence?.plan.tasks.some(t=>t.id===specialist[1]&&t.roleId===roleId);
 return /^(department-parts-qa|department|department-qa):[a-z0-9][-a-z0-9]{0,63}$/.test(stage);
}
function intentSha256(a,job){return boundedSha256({...(a.recoveryAuthorizationSha256?{recoveryAuthorizationSha256:a.recoveryAuthorizationSha256}:{}),...(a.artifactGrant?{artifactGrant:a.artifactGrant}:{}),authorityId:a.authorityId,jobId:a.jobId,stage:a.stage,issueId:a.issueId,companyId:a.companyId,agentId:a.agentId,roleId:a.roleId,adapterType:a.adapterType,model:a.model,tools:a.tools,methodsSha256:a.methodsSha256,workspace:a.workspace,planSha256:a.planSha256,planConcurrency:a.planSha256===null?null:job.planEvidence?.concurrency,requestSha256:job.requestSha256,contextRevision:job.contextRevision});}

/** Goal-private immutable registry plus a bounded atomic journal; never issues authority. */
export function createBoundedOfficeAuthority(binding,{now=Date.now}={}){
 const {privateDirectory,...config}=binding;validateGoalV2Binding(config,privateDirectory);const root=dirname(binding.authorityPath),journalPath=join(root,'work-order-journal.json'),initializationPath=join(root,'work-order-initialization.json'),lockPath=join(root,'work-order-journal.lock');
 async function readRegistry(){
  const raw=(await bytes(binding.authorityPath,true,1024*1024,'authority_registry')).toString('utf8');if(boundedSha256(raw)!==binding.authoritySha256)throw Error('authority_registry_changed');
  const registry=JSON.parse(raw);exact(registry,'version,goalId,grants');if(registry.version!==1||registry.goalId!==binding.goalId||!Array.isArray(registry.grants)||registry.grants.length>100)throw Error('authority_registry');registry.grants.forEach(grantShape);
  if(new Set(registry.grants.map(g=>g.authorityId)).size!==registry.grants.length)throw Error('authority_duplicate');
  return registry;
 }
 async function inspectArtifactGrant(g,tools,actual){
  if(!tools?.some(t=>t.startsWith('artifact_'))){if(actual!=null)throw Error('work_order_artifact_grant');return null;}
  const selected=g.artifactProfile;if(!selected)throw Error('work_order_artifact_grant');
  const expected={profileId:selected.profileId,profileSha256:selected.profileSha256,clientId:g.scope.clientId,workOrderId:g.workOrderId};
  if(boundedCanonical(actual)!==boundedCanonical(expected))throw Error('work_order_artifact_grant');
  const raw=await bytes(selected.path,false,1024*1024,'source_pin');if(boundedSha256(raw.toString('utf8'))!==selected.sha256)throw Error('work_order_artifact_source');
  let profile;try{profile=validateClientArtifactProfile(JSON.parse(raw));}catch{throw Error('work_order_artifact_source');}
  if(profile.id!==expected.profileId||clientProfileHash(profile)!==expected.profileSha256||profile.clientId!==expected.clientId||profile.workOrderId!==expected.workOrderId||profile.files.some(f=>!g.sourcePins.some(p=>p.path===join(profile.root,f.path)&&p.sha256===f.sha256)))throw Error('work_order_artifact_source');
  return expected;
 }
 async function inspect(meta){
  const registry=await readRegistry();
  const task=meta?.task,context=meta?.context;if(!task||!uuid.test(task.id??'')||task.kind==='conversation'||!context||!sha.test(context.revision??''))throw Error('trusted_task_context_required');
  const requestSha256=boundedRequestSha256(task),matches=registry.grants.filter(g=>g.companyId===meta.companyId&&g.requestSha256===requestSha256&&g.contextRevision===context.revision&&g.scope.clientId===(context.scope?.clientId??null)&&(g.scope.kind==='client'?context.scope?.kind==='client':context.scope?.kind!=='client'));
  if(matches.length!==1)throw Error('work_order_missing_or_ambiguous');const grant=matches[0];if(now()<Date.parse(grant.notBefore)||now()>=Date.parse(grant.expiresAt))throw Error('work_order_expired');
  const sourcePins=(context.foundation?.sources??[]).map(p=>({path:p.path,sha256:p.sha256}));if(boundedCanonical(sourcePins)!==boundedCanonical(grant.sourcePins))throw Error('work_order_sources');
  for(const p of [grant.ownerAuthorizationRef,...grant.sourcePins,...grant.methodPins,grant.directionGate.directionApproval,grant.directionGate.sampleApproval].filter(Boolean))await pin(p);
  if(meta.stage){
   const kind=meta.stage.split(':')[0],rule=grant.allowedStages.find(r=>r.kind===kind&&r.roleId===meta.roleId);
   if(!rule||rule.agentId!==meta.agentId||rule.adapterType!==meta.adapterType||rule.model!==meta.model||meta.billing!=='subscription_only'||!uuid.test(meta.issueId??'')||typeof meta.companyId!=='string'||!meta.companyId||boundedSha256(meta.methods??[])!==rule.methodsSha256||!Array.isArray(meta.tools)||meta.tools.some(t=>!rule.tools.includes(t)))throw Error('work_order_stage_identity');
   const artifactGrant=await inspectArtifactGrant(grant,meta.tools,meta.artifactGrant);
   if(meta.runId!==undefined){const j=await journal(),a=j.attempts.find(a=>a.id===meta.reservationId);if(!a||a.state!=='acknowledged'||a.runId!==meta.runId||a.jobId!==task.id||a.issueId!==meta.issueId||a.agentId!==meta.agentId||a.stage!==meta.stage||boundedCanonical(a.tools)!==boundedCanonical(meta.tools)||boundedCanonical(a.artifactGrant??null)!==boundedCanonical(artifactGrant))throw Error('work_order_artifact_run');}
   for(const method of meta.methods??[]){
    if(!slug.test(method.id??'')||typeof meta.methodRoot!=='string')throw Error('work_order_method_paths');
    for(const file of new Set(['SKILL.md',method.contextPath??'SKILL.md',...(method.references??[])])){
     if(typeof file!=='string'||file.includes('..')||!/^[-A-Za-z0-9/_]+\.md$/.test(file)||!grant.methodPins.some(p=>p.path===join(meta.methodRoot,method.id,file)&& (file!=='SKILL.md'||p.sha256===method.sha256)))throw Error('work_order_method_paths');
    }
   }
   const planEvidence=kind==='planning'?null:{plan:JSON.parse(boundedCanonical(meta.plan??null)),concurrency:meta.concurrency};
   const planSha256=planEvidence?validatePlanEvidence(planEvidence,grant.planPolicy):null;
   if(!completeStage(meta.stage,meta.roleId,planEvidence))throw Error(kind==='specialist'?'work_order_specialist':'work_order_stage_identity');
   return {grant,requestSha256,rule,planSha256,planEvidence,artifactGrant};
  }
  return {grant,requestSha256};
 }
 const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 async function initialization(registry){
  let value;try{value=JSON.parse((await bytes(initializationPath,true,8192,'authority_initialization')).toString('utf8'));}catch(e){if(e.code==='ENOENT')throw Error('authority_initialization_missing');throw e;}
  exact(value,'version,goalId,authoritySha256,journalId,ownerInitializationRef,createdAt');
  if(value.version!==1||value.goalId!==binding.goalId||value.authoritySha256!==binding.authoritySha256||!uuid.test(value.journalId)||!timestamp(value.createdAt)||!registry.grants.some(g=>boundedCanonical(g.ownerAuthorizationRef)===boundedCanonical(value.ownerInitializationRef)))throw Error('authority_initialization_invalid');
  await pin(value.ownerInitializationRef);return value;
 }
 async function validateJournal(j,registry,init){
  exact(j,'version,goalId,authoritySha256,journalId,jobs,attempts,integrity');const {integrity,...body}=j;
  if(j.version!==2||j.goalId!==binding.goalId||j.authoritySha256!==binding.authoritySha256||j.journalId!==init.journalId||!j.jobs||Array.isArray(j.jobs)||typeof j.jobs!=='object'||!Array.isArray(j.attempts)||!sha.test(integrity)||boundedSha256(body)!==integrity)throw Error('authority_journal_invalid');
  const grants=new Map(registry.grants.map(g=>[g.authorityId,g])),ids=new Set(),issues=new Set(),runs=new Set();
  for(const [id,job] of Object.entries(j.jobs)){
   exact(job,'authorityId,requestSha256,contextRevision,createdAt,planSha256,planEvidence,attemptIds');const g=grants.get(job.authorityId);
   if(!uuid.test(id)||!g||job.requestSha256!==g.requestSha256||job.contextRevision!==g.contextRevision||!timestamp(job.createdAt)||job.planSha256!==null&&!sha.test(job.planSha256)||!Array.isArray(job.attemptIds)||job.attemptIds.some(id=>!uuid.test(id))||new Set(job.attemptIds).size!==job.attemptIds.length)throw Error('authority_journal_relationship');
   try{if(job.planSha256===null?job.planEvidence!==null:validatePlanEvidence(job.planEvidence,g.planPolicy)!==job.planSha256)throw Error('authority_journal_relationship');}catch{throw Error('authority_journal_relationship');}
  }
  const states=new Set(['reserved','acknowledged','unknown','terminal','cancelled_before_dispatch']),transitions={reserved:['acknowledged','unknown','cancelled_before_dispatch'],acknowledged:['unknown','terminal'],unknown:[],terminal:[],cancelled_before_dispatch:[]};
  for(const a of j.attempts){
   exact(a,'id,authorityId,jobId,stage,issueId,companyId,agentId,roleId,adapterType,model,tools,methodsSha256,workspace,planSha256,state,reservedAt,runId,events'+(a.artifactGrant!==undefined?',artifactGrant':'')+(a.recoveryAuthorizationSha256!==undefined?',recoveryAuthorizationSha256':'')+(a.state==='terminal'?',nativeStatus,finishedAt':''));
   const g=grants.get(a.authorityId),job=j.jobs[a.jobId],kind=typeof a.stage==='string'?a.stage.split(':')[0]:null,rule=g?.allowedStages.find(r=>r.kind===kind&&r.roleId===a.roleId);
   if(!uuid.test(a.id)||ids.has(a.id)||!job||job.authorityId!==a.authorityId||!job.attemptIds.includes(a.id)||!g||!rule||a.companyId!==g.companyId||a.agentId!==rule.agentId||a.adapterType!==rule.adapterType||a.model!==rule.model||a.methodsSha256!==rule.methodsSha256||!uuid.test(a.issueId)||issues.has(a.issueId)||!Array.isArray(a.tools)||new Set(a.tools).size!==a.tools.length||a.tools.some(t=>!rule.tools.includes(t))||!states.has(a.state)||!timestamp(a.reservedAt))throw Error('authority_journal_relationship');
   const expectedArtifact=g.artifactProfile?{profileId:g.artifactProfile.profileId,profileSha256:g.artifactProfile.profileSha256,clientId:g.scope.clientId,workOrderId:g.workOrderId}:null;
   if(a.tools.some(t=>t.startsWith('artifact_'))?boundedCanonical(a.artifactGrant)!==boundedCanonical(expectedArtifact):a.artifactGrant!==undefined)throw Error('authority_journal_relationship');
   if(a.runId!==null&&(!uuid.test(a.runId)||runs.has(a.runId))||['reserved','cancelled_before_dispatch'].includes(a.state)&&a.runId!==null||['acknowledged','terminal'].includes(a.state)&&!a.runId)throw Error('authority_journal_relationship');
   if(a.state==='terminal'&&(!['succeeded','failed','cancelled','interrupted','timed_out'].includes(a.nativeStatus)||!timestamp(a.finishedAt)))throw Error('authority_journal_relationship');
   if(!completeStage(a.stage,a.roleId,job.planEvidence)||(kind==='planning'?a.planSha256!==null:!job.planSha256||a.planSha256!==job.planSha256))throw Error('authority_journal_relationship');
   if(a.workspace!==null){exact(a.workspace,'relativeRoot,manifestSha256,files');if(typeof a.workspace.relativeRoot!=='string'||a.workspace.relativeRoot.startsWith('/')||a.workspace.relativeRoot.includes('..')||!sha.test(a.workspace.manifestSha256)||!Number.isSafeInteger(a.workspace.files)||a.workspace.files<0)throw Error('authority_journal_relationship');}
   if(!Array.isArray(a.events)||!a.events.length||a.events.length>5)throw Error('authority_journal_events');
   let prior=null,priorTime=-Infinity,priorRun=null;
   for(const [index,event] of a.events.entries()){
    exact(event,index?'state,at,runId,intentSha256':'state,at,intentSha256');
    if(event.intentSha256!==intentSha256(a,job))throw Error('authority_journal_relationship');
    if(!states.has(event.state)||!timestamp(event.at)||Date.parse(event.at)<priorTime||(!index?(event.state!=='reserved'||event.at!==a.reservedAt):!transitions[prior].includes(event.state)))throw Error('authority_journal_events');
    if(index&&(event.runId!==null&&!uuid.test(event.runId)||priorRun&&event.runId!==priorRun||event.state==='acknowledged'&&!event.runId||event.state==='cancelled_before_dispatch'&&event.runId!==null))throw Error('authority_journal_events');
    prior=event.state;priorTime=Date.parse(event.at);if(index)priorRun=event.runId;
   }
   if(prior!==a.state||priorRun!==a.runId||a.state==='terminal'&&a.finishedAt!==a.events.at(-1).at)throw Error('authority_journal_events');
   ids.add(a.id);issues.add(a.issueId);if(a.runId)runs.add(a.runId);
  }
  if(Object.values(j.jobs).reduce((n,job)=>n+job.attemptIds.length,0)!==j.attempts.length||Object.values(j.jobs).some(job=>job.attemptIds.some(id=>!ids.has(id))))throw Error('authority_journal_relationship');
  for(const g of registry.grants){const attempts=j.attempts.filter(a=>a.authorityId===g.authorityId);if(Object.values(j.jobs).filter(job=>job.authorityId===g.authorityId).length>g.maxJobs||attempts.length>g.maxDispatchAttempts||attempts.filter(a=>a.state==='acknowledged').length>g.maxConcurrentRuns)throw Error('authority_journal_cap');for(const a of attempts){const rule=g.allowedStages.find(r=>r.kind===a.stage.split(':')[0]&&r.roleId===a.roleId);const same=attempts.filter(other=>other.jobId===a.jobId&&other.stage===a.stage);if(same.length>rule.maxAttempts||a.recoveryAuthorizationSha256!==undefined){const extra=await specialistRecovery(j,g,a.jobId,a.stage);if(same.length>2||!extra||same[0].recoveryAuthorizationSha256!==undefined||same.slice(1).some(x=>x.recoveryAuthorizationSha256!==extra.sha256))throw Error('authority_journal_cap');}}}
  return j;
 }
 async function specialistRecovery(j,g,jobId,stage){
  if(!uuid.test(jobId)||!/^specialist:[a-z0-9-]{1,40}$/.test(stage))throw Error('work_order_attempt_cap');
  const raw=(await bytes(join(root,'specialist-recovery-'+jobId+'.json'),true,32768,'authority_registry')).toString('utf8'),a=JSON.parse(raw);
  exact(a,'version,kind,goalId,authoritySha256,journalId,jobId,stage,failedAttemptId,failedRunId,expectedUpdatedAt,expiresAt,coordinatorAuthorizationRef,implementationRefs');
  const prior=j.attempts.filter(x=>x.jobId===jobId&&x.stage===stage),first=prior[0],job=j.jobs[jobId],rule=g.allowedStages.find(r=>r.kind==='specialist'&&r.roleId===first?.roleId);
  if(a.version!==1||a.kind!=='orchestrator_internal_stage_allocation'||a.goalId!==binding.goalId||a.authoritySha256!==binding.authoritySha256||a.journalId!==j.journalId||a.jobId!==jobId||a.stage!==stage||a.failedAttemptId!==first?.id||a.failedRunId!==first?.runId||first?.state!=='terminal'||first.nativeStatus!=='failed'||first.authorityId!==g.authorityId||job?.authorityId!==g.authorityId||rule?.maxAttempts!==1||g.maxJobs!==1||g.maxDispatchAttempts!==8||g.maxConcurrentRuns!==1||a.expiresAt!==g.expiresAt||!timestamp(a.expectedUpdatedAt)||!Array.isArray(a.implementationRefs)||a.implementationRefs.length!==2)throw Error('work_order_attempt_cap');
  await pin(a.coordinatorAuthorizationRef);
  const allocationRaw=(await bytes(a.coordinatorAuthorizationRef.path,false,32768,'source_pin')).toString('utf8');if(boundedSha256(allocationRaw)!==a.coordinatorAuthorizationRef.sha256)throw Error('authority_pin_changed');const allocation=JSON.parse(allocationRaw);
  if(allocation.version!==1||allocation.assignedBy!=='00 Orchestrator'||allocation.goalId!==a.goalId||allocation.jobId!==a.jobId||allocation.stage!==a.stage||allocation.failedRunId!==a.failedRunId||allocation.authoritySha256!==a.authoritySha256||allocation.journalId!==a.journalId||allocation.additionalStageAttempts!==1||allocation.globalMaxAttemptsUnchanged!==8||allocation.maxJobsUnchanged!==1||allocation.maxConcurrentRunsUnchanged!==1||allocation.expiresAtUnchanged!==a.expiresAt)throw Error('work_order_attempt_cap');
  for(const ref of a.implementationRefs)await pin(ref);
  if(!a.implementationRefs.some(r=>r.path.endsWith('/scripts/lib/office-team-engine.mjs'))||!a.implementationRefs.some(r=>r.path.endsWith('/scripts/lib/office-specialist-response.mjs')))throw Error('work_order_attempt_cap');
  return {...a,sha256:boundedSha256(raw)};
 }
 async function journal(){
  try{const registry=await readRegistry(),init=await initialization(registry),j=JSON.parse((await bytes(journalPath,true,32*1024*1024,'authority_journal')).toString('utf8'));return validateJournal(j,registry,init);}
  catch(e){if(e.code==='ENOENT')throw Error('authority_journal_missing');if(e instanceof SyntaxError)throw Error('authority_journal_invalid');e.validationPhase??='journal_validation';throw e;}
 }
 async function save(value,{fresh=false}={}){
  const {integrity:_old,...body}=value;void _old;value.integrity=boundedSha256(body);await validateJournal(value,await readRegistry(),await initialization(await readRegistry()));
  const temp=journalPath+'.'+randomUUID()+'.tmp',text=JSON.stringify(value)+'\n';
  try{const f=await open(fresh?journalPath:temp,'wx',0o600);try{await f.writeFile(text);await f.sync();}finally{await f.close();}if(!fresh)await rename(temp,journalPath);const d=await open(root,'r');try{await d.sync();}finally{await d.close();}if((await bytes(journalPath,true,32*1024*1024,'authority_journal')).toString('utf8')!==text)throw Error('authority_journal_readback');}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 async function mutation(fn){await directory(root,true);const lock=await open(lockPath,'wx',0o600);try{const j=await journal(),result=await fn(j);await save(j);return result;}finally{await lock.close();await unlink(lockPath);}}
 async function initialize(ownerInitializationRef){
  await directory(root,true);const lock=await open(lockPath,'wx',0o600);
  try{
   const registry=await readRegistry();await pin(ownerInitializationRef);if(!registry.grants.some(g=>boundedCanonical(g.ownerAuthorizationRef)===boundedCanonical(ownerInitializationRef)))throw Error('authority_initialization_invalid');
   for(const path of [initializationPath,journalPath]){try{await lstat(path);throw Error('authority_already_initialized');}catch(e){if(e.code!=='ENOENT')throw e;}}
   const marker={version:1,goalId:binding.goalId,authoritySha256:binding.authoritySha256,journalId:randomUUID(),ownerInitializationRef,createdAt:new Date(now()).toISOString()},f=await open(initializationPath,'wx',0o600);
   try{await f.writeFile(JSON.stringify(marker)+'\n');await f.sync();}finally{await f.close();}
   await save({version:2,goalId:binding.goalId,authoritySha256:binding.authoritySha256,journalId:marker.journalId,jobs:{},attempts:[]},{fresh:true});return Object.freeze({journalId:marker.journalId,authoritySha256:binding.authoritySha256});
  }finally{await lock.close();await unlink(lockPath);}
 }
 function boundJob(j,meta,evidence){const saved=j.jobs[meta.task.id];if(!saved||saved.authorityId!==evidence.grant.authorityId||saved.requestSha256!==evidence.requestSha256||saved.contextRevision!==meta.context.revision)throw Error('work_order_job_binding');return saved;}
 const receipt=(g,id)=>({version:1,goalId:binding.goalId,workOrderId:g.workOrderId,authorityId:g.authorityId,authoritySha256:binding.authoritySha256,...(id?{reservationId:id}:{}),directionPhase:g.directionGate.phase,publication:'owner_exact_version_required',...(g.artifactProfile?{artifactGrant:{profileId:g.artifactProfile.profileId,profileSha256:g.artifactProfile.profileSha256,clientId:g.scope.clientId,workOrderId:g.workOrderId}}:{})});
 return Object.freeze({
  inspect,initialize,
  specialistRecovery:async(jobId,stage)=>{const j=await journal(),g=(await readRegistry()).grants.find(g=>g.authorityId===j.jobs[jobId]?.authorityId);if(!g||now()>=Date.parse(g.expiresAt))throw Error('work_order_expired');return specialistRecovery(j,g,jobId,stage);},
  admit:async(meta,{existing=false}={})=>mutation(async j=>{const e=await inspect(meta),g=e.grant;if(j.attempts.some(a=>['unknown','reserved'].includes(a.state)))throw Error('work_order_unknown_dispatch');const prior=j.jobs[meta.task.id];if(prior){boundJob(j,meta,e);return receipt(g);}if(existing)throw Error('work_order_job_binding');if(Object.values(j.jobs).filter(x=>x.authorityId===g.authorityId).length>=g.maxJobs)throw Error('work_order_job_cap');j.jobs[meta.task.id]={authorityId:g.authorityId,requestSha256:e.requestSha256,contextRevision:meta.context.revision,createdAt:new Date(now()).toISOString(),planSha256:null,planEvidence:null,attemptIds:[]};return receipt(g);}),
  reserve:async meta=>{
   const reserved=await mutation(async j=>{
    const e=await inspect(meta),g=e.grant,job=boundJob(j,meta,e),attempts=j.attempts.filter(a=>a.authorityId===g.authorityId);
    if(j.attempts.some(a=>['unknown','reserved'].includes(a.state)))throw Error('work_order_unknown_dispatch');
    if(attempts.length>=g.maxDispatchAttempts)throw Error('work_order_attempt_cap');
    const same=attempts.filter(a=>a.jobId===meta.task.id&&a.stage===meta.stage);let recovery=null;
    if(same.length>=e.rule.maxAttempts){if(same.length!==1)throw Error('work_order_attempt_cap');recovery=await specialistRecovery(j,g,meta.task.id,meta.stage);}
    if(attempts.filter(a=>a.state==='acknowledged').length>=g.maxConcurrentRuns)throw Error('work_order_concurrency');
    if(j.attempts.some(a=>a.issueId===meta.issueId))throw Error('work_order_issue_replayed');
    if(e.planSha256){if(job.planSha256&&(job.planSha256!==e.planSha256||boundedCanonical(job.planEvidence)!==boundedCanonical(e.planEvidence)))throw Error('work_order_plan_changed');job.planSha256=e.planSha256;job.planEvidence=e.planEvidence;}
    const at=new Date(now()).toISOString(),item={...(recovery?{recoveryAuthorizationSha256:recovery.sha256}:{}),id:randomUUID(),authorityId:g.authorityId,jobId:meta.task.id,stage:meta.stage,issueId:meta.issueId,companyId:meta.companyId,agentId:meta.agentId,roleId:meta.roleId,adapterType:meta.adapterType,model:meta.model,tools:meta.tools,methodsSha256:boundedSha256(meta.methods??[]),workspace:meta.workspace??null,planSha256:e.planSha256,...(e.artifactGrant?{artifactGrant:e.artifactGrant}:{}),state:'reserved',reservedAt:at,runId:null,events:[]};item.events.push({state:'reserved',at,intentSha256:intentSha256(item,job)});j.attempts.push(item);job.attemptIds.push(item.id);return{item,receipt:receipt(g,item.id)};
   });
   const update=fn=>mutation(async j=>{const a=j.attempts.find(a=>a.id===reserved.item.id);if(!a)throw Error('work_order_reservation_missing');const prior=a.state,result=fn(a);if(a.state!==prior)a.events.push({state:a.state,at:a.state==='terminal'?a.finishedAt:new Date(now()).toISOString(),runId:a.runId,intentSha256:a.events[0].intentSha256});return result;});
   return Object.freeze({receipt:reserved.receipt,
    recheck:async()=>{await inspect(meta);const j=await journal(),e=await inspect(meta),job=boundJob(j,meta,e),a=j.attempts.find(a=>a.id===reserved.item.id);if(a?.state!=='reserved'||a.stage!==meta.stage||a.planSha256!==e.planSha256||e.planSha256&&(job.planSha256!==e.planSha256||boundedCanonical(job.planEvidence)!==boundedCanonical(e.planEvidence))||j.attempts.some(other=>other.id!==a.id&&['reserved','unknown'].includes(other.state)))throw Error('work_order_reservation_changed');const current={...a,...(e.artifactGrant?{artifactGrant:e.artifactGrant}:{}),stage:meta.stage,issueId:meta.issueId,companyId:meta.companyId,agentId:meta.agentId,roleId:meta.roleId,adapterType:meta.adapterType,model:meta.model,tools:meta.tools,methodsSha256:boundedSha256(meta.methods??[]),workspace:meta.workspace??null,planSha256:e.planSha256};if(intentSha256(current,job)!==a.events[0].intentSha256)throw Error('work_order_reservation_changed');},
    acknowledge:async runId=>update(a=>{if(!uuid.test(runId??'')||!['reserved','acknowledged'].includes(a.state)||a.runId&&a.runId!==runId)throw Error('work_order_ack');a.runId=runId;a.state='acknowledged';}),
    unknown:async()=>update(a=>{if(a.state!=='terminal'&&a.state!=='cancelled_before_dispatch')a.state='unknown';}),
    cancelBeforeDispatch:async()=>update(a=>{if(a.state!=='reserved'||a.runId)throw Error('work_order_already_dispatched');a.state='cancelled_before_dispatch';}),
    settle:async run=>update(a=>{if(a.state!=='acknowledged'||run.id!==a.runId||run.agentId!==a.agentId||run.companyId!==a.companyId||run.contextSnapshot?.issueId!==a.issueId||!['succeeded','failed','cancelled','interrupted','timed_out'].includes(run.status)||run.scheduledRetryAt||run.usageJson?.billingType!=='subscription_included')throw Error('work_order_terminal_unverified');a.state='terminal';a.nativeStatus=run.status;a.finishedAt=new Date(now()).toISOString();}),
   });
  },
 });
}

/** Explicit local operator commands only. Never installs authority or launches a model. */
import {readFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {loadOfficeCooCapture} from './start-office-coo-capture.mjs';
import {readJob,jobDirectory,listJobs,activeStates,prepareDepartmentRevision,paperclipClient} from './lib/office-team-engine.mjs';
import {createOfficeCooNativeAdmission} from './lib/office-coo-native-admission.mjs';
import {readReactivePrivateJson,readReactivePrivateBytes,sha} from './lib/office-coo-reactive-grant.mjs';
import {readOfficeCooRepairAuthority,assertOfficeCooKnownRepairFailure,claimOfficeCooOperatorRepair,officeCooRepairPreparedName,writeOfficeCooRepairOnce,assertOfficeCooPreparedRepair} from './lib/office-coo-native-repair.mjs';
import {createOfficeCooOperatorCompletion} from './lib/office-coo-operator-completion.mjs';
import {modelRunOutput} from './lib/office-review-schema.mjs';
const privateDirectory=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel');
/** Test overrides are trusted construction dependencies, never JSON/HTTP/CLI options. */
export async function prepareOfficeCooOperatorRepair({directory=privateDirectory,config,jobId,jobs=jobDirectory,api=paperclipClient(),now=()=>new Date().toISOString()}={}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(jobId??''))throw Error('Exact owner task ID required.');
 const native=readReactivePrivateJson(directory,'reactive-native-grant.json',262144),request=native.request,raw=await readFile(join(jobs,jobId+'.json')),job=await readJob(jobId,jobs),grant=readOfficeCooRepairAuthority({directory,config,request,nativeGrant:native,at:Date.parse(now())});
 if(!grant||request?.jobId!==jobId)throw Error('Private exact repair authority required.');
 assertOfficeCooKnownRepairFailure(job,grant,raw);
 await createOfficeCooNativeAdmission({directory,config,request,now:()=>Date.parse(now()),readJob:id=>readJob(id,jobs)}).assertJob(job);
 if((await listJobs(jobs,{kind:'all',limit:Number.MAX_SAFE_INTEGER})).some(j=>activeStates.includes(j.status)||j.status==='recovery_required'))throw Error('Reconcile active or uncertain work before operator repair.');
 const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8'));
 for(const call of job.calls){const run=await api('/heartbeat-runs/'+call.runId),structured=call.stage==='qa'||call.stage==='coo-release'||call.stage.startsWith('department-qa:')||call.stage.startsWith('department-parts-qa:')||call.stage.startsWith('specialist:')&&job.specialistResponseVersion===1;if(run.id!==call.runId||run.agentId!==call.agentId||run.companyId!==plan.paperclipCompanyId||run.contextSnapshot?.issueId!==call.issueId||run.status!=='succeeded'||run.scheduledRetryAt||run.usageJson?.billingType!=='subscription_included'||modelRunOutput(run,{structured})!==call.returnedOutput)throw Error('Known terminal native receipts are required; no uncertain replay.');}
 // Consumed BEFORE the first job mutation, including an unacknowledged preparation.
 await claimOfficeCooOperatorRepair(directory,grant,now());
 const snapshot=await open(join(directory,'operator-repair-failure.'+jobId+'.json'),'wx',0o600);try{await snapshot.writeFile(raw);await snapshot.sync();}finally{await snapshot.close();}
 const snapshotDirectory=await open(directory,'r');try{await snapshotDirectory.sync();}finally{await snapshotDirectory.close();}
 if(sha(readReactivePrivateBytes(directory,'operator-repair-failure.'+jobId+'.json',16*1024*1024))!==grant.failure.jobSha256)throw Error('Original failure snapshot readback differs.');
 const corrected=await prepareDepartmentRevision(jobId,{departmentId:grant.failure.departmentId,expectedUpdatedAt:grant.failure.updatedAt,note:grant.correction.note,corrections:[{partId:grant.correction.partId,expectedOutputSha256:grant.correction.sourceArtifactSha256,replacements:[{from:grant.correction.from,to:grant.correction.to}]}]},jobs);
 const body={version:1,jobId,operatorGrantRevision:grant.revision,repairRevision:grant.repairRevision,preparedUpdatedAt:corrected.updatedAt,revisionAttempt:corrected.revisionAttempt,historyEntrySha256:sha(corrected.revisionHistory.at(-1)),correctedArtifactSha256:sha(corrected.steps.find(s=>s.id===grant.correction.partId).output),originalCallsSha256:sha(corrected.calls),priorStageHeadRevision:grant.failure.stageHeadRevision,priorStageCount:5,at:now()},receipt={...body,revision:sha(body)};
 assertOfficeCooPreparedRepair(corrected,grant,receipt);await writeOfficeCooRepairOnce(directory,officeCooRepairPreparedName(jobId),receipt);
 return {jobId,repairRevision:grant.repairRevision,status:corrected.status,prepared:true,nativeLaunched:false,sent:false};
}
export async function officeCooOperatorRepair(args=process.argv.slice(2)){
 if(args.length!==2||!['--prepare','--send-completion','--status'].includes(args[0])||!/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(args[1]))throw Error('Use --prepare, --send-completion or --status with one exact task ID.');
 const {config}=await loadOfficeCooCapture(privateDirectory),jobId=args[1];
 if(args[0]==='--prepare')return prepareOfficeCooOperatorRepair({config,jobId});
 const plan=JSON.parse(await readFile(new URL('../src/lib/office-stack-plan.json',import.meta.url),'utf8')),driver=createOfficeCooOperatorCompletion({directory:privateDirectory,config,companyId:plan.paperclipCompanyId,jobId});
 return args[0]==='--send-completion'?driver.sendCompletion():driver.status();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)officeCooOperatorRepair().then(result=>console.log(JSON.stringify(result)),()=>{console.error('Operator repair stopped. Preserve claims and inspect exact saved evidence; no automatic model or send retry.');process.exitCode=1;});

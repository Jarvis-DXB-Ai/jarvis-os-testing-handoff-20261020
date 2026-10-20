/** Explicit operator repair of one known terminal QA rejection. Import is pure.
 * Original task/stage credits remain consumed; neither grants nor jobs self-repair. */
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {readReactivePrivateJson,readReactivePrivateBytes,readOfficeCooReactiveGrant,canonical,sha,assertReactivePrivateDirectory} from './office-coo-reactive-grant.mjs';
import {departmentPartsReviewCurrent,departmentReviewCurrent} from './office-department-review.mjs';
import {cooReleaseReviewCurrent} from './office-coo-release-review.mjs';
const fail=()=>{throw Error('Exact operator QA repair requires review.');};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const token=x=>typeof x==='string'&&/^[a-z0-9-]{1,80}$/.test(x);
const exact=(o,keys)=>{if(!o||Array.isArray(o)||Object.keys(o).sort().join(',')!==[...keys].sort().join(','))fail();};
export const officeCooRepairGrantName=id=>{if(!uuid(id))fail();return 'operator-repair-grant.'+id+'.json';};
export const officeCooRepairClaimName=id=>'operator-repair-claim.'+id+'.json';
export const officeCooRepairPreparedName=id=>'operator-repair-prepared.'+id+'.json';
export const officeCooRepairRevision=g=>{const body={...g};delete body.revision;delete body.repairRevision;return sha(body);};
export const officeCooRepairAuthorityRevision=g=>{const body={...g};delete body.revision;return sha(body);};
export const officeCooRepairStages=department=>['department-parts-qa:'+department,'department:'+department,'department-qa:'+department,'coo-release','qa'];
function grantSchema(g,request,native,reply,at){
 exact(g,['version','enabled','purpose','authority','jobId','requestSha256','nativeGrantRevision','nativeGrantSha256','taskClaimSha256','replyGrantRevision','policySha256','issuedAt','expiresAt','failure','correction','allowedStages','maxAdditionalStages','repairRevision','revision']);
 exact(g.authority,['kind','principal','reference']);
 const {revision:nativeRevision,...nativeBody}=native;
 if(g.version!==1||g.enabled!==true||g.purpose!=='exact-known-qa-operator-repair'||g.authority.kind!=='owner-instruction'||g.authority.principal!==reply.principal||typeof g.authority.reference!=='string'||!g.authority.reference.trim()||g.jobId!==request.jobId||g.requestSha256!==request.requestSha256||native.version!==1||native.enabled!==true||native.purpose!=='exact-owner-whatsapp-native-task'||sha(nativeBody)!==nativeRevision||native.authority?.principal!==reply.principal||Date.parse(native.expiresAt)<=at||!Number.isFinite(Date.parse(native.expiresAt))||canonical(native.request)!==canonical(request)||native.revision!==g.nativeGrantRevision||native.replyGrantRevision!==reply.revision||g.replyGrantRevision!==reply.revision||native.policySha256!==g.policySha256||g.policySha256!==reply.policySha256||request.policySha256!==g.policySha256||!digest(g.repairRevision)||officeCooRepairRevision(g)!==g.repairRevision||officeCooRepairAuthorityRevision(g)!==g.revision||![g.issuedAt,g.expiresAt].every(s=>typeof s==='string'&&Number.isFinite(Date.parse(s)))||Date.parse(g.issuedAt)>at||Date.parse(g.expiresAt)<=at||Date.parse(g.expiresAt)<=Date.parse(g.issuedAt)||Date.parse(g.expiresAt)-Date.parse(g.issuedAt)>3600000||Date.parse(g.expiresAt)>Date.parse(native.expiresAt)||Date.parse(g.expiresAt)>Date.parse(reply.expiresAt))fail();
 const f=g.failure,c=g.correction;
 exact(f,['jobSha256','updatedAt','departmentId','qaRunId','qaRawSha256','callsSha256','priorStageCount','stagePins','stageHeadRevision','reactiveStateSha256','reactiveRecordSha256','priorFailure']);
 exact(c,['partId','sourceArtifactSha256','sourceAssignmentSha256','from','to','correctedArtifactSha256','note']);
 exact(f.priorFailure,['requestId','requestHash','bodySha256','providerMessageId','conversationId','platformConversationId','outboxStableSha256','observationsPrefixSha256','observationsPrefixLength']);
 if(!token(f.departmentId)||!token(c.partId)||!uuid(f.qaRunId)||![f.jobSha256,f.qaRawSha256,f.callsSha256,f.stageHeadRevision,f.reactiveStateSha256,f.reactiveRecordSha256,g.nativeGrantSha256,g.taskClaimSha256,c.sourceArtifactSha256,c.sourceAssignmentSha256,c.correctedArtifactSha256,f.priorFailure.requestHash,f.priorFailure.bodySha256,f.priorFailure.outboxStableSha256,f.priorFailure.observationsPrefixSha256].every(digest)||!Number.isSafeInteger(f.priorFailure.observationsPrefixLength)||f.priorFailure.observationsPrefixLength<1||!Number.isFinite(Date.parse(f.updatedAt))||f.priorStageCount!==5||!Array.isArray(f.stagePins)||f.stagePins.length!==5||g.maxAdditionalStages!==5||native.maxStages<10||!Array.isArray(g.allowedStages)||canonical(g.allowedStages)!==canonical(officeCooRepairStages(f.departmentId))||c.from!==', and independent-QA outcome'||c.to!==''||typeof c.note!=='string'||!c.note.trim()||c.note.length>3000||!f.priorFailure.requestId.startsWith('reactive-')||typeof f.priorFailure.providerMessageId!=='string'||!f.priorFailure.providerMessageId)fail();
 return g;
}
/** Revocation/replacement, changed original credits or an unknown preparation deny. */
export function readOfficeCooRepairAuthority({directory,config,request,nativeGrant,at=Date.now()}){
 let g;try{g=readReactivePrivateJson(directory,officeCooRepairGrantName(request.jobId),65536);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const binding={...config.binding,senderPhone:config.binding.senderPhone.replace(/^\+/,''),ownerParticipantId:config.binding.ownerParticipantId.replace(/^\+/,'')};
 const reply=readOfficeCooReactiveGrant({runtimeDirectory:directory,binding},new Date(at).toISOString()).grant;
 grantSchema(g,request,nativeGrant,reply,at);
 if(sha(readReactivePrivateBytes(directory,'reactive-native-grant.json',262144))!==g.nativeGrantSha256||sha(readReactivePrivateBytes(directory,'coo-native-task.'+request.jobId+'.json'))!==g.taskClaimSha256||sha(readReactivePrivateBytes(directory,'coo-reactive-state.json',16*1024*1024))!==g.failure.reactiveStateSha256)fail();
 const record=readReactivePrivateJson(directory,'coo-reactive-state.json',16*1024*1024).records?.[request.jobId];
 if(record?.phase!=='replied'||sha(record)!==g.failure.reactiveRecordSha256||record.request.requestSha256!==request.requestSha256||record.replyIntent.taskStatus!=='failed')fail();
 let previous=null;
 for(const [i,pin]of g.failure.stagePins.entries()){
  exact(pin,['name','sha256','revision']);const name='coo-native-stage.'+request.jobId+'.'+String(i+1).padStart(4,'0')+'.json';
  const raw=readReactivePrivateBytes(directory,name),row=JSON.parse(raw),{revision,...body}=row;
  if(pin.name!==name||sha(raw)!==pin.sha256||pin.revision!==revision||sha(body)!==revision||row.ordinal!==i+1||row.previousRevision!==previous||row.jobId!==request.jobId||row.grantRevision!==nativeGrant.revision||row.requestSha256!==request.requestSha256||Object.hasOwn(row,'repairRevision')||Object.hasOwn(row,'operatorGrantRevision'))fail();previous=revision;
 }
 if(previous!==g.failure.stageHeadRevision)fail();return g;
}
export function assertOfficeCooKnownRepairFailure(job,g,rawJob){
 const report=job.departmentReports?.find(r=>r.departmentId===g.failure.departmentId),part=job.steps?.find(s=>s.id===g.correction.partId);
 if(job.id!==g.jobId||job.status!=='failed'||job.updatedAt!==g.failure.updatedAt||sha(rawJob)!==g.failure.jobSha256||job.calls?.length!==5||sha(job.calls)!==g.failure.callsSha256||job.calls.some(c=>c.status!=='succeeded'||!c.runId)||report?.qa?.result?.pass!==false||report.qa.runId!==g.failure.qaRunId||report.qa.rawSha256!==g.failure.qaRawSha256||sha(report.qa.rawOutput)!==g.failure.qaRawSha256||report.partsQa?.result?.pass!==true||part?.status!=='completed'||sha(part.output)!==g.correction.sourceArtifactSha256||sha(part.assignment)!==g.correction.sourceAssignmentSha256||part.output.split(g.correction.from).length!==2||sha(part.output.replace(g.correction.from,g.correction.to))!==g.correction.correctedArtifactSha256||job.revisionAttempt||job.revisionHistory?.length)fail();
 return true;
}
export function assertOfficeCooPreparedRepair(job,g,prepared){
 const {revision,...body}=prepared??{};
 exact(prepared,['version','jobId','operatorGrantRevision','repairRevision','preparedUpdatedAt','revisionAttempt','historyEntrySha256','correctedArtifactSha256','originalCallsSha256','priorStageHeadRevision','priorStageCount','at','revision']);
 const history=job.revisionHistory?.at(-1),part=job.steps?.find(s=>s.id===g.correction.partId),patch=history?.patches?.[0];
 if(prepared.version!==1||sha(body)!==revision||prepared.jobId!==g.jobId||prepared.operatorGrantRevision!==g.revision||prepared.repairRevision!==g.repairRevision||prepared.revisionAttempt!==1||job.revisionAttempt!==1||job.revisionHistory?.length!==1||sha(history)!==prepared.historyEntrySha256||history.updatedAt!==g.failure.updatedAt||history.departmentId!==g.failure.departmentId||history.qa?.runId!==g.failure.qaRunId||history.qa?.rawSha256!==g.failure.qaRawSha256||history.correction!==g.correction.note||job.revisionNote!==g.correction.note||history.patches?.length!==1||patch.partId!==g.correction.partId||patch.sourceSha256!==g.correction.sourceArtifactSha256||patch.correctedSha256!==g.correction.correctedArtifactSha256||canonical(patch.replacements)!==canonical([{from:g.correction.from,to:g.correction.to}])||sha(part?.output)!==g.correction.correctedArtifactSha256||sha(part?.priorOutput)!==g.correction.sourceArtifactSha256||sha(part?.assignment)!==g.correction.sourceAssignmentSha256||part.requiresRevision===true||part.status!=='completed'||prepared.correctedArtifactSha256!==g.correction.correctedArtifactSha256||prepared.originalCallsSha256!==g.failure.callsSha256||prepared.priorStageHeadRevision!==g.failure.stageHeadRevision||prepared.priorStageCount!==5||job.calls.length<5||job.calls.length>10||sha(job.calls.slice(0,5))!==g.failure.callsSha256)fail();
 if(canonical(part.coordinatorCorrection)!==canonical({sourceSha256:g.correction.sourceArtifactSha256,correctedSha256:g.correction.correctedArtifactSha256,replacements:[{from:g.correction.from,to:g.correction.to}],author:'Jarvis coordinator; independent QA still required'}))fail();
 for(const [i,c]of job.calls.slice(5).entries())if(c.stage!==g.allowedStages[i]||!['dispatching','queued','running','succeeded'].includes(c.status))fail();
 return true;
}
/** Ordered independent gates, not simply five reusable stage names. */
export function assertOfficeCooRepairStage(job,g,context,receiptCount){
 const calls=job.calls.slice(5),index=calls.length-1,call=calls[index],report=job.departmentReports.find(r=>r.departmentId===g.failure.departmentId);
 if(index<0||index>=5||receiptCount!==5+index||context.stage!==g.allowedStages[index]||call.stage!==context.stage||call.agentId!==context.agentId||call.model!==context.model||call.status!=='dispatching'||call.runId!==null||calls.slice(0,-1).some(c=>c.status!=='succeeded'||!c.runId))fail();
 if(index>=1&&(!departmentPartsReviewCurrent(job,report)||report.partsQa.runId!==calls[0].runId))fail();
 if(index>=2&&(report.issueId!==calls[1].issueId||report.output!==calls[1].returnedOutput))fail();
 if(index>=3&&(!departmentReviewCurrent(job,report)||report.qa.runId!==calls[2].runId))fail();
 if(index>=4&&!cooReleaseReviewCurrent(job))fail();return true;
}
/** One immutable per-job claim blocks authority rotation and duplicate preparation. */
export async function claimOfficeCooOperatorRepair(directory,g,at){
 assertReactivePrivateDirectory(directory);const body={version:1,jobId:g.jobId,operatorGrantRevision:g.revision,repairRevision:g.repairRevision,failureJobSha256:g.failure.jobSha256,claimedAt:at},value={...body,revision:sha(body)};
 await writeOfficeCooRepairOnce(directory,officeCooRepairClaimName(g.jobId),value);return value;
}
export async function writeOfficeCooRepairOnce(directory,name,value){
 assertReactivePrivateDirectory(directory);const h=await open(join(directory,name),'wx',0o600);try{await h.writeFile(canonical(value)+'\n');await h.sync();}finally{await h.close();}const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
 if(canonical(readReactivePrivateJson(directory,name,65536))!==canonical(value))fail();return value;
}
export function officeCooRepairForStage({directory,config,request,nativeGrant,job,at=Date.now()}){
 const g=readOfficeCooRepairAuthority({directory,config,request,nativeGrant,at});if(!g)return null;
 const claim=readReactivePrivateJson(directory,officeCooRepairClaimName(g.jobId)),{revision,...body}=claim;
 exact(claim,['version','jobId','operatorGrantRevision','repairRevision','failureJobSha256','claimedAt','revision']);
 if(claim.version!==1||sha(body)!==revision||claim.jobId!==g.jobId||claim.operatorGrantRevision!==g.revision||claim.repairRevision!==g.repairRevision||claim.failureJobSha256!==g.failure.jobSha256||typeof claim.claimedAt!=='string'||!Number.isFinite(Date.parse(claim.claimedAt))||Date.parse(claim.claimedAt)>at||Date.parse(claim.claimedAt)<Date.parse(g.issuedAt)||Date.parse(claim.claimedAt)>=Date.parse(g.expiresAt))fail();
 assertOfficeCooPreparedRepair(job,g,readReactivePrivateJson(directory,officeCooRepairPreparedName(g.jobId),65536));return g;
}

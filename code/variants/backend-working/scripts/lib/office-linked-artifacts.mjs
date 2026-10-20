import {clientArtifactFile} from './office-client-artifacts.mjs';
import {createHash} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const png=/^(?:card|render|preview|inspection|contact-sheet|frame-[123])\.png$/;
export const receiptHash=receipt=>createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
/** Freeze only outputs visible through the selected actor's saved assignment. */
export function linkedArtifactScope(job,agentId,clientId,receipts){
 if(!uuid.test(clientId??'')||job.knowledgeContext?.scope.clientId!==clientId)throw Error('Selected artifact client scope differs.');
 if(!['answered','needs_review','reviewed','failed','blocked'].includes(job.status))throw Error('Selected artifacts require a terminal saved task.');
 const own=(job.steps??[]).filter(s=>s.agentId===agentId),reports=(job.departmentReports??[]).filter(r=>r.agentId===agentId||r.qa?.agentId===agentId||r.partsQa?.agentId===agentId);
 const coo=(job.calls??[]).some(c=>c.agentId===agentId&&['planning','synthesis'].includes(c.stage));
 if(!own.length&&!reports.length&&!coo)throw Error('Agent was not allocated to the selected task.');
 const parts=new Set([...own.flatMap(s=>[s.id,...(s.dependsOn??[])]),...reports.flatMap(r=>r.stepIds??[]),...(coo?(job.steps??[]).filter(s=>s.status==='completed').map(s=>s.id):[])]);
 const files=[];
 for(const r of receipts){
  const call=job.calls?.find(c=>c.agentId===r.agentId&&c.runId===r.runId&&c.status==='succeeded'&&c.tools?.includes(r.tool));
  if(r.status!=='completed'||r.fixture||r.jobId!==job.id||!call||!/^[a-f0-9]{32}$/.test(r.id))continue;
  if(r.agentId!==agentId&&!parts.has(r.partId))continue;
  const bundle=r.result?.clientArtifact;
  if(bundle&&(bundle.clientId!==clientId||!bundle.workOrderId||!/^[-a-z0-9]{1,64}$/.test(bundle.profileId??'')||!/^[a-f0-9]{64}$/.test(bundle.revisionSha256??'')))continue;
  for(const f of r.files??[]){
   if(!(png.test(f.name)&&f.name!=='preview.png'||bundle&&clientArtifactFile.test(f.name))||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>16*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256))continue;
   files.push({sourceCall:r.id,fileName:f.name,sha256:f.sha256,bytes:f.bytes,receiptSha256:receiptHash(r),...(bundle?{clientId,workOrderId:bundle.workOrderId,revisionSha256:bundle.revisionSha256}:{}),url:`/api/office/tool-artifacts/${job.id}/${r.id}/${f.name}`});
  }
 }
 if(files.length>24)throw Error('Selected task has too many selected outputs; select a narrower task.');
 return {version:1,jobId:job.id,agentId,clientId,sourceUpdatedAt:job.updatedAt,files};
}
export function validateLinkedScope(scope,{kind,targetAgentId,selectedTaskId,clientId}){
 if(!scope)return;
 if(kind!=='conversation'||scope.version!==1||!uuid.test(scope.jobId??'')||scope.jobId!==selectedTaskId||scope.agentId!==targetAgentId||!clientId||scope.clientId!==clientId||!Array.isArray(scope.files)||scope.files.length>24)throw Error('Invalid selected artifact scope.');
 const seen=new Set();
 for(const f of scope.files){
  const key=f.sourceCall+'/'+f.fileName;
  if(!/^[a-f0-9]{32}$/.test(f.sourceCall)||!(png.test(f.fileName)&&f.fileName!=='preview.png'||clientArtifactFile.test(f.fileName)&&f.clientId===clientId&&typeof f.workOrderId==='string'&&/^[a-f0-9]{64}$/.test(f.revisionSha256??''))||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>16*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256)||!/^[a-f0-9]{64}$/.test(f.receiptSha256)||seen.has(key)||f.url!==`/api/office/tool-artifacts/${scope.jobId}/${key}`)throw Error('Invalid selected artifact file pin.');
  seen.add(key);
 }
}

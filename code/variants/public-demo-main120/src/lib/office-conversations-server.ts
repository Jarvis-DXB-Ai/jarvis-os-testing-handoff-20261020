import {localOfficeEnabled} from './office-runtime.mjs';
import 'server-only';
import {activeStates,listJobs,readJob,paperclipClient,savedAgentTaskContext} from '../../scripts/lib/office-team-engine.mjs';
import {storageReadiness} from '../../scripts/lib/office-archive.mjs';
import {linkedArtifactScope} from '../../scripts/lib/office-linked-artifacts.mjs';
import {toolReceipts} from '../../scripts/lib/office-tool-bridge.mjs';
import {controlOfficeTeamTask,submitOfficeTeamTask} from './office-paperclip-team-server';
import plan from './office-stack-plan.json';
import type {OfficeContextRequest} from '../../scripts/lib/office-foundations.mjs';
import {conversationHistoryMode,savedConversationHistoryMode,conversationHistoryPacket,type ConversationHistoryMode} from './office-conversation-history.mjs';
import {resolveConversationContext} from './office-conversation-context.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function local(){if(!localOfficeEnabled())throw new Error('Agent conversations require the private Mac office.');}
async function conversationContext(clientId:string):Promise<OfficeContextRequest>{
 const {clientIntake,clientOfficeContext}=await import('./office-client-intake-server');
 // The existing pilot validates client identity, source integrity and its exact
 // audit-only allocation; a pending commercial setup never grants execution.
 const {clientPilot}=await import('./office-client-pilot-server');
 return resolveConversationContext(clientId,{readSetup:clientIntake,readConfirmed:clientOfficeContext,readPilot:clientPilot});
}
export async function officeConversation(agentId:string,clientId?:string|null){
 local();if(clientId)await conversationContext(clientId);if(!uuid.test(agentId))throw new Error('Invalid agent ID.');
 const jobs=await listJobs(undefined,{kind:'all',limit:Number.MAX_SAFE_INTEGER});
 const busy=jobs.some(j=>activeStates.includes(j.status)||j.status==='recovery_required');
 const storage=await storageReadiness(plan.storage);
 const messages=await Promise.all(jobs.filter(j=>j.kind==='conversation'&&j.targetAgentId===agentId&&(clientId?j.knowledgeContext?.scope.clientId===clientId:!j.knowledgeContext?.scope.clientId)).slice(0,40).reverse().map(async j=>({...j,toolCalls:await toolReceipts(plan.storage,j.id)})));
 return {enabled:storage.status==='connected',busy,messages,message:busy?'The office is executing or recovering work. Send after it finishes.':storage.message};
}
export async function sendOfficeConversation(input:{id:string;agentId:string;message:string;taskId?:string;clientId?:string;historyMode?:ConversationHistoryMode}){
 local();const mode=conversationHistoryMode(input.historyMode);if(!uuid.test(input.id??'')||!uuid.test(input.agentId??'')||typeof input.message!=='string'||input.message.trim().length<12||input.message.length>6000)throw new Error('Choose an agent and write a message of 12–6000 characters.');
 try{
  const prior=await readJob(input.id);
  if(savedConversationHistoryMode(prior)!==mode||prior.kind!=='conversation'||prior.targetAgentId!==input.agentId||prior.brief!==input.message.trim()||(prior.selectedTaskId??null)!==(input.taskId??null)||(input.clientId??null)!==(prior.knowledgeContext?.scope.clientId??null))throw new Error('This message ID belongs to another conversation.');
  return prior;
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const agents=await paperclipClient()(`/companies/${plan.paperclipCompanyId}/agents`) as unknown as {id:string;metadata?:{jarvisSpawnedForTask?:string;modelBilling?:string;jarvisClientId?:string};status:string}[];
 const agent=agents.find(a=>a.id===input.agentId);
 if(!agent||agent.metadata?.jarvisSpawnedForTask||agent.metadata?.modelBilling!=='subscription_only'||['paused','running','terminated'].includes(agent.status))throw new Error('This desk is unavailable for a new direct conversation.');
 const clientContext=input.clientId?await conversationContext(input.clientId):undefined;
 if((agent.metadata?.jarvisClientId??null)!==(input.clientId??null))throw new Error('This desk belongs to another client Office.');
 const history=(await listJobs(undefined,{kind:'conversation',agentId:input.agentId,limit:Number.MAX_SAFE_INTEGER})).filter(j=>input.clientId?j.knowledgeContext?.scope.clientId===input.clientId:!j.knowledgeContext?.scope.clientId).slice(0,12);
 const historyPacket=conversationHistoryPacket(history,mode);let context=historyPacket.context;
 let contextRequest:OfficeContextRequest|undefined=clientContext;
 let selectedArtifacts:import('../../scripts/lib/office-linked-artifacts.mjs').LinkedArtifactScope|undefined;
 if(input.taskId){
  if(!uuid.test(input.taskId))throw new Error('Invalid saved task ID.');
  const task=await readJob(input.taskId);
  if((task.knowledgeContext?.scope.clientId??null)!==(input.clientId??null))throw new Error('The selected saved task belongs to another client scope.');
  const scoped=savedAgentTaskContext(task,input.agentId);
  // The Office UI also supplies its currently focused task when opening an
  // unrelated desk. Preserve an ordinary chat, but grant none of that task.
  if(scoped){
   context+=`\nSelected saved task ${task.id}: ${JSON.stringify(scoped).slice(0,7500)}`;contextRequest=clientContext??task.contextRequest;
   if(input.clientId)selectedArtifacts=linkedArtifactScope(task,input.agentId,input.clientId,await toolReceipts(plan.storage,task.id));
  }
 }
 return submitOfficeTeamTask({id:input.id,kind:'conversation',targetAgentId:input.agentId,...(input.taskId?{selectedTaskId:input.taskId}:{}),historyIds:historyPacket.historyIds,brief:input.message.trim(),context,contextRequest,criteria:['Answer the owner directly; distinguish verified work from proposed actions.']},{selectedArtifacts});
}

export async function controlOfficeConversation(input:{id:string;agentId:string;action:string}){
 local();if(!uuid.test(input.id??'')||!uuid.test(input.agentId??''))throw new Error('Invalid conversation identifiers.');
 const job=await readJob(input.id);if(job.kind!=='conversation'||job.targetAgentId!==input.agentId||!['stop','reconcile'].includes(input.action))throw new Error('This action does not match the selected conversation.');
 return controlOfficeTeamTask(input);
}

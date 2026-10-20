const freshMarker='Fresh task context v1: no prior desk conversation is included.';
export function conversationHistoryMode(value){if(value===undefined)return 'recent';if(!['recent','fresh'].includes(value))throw new Error('Choose recent or fresh conversation context.');return value;}
export function savedConversationHistoryMode(job){return job.context?.startsWith(freshMarker)?'fresh':'recent';}
export function conversationHistoryPacket(jobs,mode){
 const selected=conversationHistoryMode(mode)==='fresh'?[]:jobs.slice(0,12);
 return {historyIds:selected.map(job=>job.id),context:mode==='fresh'?freshMarker:[...selected].reverse().map(job=>`Owner: ${job.brief}\nAgent (${job.status}): ${job.output??'No saved reply.'}`).join('\n\n').slice(-12000)};
}

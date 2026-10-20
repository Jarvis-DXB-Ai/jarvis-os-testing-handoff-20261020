// Readers must validate the persisted client/allocation/source integrity.
// Never turn a failed confirmed-client validation into an audit fallback.
export async function resolveConversationContext(clientId,{readSetup,readConfirmed,readPilot}){
 const setup=await readSetup(clientId);
 if(setup.id!==clientId||setup.clientId!==clientId)throw new Error('Conversation setup belongs to another client.');
 const approved=setup.status==='ready';
 const profile=await (approved?readConfirmed:readPilot)(clientId);
 if(profile.clientId!==clientId||typeof profile.foundationId!=='string'||!profile.foundationId)throw new Error('Conversation foundation belongs to another client or is unavailable.');
 if(!approved&&(profile.executionMode!=='audit_only'||profile.status!=='audit_ready'||profile.brandConfirmed!==false||profile.servicesConfirmed!==false||!profile.foundationId.startsWith('audit-')))throw new Error('A validated internal audit allocation is required for draft conversation.');
 return {foundationId:profile.foundationId,taskType:'internal',mode:approved?'approved':'draft'};
}

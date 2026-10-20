// Runtime actor IDs are coordinator control-plane state, not model assignment
// authority or client evidence. Preserve every other allocation/source field.
export function modelTeamAllocation(team){
 if(!team||typeof team!=='object'||Array.isArray(team))return team;
 const {runtime,...allocation}=team;
 return allocation;
}
export function modelKnowledgeContext(knowledge){
 if(!knowledge?.clientBrain?.officeTeam)return knowledge;
 return {...knowledge,clientBrain:{...knowledge.clientBrain,officeTeam:modelTeamAllocation(knowledge.clientBrain.officeTeam)}};
}

export function clientOfficeHref(clientId){return clientId?'/office?clientId='+encodeURIComponent(clientId):'/office?scope=agency';}
export function defaultOfficeClient(clients,requested,scope){
 if(requested){if(!clients.some(c=>c.id===requested))throw new Error('Unknown client Office.');return requested;}
 if(scope==='agency')return '';
 const matches=clients.filter(c=>c.name==='DemoClientA');return matches.length===1?matches[0].id:'';
}
export function scopedOfficeSnapshot(snapshot,clientId){
 if(!snapshot)return null;
 const agents=snapshot.agents.filter(a=>clientId?a.clientId===clientId:!a.clientId),ids=new Set(agents.map(a=>a.id));
 return {...snapshot,agents,issues:snapshot.issues.filter(i=>i.assigneeAgentId&&ids.has(i.assigneeAgentId)),runs:snapshot.runs.filter(r=>ids.has(r.agentId))};
}

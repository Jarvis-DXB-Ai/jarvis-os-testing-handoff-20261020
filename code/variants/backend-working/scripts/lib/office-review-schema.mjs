/** Exact ordered criteria, generated from the task rather than model-authored labels. */
export function qaResponseSchema(criteria){
 if(!Array.isArray(criteria)||!criteria.length||criteria.some(x=>typeof x!=='string'||!x.trim()))throw new Error('QA requires ordered nonempty criteria.');
 const check={type:'object',additionalProperties:false,required:['criterion','pass','evidence'],properties:{criterion:{type:'string',enum:criteria},pass:{type:'boolean'},evidence:{type:'string',minLength:1}}};
 // Portable homogeneous array schema; the coordinator still verifies exact
 // order, uniqueness and consistent overall verdict independently.
 return {type:'object',additionalProperties:false,required:['pass','checks','note'],properties:{pass:{type:'boolean'},checks:{type:'array',minItems:criteria.length,maxItems:criteria.length,items:check},note:{type:'string'}}};
}
export function qaAdapterArguments(adapterType,criteria){return adapterType==='claude_local'?['--json-schema',JSON.stringify(qaResponseSchema(criteria))]:[];}
function completedCodexMessage(text){
 if(typeof text!=='string'||text.length>2000000)return null;
 let candidate=null,completed=null;
 for(const line of text.split(/\r?\n/)){
  let event;try{event=JSON.parse(line);}catch{continue;}
  if(event.type==='turn.started'||event.type==='turn.failed'||event.type==='error'){candidate=null;completed=null;}
  if(event.type==='item.completed'&&event.item?.type==='agent_message'&&typeof event.item.text==='string'){candidate=event.item.text;completed=null;}
  if(event.type==='turn.completed')completed=candidate;
 }
 return completed;
}
export function modelRunOutput(run,{structured=false}={}){
 if(run.resultJson?.truncated===true||run.resultJson?.stdoutTruncated===true){
  if(run.status!=='succeeded')throw new Error('Truncated native result is not a completed deliverable.');
  const complete=completedCodexMessage(run.stdoutExcerpt)??completedCodexMessage(run.resultJson?.stdout);
  if(!complete?.trim())throw new Error('Native result was truncated and no complete final message is available; inspect the recorded run without replaying the model.');
  return complete;
 }
 const object=run.resultJson?.structured_output;
 if(structured&&object!==undefined){if(!object||typeof object!=='object'||Array.isArray(object))throw new Error('Structured QA output is not an object.');return JSON.stringify(object);}
 return run.resultJson?.summary??run.summary;
}

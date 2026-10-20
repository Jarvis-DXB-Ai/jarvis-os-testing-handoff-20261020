import {createHash} from 'node:crypto';

export function specialistResponseSchema(){
 return {type:'object',additionalProperties:false,required:['artifact','internalNotes'],properties:{artifact:{type:'string',minLength:1,maxLength:44000},internalNotes:{type:'string',maxLength:4000}}};
}
export function specialistResponseArguments(adapterType){return adapterType==='claude_local'?['--json-schema',JSON.stringify(specialistResponseSchema())]:[];}
export function specialistResponseInstruction(){return 'Response transport: return ONLY one JSON object with exactly artifact and internalNotes, both strings. artifact contains only the complete assigned deliverable in its requested format, including any source references, limitations or tool artifact IDs the owner actually needs. Provide final findings, source evidence and concise explanations of recommendations only. Do not provide hidden chain-of-thought, private deliberation or internal reasoning traces. internalNotes may contain only short administrative status and check outcomes, or be an empty string; no deliberation is requested. Put evolving execution, QA and approval state there unless the owner explicitly requests it in the artifact; do not make a draft stale by listing its own then-pending QA outcome as a factual unknown. Internal notes are saved separately and do not count toward the artifact word limit. Never hide a material uncertainty, source condition or required evidence there. Do not add keys, prose outside JSON or a second artifact. This transport changes no facts, authority or tool grants.';}
export function parseSpecialistResponse(raw){
 if(typeof raw!=='string'||raw.length>60000)throw new Error('Specialist response exceeds the bounded artifact transport.');
 let value;try{value=JSON.parse(raw);}catch{throw new Error('Specialist must return one exact artifact/internalNotes JSON object; original native response is retained.');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'artifact')||!Object.hasOwn(value,'internalNotes')||typeof value.artifact!=='string'||!value.artifact.trim()||value.artifact.length>44000||typeof value.internalNotes!=='string'||value.internalNotes.length>4000)throw new Error('Specialist artifact/internalNotes response is invalid; no automatic retry.');
 const hash=text=>createHash('sha256').update(text).digest('hex');
 return {artifact:value.artifact,internalNotes:value.internalNotes,receipt:{schemaVersion:1,responseSha256:hash(raw),artifactSha256:hash(value.artifact),internalNotesSha256:hash(value.internalNotes)}};
}

import {createHash} from 'node:crypto';
import {outputWordCount} from '../../src/lib/office-output-checks.mjs';

export const JSON_MEASUREMENT_MAX_CHARACTERS=44000;
export const JSON_MEASUREMENT_MAX_FIELD_RESPONSE_CHARACTERS=12000;
const maxNodes=4096,maxFields=256,maxDepth=32,maxPointerCharacters=512;
const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
const typeOf=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const pointerPart=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');

function literalControls(artifact){
 let inString=false,escaped=false,total=0;const firstOffsets=[];
 for(let i=0;i<artifact.length;i++){
  const char=artifact[i];
  if(!inString){if(char==='"')inString=true;continue;}
  if(char.charCodeAt(0)<32){total++;if(firstOffsets.length<16)firstOffsets.push({utf16Offset:i,codePoint:'U+'+char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')});}
  if(escaped){escaped=false;continue;}
  if(char==='\\'){escaped=true;continue;}
  if(char==='"')inString=false;
 }
 return {count:total,firstOffsets,scope:'Lexical quoted-string scan only; strict parser determines JSON syntax. Escaped backslash-n is not a literal control character.'};
}

function fieldsIn(value){
 const fields=[],stack=[{value,pointer:'',depth:0}],limits=new Set();let nodes=0,scheduled=1,serializedFieldsCharacters=2;
 while(stack.length){
  const current=stack.pop();nodes++;
  if(typeof current.value==='string'){
   if(fields.length>=maxFields){limits.add('string_fields');continue;}
   const field={pointer:current.pointer,characters:current.value.length,unicodeCodePoints:[...current.value].length,wordCount:outputWordCount(current.value),paragraphCount:current.value.trim()?current.value.trim().split(/\r?\n\s*\r?\n/u).length:0};
   const serialized=JSON.stringify(field).length+(fields.length?1:0);
   // Reserve512characters for the fixed wrapper and all possible limit labels.
   // JSON-escaped pointer size is measured, so adversarial keys cannot inflate it.
   if(serializedFieldsCharacters+serialized>JSON_MEASUREMENT_MAX_FIELD_RESPONSE_CHARACTERS-512){limits.add('response_characters');continue;}
   fields.push(field);serializedFieldsCharacters+=serialized;

   continue;
  }
  if(current.value===null||typeof current.value!=='object')continue;
  const entries=Object.entries(current.value);
  if(current.depth>=maxDepth&&entries.length){limits.add('depth');continue;}
  for(let i=entries.length-1;i>=0;i--){
   const [key,child]=entries[i],pointer=current.pointer+'/'+pointerPart(key);
   if(pointer.length>maxPointerCharacters){limits.add('pointer_characters');continue;}
   if(scheduled>=maxNodes){limits.add('nodes');continue;}
   scheduled++;stack.push({value:child,pointer,depth:current.depth+1});
  }
 }
 return {wordCountAlgorithm:'unicode-lexical-v1',characterAlgorithm:'utf16-code-units-v1',complete:limits.size===0,limitsReached:[...limits].sort(),nodesVisited:nodes,maximumSerializedCharacters:JSON_MEASUREMENT_MAX_FIELD_RESPONSE_CHARACTERS,fields};
}

/** Measures exactly the supplied artifact string; never repairs/extracts or approves. */
export function measureJsonArtifact(artifact){
 if(typeof artifact!=='string')throw new TypeError('JSON measurement requires the exact artifact string.');
 if(artifact.length>JSON_MEASUREMENT_MAX_CHARACTERS)throw new RangeError('JSON measurement is bounded to44,000 UTF16 characters.');
 const result={version:1,inputSha256:sha256(artifact),inputCharacters:artifact.length,inputUtf8Bytes:Buffer.byteLength(artifact,'utf8'),algorithm:'unicode-lexical-v1',jsonSyntax:{valid:false,rootType:null,errorCode:null},format:{markdownFence:/^[ \t]{0,3}```/mu.test(artifact),literalControlsInQuotedStrings:literalControls(artifact)},stringFields:{complete:false,limitsReached:[],nodesVisited:0,fields:[]},semanticApproval:'not_assessed',scope:'Exact input syntax and decoded string measurements only. No extraction, schema/claim/quality/consent/send/owner approval. Character counts use UTF16 code units; code points reported separately, not graphemes.'};
 let parsed;
 try{parsed=JSON.parse(artifact);}catch{
  result.jsonSyntax.errorCode='INVALID_JSON';
  // Invalid wrappers never become an implicit valid inner artifact.
  return result;
 }
 result.jsonSyntax={valid:true,rootType:typeOf(parsed),errorCode:null};
 result.stringFields=fieldsIn(parsed);
 return result;
}

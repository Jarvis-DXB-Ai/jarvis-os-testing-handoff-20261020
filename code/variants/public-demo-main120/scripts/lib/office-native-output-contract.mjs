import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=/^[a-f0-9]{64}$/;

// Receipts must come from the strict broker reader, never from model prose.
// This measures exact returned bytes; it never extracts or repairs an artifact.
export function nativeOutputContract(output,checks,{returnedOutputKind='engine_returned_text',nativeFinalText}={}){
 if(typeof output!=='string')throw new TypeError('Native output must be text.');
 if(returnedOutputKind!=='structured_output_projection'&&nativeFinalText===undefined)nativeFinalText=output;
 const base={version:1,returnedOutputKind,outputSha256:digest(output),outputUtf8Bytes:Buffer.byteLength(output),outputCharacters:output.length,...(typeof nativeFinalText==='string'?{nativeFinalTextSha256:digest(nativeFinalText)}:{})};
 if(!checks.length)return {...base,status:'not_invoked',meaning:'No draft_check was invoked in this native run; no exact-check claim.'};
 const successful=checks.filter(c=>c.status==='completed');
 if(!successful.length)return {...base,status:'rejected',reason:'The native run invoked draft_check without a successful saved receipt.'};
 for(const receipt of successful){
  if(!hash.test(receipt.argumentHash??'')||!hash.test(receipt.result?.jsonMeasurements?.inputSha256??'')||!Number.isFinite(Date.parse(receipt.at)))return {...base,status:'rejected',reason:'A native draft_check receipt has incomplete exact-input evidence.'};
 }
 successful.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const latest=successful[0],ties=successful.filter(r=>Date.parse(r.at)===Date.parse(latest.at));
 if(ties.some(r=>r.argumentHash!==latest.argumentHash))return {...base,status:'rejected',reason:'Latest native draft_check order is ambiguous; different checks share a completion timestamp.'};
 const evidence={receiptId:latest.id,receiptAt:latest.at,checkedInputSha256:latest.result.jsonMeasurements.inputSha256,checkedArgumentSha256:latest.argumentHash};
 if(returnedOutputKind==='structured_output_projection'&&(typeof nativeFinalText!=='string'||nativeFinalText!==output))return {...base,...evidence,status:'rejected',reason:'Structured output is an engine projection and does not prove identical complete native final text. Exact native output validation failed; no projection or extraction substitutes for it.'};
 if(latest.argumentHash!==digest(JSON.stringify({artifact:output}))||evidence.checkedInputSha256!==base.outputSha256)return {...base,...evidence,status:'rejected',reason:'The complete native final output differs from the latest successful draft_check input. Raw output retained; no automatic retry.'};
 return {...base,...evidence,status:'passed',meaning:'Complete native output exactly matches this run’s latest successful draft_check input; craft and approval remain separate.'};
}

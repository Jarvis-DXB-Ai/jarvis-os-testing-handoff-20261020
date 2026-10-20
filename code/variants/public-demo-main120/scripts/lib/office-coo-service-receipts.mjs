/** Durable deterministic owner-channel responses. These are service receipts,
 * never native jobs, grants, approval evidence or retry instructions. */
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {readOfficeCooPrivateJson} from './office-coo-service-auth.mjs';
import {assertReactivePrivateDirectory,canonical,sha} from './office-coo-reactive-grant.mjs';
const outputs=Object.freeze({
 owner_help:()=> 'Office help: Send one clear text task and name the client when relevant. I will return the saved result or a clear error here. Client publication, external delivery and paid actions keep their existing approval requirements.',
 scope_clarification:()=> 'Please send one client assignment at a time and name the client clearly. I could not select one current Office for this message. No team task was started.',
 admission_unconfirmed:id=>`I could not confirm that Office accepted request ${id}. I will not retry it automatically. This request needs review before you send it again.`,
});
const legacyUnconfirmed=id=>`I could not confirm that Office accepted task ${id}. I will not retry it automatically. Open Office to inspect the saved task and error before trying again.`;
function name(request){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.jobId)||!['requestSha256','policySha256'].every(k=>/^[a-f0-9]{64}$/.test(request[k])))throw Error('COO service receipt identity invalid.');return 'coo-service-response.'+request.jobId+'.json';}
function validate(value,request){
 const {revision,...body}=value;
 if(value.version!==1||!Object.hasOwn(outputs,value.code)||value.jobId!==request.jobId||value.requestSha256!==request.requestSha256||value.policySha256!==request.policySha256||canonical(value.scope)!==canonical(request.scope)||value.output!==outputs[value.code](request.jobId)&&!(value.code==='admission_unconfirmed'&&value.output===legacyUnconfirmed(request.jobId))||!Number.isFinite(Date.parse(value.createdAt))||sha(body)!==revision||Object.keys(value).sort().join(',')!=='code,createdAt,jobId,output,policySha256,requestSha256,revision,scope,version')throw Error('COO service receipt changed.');
 return value;
}
export async function readOfficeCooServiceResponse(directory,request){
 try{return validate(await readOfficeCooPrivateJson(directory,name(request)),request);}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function saveOfficeCooServiceResponse(directory,request,code,at=new Date().toISOString()){
 if(!Object.hasOwn(outputs,code)||!Number.isFinite(Date.parse(at)))throw Error('COO service response invalid.');
 assertReactivePrivateDirectory(directory);
 const prior=await readOfficeCooServiceResponse(directory,request);if(prior)return prior;
 const body={version:1,jobId:request.jobId,requestSha256:request.requestSha256,policySha256:request.policySha256,scope:request.scope,code,output:outputs[code](request.jobId),createdAt:at},value={...body,revision:sha(body)};
 let f;try{f=await open(join(directory,name(request)),'wx',0o600);}catch(e){if(e.code==='EEXIST'){const saved=await readOfficeCooServiceResponse(directory,request);if(saved)return saved;}throw e;}
 // A partial write stays for explicit review; never overwrite uncertain evidence.
 try{await f.writeFile(canonical(value)+'\n');await f.sync();}finally{await f.close();}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
 return validate(await readOfficeCooPrivateJson(directory,name(request)),request);
}

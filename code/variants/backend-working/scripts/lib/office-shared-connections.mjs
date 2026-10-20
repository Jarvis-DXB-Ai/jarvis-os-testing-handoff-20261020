import {createHash} from 'node:crypto';

// Fixed, minimal GET probes. Credentials, raw provider responses and client data never leave this module.
export const sharedProviderSpecs={
 canva:{token:'CANVA_ACCESS_TOKEN',url:'https://api.canva.com/rest/v1/designs?limit=1',evidence:'Design metadata read',valid:v=>Array.isArray(v.items)},
 mailchimp:{token:'MAILCHIMP_ACCESS_TOKEN',fallback:'MAILCHIMP_API_KEY',url:'https://api.mailchimp.com/3.0/ping',evidence:'Account health read',valid:v=>typeof v.health_status==='string'},
 'google-drive':{token:'GOOGLE_DRIVE_ACCESS_TOKEN',url:'https://www.googleapis.com/drive/v3/about?fields=kind',evidence:'Drive capability read',valid:v=>v.kind==='drive#about'},
 'google-calendar':{token:'GOOGLE_CALENDAR_ACCESS_TOKEN',url:'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1&fields=kind',evidence:'Calendar-list read',valid:v=>v.kind==='calendar#calendarList'},
 gmail:{token:'GMAIL_ACCESS_TOKEN',url:'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=messagesTotal',evidence:'Mailbox capability read',valid:v=>Number.isInteger(v.messagesTotal)&&v.messagesTotal>=0},
 ga4:{token:'GOOGLE_ANALYTICS_ACCESS_TOKEN',url:'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=1&fields=accountSummaries.name',evidence:'Analytics account-list read; reporting property not bound',valid:v=>!('accountSummaries' in v)||Array.isArray(v.accountSummaries)},
 'search-console':{token:'GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN',url:'https://www.googleapis.com/webmasters/v3/sites?fields=siteEntry.permissionLevel',evidence:'Search Console permission read; site not bound',valid:v=>!('siteEntry' in v)||Array.isArray(v.siteEntry)}
};
const receipts=new Map();
const credential=(spec,env)=>[spec.token,spec.fallback].filter(Boolean).map(k=>env[k]?.trim()).find(v=>v&&!/^(TEST|isolated-)/i.test(v));
const fingerprint=token=>createHash('sha256').update(token).digest('hex');
export function sharedProviderReadiness(id,env=process.env,now=Date.now()){
 const spec=Object.hasOwn(sharedProviderSpecs,id)?sharedProviderSpecs[id]:null;if(!spec)return null;
 const token=credential(spec,env),saved=receipts.get(id);
 const fresh=saved&&token&&saved.fingerprint===fingerprint(token)&&now-saved.time>=0&&now-saved.time<15*60*1000;
 return {credentialConfigured:!!token,adapterExists:true,authenticated:!!fresh&&saved.result.authenticated,workerRoute:'pending',verifiedAt:fresh?saved.result.checkedAt:null,verificationStatus:fresh?saved.result.status:'not_checked'};
}
export async function probeSharedProvider(id,{env=process.env,fetchFn=fetch,now=Date.now()}={}){
 const spec=Object.hasOwn(sharedProviderSpecs,id)?sharedProviderSpecs[id]:null;if(!spec)throw new Error('Unsupported shared provider.');
 const token=credential(spec,env),checkedAt=new Date(now).toISOString();
 const result=(status,message,authenticated=false)=>({provider:id,status,message,authenticated,checkedAt,readOnly:true,workerRoute:'pending',evidence:authenticated?spec.evidence:null});
 let proof;
 if(!token)proof=result('missing_credentials','Secure account authentication is not configured in this Office. No provider request was made.');
 else try{
  const response=await fetchFn(spec.url,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status===401)proof=result('needs_authentication','Account authorization is missing or expired. Reconnect this provider.');
  else if(response.status===403)proof=result('access_denied','Account plan or read permission does not allow this check. Verify the selected scope.');
  else if(response.status===429)proof=result('rate_limited','Provider rate limit reached. No automatic retry or purchase was attempted.');
  else if(!response.ok||response.status!==200)proof=result('unavailable','Provider did not return a verified read response.');
  else {
   const reader=response.body?.getReader();let raw='';let bytes=0;
   if(!reader)throw new Error('Empty response.');
   const decoder=new TextDecoder();try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536){await reader.cancel();raw=' '.repeat(65537);break;}raw+=decoder.decode(chunk.value,{stream:true});}if(bytes<=65536)raw+=decoder.decode();}finally{reader.releaseLock();}
   if(raw.length>65536)proof=result('invalid_response','Provider response exceeded the bounded verification size.');
   else {const value=JSON.parse(raw);proof=value&&typeof value==='object'&&!Array.isArray(value)&&!('error' in value)&&spec.valid(value)?result('read_verified','Shared account read verified. Agent tools, client bindings and all outbound actions remain pending.',true):result('invalid_response','Provider response did not match the expected read schema.');}
  }
 }catch{proof=result('unavailable','Read verification was interrupted or timed out. No raw provider error or credential is exposed.');}
 if(token)receipts.set(id,{time:now,fingerprint:fingerprint(token),result:proof});else receipts.delete(id);
 return proof;
}

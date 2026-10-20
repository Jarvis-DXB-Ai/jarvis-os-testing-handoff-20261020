import{createHash}from'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class SnapshotReadError extends Error{constructor(kind,status){super(kind);this.kind=kind;this.status=status;}}
export function createPaperclipSnapshotReader({project,fetchImpl=fetch,clock=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 let cached=null,inFlight=null;
 return async function load({base,companyId,token='',local=false,includeHistory=true}){
  const empty=()=>({status:'not_configured',message:'Paperclip connection is not configured for this environment.',checkedAt:new Date(clock()).toISOString(),version:null,company:null,agents:[],issues:[],runs:[]});
  if(!base||!companyId)return empty();
  let origin;
  try{const url=new URL(base),loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
   if(!uuid.test(companyId)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol)||loopback&&!local||!loopback&&(url.protocol!=='https:'||!token))throw Error('Invalid private coordinator configuration');
   origin=url.origin;
  }catch{return{...empty(),status:'unavailable',connectionError:'configuration',message:'Paperclip connection settings are invalid for this environment. Review the private coordinator URL and credentials.'};}
  const key=JSON.stringify([origin,companyId,local,includeHistory,createHash('sha256').update(token).digest('hex')]);
  if(inFlight?.key===key)return inFlight.promise;
  if(cached?.key===key&&cached.until>clock())return cached.value;
  async function read(path){
   for(let attempt=0;attempt<2;attempt++){
    try{const response=await fetchImpl(new URL(path,origin),{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4000),headers:token?{Authorization:`Bearer ${token}`}:{}});
     if(!response.ok)throw new SnapshotReadError([401,403].includes(response.status)?'authentication':'http',response.status);
     try{return await response.json();}catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw new SnapshotReadError('timeout');throw new SnapshotReadError(error instanceof SyntaxError?'response':'network');}
    }catch(error){
     const failure=error instanceof SnapshotReadError?error:new SnapshotReadError(['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network');
     const retry=['network','timeout'].includes(failure.kind)||failure.kind==='http'&&[408,429,502,503,504].includes(failure.status);
     if(attempt===0&&retry){await wait(150);continue;}throw failure;
    }
   }
  }
  const promise=(async()=>{
   try{const scope='/api/companies/'+companyId;
    const reads=await Promise.allSettled([read('/api/health'),read(scope),read(scope+'/agents'),includeHistory?read(scope+'/issues?view=compact&limit=100&sortField=updated&sortDir=desc'):Promise.resolve([]),includeHistory?read(scope+'/heartbeat-runs?summary=true&limit=20'):Promise.resolve([])]);
    const failed=reads.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    const [health,company,agents,issues,runs]=reads.map(r=>r.value);
    if(company?.id!==companyId)throw new SnapshotReadError('response');
    return{...project(health,company,agents,issues,runs),checkedAt:new Date(clock()).toISOString()};
   }catch(error){const kind=error instanceof SnapshotReadError?error.kind:'response',status=error instanceof SnapshotReadError?error.status:undefined;
    const message=kind==='authentication'?`Paperclip responded but rejected access (HTTP ${status}). Reconnect the coordinator credentials.`:kind==='timeout'?'Paperclip is taking too long to respond. Activity is unknown; the next refresh will retry.':kind==='network'?'The Office could not connect to Paperclip. Check the local service; the next refresh will retry.':kind==='http'?`Paperclip returned HTTP ${status}. Activity is unknown; refresh to check again.`:'Paperclip returned an incomplete or unexpected response. Activity is unknown; refresh to check again.';
    return{...empty(),status:'unavailable',connectionError:kind,message};
   }
  })();
  inFlight={key,promise};
  try{const value=await promise;if(inFlight?.promise===promise)cached={key,value,until:clock()+1000};return value;}finally{if(inFlight?.promise===promise)inFlight=null;}
 };
}

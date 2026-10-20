// Dedicated machine ingress. The owner-only Office Worker and origin remain separate.
// This handler only verifies and forwards bounded webhook bytes; it cannot run an
// agent, read Office/client data, select an upstream path, or send a WhatsApp message.
const COO_EVENT_BODY_LIMIT=64*1024;
const eventPath='/zernio',upstreamPath='http://127.0.0.1:3106/events';
const response=status=>new Response(null,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function boundedBody(request){
 if(request.headers.has('content-length')){const length=Number(request.headers.get('content-length'));if(!Number.isSafeInteger(length)||length<0||length>COO_EVENT_BODY_LIMIT)throw Error('body');}
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader(),chunks=[];let total=0,timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('body timeout'),{code:'COO_BODY_TIMEOUT'})),1500);});
 try{for(;;){const{done,value}=await Promise.race([reader.read(),timeout]);if(done)break;total+=value.byteLength;if(total>COO_EVENT_BODY_LIMIT)throw Error('body');chunks.push(value);}}
 catch(error){void reader.cancel().catch(()=>{});throw error;}
 finally{clearTimeout(timer);try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function signatureValid(bytes,supplied,secret){
 const hex=typeof supplied==='string'?supplied.replace(/^sha256=/i,''):'';if(!/^[a-f0-9]{64}$/i.test(hex))return false;
 const signature=Uint8Array.from(hex.match(/../g).map(pair=>parseInt(pair,16))),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,signature,bytes);
}
export async function cooEventsGateway(request,env){
 const startedAt=Date.now();
 const url=new URL(request.url);
 if(url.origin!==env.COO_INGRESS_ORIGIN||url.pathname!==eventPath||url.search||request.method!=='POST')return response(404);
 if(typeof env.COO_WEBHOOK_SECRET!=='string'||env.COO_WEBHOOK_SECRET.length<32||!env.PRIVATE_COO?.fetch)return response(503);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415);
 let bytes;try{bytes=await boundedBody(request);}catch(error){return response(error.code==='COO_BODY_TIMEOUT'?408:413);}
 try{
  const signature=request.headers.get('x-zernio-signature');if(!await signatureValid(bytes,signature,env.COO_WEBHOOK_SECRET))return response(401);
  // No caller cookies, owner JWT, trusted identity, Origin, URL or arbitrary
  // headers cross this boundary. The private receiver re-verifies signature and
  // scope, durably stores/deduplicates the event, then acknowledges. Never retry.
  const headers=new Headers({'content-type':'application/json','x-zernio-signature':signature});
  for(const name of['x-zernio-event-id','x-zernio-event','x-zernio-event-type']){const value=request.headers.get(name);if(value!==null)headers.set(name,value);}
  const remainingMs=Math.max(1,4000-(Date.now()-startedAt));
  const result=await env.PRIVATE_COO.fetch(new Request(upstreamPath,{method:'POST',headers,body:bytes,redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(remainingMs)])}));
  await result.body?.cancel();
  return response(result.status===202||result.status===200?202:result.status===400||result.status===401||result.status===403?400:503);
 }catch{return response(503);}
}
const worker={fetch:cooEventsGateway};
export default worker;

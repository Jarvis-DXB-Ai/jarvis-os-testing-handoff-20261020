import{createServer}from'node:http';
import{ingestOfficeCooWebhook}from'./office-coo-whatsapp.mjs';
const maxBody=64*1024;
const originWork=new WeakMap();
const reply=(response,status)=>{if(response.destroyed)return;response.writeHead(status,{'cache-control':'no-store','x-content-type-options':'nosniff'});response.end();};
/** Separate loopback-only signed event receiver, not an owner/application proxy.
 * config/secret/ingest/clock are server-owned. No message/model processing here. */
export function createOfficeCooOrigin({config,secret,ingest=ingestOfficeCooWebhook,now}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||typeof ingest!=='function')throw Error('Private channel ingress is not configured.');
 const pending=new Set();
 const handle=async(incoming,outgoing)=>{
  if(incoming.method!=='POST'||incoming.url!=='/events')return reply(outgoing,404);
  if(incoming.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(outgoing,415);
  const length=incoming.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBody))return reply(outgoing,413);
  const signature=typeof incoming.headers['x-zernio-signature']==='string'?incoming.headers['x-zernio-signature'].replace(/^sha256=/i,'').toLowerCase():'';
  const eventId=incoming.headers['x-zernio-event-id'],eventType=incoming.headers['x-zernio-event']??incoming.headers['x-zernio-event-type'];
  if(incoming.headers['x-zernio-event']!==undefined&&incoming.headers['x-zernio-event-type']!==undefined&&incoming.headers['x-zernio-event']!==incoming.headers['x-zernio-event-type'])return reply(outgoing,400);
  if(!/^[a-f0-9]{64}$/.test(signature)||typeof eventId!=='string'||!eventId||eventId.length>200||eventType!==undefined&&typeof eventType!=='string')return reply(outgoing,401);
  const timer=setTimeout(()=>{incoming.destroy();outgoing.destroy();},5000);
  try{
   let size=0;const chunks=[];for await(const chunk of incoming){size+=chunk.length;if(size>maxBody)return reply(outgoing,413);chunks.push(chunk);}
   const rawBody=Buffer.concat(chunks);if(eventType!==undefined){let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(rawBody));}catch{return reply(outgoing,400);}if(payload?.event!==eventType)return reply(outgoing,400);}
   await ingest(config,{rawBody,signature,eventId},{secret,...(now?{now}:{})});
   return reply(outgoing,202);
  }catch(error){
   // No details, credentials, participant or message bytes cross this endpoint.
   // Transient persistence/lock failures remain retryable by the vendor; never
   // issue an internal replay and never acknowledge work not durably accepted.
   return reply(outgoing,error?.code||/busy|interrupted|limit reached/i.test(error?.message??'')?503:400);
  }finally{clearTimeout(timer);}
 };
 const server=createServer((incoming,outgoing)=>{
  const work=handle(incoming,outgoing);pending.add(work);
  void work.then(()=>pending.delete(work),()=>pending.delete(work));
 });
 originWork.set(server,pending);
 server.headersTimeout=5000;server.requestTimeout=5000;return server;
}
/** Stop admission and await persistence even when the client socket closed first. */
export async function closeOfficeCooOrigin(server){
 const pending=originWork.get(server);if(!pending)throw Error('Unregistered COO origin.');
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 await Promise.allSettled([...pending]);
}
export function listenOfficeCooOrigin(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3106,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address());});});}

import {authorizeOwner,requestForContainer} from './owner-access';

/** Separate pilot gateway; no container deployment or changes to the existing app. */
export async function privateOfficeGateway(request:Request,env:OfficePrivatePilotEnv) {
  const owner=await authorizeOwner(request,env);
  if(owner instanceof Response)return owner;
  const url=new URL(request.url);
  if(url.origin!==env.JARVIS_RUNTIME_WORKER_ORIGIN)return Response.json({error:'Unknown private Office origin.'},{status:403,headers:{'cache-control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==env.JARVIS_RUNTIME_WORKER_ORIGIN)return Response.json({error:'Internal Jarvis request required.'},{status:403,headers:{'cache-control':'no-store'}});
  try {
    const forwarded=requestForContainer(request,{kind:'owner',identity:owner});
    const upstream=new Request(`http://127.0.0.1:3104${url.pathname}${url.search}`,forwarded);
    const result=await env.PRIVATE_OFFICE.fetch(upstream,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
    const response=new Response(result.body,result);
    response.headers.set('cache-control','private, no-store');
    response.headers.set('x-jarvis-private-edge','owner-verified');
    return response;
  } catch {
    return Response.json({error:'The Mac Office connection is unavailable. No request was replayed.'},{status:502,headers:{'cache-control':'no-store'}});
  }
}

const worker={fetch:privateOfficeGateway};
export default worker;

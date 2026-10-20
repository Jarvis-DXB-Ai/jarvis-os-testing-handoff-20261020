import {createServer, request as httpRequest} from 'node:http';
import {authorizeOwner, requestForContainer} from '../../src/cloudflare/owner-access.ts';
import {privateMacPilotEnabled} from '../../src/lib/office-runtime.mjs';

const hopHeaders = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function cleanHeaders(input) {
  const headers = new Headers(input);
  for (const name of (headers.get('connection') ?? '').split(',').map(s=>s.trim()).filter(Boolean)) headers.delete(name);
  for (const name of hopHeaders) headers.delete(name);
  return headers;
}
function reply(response, status, error) {
  response.writeHead(status, {'content-type':'application/json','cache-control':'no-store'});
  response.end(JSON.stringify({error}));
}

/** Sole tunnel target. Verifies owner identity independently of the edge Worker. */
export function createPrivateOfficeOrigin({env, upstreamPort=3103, authorize=authorizeOwner, platform=process.platform}) {
  if (!privateMacPilotEnabled(env, platform)) throw new Error('Authenticated Mac production mode is not configured.');
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1024 || upstreamPort > 65535) throw new Error('Invalid private application port.');
  return createServer(async (incoming, outgoing) => {
    try {
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) return reply(outgoing,400,'Invalid request path.');
      const headers = cleanHeaders(Object.entries(incoming.headers).flatMap(([k,v])=>v === undefined ? [] : [[k,Array.isArray(v)?v.join(','):v]]));
      const method=incoming.method ?? 'GET';
      const request = new Request(env.JARVIS_RUNTIME_WORKER_ORIGIN+incoming.url,{method,headers});
      const owner = await authorize(request,env);
      if (owner instanceof Response) {
        outgoing.writeHead(owner.status,Object.fromEntries(owner.headers));
        return outgoing.end(await owner.text());
      }
      if (!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method)) return reply(outgoing,405,'Method not allowed.');
      if (!['GET','HEAD'].includes(method) && headers.get('origin') !== env.JARVIS_RUNTIME_WORKER_ORIGIN) return reply(outgoing,403,'Internal Jarvis request required.');
      // Buffer only bounded request bodies, before forwarding any mutation. Never retry writes.
      const maxBytes=2*1024*1024;
      if (Number(headers.get('content-length') ?? 0)>maxBytes) return reply(outgoing,413,'Request body is too large.');
      let size=0; const chunks=[];
      for await (const chunk of incoming) {
        size+=chunk.length;
        if (size>maxBytes) return reply(outgoing,413,'Request body is too large.');
        chunks.push(chunk);
      }
      if (['GET','HEAD'].includes(method) && size) return reply(outgoing,400,'Unexpected request body.');
      const forwarded = cleanHeaders(requestForContainer(request,{kind:'owner',identity:owner}).headers);
      forwarded.set('host',`127.0.0.1:${upstreamPort}`);
      forwarded.set('x-forwarded-host',new URL(env.JARVIS_RUNTIME_WORKER_ORIGIN).host);
      forwarded.set('x-forwarded-proto','https');
      forwarded.delete('content-length');
      if (size) forwarded.set('content-length',String(size));
      const upstream = httpRequest({hostname:'127.0.0.1',port:upstreamPort,method,path:incoming.url,headers:Object.fromEntries(forwarded),timeout:60000},response=>{
        const resultHeaders=cleanHeaders(Object.entries(response.headers).flatMap(([k,v])=>v === undefined ? [] : [[k,Array.isArray(v)?v.join(','):v]]));
        resultHeaders.set('cache-control','private, no-store');
        resultHeaders.set('x-content-type-options','nosniff');
        resultHeaders.set('x-jarvis-private-pilot','mac-origin');
        const location=resultHeaders.get('location');
        if (location?.startsWith(`http://127.0.0.1:${upstreamPort}/`)) resultHeaders.set('location',env.JARVIS_RUNTIME_WORKER_ORIGIN+new URL(location).pathname+new URL(location).search);
        // Preserve independent Set-Cookie fields; Headers would otherwise combine them.
        resultHeaders.delete('set-cookie');
        const outputHeaders=Object.fromEntries(resultHeaders);
        if (response.headers['set-cookie']) outputHeaders['set-cookie']=response.headers['set-cookie'];
        outgoing.writeHead(response.statusCode ?? 502,outputHeaders);
        response.on('error',()=>outgoing.destroy());
        response.pipe(outgoing);
      });
      upstream.on('timeout',()=>upstream.destroy(new Error('Private origin timeout')));
      upstream.on('error',()=>{if(!outgoing.headersSent) reply(outgoing,502,'The private Office runtime is unavailable. No request was replayed.'); else outgoing.destroy();});
      outgoing.on('close',()=>{if(!outgoing.writableEnded) upstream.destroy();});
      upstream.end(size?Buffer.concat(chunks):undefined);
    } catch {
      if (!outgoing.headersSent) reply(outgoing,503,'The private Office request could not be verified.');
      else outgoing.destroy();
    }
  });
}

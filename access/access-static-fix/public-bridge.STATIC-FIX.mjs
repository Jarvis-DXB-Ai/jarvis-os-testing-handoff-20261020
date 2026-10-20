import shared from '../access-implementation/public-read-051.cjs';
import { verifiedStaticDecision } from './verified-static-transport.mjs';
const { MODE, HEADER, CANONICAL_ORIGIN, enabled, configuredKey, policy, sign, upstreamHeaders } = shared;
const denied = (status, error) => Response.json({ error }, { status,
  headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' } });
async function connectionStatusBody(response) {
  // This cached status DTO otherwise passes through provider_metadata. Preserve
  // business connection status, but never publish that opaque provider blob.
  if (!response.body) return null;
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  for (;;) {
    const {value,done} = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw Error('Status response too large'); }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk,offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(merged));
  for (const connection of data?.snapshot?.connections || []) {
    delete connection.providerMetadata; delete connection.provider_metadata;
  }
  return JSON.stringify(data);
}

export default {
  async fetch(request, env) {
    if (!enabled(env) || !configuredKey(env)) return denied(503, 'Temporary public browsing is disabled.');
    const publicURL = new URL(request.url);
    if (publicURL.origin !== env.JARVIS_PUBLIC_READ_ORIGIN) return denied(403, 'Public hostname is not configured.');
    const decision = verifiedStaticDecision(request) || policy(request, { rewriteStar: true });
    if (!decision.allowed) return denied(decision.status, decision.reason);
    if (publicURL.pathname === '/office') {
      return new Response(null, { status: 307, headers: { location: publicURL.origin + '/office/demo',
        'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive',
        'x-jarvis-public-mode': MODE, 'x-jarvis-office-view': 'simulation' } });
    }
    const target = new URL(decision.url);
    target.protocol = 'https:'; target.host = new URL(CANONICAL_ORIGIN).host;
    const headers = upstreamHeaders(request);
    const unsigned = new Request(target, { method: request.method, headers, redirect: 'manual' });
    if (decision.kind !== 'manifest-static') headers.set(HEADER, await sign(unsigned, env));
    const upstream = new Request(target, { method: request.method, headers, redirect: 'manual' });
    try {
      // Same namespace and instance as getContainer(originalBinding, "production").
      // No new Container application, migrations, provider credentials or owner JWT.
      const id = env.CURRENT_PRODUCTION.idFromName('production');
      const response = await env.CURRENT_PRODUCTION.get(id).fetch(upstream);
      const output = new Headers(response.headers);
      for (const name of [...output.keys()]) if (/^(?:set-cookie|cf-access-.*|x-jarvis-.*|access-control-.*)$/i.test(name)) output.delete(name);
      output.set('cache-control', 'private, no-store');
      output.set('x-robots-tag', 'noindex, nofollow, noarchive');
      output.set('x-jarvis-public-mode', MODE);
      output.set('referrer-policy', 'no-referrer');
      output.delete('clear-site-data');
      if (output.has('location')) {
        const location = new URL(output.get('location'), target);
        const signedClientFile = decision.kind === 'file-view'
          && location.origin === 'https://exvthaxjwcmvehankihe.supabase.co'
          && /^\/storage\/v1\/object\/sign\/(?:client-assets|guest-models|thumbnails)\//.test(location.pathname)
          && location.searchParams.has('token') && !location.username && !location.password;
        if (location.origin === CANONICAL_ORIGIN && policy(new Request(location)).allowed) {
          location.protocol = publicURL.protocol; location.host = publicURL.host;
        } else if (!signedClientFile) return denied(502, 'Unexpected upstream redirect.');
        output.set('location', location.href);
      }
      let body = request.method === 'HEAD' ? null : response.body;
      if (body && target.pathname.endsWith('/social-connections')) {
        body = await connectionStatusBody(response); output.delete('content-length');
      }
      return new Response(body,
        { status: response.status, statusText: response.statusText, headers: output });
    } catch { return denied(502, 'Public browsing is temporarily unavailable.'); }
  },
};

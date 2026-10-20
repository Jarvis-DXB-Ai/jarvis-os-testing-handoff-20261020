import shared from '../access-implementation/public-read-051.cjs';
import { VERIFIED_STATIC_PATHS } from './verified-static-paths.mjs';

export function verifiedStaticDecision(request) {
  const url = new URL(request.url);
  if (!VERIFIED_STATIC_PATHS.has(url.pathname) || url.search || url.hash || url.username || url.password) return null;
  // Reuse frozen method/action/header/body validation with an ordinary static
  // probe. Only membership in the finite image-verified list bypasses the old
  // percent/bracket filename restriction; no API/page is reclassified here.
  const probe = new Request(url.origin + '/_next/static/manifest-checked.js', {
    method: request.method, headers: request.headers,
  });
  if (!shared.policy(probe).allowed) return null;
  return { allowed: true, kind: 'manifest-static', url: url.href };
}

import { timingSafeEqual } from "node:crypto"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

export type OwnerAccessConfig = Pick<Cloudflare.Env,
  "JARVIS_ACCESS_TEAM_DOMAIN" | "JARVIS_ACCESS_AUDIENCE" | "JARVIS_OWNER_EMAILS">

type GatewayAuthConfig = OwnerAccessConfig & { AGENT_RUNTIME_INTERNAL_TOKEN?: string }
export type OwnerIdentity = { subject: string; email: string }
export type GatewayAuthorization =
  | { kind: "owner"; identity: OwnerIdentity }
  | { kind: "internal" }
  | { kind: "signed-webhook" }

export const runtimeTokenHeader = "x-jarvis-agent-runtime-token"

const internalPaths = new Set([
  "/_jarvis/agent-runtime/start",
  "/_jarvis/agent-runtime/resume",
  "/api/agent-runs/internal/prepare",
  "/api/agent-runs/internal/execute",
  "/api/agent-runs/internal/attach",
  "/_jarvis/office/start",
  "/api/office/internal/execute",
  "/api/internal/social-sync",
])

// Only public signing keys are cached. Never retain tokens or user identities
// in module state. The resolver is replaced if the configured issuer changes.
let signingKeys: { issuer: string; resolve: JWTVerifyGetKey } | undefined

function denied(status: 401 | 403 | 405 | 503, error: string) {
  return Response.json({ error }, {
    status,
    headers: { "cache-control": "no-store", ...(status === 405 ? { allow: "POST" } : {}) },
  })
}

function ownerConfig(env: OwnerAccessConfig) {
  const audience = env.JARVIS_ACCESS_AUDIENCE?.trim()
  const domain = env.JARVIS_ACCESS_TEAM_DOMAIN?.trim()
  const owners = env.JARVIS_OWNER_EMAILS?.split(",").map(email => email.trim().toLowerCase())
  if (!audience || !domain || !owners?.length || owners.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null
  try {
    const url = new URL(domain)
    if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/i.test(url.hostname)
      || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null
    return { issuer: url.origin, audience, owners: new Set(owners) }
  } catch { return null }
}

/** Verify signature, issuer, audience, lifetime and the explicit owner allowlist. */
export async function authorizeOwner(request: Request, env: OwnerAccessConfig, testKeys?: JWTVerifyGetKey): Promise<OwnerIdentity | Response> {
  const config = ownerConfig(env)
  if (!config) return denied(503, "Owner access is not configured.")
  const token = request.headers.get("cf-access-jwt-assertion")
  if (!token) return denied(401, "Sign in to access Jarvis OS.")

  try {
    if (!testKeys && signingKeys?.issuer !== config.issuer) {
      signingKeys = {
        issuer: config.issuer,
        resolve: createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 }),
      }
    }
    const keys = testKeys ?? signingKeys?.resolve
    if (!keys) return denied(503, "Owner access is unavailable.")
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["exp", "iat", "sub", "email"],
    })
    if (typeof payload.email !== "string" || !payload.sub?.trim()) return denied(403, "Owner access required.")
    const email = payload.email.trim().toLowerCase()
    if (!config.owners.has(email)) return denied(403, "Owner access required.")
    return { subject: payload.sub, email }
  } catch {
    // Do not return provider/library errors, claims or token contents.
    return denied(401, "Invalid or expired sign-in.")
  }
}

export function validInternalToken(expected: string | undefined, supplied: string | null) {
  if (!expected || !supplied) return false
  const encoder = new TextEncoder()
  const left = encoder.encode(expected)
  const right = encoder.encode(supplied)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

/** The only alternatives to owner login are exact, independently protected routes. */
export async function authorizeGatewayRequest(request: Request, env: GatewayAuthConfig, testKeys?: JWTVerifyGetKey): Promise<GatewayAuthorization | Response> {
  const path = new URL(request.url).pathname
  if (internalPaths.has(path)) {
    if (request.method !== "POST") return denied(405, "Method not allowed.")
    if (!validInternalToken(env.AGENT_RUNTIME_INTERNAL_TOKEN, request.headers.get(runtimeTokenHeader))) return denied(401, "Unauthorized.")
    return { kind: "internal" }
  }
  if (path === "/api/social/webhooks/zernio") {
    if (request.method !== "POST") return denied(405, "Method not allowed.")
    // The canonical route verifies the signature over the unmodified body
    // before processing. No other webhook/provider path bypasses owner login.
    return { kind: "signed-webhook" }
  }
  const owner = await authorizeOwner(request, env, testKeys)
  return owner instanceof Response ? owner : { kind: "owner", identity: owner }
}

/** Strip untrusted identity assertions before forwarding; only the verified owner is supplied. */
export function requestForContainer(request: Request, authorization: GatewayAuthorization) {
  const headers = new Headers(request.headers)
  for (const name of ["x-jarvis-owner-id", "x-jarvis-owner-email", "cf-access-authenticated-user-email"]) headers.delete(name)
  if (authorization.kind === "owner") {
    headers.set("x-jarvis-owner-id", authorization.identity.subject)
    headers.set("x-jarvis-owner-email", authorization.identity.email)
    // Browser identity must never double as machine credentials downstream.
    headers.delete(runtimeTokenHeader)
  }
  return new Request(request, { headers })
}

import assert from "node:assert/strict"
import { test } from "node:test"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import { authorizeGatewayRequest, authorizeOwner, requestForContainer, runtimeTokenHeader, validInternalToken } from "../src/cloudflare/owner-access.ts"

// Synthetic credentials only. Tests do not call Cloudflare, Supabase or providers.
const issuer = "https://jarvis-test.cloudflareaccess.com"
const env = {
  JARVIS_ACCESS_TEAM_DOMAIN: issuer,
  JARVIS_ACCESS_AUDIENCE: "fixture-audience",
  JARVIS_OWNER_EMAILS: "owner@example.invalid,owner@example.invalid",
  AGENT_RUNTIME_INTERNAL_TOKEN: "fixture-internal-token",
}
const { privateKey, publicKey } = await generateKeyPair("RS256")
const jwk = { ...await exportJWK(publicKey), kid: "fixture-key", alg: "RS256", use: "sig" }
const keys = createLocalJWKSet({ keys: [jwk] })
const now = () => Math.floor(Date.now() / 1000)

async function token(overrides = {}, key = privateKey, algorithm = "RS256") {
  return new SignJWT({
    email: "owner@example.invalid", sub: "fixture-owner", iss: issuer,
    aud: env.JARVIS_ACCESS_AUDIENCE, iat: now(), exp: now() + 300, ...overrides,
  }).setProtectedHeader({ alg: algorithm, kid: "fixture-key" }).sign(key)
}
function request(path = "/api/home", jwt, options = {}) {
  const headers = new Headers(options.headers)
  if (jwt) headers.set("cf-access-jwt-assertion", jwt)
  return new Request(`https://jarvis.example${path}`, { ...options, headers })
}
function expectDenied(result, status) {
  assert.ok(result instanceof Response)
  assert.equal(result.status, status)
  assert.equal(result.headers.get("cache-control"), "no-store")
}

test("both explicitly allowed owner identities are accepted", async () => {
  for (const email of ["owner@example.invalid", "owner@example.invalid"]) {
    assert.deepEqual(await authorizeGatewayRequest(request("/api/home", await token({ email })), env, keys), {
      kind: "owner", identity: { subject: "fixture-owner", email },
    })
  }
})

test("missing configuration fails closed", async () => {
  for (const field of ["JARVIS_ACCESS_TEAM_DOMAIN", "JARVIS_ACCESS_AUDIENCE", "JARVIS_OWNER_EMAILS"]) {
    expectDenied(await authorizeOwner(request(), { ...env, [field]: "" }, keys), 503)
  }
})

test("invalid issuer configuration cannot become an arbitrary JWKS fetch", async () => {
  for (const domain of ["http://jarvis-test.cloudflareaccess.com", "https://evil.example", `${issuer}.evil.example`, `${issuer}/other`, `${issuer}?query=1`, "https://owner@example.invalid", "https://jarvis-test.cloudflareaccess.com:444"]) {
    expectDenied(await authorizeOwner(request(), { ...env, JARVIS_ACCESS_TEAM_DOMAIN: domain }, keys), 503)
  }
  expectDenied(await authorizeOwner(request(), { ...env, JARVIS_OWNER_EMAILS: "owner@example.invalid," }, keys), 503)
})

test("anonymous pages, reads, mutations and static-looking API URLs require login", async () => {
  for (const [path, method] of [["/", "GET"], ["/api/home", "GET"], ["/api/home/tasks", "POST"], ["/api/home/tasks/fixture", "PATCH"], ["/api/tasks/reorder", "POST"], ["/api/home.json", "GET"], ["/_next/static/example.js", "GET"]]) {
    expectDenied(await authorizeGatewayRequest(request(path, undefined, { method }), env, keys), 401)
  }
})

test("unsigned email and owner headers do not authenticate requests", async () => {
  expectDenied(await authorizeGatewayRequest(request("/api/home", undefined, { headers: {
    "cf-access-authenticated-user-email": "owner@example.invalid",
    "x-jarvis-owner-email": "owner@example.invalid", "x-jarvis-owner-id": "fixture-owner",
  } }), env, keys), 401)
})

test("a validly signed token for an unapproved user is denied", async () => {
  expectDenied(await authorizeOwner(request("/", await token({ email: "owner@example.invalid" })), env, keys), 403)
})

test("wrong issuer, wrong audience, expired and not-yet-valid tokens are denied", async () => {
  for (const changes of [{ iss: "https://other.cloudflareaccess.com" }, { aud: "other-app" }, { exp: now() - 60 }, { nbf: now() + 60 }]) {
    expectDenied(await authorizeOwner(request("/", await token(changes)), env, keys), 401)
  }
})

test("required identity and lifetime claims cannot be omitted", async () => {
  for (const claim of ["sub", "email", "exp", "iat"]) {
    expectDenied(await authorizeOwner(request("/", await token({ [claim]: undefined })), env, keys), 401)
  }
  expectDenied(await authorizeOwner(request("/", await token({ sub: "" })), env, keys), 403)
})

test("forged signature, altered claims and wrong algorithms are denied", async () => {
  const other = await generateKeyPair("RS256")
  expectDenied(await authorizeOwner(request("/", await token({}, other.privateKey)), env, keys), 401)
  const parts = (await token()).split(".")
  parts[1] = Buffer.from(JSON.stringify({ email: "owner@example.invalid" })).toString("base64url")
  expectDenied(await authorizeOwner(request("/", parts.join(".")), env, keys), 401)
  expectDenied(await authorizeOwner(request("/", await token({}, new TextEncoder().encode("fixture-hmac-key"), "HS256")), env, keys), 401)
  expectDenied(await authorizeOwner(request("/", "not-a-jwt"), env, keys), 401)
})

test("signing-key failures fail closed without leaking diagnostics", async () => {
  const failure = await authorizeOwner(request("/", await token()), env, async () => { throw new Error("private diagnostic") })
  expectDenied(failure, 401)
  assert.equal((await failure.text()).includes("private diagnostic"), false)
})

test("exact internal POST endpoints require their own token, even for an owner", async () => {
  for (const path of ["/_jarvis/agent-runtime/start", "/_jarvis/agent-runtime/resume", "/api/agent-runs/internal/prepare", "/api/agent-runs/internal/execute", "/api/agent-runs/internal/attach", "/api/internal/social-sync"]) {
    assert.deepEqual(await authorizeGatewayRequest(request(path, undefined, { method: "POST", headers: { [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN } }), env, keys), { kind: "internal" })
    expectDenied(await authorizeGatewayRequest(request(path, await token(), { method: "POST" }), env, keys), 401)
    expectDenied(await authorizeGatewayRequest(request(path, undefined, { method: "POST", headers: { [runtimeTokenHeader]: "wrong" } }), env, keys), 401)
    expectDenied(await authorizeGatewayRequest(request(path, undefined, { headers: { [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN } }), env, keys), 405)
  }
})

test("machine credentials do not grant access to arbitrary application routes", async () => {
  for (const path of ["/api/home", "/api/internal/social-sync/extra", "/api/internal/other", "/api/agent-runs/internal/execute/extra", "/_jarvis/agent-runtime/start/extra", "/api/home/tasks"]) {
    expectDenied(await authorizeGatewayRequest(request(path, undefined, { method: "POST", headers: { [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN } }), env, keys), 401)
  }
  assert.equal(validInternalToken("", ""), false)
  assert.equal(validInternalToken(undefined, env.AGENT_RUNTIME_INTERNAL_TOKEN), false)
  assert.equal(validInternalToken("é", "e"), false)
})

test("only the exact Zernio POST path reaches the canonical signature verifier", async () => {
  const incoming = request("/api/social/webhooks/zernio", undefined, {
    method: "POST", headers: { "x-zernio-signature": "fixture-signature", "x-jarvis-owner-email": "owner@example.invalid" },
    body: '{ "id": "fixture-event" }',
  })
  const authorization = await authorizeGatewayRequest(incoming, env, keys)
  assert.deepEqual(authorization, { kind: "signed-webhook" })
  const forwarded = requestForContainer(incoming, authorization)
  assert.equal(forwarded.headers.get("x-zernio-signature"), "fixture-signature")
  assert.equal(forwarded.headers.get("x-jarvis-owner-email"), null)
  assert.equal(await forwarded.text(), '{ "id": "fixture-event" }')
  expectDenied(await authorizeGatewayRequest(request("/api/social/webhooks/zernio"), env, keys), 405)
  for (const path of ["/api/social/webhooks/other", "/api/social/webhooks/zernio/extra", "/api/social/webhooks/zernio/", "/api/social/webhooks/zernio%2fextra"]) {
    expectDenied(await authorizeGatewayRequest(request(path, undefined, { method: "POST" }), env, keys), 401)
  }
})

test("forwarded owner identity replaces spoofed headers and removes machine credentials", async () => {
  const incoming = request("/api/home/tasks", await token(), { method: "POST", headers: {
    "x-jarvis-owner-id": "spoofed", "x-jarvis-owner-email": "owner@example.invalid",
    "cf-access-authenticated-user-email": "owner@example.invalid", [runtimeTokenHeader]: "spoofed-token",
  }, body: '{"title":"fixture"}' })
  const authorization = await authorizeGatewayRequest(incoming, env, keys)
  assert.equal(authorization.kind, "owner")
  const forwarded = requestForContainer(incoming, authorization)
  assert.equal(forwarded.headers.get("x-jarvis-owner-id"), "fixture-owner")
  assert.equal(forwarded.headers.get("x-jarvis-owner-email"), "owner@example.invalid")
  assert.equal(forwarded.headers.get("cf-access-authenticated-user-email"), null)
  assert.equal(forwarded.headers.get(runtimeTokenHeader), null)
  assert.equal(await forwarded.text(), '{"title":"fixture"}')
})

test("valid machine routes remain independent of browser Access configuration", async () => {
  const incoming = request("/api/internal/social-sync", undefined, { method: "POST", headers: {
    [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN, "x-jarvis-owner-id": "spoofed",
  } })
  const authorization = await authorizeGatewayRequest(incoming, { ...env, JARVIS_ACCESS_AUDIENCE: "" }, keys)
  assert.equal(authorization.kind, "internal")
  const forwarded = requestForContainer(incoming, authorization)
  assert.equal(forwarded.headers.get(runtimeTokenHeader), env.AGENT_RUNTIME_INTERNAL_TOKEN)
  assert.equal(forwarded.headers.get("x-jarvis-owner-id"), null)
})

test("production JWKS resolver fetches only the configured issuer's public keys", async (context) => {
  const calls = []
  context.mock.method(globalThis, "fetch", async (input, options) => {
    calls.push(String(input))
    assert.equal(String(input), `${issuer}/cdn-cgi/access/certs`)
    assert.equal(new Headers(options?.headers).has("cf-access-jwt-assertion"), false)
    return Response.json({ keys: [jwk] })
  })
  // Exercise the real createRemoteJWKSet path; outbound HTTP is mocked above.
  const owner = await authorizeOwner(request("/", await token()), env)
  assert.deepEqual(owner, { subject: "fixture-owner", email: "owner@example.invalid" })
  const second = await authorizeOwner(request("/", await token({ email: "owner@example.invalid" })), env)
  assert.equal(second.email, "owner@example.invalid")
  assert.equal(calls.length, 1)
})

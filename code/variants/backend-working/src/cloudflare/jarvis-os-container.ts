import { Container, getContainer } from "@cloudflare/containers"
import { WorkflowEntrypoint, env as workerEnv, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { authorizeGatewayRequest, requestForContainer, runtimeTokenHeader, type OwnerAccessConfig } from "./owner-access"

type JarvisContainerEnv = OwnerAccessConfig & {
  JARVIS_OS: unknown
  JARVIS_DEPLOYMENT_READY: string
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ANTHROPIC_API_KEY: string
  GEMINI_API_KEY: string
  TOPAZ_API_KEY: string
  ZERNIO_API_KEY: string
  ZERNIO_WEBHOOK_SECRET: string
  PINTEREST_ACCESS_TOKEN: string
  TAVILY_API_KEY: string
  CLIENT_VAULT_ENCRYPTION_KEY: string
  AI_CONTENT_STUDIO_MODE: string
  SOCIAL_INDIVIDUAL_PRODUCTION_MODE: string
  SOCIAL_PUBLISHING_MODE: string
  JARVIS_RUNTIME_WORKER_ORIGIN: string
  AGENT_RUNTIME_INTERNAL_TOKEN: string
  JARVIS_AGENT_RUNTIME_WORKFLOW: import("cloudflare:workers").Workflow<AgentRuntimeWorkflowPayload>
  JARVIS_OFFICE_TEAM_WORKFLOW: import("cloudflare:workers").Workflow<OfficeTeamWorkflowPayload>
  JARVIS_OFFICE_LIVE_ENABLED: string
}

type AgentRuntimeWorkflowPayload = { runId: string }
type OfficeTeamWorkflowPayload = { jobId: string }
type InternalRuntimeResponse = { waitForApproval?: boolean; terminal?: boolean; run?: { id?: string; status?: string } }

function validRunId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function callRuntimeContainer(env: JarvisContainerEnv, path: string, runId: string) {
  const response = await getContainer(env.JARVIS_OS as never, "production").fetch(`http://jarvis-internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN },
    body: JSON.stringify({ runId }),
  })
  if (!response.ok) throw new Error(`Agent Runtime container call failed with HTTP ${response.status}.`)
  return response.json<InternalRuntimeResponse>()
}

async function callOfficeContainer(env: JarvisContainerEnv, jobId: string) {
  const response = await getContainer(env.JARVIS_OS as never, "production").fetch("http://jarvis-internal/api/office/internal/execute", {
    method: "POST",
    headers: { "content-type": "application/json", [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN },
    body: JSON.stringify({ jobId }),
  })
  if (!response.ok) throw new Error(`Office container call failed with HTTP ${response.status}.`)
  return response.json<{ id: string; status: string }>()
}

/**
 * The application process is intentionally stateless. Supabase remains the
 * durable system of record; this Container only supplies the full Node runtime.
 */
export class JarvisOsContainer extends Container<JarvisContainerEnv> {
  defaultPort = 3000
  // Keep the owner workspace warm across short breaks; still sleep overnight.
  sleepAfter = "1h"
  pingEndpoint = "localhost/"
  envVars = {
    JARVIS_ACCESS_TEAM_DOMAIN: workerEnv.JARVIS_ACCESS_TEAM_DOMAIN,
    JARVIS_ACCESS_AUDIENCE: workerEnv.JARVIS_ACCESS_AUDIENCE,
    JARVIS_OWNER_EMAILS: workerEnv.JARVIS_OWNER_EMAILS,
    NEXT_PUBLIC_SUPABASE_URL: workerEnv.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: workerEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: workerEnv.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: workerEnv.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: workerEnv.GEMINI_API_KEY,
    TOPAZ_API_KEY: workerEnv.TOPAZ_API_KEY,
    ZERNIO_API_KEY: workerEnv.ZERNIO_API_KEY,
    ZERNIO_WEBHOOK_SECRET: workerEnv.ZERNIO_WEBHOOK_SECRET,
    PINTEREST_ACCESS_TOKEN: workerEnv.PINTEREST_ACCESS_TOKEN,
    TAVILY_API_KEY: workerEnv.TAVILY_API_KEY,
    CLIENT_VAULT_ENCRYPTION_KEY: workerEnv.CLIENT_VAULT_ENCRYPTION_KEY,
    AI_CONTENT_STUDIO_MODE: workerEnv.AI_CONTENT_STUDIO_MODE,
    SOCIAL_INDIVIDUAL_PRODUCTION_MODE: workerEnv.SOCIAL_INDIVIDUAL_PRODUCTION_MODE,
    SOCIAL_PUBLISHING_MODE: workerEnv.SOCIAL_PUBLISHING_MODE,
    JARVIS_RUNTIME_WORKER_ORIGIN: workerEnv.JARVIS_RUNTIME_WORKER_ORIGIN,
    AGENT_RUNTIME_INTERNAL_TOKEN: workerEnv.AGENT_RUNTIME_INTERNAL_TOKEN,
    JARVIS_OFFICE_LIVE_ENABLED: workerEnv.JARVIS_OFFICE_LIVE_ENABLED,
  }
}

/**
 * The Home visual-QA Worker must use its own Durable Object namespace and
 * Container application. Keeping this subclass separate prevents a preview
 * deployment from claiming either the production container or an older
 * preview container that uses JarvisOsContainer directly.
 */
export class JarvisOsPackage20PreviewContainer extends JarvisOsContainer {}

export class JarvisAgentRuntimeWorkflow extends WorkflowEntrypoint<JarvisContainerEnv, AgentRuntimeWorkflowPayload> {
  override async run(event: WorkflowEvent<AgentRuntimeWorkflowPayload>, step: WorkflowStep) {
    const runId = event.payload.runId
    const prepared = await step.do("prepare permissioned agent run", () => callRuntimeContainer(this.env, "/api/agent-runs/internal/prepare", runId))
    if (prepared.terminal) return prepared

    if (prepared.waitForApproval) {
      await step.waitForEvent<{ runId: string }>("wait for human approval", { type: "agent-approval", timeout: "7 days" })
    }

    return step.do("execute prepared agent run", () => callRuntimeContainer(this.env, "/api/agent-runs/internal/execute", runId))
  }
}

export class JarvisOfficeTeamWorkflow extends WorkflowEntrypoint<JarvisContainerEnv, OfficeTeamWorkflowPayload> {
  override async run(event: WorkflowEvent<OfficeTeamWorkflowPayload>, step: WorkflowStep) {
    const jobId = event.payload.jobId
    // Model calls can have uncertain provider outcomes. Never let Workflows replay
    // this step automatically; the saved job ledger requires manual reconciliation.
    return step.do("execute saved office team", { retries: { limit: 0, delay: "1 second" }, timeout: "15 minutes" },
      () => callOfficeContainer(this.env, jobId))
  }
}

const worker = {
  /**
   * Provider snapshots are only written when a refresh is requested, so the
   * dashboard serves stale numbers indefinitely if nothing asks — which is how
   * a seven-day provider outage went unnoticed. This trigger makes that
   * request on a schedule; the container owns per-client eligibility and the
   * ledger of what it wrote.
   */
  // Typed structurally: this project does not install @cloudflare/workers-types,
  // and waitUntil is the only part of the execution context this handler needs.
  async scheduled(_controller: unknown, env: JarvisContainerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const response = await getContainer(env.JARVIS_OS as never, "production").fetch("http://jarvis-internal/api/internal/social-sync", {
          method: "POST",
          headers: { "content-type": "application/json", [runtimeTokenHeader]: env.AGENT_RUNTIME_INTERNAL_TOKEN },
        })
        // A partial refresh returns 207 with a per-client ledger. Log the body
        // either way so a failing provider is visible in Worker logs instead of
        // disappearing into a silent success.
        console.log(`[social-sync] HTTP ${response.status} ${await response.text()}`)
      })(),
    )
  },

  async fetch(request: Request, env: JarvisContainerEnv): Promise<Response> {
    if (env.JARVIS_DEPLOYMENT_READY !== "true") {
      return new Response("Jarvis OS deployment is being configured.", {
        status: 503,
        headers: { "cache-control": "no-store" },
      })
    }

    const url = new URL(request.url)
    const authorization = await authorizeGatewayRequest(request, env)
    if (authorization instanceof Response) return authorization

    if (url.pathname === "/_jarvis/agent-runtime/start" || url.pathname === "/_jarvis/agent-runtime/resume") {
      const body = await request.json().catch(() => null)
      const runId = body && typeof body === "object" ? (body as { runId?: unknown }).runId : undefined
      if (!validRunId(runId)) return Response.json({ error: "runId is required." }, { status: 400 })

      if (url.pathname.endsWith("/start")) {
        try {
          const instance = await env.JARVIS_AGENT_RUNTIME_WORKFLOW.create({ id: runId, params: { runId } })
          return Response.json({ workflowInstanceId: instance.id, reused: false })
        } catch (error) {
          // A duplicate delivery must attach to the same durable instance rather
          // than executing a second run. The run ledger owns the final state.
          return Response.json({ workflowInstanceId: runId, reused: true, detail: error instanceof Error ? error.message : "Workflow instance already exists." })
        }
      }

      try {
        const instance = await env.JARVIS_AGENT_RUNTIME_WORKFLOW.get(runId)
        await instance.sendEvent({ type: "agent-approval", payload: { runId } })
        return Response.json({ workflowInstanceId: runId, resumed: true })
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Workflow resume failed." }, { status: 409 })
      }
    }

    if (url.pathname === "/_jarvis/office/start") {
      const body = await request.json().catch(() => null)
      const jobId = body && typeof body === "object" ? (body as { jobId?: unknown }).jobId : undefined
      if (!validRunId(jobId)) return Response.json({ error: "jobId is required." }, { status: 400 })
      try {
        const instance = await env.JARVIS_OFFICE_TEAM_WORKFLOW.create({ id: `office-${jobId}`, params: { jobId } })
        return Response.json({ workflowInstanceId: instance.id, reused: false })
      } catch {
        // Only report a duplicate if the durable instance actually exists.
        try {
          const existing = await env.JARVIS_OFFICE_TEAM_WORKFLOW.get(`office-${jobId}`)
          return Response.json({ workflowInstanceId: existing.id, reused: true })
        } catch {
          return Response.json({ error: "Office Workflow could not be started." }, { status: 503 })
        }
      }
    }

    return getContainer(env.JARVIS_OS as never, "production").fetch(requestForContainer(request, authorization))
  },
}

export default worker

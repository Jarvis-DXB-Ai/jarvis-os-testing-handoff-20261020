import "server-only"

import { timingSafeEqual } from "crypto"

import { AgentRuntimeError, executePreparedAgentRun, prepareAgentRun } from "@/lib/agent-runtime-server"

const INTERNAL_HEADER = "x-jarvis-agent-runtime-token"

function token() { return process.env.AGENT_RUNTIME_INTERNAL_TOKEN?.trim() ?? "" }

export function isAgentRuntimeInternalRequest(request: Request) {
  const expected = token()
  const supplied = request.headers.get(INTERNAL_HEADER) ?? ""
  if (!expected || !supplied || expected.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(supplied, "utf8"))
}

async function workerRequest(request: Request, path: "start" | "resume", runId: string) {
  const expected = token()
  if (!expected) throw new AgentRuntimeError("Agent Runtime internal token is not configured.", 503)
  const origin = process.env.JARVIS_RUNTIME_WORKER_ORIGIN?.trim() || new URL(request.url).origin
  const response = await fetch(`${origin}/_jarvis/agent-runtime/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", [INTERNAL_HEADER]: expected },
    body: JSON.stringify({ runId }),
    cache: "no-store",
  })
  if (!response.ok) throw new AgentRuntimeError(`Agent Runtime Workflow ${path} failed with HTTP ${response.status}.`, 502)
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (path === "start" && typeof result.workflowInstanceId === "string") {
    const attached = await fetch(`${origin}/api/agent-runs/internal/attach`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_HEADER]: expected },
      body: JSON.stringify({ runId, workflowInstanceId: result.workflowInstanceId }),
      cache: "no-store",
    })
    if (!attached.ok) throw new AgentRuntimeError(`Agent Runtime Workflow attachment failed with HTTP ${attached.status}.`, 502)
  }
  return result
}

export async function dispatchAgentRun(request: Request, runId: string) {
  if (process.env.NODE_ENV !== "production") {
    const prepared = await prepareAgentRun(runId)
    return prepared.waitForApproval || prepared.terminal ? prepared : executePreparedAgentRun(runId)
  }
  return workerRequest(request, "start", runId)
}

export async function resumeAgentRun(request: Request, runId: string) {
  if (process.env.NODE_ENV !== "production") return executePreparedAgentRun(runId)
  return workerRequest(request, "resume", runId)
}

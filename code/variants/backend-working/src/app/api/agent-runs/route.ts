import { NextRequest, NextResponse } from "next/server"

import { dispatchAgentRun } from "@/lib/agent-runtime-dispatch-server"
import { agentRuntimeErrorResponse, createAgentRun, loadAgentRunsSnapshot } from "@/lib/agent-runtime-server"

export const runtime = "nodejs"

export async function GET() {
  try { return NextResponse.json(await loadAgentRunsSnapshot()) }
  catch (error) { const failure = agentRuntimeErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const created = await createAgentRun({
      agentKey: typeof body.agentKey === "string" ? body.agentKey : "",
      goal: typeof body.goal === "string" ? body.goal : undefined,
      triggerType: body.triggerType === "manual" || body.triggerType === "scheduled" || body.triggerType === "event" || body.triggerType === "delegated" ? body.triggerType : "manual",
      triggerReference: typeof body.triggerReference === "string" ? body.triggerReference : null,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      resourceKey: typeof body.resourceKey === "string" ? body.resourceKey : undefined,
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      parentRunId: typeof body.parentRunId === "string" ? body.parentRunId : null,
    })
    const dispatch = await dispatchAgentRun(request, created.run.id)
    return NextResponse.json({ run: created.run, reused: created.reused, dispatch }, { status: created.reused ? 200 : 201 })
  } catch (error) {
    const failure = agentRuntimeErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

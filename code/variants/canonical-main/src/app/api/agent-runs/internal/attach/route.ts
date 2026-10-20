import { NextRequest, NextResponse } from "next/server"

import { isAgentRuntimeInternalRequest } from "@/lib/agent-runtime-dispatch-server"
import { AgentRuntimeError, agentRuntimeErrorResponse, attachWorkflowInstance } from "@/lib/agent-runtime-server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!isAgentRuntimeInternalRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { runId?: unknown; workflowInstanceId?: unknown }
    if (typeof body.runId !== "string" || typeof body.workflowInstanceId !== "string") throw new AgentRuntimeError("runId and workflowInstanceId are required.", 400)
    return NextResponse.json({ run: await attachWorkflowInstance(body.runId, body.workflowInstanceId) })
  } catch (error) {
    const failure = agentRuntimeErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { resumeAgentRun } from "@/lib/agent-runtime-dispatch-server"
import { AgentRuntimeError, agentRuntimeErrorResponse, decideAgentRunApproval } from "@/lib/agent-runtime-server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const [{ runId }, body] = await Promise.all([context.params, request.json().catch(() => ({}))])
    if (typeof body.approved !== "boolean") throw new AgentRuntimeError("Approval decision is required.", 400)
    const run = await decideAgentRunApproval(runId, body.approved, typeof body.decisionNote === "string" ? body.decisionNote : undefined)
    const dispatch = body.approved ? await resumeAgentRun(request, run.id) : null
    return NextResponse.json({ run, dispatch })
  } catch (error) {
    const failure = agentRuntimeErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

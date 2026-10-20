import { NextRequest, NextResponse } from "next/server"

import { isAgentRuntimeInternalRequest } from "@/lib/agent-runtime-dispatch-server"
import { agentRuntimeErrorResponse, prepareAgentRun } from "@/lib/agent-runtime-server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!isAgentRuntimeInternalRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { runId?: unknown }
    if (typeof body.runId !== "string") return NextResponse.json({ error: "runId is required." }, { status: 400 })
    return NextResponse.json(await prepareAgentRun(body.runId))
  } catch (error) {
    const failure = agentRuntimeErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

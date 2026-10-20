import { NextRequest, NextResponse } from "next/server"

import { dispatchAgentRun } from "@/lib/agent-runtime-dispatch-server"
import { agentRuntimeErrorResponse, createSocialIntelligenceRun } from "@/lib/agent-runtime-server"
import { latestSocialIntelligenceArtifact } from "@/lib/social-intelligence-runtime-server"
import { isUuid } from "@/lib/client-brain-v2-server-core"

export const runtime = "nodejs"

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid client ID." }, { status: 400 })
  try { return NextResponse.json({ artifact: await latestSocialIntelligenceArtifact(id) }) }
  catch (error) { const failure = agentRuntimeErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid client ID." }, { status: 400 })
  try {
    const created = await createSocialIntelligenceRun(id)
    const dispatch = await dispatchAgentRun(request, created.run.id)
    return NextResponse.json({ run: created.run, reused: created.reused, dispatch, dataRevision: created.context.dataRevision }, { status: created.reused ? 200 : 201 })
  } catch (error) {
    const failure = agentRuntimeErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

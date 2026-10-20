import { NextRequest, NextResponse } from "next/server"
import { AgentsV2Error, updateAgent } from "@/lib/agents-v2-server"

export const runtime = "nodejs"
function failure(error: unknown) { const known = error instanceof AgentsV2Error ? error : new AgentsV2Error("Agents request failed.", 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function PATCH(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  try { const [{ agentId }, body] = await Promise.all([context.params, request.json()]); if (!body || typeof body.expectedUpdatedAt !== "string" || !body.patch || typeof body.patch !== "object") throw new AgentsV2Error("Agent update request is invalid."); return NextResponse.json(await updateAgent(agentId, body.expectedUpdatedAt, body.patch as Record<string, unknown>)) } catch (error) { return failure(error) }
}

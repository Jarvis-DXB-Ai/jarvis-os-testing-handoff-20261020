import { NextRequest, NextResponse } from "next/server"
import { AgentsV2Error, createAgent, loadAgentsV2Snapshot } from "@/lib/agents-v2-server"

export const runtime = "nodejs"
function failure(error: unknown) { const known = error instanceof AgentsV2Error ? error : new AgentsV2Error("Agents request failed.", 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function GET() { try { return NextResponse.json(await loadAgentsV2Snapshot()) } catch (error) { return failure(error) } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await createAgent(await request.json()), { status: 201 }) } catch (error) { return failure(error) } }

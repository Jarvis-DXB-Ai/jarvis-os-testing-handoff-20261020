import { NextResponse } from "next/server"
import { createRoadmapIdea, loadRoadmapSnapshot, RoadmapError } from "@/lib/roadmap-server"

export const dynamic = "force-dynamic"

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to process Idea Vault request." }, { status: error instanceof RoadmapError ? error.status : 500 })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const snapshot = await createRoadmapIdea(body.projectId, body.idea ?? body)
    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}

export async function GET() {
  try { return NextResponse.json(await loadRoadmapSnapshot()) } catch (error) { return errorResponse(error) }
}

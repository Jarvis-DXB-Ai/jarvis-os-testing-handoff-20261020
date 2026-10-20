import { NextResponse } from "next/server"
import { loadRoadmapSnapshot, RoadmapError, updateRoadmapIdea } from "@/lib/roadmap-server"

export const dynamic = "force-dynamic"

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to update Idea." }, { status: error instanceof RoadmapError ? error.status : 500 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  try {
    const { ideaId } = await params
    const body = await request.json()
    const snapshot = await updateRoadmapIdea(ideaId, body.expectedUpdatedAt, body.idea ?? body)
    return NextResponse.json({ snapshot })
  } catch (error) { return errorResponse(error) }
}

export async function GET() {
  try { return NextResponse.json(await loadRoadmapSnapshot()) } catch (error) { return errorResponse(error) }
}

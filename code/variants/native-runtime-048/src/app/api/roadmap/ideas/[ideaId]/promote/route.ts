import { NextResponse } from "next/server"
import { promoteRoadmapIdea, RoadmapError } from "@/lib/roadmap-server"

export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  try {
    const { ideaId } = await params
    const body = await request.json()
    const snapshot = await promoteRoadmapIdea(ideaId, body.expectedUpdatedAt, body.promotion ?? body)
    return NextResponse.json({ snapshot })
  } catch (error) {
    return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to promote Idea." }, { status: error instanceof RoadmapError ? error.status : 500 })
  }
}

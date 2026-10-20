import { NextResponse } from "next/server"
import { addRoadmapDependency, createRoadmapIdea, createRoadmapItem, loadRoadmapSnapshot, RoadmapError } from "@/lib/roadmap-server"

export const dynamic = "force-dynamic"

function errorResponse(error: unknown) { return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to process roadmap request." }, { status: error instanceof RoadmapError ? error.status : 500 }) }

export async function GET() {
  try { return NextResponse.json(await loadRoadmapSnapshot()) } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (body.action === "capture_idea") {
      if (!body.projectId) return NextResponse.json({ error: "A Roadmap project is required." }, { status: 400 })
      const snapshot = await createRoadmapIdea(body.projectId, {
        title: body.title,
        description: body.description,
        category: "other",
        potential_phase_id: body.phaseId,
        potential_value: "medium",
        complexity: "medium",
        status: "idea",
      })
      return NextResponse.json({ snapshot }, { status: 201 })
    }
    if (body.action === "create") {
      const item = await createRoadmapItem({ ...body, itemType: body.itemType, status: body.status })
      return NextResponse.json({ item, snapshot: await loadRoadmapSnapshot() }, { status: 201 })
    }
    if (body.action === "add_dependency") {
      await addRoadmapDependency(body.itemId, body.dependsOnItemId)
      return NextResponse.json({ snapshot: await loadRoadmapSnapshot() })
    }
    return NextResponse.json({ error: "Unsupported roadmap action." }, { status: 400 })
  } catch (error) { return errorResponse(error) }
}

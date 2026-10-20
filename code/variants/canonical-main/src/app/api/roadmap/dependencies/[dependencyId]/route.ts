import { NextResponse } from "next/server"
import { loadRoadmapSnapshot, removeRoadmapDependency, RoadmapError } from "@/lib/roadmap-server"

export async function DELETE(_: Request, { params }: { params: Promise<{ dependencyId: string }> }) {
  try { const { dependencyId } = await params; await removeRoadmapDependency(dependencyId); return NextResponse.json({ snapshot: await loadRoadmapSnapshot() }) } catch (error) { return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to remove dependency." }, { status: error instanceof RoadmapError ? error.status : 500 }) }
}

import { NextResponse } from "next/server"
import { archiveRoadmapItem, loadRoadmapSnapshot, RoadmapError, updateRoadmapItem } from "@/lib/roadmap-server"

export const dynamic = "force-dynamic"
function errorResponse(error: unknown) { return NextResponse.json({ error: error instanceof RoadmapError ? error.message : "Unable to update roadmap item." }, { status: error instanceof RoadmapError ? error.status : 500 }) }

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try { const { itemId } = await params; const body = await request.json(); await updateRoadmapItem(itemId, body.expectedUpdatedAt, body.patch ?? {}); return NextResponse.json({ snapshot: await loadRoadmapSnapshot() }) } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try { const { itemId } = await params; const body = await request.json(); await archiveRoadmapItem(itemId, body.expectedUpdatedAt); return NextResponse.json({ snapshot: await loadRoadmapSnapshot() }) } catch (error) { return errorResponse(error) }
}

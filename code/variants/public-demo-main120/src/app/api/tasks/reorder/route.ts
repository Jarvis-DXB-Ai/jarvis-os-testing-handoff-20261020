import { NextRequest, NextResponse } from "next/server"

import { reorderTasks, tasksBoardErrorResponse } from "@/lib/tasks-board-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    return NextResponse.json({ reordered: await reorderTasks(body) })
  } catch (error) {
    const failure = tasksBoardErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { homeDashboardErrorResponse, updateHomeTask } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function PATCH(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    return NextResponse.json({ task: await updateHomeTask(taskId, body) })
  } catch (error) { const failure = homeDashboardErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

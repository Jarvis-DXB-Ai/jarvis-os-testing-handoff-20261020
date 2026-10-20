import { NextRequest, NextResponse } from "next/server"

import { createHomeTask, homeDashboardErrorResponse, reviewCompletedHomeTasks } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (body.action === "review_all") return NextResponse.json({ tasks: await reviewCompletedHomeTasks() })
    return NextResponse.json({ task: await createHomeTask(body) }, { status: 201 })
  } catch (error) { const failure = homeDashboardErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

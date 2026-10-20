import { NextRequest, NextResponse } from "next/server"

import { createHomeTaskForBoardColumn, homeDashboardErrorResponse } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    return NextResponse.json({ task: await createHomeTaskForBoardColumn(body) }, { status: 201 })
  } catch (error) {
    const failure = homeDashboardErrorResponse(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}

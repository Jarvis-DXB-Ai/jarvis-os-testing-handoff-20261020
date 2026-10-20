import { NextResponse } from "next/server"

import { getHomeDashboardData, homeDashboardErrorResponse } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET() {
  try { return NextResponse.json(await getHomeDashboardData()) }
  catch (error) { const failure = homeDashboardErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

import { NextRequest, NextResponse } from "next/server"

import { acceptHomeSuggestion, dismissHomeSuggestion, homeDashboardErrorResponse } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const dedupeIdentity = typeof body.dedupeIdentity === "string" ? body.dedupeIdentity : ""
    const evidenceHash = typeof body.evidenceHash === "string" ? body.evidenceHash : ""
    if (body.action === "accept") return NextResponse.json({ task: await acceptHomeSuggestion(dedupeIdentity, evidenceHash) }, { status: 201 })
    if (body.action === "dismiss") { await dismissHomeSuggestion(dedupeIdentity, evidenceHash); return NextResponse.json({ dismissed: true }) }
    return NextResponse.json({ error: "Suggestion action is invalid." }, { status: 400 })
  } catch (error) { const failure = homeDashboardErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

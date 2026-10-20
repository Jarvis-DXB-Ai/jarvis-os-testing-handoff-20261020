import { NextResponse } from "next/server"
import { socialClientScopeFromSearchParams } from "@/lib/social-client-config"
import { getAnalytics } from "@/lib/zernio-server"
import type { SocialAnalyticsRange } from "@/lib/zernio"

function analyticsRange(value: string | null): SocialAnalyticsRange {
  return value === "30d" || value === "90d" || value === "all" ? value : "all"
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json(await getAnalytics(analyticsRange(searchParams.get("range")), socialClientScopeFromSearchParams(searchParams)))
}

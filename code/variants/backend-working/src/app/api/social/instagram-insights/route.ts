import { NextResponse } from "next/server"
import { socialClientScopeFromSearchParams } from "@/lib/social-client-config"
import { getInstagramAccountInsights } from "@/lib/zernio-server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json(await getInstagramAccountInsights(socialClientScopeFromSearchParams(searchParams)))
}

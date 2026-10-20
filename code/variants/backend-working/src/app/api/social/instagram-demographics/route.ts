import { NextResponse } from "next/server"
import { socialClientScopeFromSearchParams } from "@/lib/social-client-config"
import { getInstagramDemographics } from "@/lib/zernio-server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json(await getInstagramDemographics(socialClientScopeFromSearchParams(searchParams)))
}

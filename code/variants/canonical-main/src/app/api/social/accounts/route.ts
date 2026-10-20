import { NextResponse } from "next/server"
import { socialClientScopeFromSearchParams } from "@/lib/social-client-config"
import { getAccounts } from "@/lib/zernio-server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json(await getAccounts(socialClientScopeFromSearchParams(searchParams)))
}

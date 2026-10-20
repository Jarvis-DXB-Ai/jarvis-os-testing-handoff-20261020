import { NextResponse } from "next/server"
import { getPinterestGroups } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getPinterestGroups())
}

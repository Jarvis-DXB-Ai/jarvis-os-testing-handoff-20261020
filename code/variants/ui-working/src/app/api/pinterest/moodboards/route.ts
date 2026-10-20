import { NextResponse } from "next/server"
import { getPinterestMoodboards } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getPinterestMoodboards())
}

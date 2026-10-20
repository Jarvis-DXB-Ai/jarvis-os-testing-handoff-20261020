import { NextResponse } from "next/server"
import { getHighlights } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getHighlights())
}

import { NextResponse } from "next/server"
import { getPinterestBoards } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getPinterestBoards())
}

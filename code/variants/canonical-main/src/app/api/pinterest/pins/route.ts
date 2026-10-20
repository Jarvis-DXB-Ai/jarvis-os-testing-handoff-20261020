import { NextResponse } from "next/server"
import { getPinterestBoardPins } from "@/lib/zernio-server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json(await getPinterestBoardPins(searchParams.get("boardId")))
}

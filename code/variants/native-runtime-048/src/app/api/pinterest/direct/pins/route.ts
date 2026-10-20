import { NextResponse } from "next/server"
import { getDirectPinterestBoardPins, getDirectPinterestPin } from "@/lib/pinterest-server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pinId = searchParams.get("pinId")
  if (pinId) return NextResponse.json(await getDirectPinterestPin(pinId))
  return NextResponse.json(await getDirectPinterestBoardPins(searchParams.get("boardId"), searchParams.get("boardName")))
}

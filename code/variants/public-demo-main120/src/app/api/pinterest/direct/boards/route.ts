import { NextResponse } from "next/server"
import { getDirectPinterestBoards } from "@/lib/pinterest-server"

export async function GET() {
  return NextResponse.json(await getDirectPinterestBoards())
}

import { NextResponse } from "next/server"
import { getInbox } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getInbox())
}

import { NextResponse } from "next/server"
import { getComments } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getComments())
}

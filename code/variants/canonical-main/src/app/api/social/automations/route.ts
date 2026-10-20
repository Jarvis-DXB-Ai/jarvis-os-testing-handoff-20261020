import { NextResponse } from "next/server"
import { getAutomations } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getAutomations())
}

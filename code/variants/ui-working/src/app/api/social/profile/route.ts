import { NextResponse } from "next/server"
import { getProfiles } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getProfiles())
}

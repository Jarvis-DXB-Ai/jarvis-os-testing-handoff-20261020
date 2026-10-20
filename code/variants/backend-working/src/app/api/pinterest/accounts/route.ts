import { NextResponse } from "next/server"
import { getPinterestAccounts } from "@/lib/zernio-server"

export async function GET() {
  return NextResponse.json(await getPinterestAccounts())
}

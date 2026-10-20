import { NextResponse } from "next/server"
import { getCachedSocialPerformance, syncSocialPerformance } from "@/lib/social-performance-server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, error: "Invalid client ID." }, { status: 400 })
  try { return NextResponse.json({ ok: true, performance: await getCachedSocialPerformance(id) }) }
  catch { return NextResponse.json({ ok: false, error: "Unable to load cached social performance." }, { status: 500 }) }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, error: "Invalid client ID." }, { status: 400 })
  try { return NextResponse.json({ ok: true, performance: await syncSocialPerformance(id) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to refresh Zernio insights." }, { status: 409 }) }
}

import { NextResponse } from "next/server"
import { getSocialProviderConnections, syncDemoClientBZernioConnections } from "@/lib/social-provider-connections-server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validClientId(id: string) {
  return UUID_PATTERN.test(id)
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validClientId(id)) return NextResponse.json({ ok: false, error: "Invalid client ID." }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, snapshot: await getSocialProviderConnections(id) })
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load cached provider connections." }, { status: 500 })
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validClientId(id)) return NextResponse.json({ ok: false, error: "Invalid client ID." }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, snapshot: await syncDemoClientBZernioConnections(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to synchronize Zernio connections."
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}

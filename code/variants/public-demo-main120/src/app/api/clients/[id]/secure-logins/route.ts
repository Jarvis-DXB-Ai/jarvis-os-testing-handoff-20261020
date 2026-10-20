import { NextResponse } from "next/server"
import { createSecureLogin, listSecureLogins } from "@/lib/client-secure-logins-server"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return NextResponse.json({ ok: true, logins: await listSecureLogins(id) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Logins." }, { status: 400 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const body = await request.json() as Record<string, unknown>; return NextResponse.json({ ok: true, id: await createSecureLogin(id, body) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save Login." }, { status: 400 }) }
}

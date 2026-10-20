import { NextResponse } from "next/server"
import { archiveSecureLogin, deleteSecureLogin, revealSecureLoginSecret, updateSecureLogin } from "@/lib/client-secure-logins-server"

export const runtime = "nodejs"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; credentialId: string }> }) {
  try { const { id, credentialId } = await params; await updateSecureLogin(id, credentialId, await request.json() as Record<string, unknown>); return NextResponse.json({ ok: true }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update Login." }, { status: 400 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; credentialId: string }> }) {
  try {
    const { id, credentialId } = await params; const body = await request.json() as { action?: string }
    if (body.action === "reveal" || body.action === "copy") return NextResponse.json({ ok: true, secret: await revealSecureLoginSecret(id, credentialId, body.action === "copy" ? "copied" : "revealed") })
    if (body.action === "archive") { await archiveSecureLogin(id, credentialId); return NextResponse.json({ ok: true }) }
    if (body.action === "delete") { await deleteSecureLogin(id, credentialId); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ ok: false, error: "Unsupported Login action." }, { status: 400 })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update Login." }, { status: 400 }) }
}

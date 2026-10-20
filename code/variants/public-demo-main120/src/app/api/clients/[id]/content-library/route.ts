import { NextResponse } from "next/server"
import { archiveClientContent, createContentMonth, loadClientContentLibrary } from "@/lib/client-content-library-server"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return NextResponse.json({ ok: true, ...(await loadClientContentLibrary(id)) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Content." }, { status: 400 }) }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const body = await request.json() as { action?: string; monthStart?: string; itemId?: string }; if (body.action === "create_month") return NextResponse.json({ ok: true, month: await createContentMonth(id, body.monthStart) }); if (body.action === "archive") { await archiveClientContent(id, body.itemId ?? ""); return NextResponse.json({ ok: true }) }; return NextResponse.json({ ok: false, error: "Unsupported Content action." }, { status: 400 }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update Content." }, { status: 400 }) }
}

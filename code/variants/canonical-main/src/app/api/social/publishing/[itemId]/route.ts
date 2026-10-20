import { NextResponse } from "next/server"
import { markItemScheduled, removeContentItemFromCalendar, updateContentItem } from "@/lib/social-publishing-server"

export const runtime = "nodejs"

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.clientId !== "string") return NextResponse.json({ ok: false, error: "A client ID is required." }, { status: 400 })
  const { itemId } = await params
  try {
    if (body.action === "schedule") await markItemScheduled(body.clientId, itemId)
    else await updateContentItem(body.clientId, itemId, body)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update Social content." }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.clientId !== "string") return NextResponse.json({ ok: false, error: "A client ID is required." }, { status: 400 })
  try {
    await removeContentItemFromCalendar(body.clientId, (await params).itemId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to remove this calendar item." }, { status: 400 })
  }
}

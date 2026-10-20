import { NextResponse } from "next/server"
import { uploadClientContent } from "@/lib/client-content-library-server"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return NextResponse.json({ ok: true, itemIds: await uploadClientContent(id, await request.formData()) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to upload Content." }, { status: 400 }) }
}

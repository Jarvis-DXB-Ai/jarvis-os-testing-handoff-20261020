import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { deleteAiContentSession, getAiContentSession, updateAiContentSession } from '@/lib/ai-content-studio'
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try { const { id, sessionId } = await params; return NextResponse.json(await getAiContentSession(id, sessionId)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try { const { id, sessionId } = await params; return NextResponse.json(await updateAiContentSession(id, sessionId, await request.json())) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const { id, sessionId } = await params
    await deleteAiContentSession(id, sessionId)
    return NextResponse.json({ ok: true })
  } catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

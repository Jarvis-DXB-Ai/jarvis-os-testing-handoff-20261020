import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { removeAiContentReference, updateAiContentReference } from '@/lib/ai-content-studio'
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string; referenceId: string }> }) {
  try { const { id, sessionId, referenceId } = await params; return NextResponse.json(await updateAiContentReference(id, sessionId, referenceId, await request.json())) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string; referenceId: string }> }) {
  try { const { id, sessionId, referenceId } = await params; return NextResponse.json(await removeAiContentReference(id, sessionId, referenceId)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

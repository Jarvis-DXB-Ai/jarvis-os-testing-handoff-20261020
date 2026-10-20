import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { updateAiContentPrompt } from '@/lib/ai-content-studio'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string; promptId: string }> }) {
  try { const { id, sessionId, promptId } = await params; const body = await request.json() as { providerPrompt?: unknown }; return NextResponse.json(await updateAiContentPrompt(id, sessionId, promptId, body.providerPrompt)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

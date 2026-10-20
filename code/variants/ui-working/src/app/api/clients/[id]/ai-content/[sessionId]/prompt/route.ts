import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { createAiContentPrompt } from '@/lib/ai-content-studio'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const { id, sessionId } = await params
    const body = await request.json().catch(() => ({})) as { correction?: unknown; request_id?: unknown }
    return NextResponse.json(await createAiContentPrompt(id, sessionId, typeof body.request_id === 'string' ? body.request_id : '', typeof body.correction === 'string' ? body.correction : undefined))
  }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

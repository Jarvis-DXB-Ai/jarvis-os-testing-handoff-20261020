import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { generateAiContent } from '@/lib/ai-content-studio'
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try { const { id, sessionId } = await params; const body = await request.json().catch(() => ({})) as { promptVersionId?: string; requestId?: string }; return NextResponse.json(await generateAiContent(id, sessionId, body.promptVersionId, body.requestId)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

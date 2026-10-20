import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { addAiContentReference, uploadAiContentReference } from '@/lib/ai-content-studio'
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const { id, sessionId } = await params
    if (request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json(await uploadAiContentReference(id, sessionId, await request.formData()))
    return NextResponse.json(await addAiContentReference(id, sessionId, await request.json()))
  } catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { analysePinterestInspirationBatch } from '@/lib/client-brain-pinterest-inspiration-server'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await analysePinterestInspirationBatch(clientId, body?.ids, body?.analysis_state)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

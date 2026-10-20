import { NextRequest, NextResponse } from 'next/server'
import {
  parseClientBrainV2RetrievalRequest,
  retrieveClientBrainContext,
} from '@/lib/client-brain-v2-retrieval'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    const retrievalRequest = parseClientBrainV2RetrievalRequest(body)
    const result = await retrieveClientBrainContext(clientId, retrievalRequest)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

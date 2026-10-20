import { NextRequest, NextResponse } from 'next/server'
import { enrichClientBrainV2Asset } from '@/lib/client-brain-v2-asset-enrichment'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const { id: clientId, assetId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await enrichClientBrainV2Asset(clientId, assetId, body)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

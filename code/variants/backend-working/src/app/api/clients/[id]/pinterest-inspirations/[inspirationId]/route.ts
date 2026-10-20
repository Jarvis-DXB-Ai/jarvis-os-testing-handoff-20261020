import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { deletePinterestInspiration, savePinterestInspiration } from '@/lib/client-brain-pinterest-inspiration-server'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; inspirationId: string }> }) {
  try {
    const { id: clientId, inspirationId } = await context.params
    return NextResponse.json({ success: true, ...(await savePinterestInspiration(clientId, inspirationId, await request.json())) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; inspirationId: string }> }) {
  try {
    const { id: clientId, inspirationId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await deletePinterestInspiration(clientId, inspirationId, body?.expected_updated_at)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

import { NextResponse } from 'next/server'
import { deleteClientBrainV2Source } from '@/lib/client-brain-v2-source-mutations'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; sourceId: string }> }) {
  try {
    const { id: clientId, sourceId } = await context.params
    return NextResponse.json({ success: true, ...(await deleteClientBrainV2Source(clientId, sourceId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

import { NextResponse } from 'next/server'
import { listClientBrainV2SourceTargets } from '@/lib/client-brain-v2-source-mutations'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    return NextResponse.json({ success: true, ...(await listClientBrainV2SourceTargets(clientId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

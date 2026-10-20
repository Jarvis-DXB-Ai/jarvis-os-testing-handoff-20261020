import { ownerForRequest } from "@/lib/owner-request-server"
import { NextRequest, NextResponse } from 'next/server'
import { loadClientBrainV2AssetThumbnails } from '@/lib/client-brain-v2-assets-server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const owner = await ownerForRequest(request)
  if (owner instanceof Response) return owner
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const { id: clientId } = await context.params
    const body = await request.json().catch(() => null)
    return NextResponse.json({ success: true, ...(await loadClientBrainV2AssetThumbnails(clientId, body?.assetIds)) }, { headers })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status, headers })
  }
}

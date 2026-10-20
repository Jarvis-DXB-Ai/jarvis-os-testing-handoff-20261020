import { ownerForRequest } from "@/lib/owner-request-server"
import { NextRequest, NextResponse } from 'next/server'
import { classifyClientBrainV2Asset, deleteClientBrainV2Asset, saveClientBrainV2AssetMetadata } from '@/lib/client-brain-v2-asset-mutations'
import { loadClientBrainV2AssetDetail } from '@/lib/client-brain-v2-assets-server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  const owner = await ownerForRequest(request)
  if (owner instanceof Response) return owner
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const { id: clientId, assetId } = await context.params
    return NextResponse.json({ success: true, ...(await loadClientBrainV2AssetDetail(clientId, assetId, true)) }, { headers })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status, headers })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const { id: clientId, assetId } = await context.params
    const body = await request.json()
    const result = body?.action === 'classify'
      ? await classifyClientBrainV2Asset(clientId, assetId, body)
      : await saveClientBrainV2AssetMetadata(clientId, assetId, body)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const { id: clientId, assetId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await deleteClientBrainV2Asset(clientId, assetId, body)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

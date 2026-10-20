import { NextRequest, NextResponse } from 'next/server'
import {
  cancelAssetIngestion,
  analyseAssetIngestionProduct,
  analyseAssetIngestionVenue,
  finalizeAssetIngestion,
  generateAssetIngestionStudioReference,
  loadAssetIngestionOptions,
  matchAssetIngestionMenu,
  selectAssetIngestionMenu,
  stageAssetIngestion,
} from '@/lib/client-brain-v2-asset-ingestion'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    return NextResponse.json({ success: true, ...(await loadAssetIngestionOptions(clientId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: true, ...(await stageAssetIngestion(clientId, await request.formData())) })
    }
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    const result = action === 'menu_match'
      ? await matchAssetIngestionMenu(clientId, body)
      : action === 'menu_select'
        ? await selectAssetIngestionMenu(clientId, body)
        : action === 'analyse_product'
          ? await analyseAssetIngestionProduct(clientId, body)
        : action === 'analyse_venue'
          ? await analyseAssetIngestionVenue(clientId, body)
        : action === 'generate_studio_truth'
          ? await generateAssetIngestionStudioReference(clientId, body)
          : action === 'finalize'
            ? await finalizeAssetIngestion(clientId, body)
            : null
    if (!result) return NextResponse.json({ success: false, error: 'Unsupported Asset ingestion action.' }, { status: 400 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json() as { draft_id?: string }
    if (!body.draft_id) return NextResponse.json({ success: false, error: 'Ingestion draft is required.' }, { status: 400 })
    return NextResponse.json({ success: true, ...(await cancelAssetIngestion(clientId, body.draft_id)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

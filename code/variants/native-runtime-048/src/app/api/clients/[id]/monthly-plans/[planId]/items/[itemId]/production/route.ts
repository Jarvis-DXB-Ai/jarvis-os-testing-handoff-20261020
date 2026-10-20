import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { individualProductionProviderStatus, inspectIndividualProductionPackage, listIndividualProductionArtifacts, runIndividualProduction, setIndividualProductionPinterestSelection } from '@/lib/social-individual-production'

export const runtime = 'nodejs'

function productionErrorResponse(error: unknown) {
  const response = clientBrainV2ErrorResponse(error)
  if (response.message !== 'Unable to complete the Client Brain request.') return response
  return { message: 'Individual Production could not complete. Existing candidates were preserved. Review the production package and try again.', status: response.status }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    const correction = request.nextUrl.searchParams.get('correction') ?? ''
    const pinterestReferenceId = request.nextUrl.searchParams.get('pinterest_reference_id')
    const packageData = await inspectIndividualProductionPackage({ clientId: id, planId, itemId, correction, pinterestReferenceId })
    const artifacts = await listIndividualProductionArtifacts(id, planId, itemId)
    return NextResponse.json({ success: true, provider: individualProductionProviderStatus(), package: packageData, artifacts })
  } catch (error) {
    const response = productionErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    const body = await request.json().catch(() => ({})) as { correction?: unknown; pinterest_reference_id?: unknown }
    const correction = typeof body.correction === 'string' ? body.correction : ''
    const pinterestReferenceId = typeof body.pinterest_reference_id === 'string' ? body.pinterest_reference_id : null
    return NextResponse.json({ success: true, ...(await runIndividualProduction({ clientId: id, planId, itemId, correction, pinterestReferenceId })) })
  } catch (error) {
    const response = productionErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    const body = await request.json().catch(() => ({})) as { action?: unknown; pinterest_reference_id?: unknown }
    if (body.action !== 'set_pinterest_reference' || typeof body.pinterest_reference_id !== 'string') {
      return NextResponse.json({ success: false, error: 'A valid Pinterest inspiration selection is required.' }, { status: 400 })
    }
    return NextResponse.json({ success: true, package: await setIndividualProductionPinterestSelection({ clientId: id, planId, itemId, pinterestReferenceId: body.pinterest_reference_id }) })
  } catch (error) {
    const response = productionErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

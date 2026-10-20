import { NextResponse } from 'next/server'
import { loadCurrentOfficialActivationDocument } from '@/lib/client-brain-v2-menu-documents'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; activationId: string }> },
) {
  try {
    const { id: clientId, activationId } = await context.params
    return NextResponse.json({ success: true, ...(await loadCurrentOfficialActivationDocument(clientId, activationId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

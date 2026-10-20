import { NextResponse } from 'next/server'
import { loadCurrentOfficialMenuDocument } from '@/lib/client-brain-v2-menu-documents'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; menuId: string }> },
) {
  try {
    const { id: clientId, menuId } = await context.params
    return NextResponse.json({ success: true, ...(await loadCurrentOfficialMenuDocument(clientId, menuId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

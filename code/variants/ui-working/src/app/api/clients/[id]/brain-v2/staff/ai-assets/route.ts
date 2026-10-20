import { NextResponse } from 'next/server'
import { loadApprovedStaffIdentityAssets } from '@/lib/client-brain-v2-assets-server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    return NextResponse.json({ success: true, ...(await loadApprovedStaffIdentityAssets(clientId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

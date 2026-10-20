import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { updateConceptGrid } from '@/lib/social-monthly-concept-grids'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string; gridId: string }> }) {
  try {
    const { id, planId, gridId } = await context.params
    const body = await request.json().catch(() => ({})) as { action?: unknown }
    if (body.action !== 'select' && body.action !== 'accept') return NextResponse.json({ success: false, error: 'Unsupported Concept Grid action.' }, { status: 400 })
    return NextResponse.json({ success: true, grid: await updateConceptGrid(id, planId, gridId, body.action) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

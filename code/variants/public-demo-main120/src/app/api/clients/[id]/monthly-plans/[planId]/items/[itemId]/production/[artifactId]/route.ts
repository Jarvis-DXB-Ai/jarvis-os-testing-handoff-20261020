import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { selectIndividualProductionVersion } from '@/lib/social-individual-production'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string; artifactId: string }> }) {
  try {
    const { id, planId, itemId, artifactId } = await context.params
    const body = await request.json().catch(() => ({})) as { action?: unknown }
    if (body.action !== 'select') return NextResponse.json({ success: false, error: 'Unsupported production action.' }, { status: 400 })
    return NextResponse.json({ success: true, artifact: await selectIndividualProductionVersion({ clientId: id, planId, itemId, artifactId }) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

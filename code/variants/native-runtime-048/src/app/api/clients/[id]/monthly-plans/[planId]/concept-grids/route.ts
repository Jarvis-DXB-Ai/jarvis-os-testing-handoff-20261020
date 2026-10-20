import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { generateConceptGrid, inspectConceptGrid, listConceptGrids } from '@/lib/social-monthly-concept-grids'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const inspect = request.nextUrl.searchParams.get('inspect') === '1'
    if (inspect) {
      const correction = request.nextUrl.searchParams.get('correction') ?? ''
      return NextResponse.json({ success: true, inspection: await inspectConceptGrid(id, planId, correction) })
    }
    return NextResponse.json({ success: true, grids: await listConceptGrids(id, planId) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json().catch(() => ({})) as { action?: unknown; correction?: unknown }
    const action = body.action === 'inspect' ? 'inspect' : 'generate'
    const correction = typeof body.correction === 'string' ? body.correction : ''
    if (action === 'inspect') return NextResponse.json({ success: true, inspection: await inspectConceptGrid(id, planId, correction) })
    return NextResponse.json({ success: true, ...(await generateConceptGrid(id, planId, correction)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

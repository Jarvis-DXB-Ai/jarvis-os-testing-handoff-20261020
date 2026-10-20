import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { acceptHistoricalMonthlyPlanningCandidate } from '@/lib/social-monthly-planning-ai'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json()
    const result = await acceptHistoricalMonthlyPlanningCandidate({
      clientId: id,
      planId,
      executionId: String(body?.execution_id ?? ''),
      expectedUpdatedAt: String(body?.expected_updated_at ?? ''),
    })
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

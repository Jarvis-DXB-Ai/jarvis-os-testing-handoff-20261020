import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { createMonthlyPlanItem } from '@/lib/social-monthly-content-plans'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, item: await createMonthlyPlanItem(id, planId, body ?? {}) }, { status: 201 })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

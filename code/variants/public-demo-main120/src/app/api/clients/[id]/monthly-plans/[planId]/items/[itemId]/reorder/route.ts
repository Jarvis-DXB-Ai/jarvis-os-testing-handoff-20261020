import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { reorderMonthlyPlanItem } from '@/lib/social-monthly-content-plans'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, items: await reorderMonthlyPlanItem(id, planId, itemId, body?.target_position) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

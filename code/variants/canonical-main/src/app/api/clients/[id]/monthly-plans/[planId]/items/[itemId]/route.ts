import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { deleteMonthlyPlanItem, updateMonthlyPlanItem } from '@/lib/social-monthly-content-plans'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, item: await updateMonthlyPlanItem(id, planId, itemId, body ?? {}) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params
    await deleteMonthlyPlanItem(id, planId, itemId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

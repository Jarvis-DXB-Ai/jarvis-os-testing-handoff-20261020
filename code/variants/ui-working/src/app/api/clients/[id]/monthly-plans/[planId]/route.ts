import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { deleteMonthlyPlan, getMonthlyPlan, updateMonthlyPlan } from '@/lib/social-monthly-content-plans'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    return NextResponse.json({ success: true, ...(await getMonthlyPlan(id, planId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, plan: await updateMonthlyPlan(id, planId, body ?? {}) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    await deleteMonthlyPlan(id, planId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

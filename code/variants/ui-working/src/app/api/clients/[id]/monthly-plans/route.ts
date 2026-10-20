import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { createMonthlyPlan, listMonthlyPlans } from '@/lib/social-monthly-content-plans'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json({ success: true, plans: await listMonthlyPlans(id) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const result = await createMonthlyPlan(id, body ?? {})
    return NextResponse.json({ success: true, ...result }, { status: result.created ? 201 : 200 })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

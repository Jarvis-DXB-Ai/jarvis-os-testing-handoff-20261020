import { NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { listMonthlyPlanningExecutions } from '@/lib/social-monthly-planning-diagnostics'

export async function GET(_request: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const executions = await listMonthlyPlanningExecutions(id, planId)
    return NextResponse.json({ success: true, executions })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

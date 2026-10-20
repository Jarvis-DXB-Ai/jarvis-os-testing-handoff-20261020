import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { buildMonthlyPlanningExecutableUniverse, generateMonthlyPlan, inspectMonthlyPlanningExecutionCandidate, monthlyPlanningProviderStatus, runMonthlyPlanningDiagnosticFixtures } from '@/lib/social-monthly-planning-ai'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  if (new URL(request.url).searchParams.get('fixtures') === '1' && process.env.NODE_ENV !== 'production') {
    return NextResponse.json({ success: true, fixtures: runMonthlyPlanningDiagnosticFixtures() })
  }
  const executionId = new URL(request.url).searchParams.get('execution_diagnostics')
  if (executionId && process.env.NODE_ENV !== 'production') {
    const { id, planId } = await context.params
    return NextResponse.json({ success: true, diagnostics: await inspectMonthlyPlanningExecutionCandidate(id, planId, executionId) })
  }
  if (new URL(request.url).searchParams.get('universe') === '1') {
    const { id } = await context.params
    return NextResponse.json({ success: true, executable_universe: await buildMonthlyPlanningExecutableUniverse(id) })
  }
  return NextResponse.json({ success: true, planning_ai: monthlyPlanningProviderStatus() })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json()
    const result = await generateMonthlyPlan({
      clientId: id,
      planId,
      expectedUpdatedAt: String(body?.expected_updated_at ?? ''),
      mode: body?.mode,
      replaceExisting: body?.replace_existing === true,
      createNewVersion: body?.create_new_version === true,
      itemId: typeof body?.item_id === 'string' ? body.item_id : undefined,
      correction: typeof body?.correction === 'string' ? body.correction : undefined,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

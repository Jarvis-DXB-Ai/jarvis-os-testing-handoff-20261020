import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { generateMonthlyVisualDirection, monthlyVisualDirectionProviderStatus } from '@/lib/social-monthly-visual-directions'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ success: true, visual_direction_ai: monthlyVisualDirectionProviderStatus() })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const { id, planId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await generateMonthlyVisualDirection({
      clientId: id,
      planId,
      correction: typeof body?.correction === 'string' ? body.correction : undefined,
    })) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

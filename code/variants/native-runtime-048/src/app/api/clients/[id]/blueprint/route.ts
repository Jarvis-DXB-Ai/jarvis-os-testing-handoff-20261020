import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { requireInternalJarvisMutation } from '@/lib/internal-api-request'
import { initializeClientBlueprint, loadClientBlueprint, saveBlueprintAnswer } from '@/lib/legacy-blueprint-server'

export const runtime = 'nodejs'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ ok: true, ...(await loadClientBlueprint(id)) }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireInternalJarvisMutation(request); const { id } = await context.params; return NextResponse.json({ ok: true, ...(await initializeClientBlueprint(id)) }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireInternalJarvisMutation(request); const { id } = await context.params; return NextResponse.json({ ok: true, ...(await saveBlueprintAnswer(id, await request.json())) }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}

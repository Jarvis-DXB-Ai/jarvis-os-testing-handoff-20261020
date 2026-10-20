import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { requireInternalJarvisMutation } from '@/lib/internal-api-request'
import { deleteGuestModel, loadGuestModels, saveGuestModel } from '@/lib/legacy-guest-model-server'

export const runtime = 'nodejs'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ ok: true, ...(await loadGuestModels(id)) }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireInternalJarvisMutation(request); const { id } = await context.params; return NextResponse.json({ ok: true, ...(await saveGuestModel(id, await request.json())) }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireInternalJarvisMutation(request); const { id } = await context.params; const body = await request.json() as { modelId?: string }; await deleteGuestModel(id, body.modelId ?? ''); return NextResponse.json({ ok: true }) }
  catch (error) { const response = clientBrainV2ErrorResponse(error); return NextResponse.json({ ok: false, error: response.message }, { status: response.status }) }
}

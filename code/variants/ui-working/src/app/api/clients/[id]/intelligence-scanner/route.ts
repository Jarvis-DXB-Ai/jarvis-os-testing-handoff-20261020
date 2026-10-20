import { after, NextRequest, NextResponse } from 'next/server'
import { authorizeIntelligenceScan, beginAuthorizedIntelligenceScan, cancelIntelligenceScan, confirmIntelligenceClaim, loadClientIntelligence, runQueuedIntelligenceScan, scannerPlan } from '@/lib/client-intelligence-scanner'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await loadClientIntelligence((await context.params).id)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Scanner unavailable.' }, { status: 400 }) }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const body = await request.json() as Record<string, unknown>; const clientId = (await context.params).id; if (body.action === 'authorize') return NextResponse.json(await authorizeIntelligenceScan(clientId, String(body.executionId ?? ''), body.sources && typeof body.sources === 'object' ? body.sources as Record<string, unknown> : {})); if (body.action === 'execute') { const executionId = String(body.executionId ?? ''); const scan = await beginAuthorizedIntelligenceScan(clientId, executionId); after(async () => { try { await runQueuedIntelligenceScan(clientId, executionId) } catch { /* persisted by runQueuedIntelligenceScan */ } }); return NextResponse.json(scan, { status: 202 }) } return NextResponse.json({ ...scannerPlan(body), clientId }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid scan setup.' }, { status: 400 }) }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const body = await request.json() as { action?: string; executionId?: string; claimId?: string; promote?: boolean }; const clientId = (await context.params).id; if (body.action === 'cancel') return NextResponse.json(await cancelIntelligenceScan(clientId, body.executionId ?? '')); return NextResponse.json(await confirmIntelligenceClaim(clientId, body.claimId ?? '', body.promote === true)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Claim update failed.' }, { status: 400 }) }
}

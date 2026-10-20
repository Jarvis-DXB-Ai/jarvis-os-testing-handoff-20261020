import { NextRequest, NextResponse } from 'next/server'
import { FinanceCostsError, updatePipelineRecord } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function PATCH(request: NextRequest, context: { params: Promise<{ pipelineRecordId: string }> }) { try { const [{ pipelineRecordId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updatePipelineRecord(pipelineRecordId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Pipeline request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

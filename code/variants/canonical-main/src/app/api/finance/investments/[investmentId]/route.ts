import { NextRequest, NextResponse } from 'next/server'
import { FinanceCostsError, updateInvestment } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function PATCH(request: NextRequest, context: { params: Promise<{ investmentId: string }> }) { try { const [{ investmentId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateInvestment(investmentId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Investment request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

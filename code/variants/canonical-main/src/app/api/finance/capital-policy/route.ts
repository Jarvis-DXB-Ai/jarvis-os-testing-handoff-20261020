import { NextRequest, NextResponse } from 'next/server'
import { FinanceCostsError, updateCapitalPolicy } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function PUT(request: NextRequest) { try { const body = await request.json(); return NextResponse.json(await updateCapitalPolicy(body.policy ?? body, body.expectedUpdatedAt)) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Capital policy request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

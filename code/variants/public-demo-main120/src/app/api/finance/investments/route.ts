import { NextRequest, NextResponse } from 'next/server'
import { createInvestment, FinanceCostsError } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) { try { return NextResponse.json(await createInvestment(await request.json()), { status: 201 }) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Investment request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

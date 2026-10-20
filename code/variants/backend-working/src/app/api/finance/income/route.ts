import { NextRequest, NextResponse } from 'next/server'
import { createIncome, FinanceCostsError } from '@/lib/finance-costs-server'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) { try { return NextResponse.json(await createIncome(await request.json()), { status: 201 }) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Income request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

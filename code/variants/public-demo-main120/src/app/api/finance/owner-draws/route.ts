import { NextRequest, NextResponse } from 'next/server'
import { createOwnerDraw, FinanceCostsError } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createOwnerDraw(await request.json()), { status: 201 }) }
  catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Owner draw request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

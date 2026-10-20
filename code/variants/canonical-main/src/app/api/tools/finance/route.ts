import { NextRequest, NextResponse } from 'next/server'
import { createSubscription, FinanceCostsError, loadFinanceSnapshot } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
function failure(error: unknown) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Finance request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function GET() { try { return NextResponse.json(await loadFinanceSnapshot()) } catch (error) { return failure(error) } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await createSubscription(await request.json()), { status: 201 }) } catch (error) { return failure(error) } }

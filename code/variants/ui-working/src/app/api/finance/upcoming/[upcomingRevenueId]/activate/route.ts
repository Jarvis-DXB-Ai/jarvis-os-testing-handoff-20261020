import { NextRequest, NextResponse } from 'next/server'
import { activateUpcomingRevenue, FinanceCostsError } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function POST(request: NextRequest, context: { params: Promise<{ upcomingRevenueId: string }> }) { try { const [{ upcomingRevenueId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await activateUpcomingRevenue(upcomingRevenueId, body.expectedUpdatedAt)) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Upcoming revenue activation failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

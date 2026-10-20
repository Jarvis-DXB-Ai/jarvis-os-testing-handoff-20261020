import { NextRequest, NextResponse } from 'next/server'
import { FinanceCostsError, updateUpcomingRevenue } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export async function PATCH(request: NextRequest, context: { params: Promise<{ upcomingRevenueId: string }> }) { try { const [{ upcomingRevenueId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateUpcomingRevenue(upcomingRevenueId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Upcoming revenue request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) } }

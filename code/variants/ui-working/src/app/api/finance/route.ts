import { NextRequest, NextResponse } from 'next/server'
import { FinanceCostsError, loadFinanceSnapshot, updateFinanceSettings } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Finance request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function GET(request: NextRequest) { try { const month = request.nextUrl.searchParams.get('month') ?? undefined; if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new FinanceCostsError('Month must use YYYY-MM.', 400); return NextResponse.json(await loadFinanceSnapshot(month)) } catch (error) { return failure(error) } }
export async function PUT(request: NextRequest) { try { const body = await request.json(); return NextResponse.json(await updateFinanceSettings(body.settings ?? body, body.expectedUpdatedAt)) } catch (error) { return failure(error) } }

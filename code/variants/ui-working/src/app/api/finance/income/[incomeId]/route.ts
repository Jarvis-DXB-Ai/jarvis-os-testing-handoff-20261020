import { NextRequest, NextResponse } from 'next/server'
import { deleteIncome, FinanceCostsError, updateIncome } from '@/lib/finance-costs-server'
export const runtime = 'nodejs'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Income request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function PATCH(request: NextRequest, context: { params: Promise<{ incomeId: string }> }) { try { const [{ incomeId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateIncome(incomeId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { return failure(error) } }
export async function DELETE(request: NextRequest, context: { params: Promise<{ incomeId: string }> }) { try { const [{ incomeId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await deleteIncome(incomeId, body.expectedUpdatedAt)) } catch (error) { return failure(error) } }

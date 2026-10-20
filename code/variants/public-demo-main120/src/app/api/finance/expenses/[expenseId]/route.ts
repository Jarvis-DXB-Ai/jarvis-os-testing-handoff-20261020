import { NextRequest, NextResponse } from 'next/server'
import { deleteExpense, FinanceCostsError, updateExpense } from '@/lib/finance-costs-server'
export const runtime = 'nodejs'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Expense request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function PATCH(request: NextRequest, context: { params: Promise<{ expenseId: string }> }) { try { const [{ expenseId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateExpense(expenseId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { return failure(error) } }
export async function DELETE(request: NextRequest, context: { params: Promise<{ expenseId: string }> }) { try { const [{ expenseId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await deleteExpense(expenseId, body.expectedUpdatedAt)) } catch (error) { return failure(error) } }

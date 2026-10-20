import { NextRequest, NextResponse } from 'next/server'
import { deleteInvoice, FinanceCostsError, updateInvoice } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Invoice request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function PATCH(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) { try { const [{ invoiceId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateInvoice(invoiceId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { return failure(error) } }
export async function DELETE(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) { try { const [{ invoiceId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await deleteInvoice(invoiceId, body.expectedUpdatedAt)) } catch (error) { return failure(error) } }

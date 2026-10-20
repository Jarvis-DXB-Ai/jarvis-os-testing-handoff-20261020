import { NextRequest, NextResponse } from 'next/server'
import { deleteSubscription, FinanceCostsError, updateSubscription } from '@/lib/finance-costs-server'
export const runtime = 'nodejs'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Subscription request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function PATCH(request: NextRequest, context: { params: Promise<{ subscriptionId: string }> }) { try { const [{ subscriptionId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await updateSubscription(subscriptionId, body.expectedUpdatedAt, body.patch ?? {})) } catch (error) { return failure(error) } }
export async function DELETE(request: NextRequest, context: { params: Promise<{ subscriptionId: string }> }) { try { const [{ subscriptionId }, body] = await Promise.all([context.params, request.json()]); return NextResponse.json(await deleteSubscription(subscriptionId, body.expectedUpdatedAt)) } catch (error) { return failure(error) } }

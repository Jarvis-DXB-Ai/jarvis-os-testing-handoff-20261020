import { NextRequest, NextResponse } from 'next/server'
import { CommercialCatalogError, updateCommercialProduct } from '@/lib/commercial-catalog-server'

export async function PATCH(request: NextRequest, context: { params: Promise<{ productId: string }> }) {
  try {
    const [{ productId }, body] = await Promise.all([context.params, request.json()])
    return NextResponse.json(await updateCommercialProduct(productId, body ?? {}))
  } catch (error) {
    const known = error instanceof CommercialCatalogError ? error : new CommercialCatalogError('Commercial product could not be saved.', 500)
    return NextResponse.json({ error: known.message }, { status: known.status })
  }
}

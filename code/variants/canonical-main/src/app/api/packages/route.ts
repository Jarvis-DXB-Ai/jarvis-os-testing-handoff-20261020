import { NextResponse } from 'next/server'
import { CommercialCatalogError, loadCommercialCatalogSnapshot } from '@/lib/commercial-catalog-server'

export async function GET() {
  try {
    return NextResponse.json(await loadCommercialCatalogSnapshot())
  } catch (error) {
    const known = error instanceof CommercialCatalogError ? error : new CommercialCatalogError('Packages could not be loaded.', 500)
    return NextResponse.json({ error: known.message }, { status: known.status })
  }
}

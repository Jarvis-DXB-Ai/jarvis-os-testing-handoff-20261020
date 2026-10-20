import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  applyVenueSpatialMetadataToAssetMetadata,
  getAssetMetadataCompleteness,
  isVenueLikeSpatialAsset,
  type VenueSpatialAsset,
} from '@/lib/venue-spatial-metadata'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type BackfillAsset = VenueSpatialAsset & {
  metadata?: unknown
}

function methodNotAllowed() {
  return NextResponse.json(
    { error: 'Method not allowed. Venue spatial metadata backfill is POST-only.' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { client_id, force = false, batch_size = 500 } = await req.json() as {
      client_id?: string
      force?: boolean
      batch_size?: number
    }

    if (!client_id) {
      return NextResponse.json({ error: 'Missing client_id' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('asset_uploads')
      .select('id, file_name, asset_category, extracted_summary, metadata')
      .eq('client_id', client_id)
      .in('asset_category', ['interiors', 'exteriors', 'venue_items'])
      .limit(batch_size)

    if (error) {
      return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 500 })
    }

    const assets = (data ?? []) as BackfillAsset[]
    const targets = assets.filter(asset =>
      isVenueLikeSpatialAsset(asset)
      && (force || getAssetMetadataCompleteness(asset) !== 'complete')
    )

    let updatedCount = 0
    const updatedIds: string[] = []
    const skippedIds = assets.filter(asset => !targets.some(target => target.id === asset.id)).map(asset => asset.id)
    const errors: Array<{ id: string; message: string }> = []

    for (const asset of targets) {
      const metadata = applyVenueSpatialMetadataToAssetMetadata(asset)
      const { error: updateError } = await sb
        .from('asset_uploads')
        .update({ metadata })
        .eq('id', asset.id)

      if (updateError) {
        errors.push({ id: asset.id, message: updateError.message })
      } else {
        updatedCount += 1
        updatedIds.push(asset.id)
      }
    }

    return NextResponse.json({
      updated_count: updatedCount,
      skipped_count: skippedIds.length,
      total_scanned: assets.length,
      updated_ids: updatedIds,
      skipped_ids: skippedIds,
      errors,
      method: 'deterministic_seeded_spatial_backfill',
      paid_analysis_used: false,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { venuePhotographySaveTags, type VenuePhotographyTemplateId } from '@/lib/venue-background-presets'

type SourceAsset = {
  id: string
  client_id: string
  file_name: string
  asset_category: string | null
  metadata: unknown
}

const BUCKET = 'client-assets'
const VENUE_SOURCE_CATEGORIES = new Set(['interiors', 'exteriors', 'venue_items'])
const VALID_TEMPLATES = new Set<VenuePhotographyTemplateId>(['focused_venue_plate', 'surface_texture_background'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  return 'jpg'
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function idsFrom(value: unknown, limit = 20) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))).slice(0, limit)
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

function metadataFor({
  template,
  sources,
  backgroundPresetIds,
  prompt,
  metadataTags,
}: {
  template: VenuePhotographyTemplateId
  sources: SourceAsset[]
  backgroundPresetIds: string[]
  prompt: string
  metadataTags: string[]
}) {
  const source = sources[0]
  const isFocusedPlate = template === 'focused_venue_plate'
  const tags = Array.from(new Set([...venuePhotographySaveTags(template), ...metadataTags]))
  return {
    reference_type: 'venue_photography_output',
    venue_photography: true,
    workflow_type: template,
    source_asset_id: source.id,
    source_asset_ids: sources.map(asset => asset.id),
    source_filenames: sources.map(asset => asset.file_name),
    source_categories: Array.from(new Set(sources.map(asset => asset.asset_category).filter(Boolean))),
    background_preset_ids: backgroundPresetIds,
    prompt: prompt.slice(0, 5000),
    tags,
    venue_plate: isFocusedPlate,
    environment_base: isFocusedPlate,
    compositing_base: isFocusedPlate,
    surface_texture: !isFocusedPlate,
    product_background: !isFocusedPlate,
    material_reference: !isFocusedPlate,
    approved_for_generation: true,
    approval_status: 'approved',
    inspirationOnly: false,
    no_people: true,
    no_models: true,
    no_hands: true,
    no_food: true,
    no_drinks: true,
    no_table_setting: true,
    generated_by: 'nano_banana_pro',
    purpose: isFocusedPlate
      ? 'Reusable venue plate / environment base for future compositing'
      : 'Reusable surface / material background for future product photography',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      client_id?: unknown
      image_data_url?: unknown
      template?: unknown
      source_asset_ids?: unknown
      background_preset_ids?: unknown
      prompt?: unknown
      metadata_tags?: unknown
    }

    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const parsedImage = typeof body.image_data_url === 'string' ? parseDataUrl(body.image_data_url) : null
    const template = typeof body.template === 'string' && VALID_TEMPLATES.has(body.template as VenuePhotographyTemplateId)
      ? body.template as VenuePhotographyTemplateId
      : null
    const sourceAssetIds = idsFrom(body.source_asset_ids, 1)
    const backgroundPresetIds = idsFrom(body.background_preset_ids, 20)
    const metadataTags = idsFrom(body.metadata_tags, 30)
    const prompt = typeof body.prompt === 'string' ? body.prompt : ''

    if (!clientId || !parsedImage || !template || sourceAssetIds.length !== 1) {
      return NextResponse.json({ success: false, error: 'client_id, image_data_url, template, and one source_asset_id are required.' }, { status: 400 })
    }

    if (!parsedImage.mimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'Invalid generated image file.' }, { status: 400 })
    }

    const { data: sourceRows, error } = await sb
      .from('asset_uploads')
      .select('id, client_id, file_name, asset_category, metadata')
      .eq('client_id', clientId)
      .in('id', sourceAssetIds)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!sourceRows || sourceRows.length !== sourceAssetIds.length) {
      return NextResponse.json({ success: false, error: 'Source venue asset was not found for this client.' }, { status: 404 })
    }

    const sources = sourceRows as SourceAsset[]
    const unsupported = sources.find(source => !VENUE_SOURCE_CATEGORIES.has(source.asset_category ?? ''))
    if (unsupported) {
      return NextResponse.json({ success: false, error: 'Venue Photography saves only support interior, exterior, and venue/background source assets.' }, { status: 400 })
    }

    await ensureBucket()

    const source = sources[0]
    const isFocusedPlate = template === 'focused_venue_plate'
    const ext = extensionForMimeType(parsedImage.mimeType)
    const sourceName = source.file_name.replace(/\.[^.]+$/, '')
    const safeSourceName = safeFileName(sourceName)
    const fileName = `${isFocusedPlate ? 'Venue Plate' : 'Surface Texture'} - ${sourceName}.${ext}`
    const path = `${clientId}/venue-photography/${Date.now()}_${randomUUID()}_${safeSourceName}.${ext}`
    const imageMeta = await sharp(parsedImage.buffer).metadata().catch(() => ({ width: null, height: null }))

    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, parsedImage.buffer, {
      contentType: parsedImage.mimeType,
      upsert: false,
    })
    if (uploadError) return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })

    const savedMetadata = metadataFor({
      template,
      sources,
      backgroundPresetIds,
      prompt,
      metadataTags,
    })

    const { data: record, error: insertError } = await sb
      .from('asset_uploads')
      .insert({
        client_id: clientId,
        file_name: fileName,
        file_path: path,
        original_file_path: path,
        file_type: parsedImage.mimeType,
        asset_category: isFocusedPlate ? 'interiors' : 'background_presets',
        file_size: parsedImage.buffer.length,
        original_size_bytes: parsedImage.buffer.length,
        original_width: imageMeta.width ?? null,
        original_height: imageMeta.height ?? null,
        extraction_status: 'skipped',
        extraction_method: 'ai_venue_photography',
        source_quality: 'approved',
        metadata_status: 'complete',
        has_metadata: true,
        metadata: savedMetadata,
      })
      .select('id, file_name, asset_category, file_path, file_type, metadata, status, source_quality, uploaded_at')
      .single()

    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      asset: record,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

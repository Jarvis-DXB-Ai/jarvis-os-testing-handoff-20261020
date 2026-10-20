import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

type SourceAsset = {
  id: string
  client_id: string
  file_name: string
  asset_category: string | null
  metadata: unknown
}

const BUCKET = 'client-assets'
const SUPPORTED_CATEGORIES = new Set(['food', 'breakfast', 'drinks', 'venue_items'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeMetadataValue(item, depth + 1))
      .filter(item => item !== undefined)
      .slice(0, 80)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, sanitizeMetadataValue(item, depth + 1)] as const)
        .filter(([, item]) => item !== undefined)
    )
  }
  return undefined
}

function isEmptyMetadataValue(value: unknown) {
  return value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (isRecord(value) && Object.keys(value).length === 0)
}

const STUDIO_METADATA_KEYS = [
  'name',
  'title',
  'dish_name',
  'drink_name',
  'ingredients',
  'allergens',
  'description',
  'menu_category',
  'category',
  'menus',
  'meal_period',
  'activation',
  'plate_count',
  'item_count',
  'serving_vessel',
  'sauce',
  'side_components',
  'garnish',
  'texture_notes',
  'shape_structure',
  'do_not_add',
  'do_not_remove',
  'glass_shape',
  'liquid_color',
  'foam_or_clarity',
  'scale',
  'contains_smoke_effect',
  'item_type',
  'service_style',
  'cutlery',
  'tableware',
  'material',
  'color',
  'usage',
  'location',
] as const

function mergeMetadataValue(existing: unknown, incoming: unknown): unknown {
  if (isEmptyMetadataValue(existing)) return incoming
  if (isEmptyMetadataValue(incoming)) return existing
  if (Array.isArray(existing) || Array.isArray(incoming)) {
    const combined = [...(Array.isArray(existing) ? existing : [existing]), ...(Array.isArray(incoming) ? incoming : [incoming])]
    return Array.from(new Set(combined.map(item => typeof item === 'string' ? item.trim() : JSON.stringify(item))))
      .filter(Boolean)
      .map(item => {
        try { return JSON.parse(item) } catch { return item }
      })
  }
  if (isRecord(existing) && isRecord(incoming)) {
    return mergeMetadataRecords(existing, incoming)
  }
  if (typeof existing === 'string' && typeof incoming === 'string') {
    return incoming.length > existing.length && existing.length < 24 ? incoming : existing
  }
  return existing
}

function mergeMetadataRecords(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = mergeMetadataValue(merged[key], value)
  }
  return merged
}

function pickStudioSourceMetadata(source: SourceAsset) {
  const sourceMetadata = isRecord(source.metadata) ? source.metadata : {}
  const picked: Record<string, unknown> = {}
  for (const key of STUDIO_METADATA_KEYS) {
    const sanitized = sanitizeMetadataValue(sourceMetadata[key])
    if (!isEmptyMetadataValue(sanitized)) picked[key] = sanitized
  }
  return picked
}

function normalizedSourceMetadata(source: SourceAsset) {
  const metadata = pickStudioSourceMetadata(source)
  const category = source.asset_category ?? ''
  const officialName = metadata.dish_name || metadata.drink_name || metadata.name || metadata.title || source.file_name.replace(/\.[^.]+$/, '')
  if (category === 'drinks') {
    metadata.drink_name = metadata.drink_name || officialName
  } else if (category === 'venue_items') {
    metadata.name = metadata.name || officialName
  } else {
    metadata.dish_name = metadata.dish_name || officialName
  }
  if (metadata.category && !metadata.menu_category) metadata.menu_category = metadata.category
  return metadata
}

function studioCategoryFor(source: SourceAsset) {
  if (source.asset_category === 'venue_items') return 'venue_items'
  return source.asset_category === 'drinks' ? 'drink_studio_shots' : 'food_studio_shots'
}

function studioReferenceTypeFor(source: SourceAsset) {
  if (source.asset_category === 'venue_items') return 'venue_item'
  return source.asset_category === 'drinks' ? 'drink' : 'food'
}

function cameraAngleModeFor(angle: string) {
  if (angle === '45_degree') return '45_degree_hero'
  if (angle === 'top_down') return 'top_down_overhead'
  if (angle === 'front_profile') return 'side_profile'
  if (angle === 'detail_closeup') return 'detail_closeup'
  return 'match_source'
}

function overheadAllowedFor(angle: string) {
  return angle === 'top_down'
}

function mergeSourceMetadata(sources: SourceAsset[]) {
  return sources.reduce<Record<string, unknown>>((acc, source) => {
    return mergeMetadataRecords(acc, normalizedSourceMetadata(source))
  }, {})
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  return 'jpg'
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function parseSourceAssetIds(value: unknown, fallback: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return [value]
    }
  }
  return typeof fallback === 'string' ? [fallback] : []
}

async function parseSaveRequest(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const imageFile = form.get('image_file')
    const imageBuffer = imageFile instanceof File ? Buffer.from(await imageFile.arrayBuffer()) : null
    const imageMimeType = imageFile instanceof File ? imageFile.type || 'image/png' : ''
    return {
      bodyKind: 'multipart' as const,
      clientId: typeof form.get('client_id') === 'string' ? String(form.get('client_id')) : '',
      sourceAssetIds: parseSourceAssetIds(form.get('source_asset_ids'), form.get('source_asset_id')),
      imageBuffer,
      imageMimeType,
      backgroundStyle: typeof form.get('background_style') === 'string' ? String(form.get('background_style')) : 'studio_clean',
      angle: typeof form.get('angle') === 'string' ? String(form.get('angle')) : 'match_source',
      dryRun: form.get('dry_run') === 'true',
    }
  }

  const body = await req.json().catch(() => ({})) as {
    client_id?: unknown
    source_asset_id?: unknown
    source_asset_ids?: unknown
    image_data_url?: unknown
    background_style?: unknown
    angle?: unknown
    dry_run?: unknown
  }
  const imageDataUrl = typeof body.image_data_url === 'string' ? body.image_data_url : ''
  const parsedImage = parseDataUrl(imageDataUrl)
  return {
    bodyKind: 'json' as const,
    clientId: typeof body.client_id === 'string' ? body.client_id : '',
    sourceAssetIds: parseSourceAssetIds(body.source_asset_ids, body.source_asset_id),
    imageBuffer: parsedImage?.buffer ?? null,
    imageMimeType: parsedImage?.mimeType ?? '',
    backgroundStyle: typeof body.background_style === 'string' ? body.background_style : 'studio_clean',
    angle: typeof body.angle === 'string' ? body.angle : 'match_source',
    dryRun: body.dry_run === true,
  }
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

function buildSavedMetadata({
  sources,
  backgroundStyle,
  angle,
}: {
  sources: SourceAsset[]
  backgroundStyle: string
  angle: string
}) {
  const source = sources[0]
  const base = mergeSourceMetadata(sources)
  const sourceIds = sources.map(asset => asset.id)
  return {
    ...base,
    reference_type: 'ai_truth_reference',
    studio_reference_type: studioReferenceTypeFor(source),
    asset_category: studioCategoryFor(source),
    source_asset_id: source.id,
    source_asset_ids: sourceIds,
    source_filenames: sources.map(asset => asset.file_name),
    source_categories: Array.from(new Set(sources.map(asset => asset.asset_category).filter(Boolean))),
    source_count: sources.length,
    multi_source: sources.length > 1,
    studio_reference: true,
    studio_generated: true,
    framing: angle === 'detail_closeup' ? 'detail_closeup' : 'full_object',
    object_boundary_visible: angle !== 'detail_closeup',
    safe_margin: angle !== 'detail_closeup',
    composition_mode: angle === 'detail_closeup' ? 'detail_crop' : 'object_fit',
    plate_boundary_visible: angle !== 'detail_closeup',
    outer_margin_required: angle !== 'detail_closeup',
    editorial_crop_allowed: angle === 'detail_closeup',
    camera_angle_mode: cameraAngleModeFor(angle),
    overhead_allowed: overheadAllowedFor(angle),
    focus_mode: angle === 'detail_closeup' ? 'detail_focus' : 'deep_focus',
    depth_behavior: angle === 'detail_closeup' ? 'selective_detail_focus' : 'deep_focus',
    edge_to_edge_sharpness: angle !== 'detail_closeup',
    background_requirement: 'clean_studio_reference',
    approved_for_generation: true,
    approval_status: 'approved',
    background_style: backgroundStyle,
    angle,
    generated_by: 'nano_banana_pro',
    purpose: 'AI generation truth reference',
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsedRequest = await parseSaveRequest(req)
    const clientId = parsedRequest.clientId
    const sourceAssetIds = parsedRequest.sourceAssetIds
    const uniqueSourceAssetIds = Array.from(new Set(sourceAssetIds))
    const backgroundStyle = parsedRequest.backgroundStyle
    const angle = parsedRequest.angle
    const dryRun = parsedRequest.dryRun

    console.info('[studio-reference-save] request_received', {
      bodyKind: parsedRequest.bodyKind,
      clientId,
      sourceCount: uniqueSourceAssetIds.length,
      imageBytes: parsedRequest.imageBuffer?.length ?? 0,
      imageMimeType: parsedRequest.imageMimeType,
      dryRun,
    })

    if (!clientId || uniqueSourceAssetIds.length === 0 || !parsedRequest.imageBuffer) {
      return NextResponse.json({ success: false, error: 'client_id, at least one source_asset_id, and image_data_url are required.' }, { status: 400 })
    }

    if (!parsedRequest.imageMimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'Invalid generated image file.' }, { status: 400 })
    }

    const { data: sourceRows, error } = await sb
      .from('asset_uploads')
      .select('id, client_id, file_name, asset_category, metadata')
      .eq('client_id', clientId)
      .in('id', uniqueSourceAssetIds)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!sourceRows || sourceRows.length !== uniqueSourceAssetIds.length) {
      return NextResponse.json({ success: false, error: 'One or more source assets were not found for this client.' }, { status: 404 })
    }

    const sourcesById = new Map((sourceRows as SourceAsset[]).map(source => [source.id, source]))
    const sourceAssets = uniqueSourceAssetIds.map(id => sourcesById.get(id)).filter((source): source is SourceAsset => Boolean(source))
    const sourceAsset = sourceAssets[0]
    const targetCategory = studioCategoryFor(sourceAsset)
    const unsupported = sourceAssets.find(source => !SUPPORTED_CATEGORIES.has(source.asset_category ?? ''))
    if (unsupported) {
      return NextResponse.json({ success: false, error: 'Studio references V1 only supports food, breakfast, drinks, and venue items assets.' }, { status: 400 })
    }

    const savedMetadata = buildSavedMetadata({ sources: sourceAssets, backgroundStyle, angle })
    console.info('[studio-reference-save] metadata_prepared', {
      targetCategory,
      metadataKeys: Object.keys(savedMetadata).length,
      hasBase64: JSON.stringify(savedMetadata).includes('base64'),
    })

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        asset: {
          id: 'dry-run',
          file_name: `AI Truth Ref - ${sourceAsset.file_name.replace(/\.[^.]+$/, '')}`,
          asset_category: targetCategory,
          file_path: null,
          metadata: savedMetadata,
        },
      })
    }

    await ensureBucket()

    const ext = extensionForMimeType(parsedRequest.imageMimeType)
    const sourceName = safeFileName(sourceAsset.file_name.replace(/\.[^.]+$/, ''))
    const fileName = `AI Truth Ref - ${sourceAsset.file_name.replace(/\.[^.]+$/, '')}.${ext}`
    const path = `${clientId}/studio-references/${Date.now()}_${randomUUID()}_${sourceName}.${ext}`
    const meta = await sharp(parsedRequest.imageBuffer).metadata().catch(() => ({ width: null, height: null }))

    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, parsedRequest.imageBuffer, {
      contentType: parsedRequest.imageMimeType,
      upsert: false,
    })
    if (uploadError) return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })
    console.info('[studio-reference-save] storage_uploaded', { path, bytes: parsedRequest.imageBuffer.length })

    const { data: record, error: insertError } = await sb
      .from('asset_uploads')
      .insert({
        client_id: clientId,
        file_name: fileName,
        file_path: path,
        original_file_path: path,
        file_type: parsedRequest.imageMimeType,
        asset_category: targetCategory,
        file_size: parsedRequest.imageBuffer.length,
        original_size_bytes: parsedRequest.imageBuffer.length,
        original_width: meta.width ?? null,
        original_height: meta.height ?? null,
        extraction_status: 'skipped',
        extraction_method: 'ai_studio_reference',
        source_quality: 'ai_generated',
        metadata_status: 'complete',
        has_metadata: true,
        metadata: savedMetadata,
      })
      .select('id, file_name, asset_category, file_path, metadata')
      .single()

    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
    console.info('[studio-reference-save] db_inserted', { id: record.id, path, targetCategory })

    return NextResponse.json({
      success: true,
      asset: record,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

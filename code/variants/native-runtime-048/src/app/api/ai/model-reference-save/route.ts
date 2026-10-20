import { ownerMediaPath } from '@/lib/private-media'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const BUCKET = 'guest-models'
const GENERATION_ASSET_TYPES = new Set(['front_face', 'forty_five_face', 'full_body_front', 'full_body_side', 'outfit'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10485760,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
  }
}

async function nextVersionNumber(modelId: string, assetType: string, outfitId?: string | null) {
  let query = sb
    .from('ai_model_assets')
    .select('version_number')
    .eq('model_id', modelId)
    .eq('asset_type', assetType)

  if (assetType === 'outfit' && outfitId) {
    query = query.contains('generation_settings', { outfit_id: outfitId })
  }

  const { data } = await query
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return typeof data?.version_number === 'number' ? data.version_number + 1 : 1
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      client_id?: unknown
      model_id?: unknown
      asset_type?: unknown
      image_data_url?: unknown
      image_url?: unknown
      prompt_used?: unknown
      negative_prompt_used?: unknown
      generation_settings?: unknown
      notes?: unknown
      identity_match_score?: unknown
      status?: unknown
    }
    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const modelId = typeof body.model_id === 'string' ? body.model_id : ''
    const assetType = typeof body.asset_type === 'string' ? body.asset_type : ''
    const imageDataUrl = typeof body.image_data_url === 'string' ? body.image_data_url : ''
    const providerImageUrl = typeof body.image_url === 'string' ? body.image_url : ''
    const promptUsed = typeof body.prompt_used === 'string' ? body.prompt_used : ''
    const negativePromptUsed = typeof body.negative_prompt_used === 'string' ? body.negative_prompt_used : ''
    const notes = typeof body.notes === 'string' ? body.notes : null
    const status = body.status === 'approved' ? 'approved' : 'pending'
    const score = typeof body.identity_match_score === 'number'
      ? body.identity_match_score
      : typeof body.identity_match_score === 'string' && body.identity_match_score.trim()
        ? Number(body.identity_match_score)
        : null

    if (!clientId || !modelId || !GENERATION_ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ success: false, error: 'client_id, model_id, and valid asset_type are required.' }, { status: 400 })
    }

    const { data: model, error: modelError } = await sb
      .from('ai_models')
      .select('id, client_id, model_name')
      .eq('client_id', clientId)
      .eq('id', modelId)
      .single()

    if (modelError || !model) {
      return NextResponse.json({ success: false, error: 'AI model was not found for this client.' }, { status: 404 })
    }

    let imageUrl = providerImageUrl
    let storagePath: string | null = null
    let imageMimeType: string | null = null
    let imageBytes: number | null = null
    let dimensions: { width?: number | null; height?: number | null } = {}

    if (imageDataUrl) {
      const parsed = parseDataUrl(imageDataUrl)
      if (!parsed || !parsed.mimeType.startsWith('image/')) {
        return NextResponse.json({ success: false, error: 'Invalid generated image data.' }, { status: 400 })
      }
      await ensureBucket()
      const ext = extensionForMimeType(parsed.mimeType)
      const path = `${clientId}/ai-models/${modelId}/${assetType}/${Date.now()}_${randomUUID()}.${ext}`
      const meta = await sharp(parsed.buffer).metadata().catch(() => ({ width: null, height: null }))
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, parsed.buffer, {
        contentType: parsed.mimeType,
        upsert: false,
      })
      if (uploadError) return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })
      const publicUrl = { publicUrl: ownerMediaPath(BUCKET, path) }
      imageUrl = publicUrl.publicUrl
      storagePath = path
      imageMimeType = parsed.mimeType
      imageBytes = parsed.buffer.length
      dimensions = { width: meta.width ?? null, height: meta.height ?? null }
    }

    if (!imageUrl) {
      return NextResponse.json({ success: false, error: 'image_data_url or image_url is required.' }, { status: 400 })
    }

    const baseSettings = isRecord(body.generation_settings) ? body.generation_settings : {}
    const outfitId = typeof baseSettings.outfit_id === 'string' ? baseSettings.outfit_id : null
    const versionNumber = await nextVersionNumber(modelId, assetType, outfitId)
    const generationSettings: Record<string, unknown> = {
      ...baseSettings,
      source: baseSettings.source ?? 'nano_banana_pro_model_reference',
      provider: baseSettings.provider ?? 'google-gemini',
      stored_in_bucket: storagePath ? BUCKET : null,
      mime_type: imageMimeType,
      byte_size: imageBytes,
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
    }
    if (typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 10) {
      generationSettings.identity_match_score = score
    }

    const { data: record, error: insertError } = await sb
      .from('ai_model_assets')
      .insert({
        client_id: clientId,
        model_id: modelId,
        asset_type: assetType,
        image_url: imageUrl,
        storage_path: storagePath,
        prompt_used: promptUsed,
        negative_prompt_used: negativePromptUsed,
        generation_settings: generationSettings,
        version_number: versionNumber,
        status,
        notes,
      })
      .select('*')
      .single()

    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      asset: record,
      storage_path: storagePath,
      image_url: imageUrl,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

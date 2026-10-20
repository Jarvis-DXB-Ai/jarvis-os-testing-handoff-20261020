import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type GeminiInlineData = {
  mimeType?: string
  mime_type?: string
  data?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
    finishReason?: string
    finish_reason?: string
  }>
  usageMetadata?: unknown
  error?: {
    message?: string
    status?: string
    code?: number
  }
}

type AssetUpload = {
  id: string
  client_id: string
  file_name: string
  asset_category: string | null
  file_path: string | null
  optimized_file_path: string | null
  ai_preview_path: string | null
  file_type: string | null
  metadata: unknown
}

type GuestModelRow = {
  id: string
  name: string | null
  model_references: unknown
}

type ProviderReferencePart = {
  label: string
  inlineData: {
    mimeType: string
    data: string
  }
}

const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const CLIENT_ASSETS_BUCKET = 'client-assets'
const GUEST_MODELS_BUCKET = 'guest-models'
const PROVIDER_TIMEOUT_MS = 120000
const MAX_FRAME_PROMPT_CHARS = 5000
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
const ALLOWED_ASSET_CATEGORIES = new Set(['interiors', 'exteriors', 'venue_items', 'food_studio_shots', 'drink_studio_shots', 'pinterest_inspiration'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function idsFrom(value: unknown, limit: number) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(0, limit)
    : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCategory(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function metadataValue(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return ''
  const value = metadata[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join(', ')
  return ''
}

function cleanLine(value: string | undefined, maxLength = 180) {
  if (!value?.trim()) return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact
}

function assetLabel(asset: AssetUpload, index: number) {
  const category = normalizeCategory(asset.asset_category)
  const name = metadataValue(asset.metadata, 'dish_name')
    || metadataValue(asset.metadata, 'drink_name')
    || metadataValue(asset.metadata, 'name')
    || metadataValue(asset.metadata, 'title')
    || asset.file_name
  if (category === 'food_studio_shots') return `[FRAME REF ${index}] FOOD STUDIO SHOT / ${cleanLine(name, 90)} — exact dish truth for this storyboard frame.`
  if (category === 'drink_studio_shots') return `[FRAME REF ${index}] DRINK STUDIO SHOT / ${cleanLine(name, 90)} — exact beverage truth for this storyboard frame.`
  if (category === 'pinterest_inspiration') return `[FRAME REF ${index}] LIGHTING / COMPOSITION INSPIRATION / ${cleanLine(name, 90)} — use only for mood, light, framing, and pacing.`
  if (category === 'venue_items') return `[FRAME REF ${index}] VENUE DETAIL / ${cleanLine(name, 90)} — use only for brand material/service continuity.`
  return `[FRAME REF ${index}] LOCKED SCENE PLATE / VENUE LOCATION TRUTH / ${cleanLine(name, 90)} — use as photographic base plate; preserve source camera angle, architecture, layout, furniture placement, table geometry, materials, lighting fixtures, surfaces, and spatial continuity. Do not redesign or invent venue elements.`
}

function guestModelPrimaryReference(row: GuestModelRow) {
  const refs = isRecord(row.model_references) && Array.isArray(row.model_references.references)
    ? row.model_references.references
    : []
  const records = refs.filter(isRecord)
  const selected = records.find(ref => ref.key === 'front_face' && typeof ref.storagePath === 'string')
    ?? records.find(ref => ref.key === 'front_face' && typeof ref.publicUrl === 'string')
    ?? records.find(ref => typeof ref.storagePath === 'string' || typeof ref.publicUrl === 'string' || typeof ref.previewUrl === 'string')
  if (!selected) return null
  return {
    storagePath: typeof selected.storagePath === 'string' ? selected.storagePath : null,
    publicUrl: typeof selected.publicUrl === 'string'
      ? selected.publicUrl
      : typeof selected.previewUrl === 'string'
        ? selected.previewUrl
        : null,
    mimeType: typeof selected.mimeType === 'string' ? selected.mimeType : 'image/jpeg',
  }
}

function parseImageResponse(response: GeminiResponse) {
  const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
  const imagePart = parts.find(part => (part.inlineData ?? part.inline_data)?.data)
  const inlineData = imagePart ? imagePart.inlineData ?? imagePart.inline_data : null
  const mimeType = inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png'
  const imageBase64 = inlineData?.data ?? null
  const text = parts.map(part => part.text).filter((value): value is string => Boolean(value)).join('\n')
  return { imageBase64, mimeType, text }
}

async function callProvider({
  apiKey,
  prompt,
  aspectRatio,
  quality,
  referenceParts,
}: {
  apiKey: string
  prompt: string
  aspectRatio: string
  quality: '2k' | '4k'
  referenceParts: ProviderReferencePart[]
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...referenceParts.flatMap(part => [
                { text: part.label },
                { inlineData: part.inlineData },
              ]),
            ],
          },
        ],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
            imageSize: quality === '4k' ? '4K' : '2K',
          },
        },
      }),
    })
    const providerResponse = await response.json().catch(() => ({})) as GeminiResponse
    return { response, providerResponse, latencyMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = await req.json().catch(() => ({})) as {
      client_id?: unknown
      prompt?: unknown
      aspect_ratio?: unknown
      quality?: unknown
      composition_fidelity?: unknown
      composition_fidelity_percent?: unknown
      environment_mode?: unknown
      environment_confidence?: unknown
      shot_number?: unknown
      shot_title?: unknown
      asset_upload_ids?: unknown
      guest_model_ids?: unknown
      dry_run?: unknown
    }

    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const aspectRatio = typeof body.aspect_ratio === 'string' && ALLOWED_ASPECT_RATIOS.has(body.aspect_ratio) ? body.aspect_ratio : '9:16'
    const quality = body.quality === '4k' ? '4k' : '2k'
    const compositionFidelity = typeof body.composition_fidelity === 'string' ? body.composition_fidelity : 'strict_scene_match'
    const compositionFidelityPercent = typeof body.composition_fidelity_percent === 'number' ? body.composition_fidelity_percent : 100
    const environmentMode = typeof body.environment_mode === 'string' ? body.environment_mode : 'locked_truth'
    const environmentConfidence = typeof body.environment_confidence === 'number' ? body.environment_confidence : 95
    const shotNumber = typeof body.shot_number === 'number' ? body.shot_number : null
    const shotTitle = typeof body.shot_title === 'string' ? body.shot_title : ''
    const assetUploadIds = idsFrom(body.asset_upload_ids, 8)
    const guestModelIds = idsFrom(body.guest_model_ids, 4)
    const dryRun = body.dry_run === true

    if (!clientId) return NextResponse.json({ success: false, error: 'client_id is required.' }, { status: 400 })
    if (!prompt) return NextResponse.json({ success: false, error: 'prompt is required.' }, { status: 400 })
    if (prompt.length >= MAX_FRAME_PROMPT_CHARS) {
      return NextResponse.json({ success: false, error: `Frame prompt is too long. Keep it under ${MAX_FRAME_PROMPT_CHARS} characters.`, prompt_length: prompt.length }, { status: 400 })
    }

    const assetRows = assetUploadIds.length > 0
      ? await sb
        .from('asset_uploads')
        .select('id, client_id, file_name, asset_category, file_path, optimized_file_path, ai_preview_path, file_type, metadata')
        .eq('client_id', clientId)
        .in('id', assetUploadIds)
      : { data: [], error: null }

    if (assetRows.error) return NextResponse.json({ success: false, error: assetRows.error.message }, { status: 500 })
    const assets = (assetRows.data ?? []) as AssetUpload[]
    if (assets.length !== assetUploadIds.length) return NextResponse.json({ success: false, error: 'One or more frame asset references were not found for this client.' }, { status: 404 })
    const unsupported = assets.find(asset => !ALLOWED_ASSET_CATEGORIES.has(normalizeCategory(asset.asset_category)))
    if (unsupported) return NextResponse.json({ success: false, error: `Unsupported frame reference category: ${unsupported.asset_category}` }, { status: 400 })

    const guestRows = guestModelIds.length > 0
      ? await sb
        .from('guest_models')
        .select('id, name, model_references')
        .eq('client_id', clientId)
        .in('id', guestModelIds)
      : { data: [], error: null }

    if (guestRows.error) return NextResponse.json({ success: false, error: guestRows.error.message }, { status: 500 })
    const guests = (guestRows.data ?? []) as GuestModelRow[]
    if (guests.length !== guestModelIds.length) return NextResponse.json({ success: false, error: 'One or more guest model references were not found for this client.' }, { status: 404 })

    const assetDescriptors = assets.map((asset, index) => ({
      asset,
      label: assetLabel(asset, index + 1),
      path: asset.ai_preview_path || asset.optimized_file_path || asset.file_path,
    }))
    const guestDescriptors = guests.map((guest, index) => ({
      guest,
      label: `[FRAME REF ${assetDescriptors.length + index + 1}] MODEL / ${cleanLine(guest.name || 'Guest model', 90)} — use only for model identity and continuity in this storyboard frame.`,
      image: guestModelPrimaryReference(guest),
    }))

    const missingAsset = assetDescriptors.find(item => !item.path)
    if (missingAsset) return NextResponse.json({ success: false, error: `Frame reference has no storage path: ${missingAsset.asset.file_name}` }, { status: 400 })
    const missingGuest = guestDescriptors.find(item => !item.image)
    if (missingGuest) return NextResponse.json({ success: false, error: `Guest model has no usable image reference: ${missingGuest.guest.name ?? missingGuest.guest.id}` }, { status: 400 })

    const referenceDebug = [
      ...assetDescriptors.map(item => ({
        id: item.asset.id,
        label: item.label,
        category: item.asset.asset_category,
        source: 'asset_upload',
        storage_path: item.path,
      })),
      ...guestDescriptors.map(item => ({
        id: item.guest.id,
        label: item.label,
        category: 'guest_model',
        source: 'guest_models',
        storage_path: item.image?.storagePath ?? item.image?.publicUrl ?? null,
      })),
    ]

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        provider: 'google-gemini',
        model: MODEL,
        shot_number: shotNumber,
        shot_title: shotTitle,
        quality,
        composition_fidelity: compositionFidelity,
        composition_fidelity_percent: compositionFidelityPercent,
        environment_mode: environmentMode,
        environment_confidence: environmentConfidence,
        image_size: quality === '4k' ? '4K' : '2K',
        aspect_ratio: aspectRatio,
        prompt,
        prompt_length: prompt.length,
        reference_count: referenceDebug.length,
        reference_debug: referenceDebug,
        latency_ms: Date.now() - startedAt,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ success: false, error: 'GEMINI_API_KEY is not set.' }, { status: 500 })

    const referenceParts: ProviderReferencePart[] = []
    for (const descriptor of assetDescriptors) {
      const { data: file, error } = await sb.storage.from(CLIENT_ASSETS_BUCKET).download(descriptor.path!)
      if (error || !file) return NextResponse.json({ success: false, error: `Failed to download frame asset ${descriptor.asset.file_name}: ${error?.message ?? 'unknown error'}` }, { status: 500 })
      const bytes = Buffer.from(await file.arrayBuffer())
      referenceParts.push({
        label: descriptor.label,
        inlineData: {
          mimeType: file.type || descriptor.asset.file_type || 'image/jpeg',
          data: bytes.toString('base64'),
        },
      })
    }

    for (const descriptor of guestDescriptors) {
      let bytes: Buffer | null = null
      let mimeType = descriptor.image?.mimeType || 'image/jpeg'
      if (descriptor.image?.storagePath) {
        const { data: file } = await sb.storage.from(GUEST_MODELS_BUCKET).download(descriptor.image.storagePath)
        if (file) {
          bytes = Buffer.from(await file.arrayBuffer())
          mimeType = file.type || mimeType
        }
      }
      if (!bytes && descriptor.image?.publicUrl) {
        const response = await fetch(descriptor.image.publicUrl)
        if (response.ok) {
          bytes = Buffer.from(await response.arrayBuffer())
          mimeType = response.headers.get('content-type') ?? mimeType
        }
      }
      if (!bytes) return NextResponse.json({ success: false, error: `Failed to download guest model image: ${descriptor.guest.name ?? descriptor.guest.id}` }, { status: 500 })
      referenceParts.push({
        label: descriptor.label,
        inlineData: {
          mimeType,
          data: bytes.toString('base64'),
        },
      })
    }

    const provider = await callProvider({ apiKey, prompt, aspectRatio, quality, referenceParts })
    if (!provider.response.ok || provider.providerResponse.error) {
      return NextResponse.json({
        success: false,
        provider: 'google-gemini',
        model: MODEL,
        error: provider.providerResponse.error?.message || `Provider returned ${provider.response.status}`,
        provider_status: provider.response.status,
        prompt_length: prompt.length,
        reference_count: referenceParts.length,
        latency_ms: Date.now() - startedAt,
      }, { status: provider.response.ok ? 500 : provider.response.status })
    }

    const parsed = parseImageResponse(provider.providerResponse)
    if (!parsed.imageBase64) {
      return NextResponse.json({
        success: false,
        provider: 'google-gemini',
        model: MODEL,
        error: parsed.text || 'Provider did not return an image.',
        prompt_length: prompt.length,
        reference_count: referenceParts.length,
        latency_ms: Date.now() - startedAt,
      }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      provider: 'google-gemini',
      model: MODEL,
      shot_number: shotNumber,
      shot_title: shotTitle,
      quality,
      composition_fidelity: compositionFidelity,
      composition_fidelity_percent: compositionFidelityPercent,
      environment_mode: environmentMode,
      environment_confidence: environmentConfidence,
      image_size: quality === '4k' ? '4K' : '2K',
      aspect_ratio: aspectRatio,
      generated_image_data: `data:${parsed.mimeType};base64,${parsed.imageBase64}`,
      generated_image_mime_type: parsed.mimeType,
      prompt,
      prompt_length: prompt.length,
      reference_count: referenceParts.length,
      reference_debug: referenceDebug,
      provider_latency_ms: provider.latencyMs,
      latency_ms: Date.now() - startedAt,
      usage_metadata: provider.providerResponse.usageMetadata ?? null,
      text: parsed.text || null,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - startedAt,
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

type TopazStatus = {
  process_id?: string
  status?: string
  progress?: number
  eta?: number
  credits?: number
  output_width?: number
  output_height?: number
  output_format?: string
  model?: string
  category?: string
}

type TopazEstimate = {
  duration?: number
  credits?: number
}

const TOPAZ_API_BASE = 'https://api.topazlabs.com/image/v1'
const CLIENT_ASSETS_BUCKET = 'client-assets'
const DEFAULT_MODEL = 'Standard V2'
const DEFAULT_OUTPUT_FORMAT = 'jpg'
const MAX_POLL_ATTEMPTS = 30
const POLL_INTERVAL_MS = 2500

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

function dataUrlFromBuffer(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('tiff') || mimeType.includes('tif')) return 'tif'
  return 'jpg'
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(item => sanitizeMetadata(item, depth + 1)).filter(item => item !== undefined).slice(0, 50)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)] as const)
        .filter(([, item]) => item !== undefined)
    )
  }
  return undefined
}

function topazHeaders(apiKey: string) {
  return {
    'X-API-Key': apiKey,
    Accept: 'application/json',
  }
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  let json: unknown = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    const message = isRecord(json) && typeof json.message === 'string'
      ? json.message
      : isRecord(json) && typeof json.error === 'string'
        ? json.error
        : `Topaz API returned ${response.status}.`
    throw Object.assign(new Error(message), { status: response.status, payload: json })
  }
  return json
}

async function loadInputImage(body: Record<string, unknown>) {
  const imageDataUrl = typeof body.image_data_url === 'string' ? body.image_data_url : ''
  if (imageDataUrl) {
    const parsed = parseDataUrl(imageDataUrl)
    if (!parsed) throw new Error('image_data_url must be a valid base64 data URL.')
    return { ...parsed, source: 'data_url' as const }
  }

  const imageUrl = typeof body.image_url === 'string' ? body.image_url : ''
  if (!imageUrl) throw new Error('Provide image_data_url or image_url.')
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Could not fetch source image: ${response.status}`)
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await response.arrayBuffer())
  return { mimeType: contentType, buffer, source: 'image_url' as const }
}

function normalizeOutputFormat(value: unknown) {
  const format = typeof value === 'string' ? value.toLowerCase() : DEFAULT_OUTPUT_FORMAT
  if (['jpg', 'jpeg', 'png', 'tiff', 'tif'].includes(format)) return format
  return DEFAULT_OUTPUT_FORMAT
}

function normalizeUpscaleFactor(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 2
  return Math.min(6, Math.max(1, numeric))
}

async function estimateTopaz({
  apiKey,
  inputWidth,
  inputHeight,
  outputWidth,
  outputHeight,
  outputFormat,
  model,
}: {
  apiKey: string
  inputWidth: number
  inputHeight: number
  outputWidth: number
  outputHeight: number
  outputFormat: string
  model: string
}) {
  const estimate = await fetchJson(`${TOPAZ_API_BASE}/estimate`, {
    method: 'POST',
    headers: {
      ...topazHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: 'Enhance',
      model,
      input_width: inputWidth,
      input_height: inputHeight,
      output_width: outputWidth,
      output_height: outputHeight,
      crop_to_fill: false,
      output_format: outputFormat,
    }),
  })
  return estimate as TopazEstimate
}

async function createTopazJob({
  apiKey,
  image,
  outputWidth,
  outputHeight,
  outputFormat,
  model,
}: {
  apiKey: string
  image: { buffer: Buffer; mimeType: string }
  outputWidth: number
  outputHeight: number
  outputFormat: string
  model: string
}) {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), `jarvis-source.${extensionForMimeType(image.mimeType)}`)
  form.append('model', model)
  form.append('output_width', String(outputWidth))
  form.append('output_height', String(outputHeight))
  form.append('crop_to_fill', 'false')
  form.append('output_format', outputFormat)

  const created = await fetchJson(`${TOPAZ_API_BASE}/enhance/async`, {
    method: 'POST',
    headers: topazHeaders(apiKey),
    body: form,
  })
  if (!isRecord(created) || typeof created.process_id !== 'string') {
    throw new Error('Topaz did not return a process_id.')
  }
  return created as { process_id: string; eta?: number; source_id?: string }
}

async function waitForTopazResult(apiKey: string, processId: string) {
  let latest: TopazStatus | null = null
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const status = await fetchJson(`${TOPAZ_API_BASE}/status/${processId}`, {
      method: 'GET',
      headers: topazHeaders(apiKey),
    }) as TopazStatus
    latest = status
    if (status.status === 'Completed') return status
    if (status.status === 'Failed' || status.status === 'Cancelled') {
      throw new Error(`Topaz job ${status.status.toLowerCase()}.`)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw Object.assign(new Error('Topaz processing did not complete before the local timeout.'), { statusPayload: latest })
}

async function downloadTopazOutput(apiKey: string, processId: string) {
  const download = await fetchJson(`${TOPAZ_API_BASE}/download/${processId}`, {
    method: 'GET',
    headers: topazHeaders(apiKey),
  }) as { download_url?: string; expiry?: number }
  if (!download.download_url) throw new Error('Topaz did not return a download URL.')
  const imageResponse = await fetch(download.download_url)
  if (!imageResponse.ok) throw new Error(`Could not download Topaz output: ${imageResponse.status}`)
  const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  return { buffer, mimeType, expiry: download.expiry ?? null }
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === CLIENT_ASSETS_BUCKET)) {
    await sb.storage.createBucket(CLIENT_ASSETS_BUCKET, { public: false })
  }
}

async function saveEnhancedOutput(body: Record<string, unknown>) {
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  const imageDataUrl = typeof body.enhanced_image_data_url === 'string' ? body.enhanced_image_data_url : ''
  const parsed = parseDataUrl(imageDataUrl)
  if (!clientId || !parsed) throw new Error('client_id and enhanced_image_data_url are required to save.')

  const originalOutputId = typeof body.original_output_id === 'string' ? body.original_output_id : null
  const upscaleFactor = normalizeUpscaleFactor(body.upscale_factor)
  const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL
  const outputFormat = normalizeOutputFormat(body.output_format)
  const costCredits = typeof body.cost_credits === 'number' ? body.cost_credits : null
  const meta = await sharp(parsed.buffer).metadata().catch(() => ({ width: null, height: null }))
  const timestamp = new Date().toISOString()
  const metadata = sanitizeMetadata({
    original_asset_or_output_id: originalOutputId,
    enhancement_provider: 'Topaz',
    enhancement_provider_slug: 'topaz',
    enhancement_type: 'upscale',
    upscale_factor: upscaleFactor,
    model,
    output_format: outputFormat,
    cost_credits: costCredits,
    timestamp,
  })

  await ensureBucket()
  const ext = extensionForMimeType(parsed.mimeType)
  const path = `${clientId}/topaz-enhancements/${Date.now()}_${randomUUID()}.${ext}`
  const { error: uploadError } = await sb.storage.from(CLIENT_ASSETS_BUCKET).upload(path, parsed.buffer, {
    contentType: parsed.mimeType,
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { data: record, error: insertError } = await sb
    .from('asset_uploads')
    .insert({
      client_id: clientId,
      file_name: `Topaz Enhanced Output - ${new Date().toISOString()}.${ext}`,
      file_path: path,
      original_file_path: path,
      file_type: parsed.mimeType,
      asset_category: 'topaz_enhancements',
      file_size: parsed.buffer.length,
      original_size_bytes: parsed.buffer.length,
      original_width: meta.width ?? null,
      original_height: meta.height ?? null,
      extraction_status: 'skipped',
      extraction_method: 'topaz_upscale',
      source_quality: 'ai_enhanced',
      metadata_status: 'complete',
      has_metadata: true,
      metadata,
    })
    .select('id, file_name, asset_category, file_path, metadata')
    .single()

  if (insertError) throw new Error(insertError.message)
  return record
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'upscale'

    if (action === 'save') {
      const asset = await saveEnhancedOutput(body)
      return NextResponse.json({ success: true, asset })
    }

    const apiKey = process.env.TOPAZ_API_KEY
    const image = await loadInputImage(body)
    const metadata = await sharp(image.buffer).metadata()
    const inputWidth = metadata.width ?? 0
    const inputHeight = metadata.height ?? 0
    if (!inputWidth || !inputHeight) throw new Error('Could not read input image dimensions.')

    const upscaleFactor = normalizeUpscaleFactor(body.upscale_factor)
    const outputFormat = normalizeOutputFormat(body.output_format)
    const outputWidth = Math.round(inputWidth * upscaleFactor)
    const outputHeight = Math.round(inputHeight * upscaleFactor)
    const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL
    const dryRun = body.dry_run === true

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        dry_run: dryRun,
        topaz_configured: false,
        error: 'TOPAZ_API_KEY is not configured.',
        action_needed: 'Add TOPAZ_API_KEY to .env.local and restart the dev server.',
        input: { width: inputWidth, height: inputHeight, mime_type: image.mimeType },
        requested_output: { width: outputWidth, height: outputHeight, upscale_factor: upscaleFactor, output_format: outputFormat, model },
      }, { status: 503 })
    }

    const estimate = await estimateTopaz({ apiKey, inputWidth, inputHeight, outputWidth, outputHeight, outputFormat, model })

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        topaz_configured: true,
        provider: 'Topaz',
        model,
        input: { width: inputWidth, height: inputHeight, mime_type: image.mimeType },
        requested_output: { width: outputWidth, height: outputHeight, upscale_factor: upscaleFactor, output_format: outputFormat },
        estimated_duration_seconds: estimate.duration ?? null,
        estimated_credits: estimate.credits ?? null,
      })
    }

    const created = await createTopazJob({ apiKey, image, outputWidth, outputHeight, outputFormat, model })
    const status = await waitForTopazResult(apiKey, created.process_id)
    const output = await downloadTopazOutput(apiKey, created.process_id)
    const outputMeta = await sharp(output.buffer).metadata().catch(() => ({ width: null, height: null }))

    return NextResponse.json({
      success: true,
      provider: 'Topaz',
      model: status.model ?? model,
      process_id: created.process_id,
      source_id: created.source_id ?? null,
      input: { width: inputWidth, height: inputHeight, mime_type: image.mimeType, source: image.source },
      output: {
        width: outputMeta.width ?? status.output_width ?? outputWidth,
        height: outputMeta.height ?? status.output_height ?? outputHeight,
        mime_type: output.mimeType,
        byte_size: output.buffer.length,
      },
      upscale_factor: upscaleFactor,
      output_format: outputFormat,
      estimated_duration_seconds: estimate.duration ?? null,
      estimated_credits: estimate.credits ?? null,
      actual_credits: status.credits ?? estimate.credits ?? null,
      status,
      download_expiry: output.expiry,
      enhanced_image_data: dataUrlFromBuffer(output.buffer, output.mimeType),
    })
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'client-assets'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ImageVariant {
  buffer: Buffer
  width: number
  height: number
  mimeType: string
  outputExt: string
}

interface OptimizationResult {
  original: { width: number; height: number }
  optimized: ImageVariant
  aiPreview: ImageVariant
}

interface AssetUploadRow {
  id: string
  client_id: string
  file_path: string | null
  optimized_file_path: string | null
  ai_preview_path: string | null
  original_file_path: string | null
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

async function uploadToStorage(path: string, buffer: Buffer, contentType: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  })
  return error?.message ?? null
}

async function optimizeImage(buffer: Buffer, inputMime: string): Promise<OptimizationResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp') as typeof import('sharp')
  const meta = await sharp(buffer).metadata()
  const useWebP = inputMime === 'image/webp'
  const outMime = useWebP ? 'image/webp' : 'image/jpeg'
  const outExt = useWebP ? 'webp' : 'jpg'

  const optimized = await (useWebP
    ? sharp(buffer).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 87 })
    : sharp(buffer).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 87, mozjpeg: true })
  ).toBuffer({ resolveWithObject: true })

  const aiPreview = await (useWebP
    ? sharp(buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 77 })
    : sharp(buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 77, mozjpeg: true })
  ).toBuffer({ resolveWithObject: true })

  return {
    original: {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    },
    optimized: {
      buffer: optimized.data,
      width: optimized.info.width,
      height: optimized.info.height,
      mimeType: outMime,
      outputExt: outExt,
    },
    aiPreview: {
      buffer: aiPreview.data,
      width: aiPreview.info.width,
      height: aiPreview.info.height,
      mimeType: outMime,
      outputExt: outExt,
    },
  }
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function uniqueStoragePaths(asset: AssetUploadRow, nextPaths: string[]) {
  return Array.from(new Set([
    asset.file_path,
    asset.optimized_file_path,
    asset.ai_preview_path,
    asset.original_file_path,
  ].filter((path): path is string => Boolean(path) && !nextPaths.includes(path!))))
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const assetId = String(form.get('asset_id') ?? '')
    const file = form.get('file')

    if (!assetId) {
      return NextResponse.json({ error: 'Missing asset_id.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing replacement image file.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Replacement file must be an image.' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await sb
      .from('asset_uploads')
      .select('id, client_id, file_path, optimized_file_path, ai_preview_path, original_file_path')
      .eq('id', assetId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 })
    }

    const asset = existing as AssetUploadRow
    const bytes = await file.arrayBuffer()
    const originalBuffer = Buffer.from(bytes)
    const timestamp = Date.now()
    const basePath = `${asset.client_id}/replacements/${asset.id}/${timestamp}_${safeFileName(file.name)}`
    const originalPath = basePath

    await ensureBucket()

    const originalUploadError = await uploadToStorage(originalPath, originalBuffer, file.type)
    if (originalUploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${originalUploadError}` }, { status: 500 })
    }

    let optimizedPath: string | null = null
    let aiPreviewPath: string | null = null
    let updatePayload: Record<string, unknown> = {
      file_path: originalPath,
      original_file_path: originalPath,
      file_type: file.type,
      file_size: originalBuffer.length,
      optimization_status: 'skipped',
      original_size_bytes: originalBuffer.length,
      optimized_size_bytes: null,
      ai_preview_size_bytes: null,
      compression_ratio: null,
      optimized_file_path: null,
      ai_preview_path: null,
      original_width: null,
      original_height: null,
      optimized_width: null,
      optimized_height: null,
      ai_preview_width: null,
      ai_preview_height: null,
    }

    try {
      const optimized = await optimizeImage(originalBuffer, file.type)
      optimizedPath = basePath.replace(/\.[^.]+$/, `_optimized.${optimized.optimized.outputExt}`)
      aiPreviewPath = basePath.replace(/\.[^.]+$/, `_ai_preview.${optimized.aiPreview.outputExt}`)

      const optimizedUploadError = await uploadToStorage(optimizedPath, optimized.optimized.buffer, optimized.optimized.mimeType)
      const aiPreviewUploadError = await uploadToStorage(aiPreviewPath, optimized.aiPreview.buffer, optimized.aiPreview.mimeType)

      if (optimizedUploadError || aiPreviewUploadError) {
        throw new Error(optimizedUploadError || aiPreviewUploadError || 'Variant upload failed')
      }

      updatePayload = {
        ...updatePayload,
        optimization_status: 'optimized',
        optimized_size_bytes: optimized.optimized.buffer.length,
        ai_preview_size_bytes: optimized.aiPreview.buffer.length,
        compression_ratio: Math.round((1 - optimized.aiPreview.buffer.length / originalBuffer.length) * 100) / 100,
        optimized_file_path: optimizedPath,
        ai_preview_path: aiPreviewPath,
        original_width: optimized.original.width,
        original_height: optimized.original.height,
        optimized_width: optimized.optimized.width,
        optimized_height: optimized.optimized.height,
        ai_preview_width: optimized.aiPreview.width,
        ai_preview_height: optimized.aiPreview.height,
      }
    } catch (error) {
      console.warn('[replace-image-optimize]', error)
      await sb.storage.from(BUCKET).remove([optimizedPath, aiPreviewPath].filter((path): path is string => Boolean(path)))
      optimizedPath = null
      aiPreviewPath = null
    }

    const { data: updated, error: updateError } = await sb
      .from('asset_uploads')
      .update(updatePayload)
      .eq('id', asset.id)
      .select()
      .single()

    if (updateError || !updated) {
      await sb.storage.from(BUCKET).remove([originalPath, optimizedPath, aiPreviewPath].filter((path): path is string => Boolean(path)))
      return NextResponse.json({ error: `Asset update failed: ${updateError?.message ?? 'unknown error'}` }, { status: 500 })
    }

    const nextPaths = [originalPath, optimizedPath, aiPreviewPath].filter((path): path is string => Boolean(path))
    const oldPaths = uniqueStoragePaths(asset, nextPaths)
    let removeWarning: string | null = null
    if (oldPaths.length > 0) {
      const { error: removeError } = await sb.storage.from(BUCKET).remove(oldPaths)
      if (removeError) removeWarning = 'Image replaced, but one or more previous storage files could not be removed.'
    }

    return NextResponse.json({
      ok: true,
      asset: updated,
      removed_paths_count: removeWarning ? 0 : oldPaths.length,
      warning: removeWarning,
    })
  } catch (error) {
    console.error('[replace-image]', error)
    return NextResponse.json({ error: 'Image replacement failed.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const BUCKET = 'client-assets'
const CATEGORY = 'pinterest_inspiration'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const clientId = formData.get('client_id')
    const rawFiles = formData.getAll('files[]')

    if (typeof clientId !== 'string' || clientId.length === 0) {
      return NextResponse.json({ error: 'Missing client_id' }, { status: 400 })
    }

    const files = rawFiles.filter((file): file is File => file instanceof File && file.size > 0 && file.type.startsWith('image/'))
    if (files.length === 0) {
      return NextResponse.json({ error: 'No valid image files provided' }, { status: 400 })
    }

    await ensureBucket()

    const uploaded = await Promise.all(files.slice(0, 8).map(async file => {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileName = safeFileName(file.name)
      const path = `${clientId}/pinterest-inspiration/${Date.now()}_${randomUUID()}_${fileName}`

      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error: insertError } = await sb
        .from('asset_uploads')
        .insert({
          client_id: clientId,
          file_name: file.name,
          file_path: path,
          file_type: file.type || 'image/jpeg',
          asset_category: CATEGORY,
          file_size: buffer.length,
          extraction_status: 'skipped',
          extraction_method: 'pinterest_inspiration',
          source_quality: 'original',
          metadata: {
            content_pillar: CATEGORY,
            usage_role: 'creative_inspiration_only',
            notes: 'Use as mood/composition/styling inspiration only. Not source-of-truth.',
          },
        })
        .select('id, file_name, asset_category, file_path')
        .single()

      if (insertError) throw new Error(insertError.message)
      return data
    }))

    return NextResponse.json({ success: true, uploads: uploaded })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { trackUsage, calcCost } from '@/lib/ai-tracker'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const BUCKET    = 'client-assets'
const MAX_IMGS  = 10  // max images per vision call

// ─── Brain questions (for proposal mapping) ────────────────────────────────────

const BRAIN_QUESTIONS: Record<string, string> = {
  venue_overview:       'What is this venue? (concept, location, parent group)',
  visual_identity:      'What is the visual identity? (colors, style, atmosphere, lighting, plating)',
  content_pillars:      'What are the content pillars?',
  tone_of_voice:        'What is the tone of voice?',
  audience:             'Who is the audience?',
  assets_available:     'What assets are available? (photos, video, logo, menu PDF)',
  assets_missing:       'What assets are missing?',
  social_strategy:      'What is the social media strategy?',
  agent_writing_guide:  'What do agents need to know to write for this client?',
  jarvis_internal_notes:'Critical context, edge cases, internal notes?',
}

// ─── Image optimization ────────────────────────────────────────────────────────

interface ImageVariant { buffer: Buffer; width: number; height: number; ext: string; mime: string }
interface OptResult {
  original:  { w: number; h: number }
  optimized: ImageVariant
  aiPreview: ImageVariant
}

async function optimizeImage(buf: Buffer, mime: string): Promise<OptResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp  = require('sharp') as typeof import('sharp')
  const meta   = await sharp(buf).metadata()
  const webp   = mime === 'image/webp'
  const outMime = webp ? 'image/webp' : 'image/jpeg'
  const outExt  = webp ? 'webp' : 'jpg'

  const [optR, aiR] = await Promise.all([
    (webp
      ? sharp(buf).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 87 })
      : sharp(buf).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 87, mozjpeg: true })
    ).toBuffer({ resolveWithObject: true }),
    (webp
      ? sharp(buf).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 77 })
      : sharp(buf).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 77, mozjpeg: true })
    ).toBuffer({ resolveWithObject: true }),
  ])

  return {
    original:  { w: meta.width ?? 0, h: meta.height ?? 0 },
    optimized: { buffer: optR.data, width: optR.info.width, height: optR.info.height, ext: outExt, mime: outMime },
    aiPreview: { buffer: aiR.data,  width: aiR.info.width,  height: aiR.info.height,  ext: outExt, mime: outMime },
  }
}

// ─── Storage upload ────────────────────────────────────────────────────────────

async function ensureBucket() {
  const { data: list } = await sb.storage.listBuckets()
  if (!list?.find(b => b.name === BUCKET)) await sb.storage.createBucket(BUCKET, { public: false })
}

async function uploadStorage(path: string, buf: Buffer, mime: string) {
  await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false })
}

// ─── Vision analysis ───────────────────────────────────────────────────────────

type Proposal = { question_key: string; proposed_answer: string; reasoning: string; confidence: number }

async function analyzeImages(
  previews:       Array<{ buffer: Buffer; label: string }>,
  category:       string,
  clientName:     string,
  currentBrain:   Record<string, string | null>,
  enrichmentMode: boolean = false,
  clientId?:      string
): Promise<{ proposals: Proposal[]; summary: string; tokenCost: number }> {
  const content: Anthropic.MessageParam['content'] = []

  // Add images with labels
  for (const { buffer, label } of previews) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buffer.toString('base64') } })
    content.push({ type: 'text', text: label })
  }

  const snippets = Object.entries(BRAIN_QUESTIONS).map(([k, v]) => {
    const cur = currentBrain[k]
    return `- ${k}: ${v}\n  Current: ${cur ? `"${cur.slice(0, 100)}…"` : '[empty]'}`
  }).join('\n')

  const enrichmentNote = enrichmentMode ? `
IMPORTANT — ENRICHMENT MODE: These are ORIGINAL high-resolution files replacing previously analyzed compressed Telegram previews.
- The brain already has answers from the compressed versions — your job is to ENRICH them with finer detail only visible in originals.
- Look for: precise color hex/tone descriptions, texture details, typography on signage, brand elements, material quality cues.
- Propose enriched answers even if the question_key already has an answer — write a richer, more specific version.
- Prefix your reasoning with "[Original quality — enriched from compressed]".
` : ''

  content.push({ type: 'text', text: `
You are analyzing ${previews.length} photo(s) from a "${category}" batch upload for restaurant "${clientName}".
${enrichmentNote}
TASK:
1. Write a brief SUMMARY of what the photos collectively show (atmosphere, style, quality, key visual elements).
2. Identify SHARED patterns: lighting style, color palette, plating/presentation style, interior design cues.
3. Propose updates to the Client Brain where these photos provide genuine, specific new information.

BRAIN QUESTIONS:
${snippets}

RULES:
- ${enrichmentMode ? 'Enrich existing answers with higher-fidelity detail from originals — don\'t just repeat.' : 'Only propose where photos add real, specific new value over current answers.'}
- Keep proposed answers concise (max 250 words). Integrate with existing answer — don't replace it wholesale.
- Confidence: 5 = clearly visible, 4 = strongly implied.
- For visual_identity: be specific about colors, materials, lighting temperature, design era/style.
- For assets_available: list shot types confirmed (e.g. "interior wide shots x3, entrance reveal x1").

Return:
=== SUMMARY ===
[2–4 sentence summary of the batch]

=== BRAIN_JSON ===
[{"question_key":"...","proposed_answer":"...","reasoning":"...","confidence":5}]
` })

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 2000,
    messages:   [{ role: 'user', content }],
  })

  const raw       = (response.content.find(b => b.type === 'text') as { text: string } | undefined)?.text ?? ''
  const cost      = calcCost('claude-haiku-4-5', response.usage)

  // Persist accurate usage (images in this call are the primary cost driver)
  trackUsage({
    model:       'claude-haiku-4-5',
    route:       '/api/brain/upload/batch',
    feature:     'vision_batch',
    clientId,
    usage:       response.usage,
    imagesCount: content.filter(c => c.type === 'image').length,
  }).catch(() => {})

  const summaryMatch = raw.match(/=== SUMMARY ===([\s\S]*?)(?:=== BRAIN_JSON ===|$)/i)
  const jsonMatch    = raw.match(/=== BRAIN_JSON ===([\s\S]*?)$/i)

  const summary = summaryMatch?.[1]?.trim() ?? ''
  const jsonStr = (jsonMatch?.[1] ?? '[]').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim()

  let proposals: Proposal[] = []
  try { proposals = JSON.parse(jsonStr) } catch { proposals = [] }

  return { proposals, summary, tokenCost: cost }
}

// ─── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData     = await req.formData()
    const clientId      = formData.get('client_id')      as string | null
    const clientName    = formData.get('client_name')    as string | null
    const category      = formData.get('asset_category') as string | null
    const sourceQuality = (formData.get('source_quality') as string | null) ?? 'original'
    const skipAnalysis  = formData.get('skip_analysis') === 'true'
    const rawFiles      = formData.getAll('files[]')

    if (!clientId || !category || rawFiles.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return NextResponse.json({ error: 'No valid files' }, { status: 400 })

    await ensureBucket()

    // ── 1. Optimize all images in parallel ────────────────────────────────────
    const optimized = await Promise.all(files.map(async (file, i) => {
      const buf  = Buffer.from(await file.arrayBuffer())
      const mime = file.type || 'image/jpeg'
      const opt  = await optimizeImage(buf, mime)
      return { file, buf, mime, opt, index: i }
    }))

    // ── 2. Upload originals + variants in parallel ─────────────────────────────
    const ts  = Date.now()
    const uploads = await Promise.all(optimized.map(async ({ file, buf, mime, opt, index }) => {
      const safe   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const base   = `${clientId}/${ts}_${index}_${safe}`
      const optExt = opt.optimized.ext
      const aiExt  = opt.aiPreview.ext
      const baseMetadata = category === 'pinterest_inspiration'
        ? {
            inspirationOnly: true,
            inspiration_only: true,
            source: 'pinterest',
            source_type: 'pinterest_inspiration',
            normalized_role: 'inspiration',
            asset_role: 'inspiration',
            approved_for_generation: false,
            client_truth_reference: false,
          }
        : null

      await Promise.all([
        uploadStorage(base,                              buf,              mime),
        uploadStorage(base.replace(/\.[^.]+$/, `_optimized.${optExt}`),  opt.optimized.buffer, opt.optimized.mime),
        uploadStorage(base.replace(/\.[^.]+$/, `_ai_preview.${aiExt}`),  opt.aiPreview.buffer, opt.aiPreview.mime),
      ])

      // Insert asset_uploads record
      const { data: record } = await sb.from('asset_uploads').insert({
        client_id:            clientId,
        file_name:            file.name,
        file_path:            base,
        file_type:            mime,
        asset_category:       category,
        file_size:            buf.length,
        extraction_status:    skipAnalysis ? 'uploaded' : 'pending',
        extraction_method:    skipAnalysis ? 'manual_image_upload' : 'batch_vision',
        source_quality:       sourceQuality,
        ...(baseMetadata ? { metadata: baseMetadata } : {}),
        optimization_status:  'optimized',
        original_size_bytes:  buf.length,
        optimized_size_bytes: opt.optimized.buffer.length,
        ai_preview_size_bytes:opt.aiPreview.buffer.length,
        compression_ratio:    Math.round((1 - opt.aiPreview.buffer.length / buf.length) * 100) / 100,
        original_width:       opt.original.w,
        original_height:      opt.original.h,
        original_file_path:   base,
      }).select().single()

      return {
        id:               record?.id,
        file_name:        file.name,
        original_bytes:   buf.length,
        optimized_bytes:  opt.optimized.buffer.length,
        ai_preview_bytes: opt.aiPreview.buffer.length,
        ai_preview_buf:   opt.aiPreview.buffer,
      }
    }))

    // ── 3. Auto-supersede compressed previews if uploading originals ──────────
    let supersededCount = 0
    if (sourceQuality === 'original') {
      const { data: compressed } = await sb
        .from('asset_uploads')
        .select('id')
        .eq('client_id', clientId!)
        .eq('asset_category', category!)
        .eq('source_quality', 'compressed_preview')
        .eq('superseded', false)

      if (compressed && compressed.length > 0) {
        const primaryId = uploads.find(u => u.id)?.id
        await sb.from('asset_uploads')
          .update({ superseded: true, superseded_by: primaryId ?? null })
          .in('id', compressed.map(r => r.id))
        supersededCount = compressed.length
      }
    }

    if (skipAnalysis) {
      const totalOriginal = uploads.reduce((sum, upload) => sum + upload.original_bytes, 0)
      const totalOptimized = uploads.reduce((sum, upload) => sum + upload.ai_preview_bytes, 0)
      return NextResponse.json({
        uploads_count: uploads.length,
        images_analyzed: 0,
        skipped: uploads.length,
        proposals_count: 0,
        superseded_count: supersededCount,
        enrichment_mode: false,
        source_quality: sourceQuality,
        cost_usd: 0,
        summary: '',
        metadata_status: 'skipped',
        metadata_success_count: 0,
        metadata_fail_count: 0,
        total_original_bytes: totalOriginal,
        total_ai_preview_bytes: totalOptimized,
        compression_ratio: totalOriginal > 0 ? Math.round((1 - totalOptimized / totalOriginal) * 100) : 0,
        files: uploads.map(upload => ({
          id: upload.id,
          file_name: upload.file_name,
          original_bytes: upload.original_bytes,
          optimized_bytes: upload.optimized_bytes,
          ai_preview_bytes: upload.ai_preview_bytes,
        })),
      })
    }

    // ── 4. Load current brain ─────────────────────────────────────────────────
    const { data: brainEntries } = await sb.from('client_brain').select('id, question_key, answer').eq('client_id', clientId)
    const currentBrain: Record<string, string | null> = {}
    const brainIdMap:   Record<string, string>        = {}
    for (const e of brainEntries ?? []) {
      currentBrain[e.question_key] = e.answer
      brainIdMap[e.question_key]   = e.id
    }

    // ── 5. Vision analysis — cap at MAX_IMGS, use AI previews ─────────────────
    const toAnalyze = uploads.slice(0, MAX_IMGS)
    const previews  = toAnalyze.map((u, i) => ({
      buffer: u.ai_preview_buf,
      label:  `[Photo ${i + 1} of ${toAnalyze.length} — ${category}]`,
    }))

    const { proposals, summary, tokenCost } = await analyzeImages(
      previews, category, clientName ?? 'Client', currentBrain,
      sourceQuality === 'original' && supersededCount > 0,  // enrichment mode
      clientId ?? undefined
    )

    // ── 6. Extract image metadata for each upload (skip brain proposals) ──────
    const metadataUpdates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    let metadataSuccessCount = 0
    let metadataFailCount = 0

    for (const [idx, u] of toAnalyze.entries()) {
      // Use AI preview if available, else skip (can't extract metadata without image)
      if (!u.ai_preview_buf) {
        console.warn(`[batch-metadata] ${u.file_name}: no ai_preview_buf — skipping metadata`)
        metadataFailCount++
        continue
      }

      try {
        const metaRes = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: u.ai_preview_buf.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: category === 'blueprint_layouts'
                    ? `Analyze image ${idx + 1} as a blueprint/spatial layout. Extract only reliable visible spatial facts. Return JSON ONLY:
{"layout_type":"floor plan|terrace plan|seating map|zone diagram|unknown","zones":"visible named/obvious zones only","tables":"table shapes/counts/placement if visible","walkways":"walking paths, circulation, entrances, service paths if visible","seating_clusters":"seating groups and spacing notes if visible","relationships":"zone/table/chandelier/entrance/terrace relationships if visible","spatial_notes":"short continuity notes; do not invent","confidence":60-95}`
                    : ['food', 'breakfast'].includes(category)
                      ? `Analyze image ${idx + 1} as a food reference for generation fidelity. Return JSON ONLY:
{"type":"${category === 'breakfast' ? 'Breakfast' : 'Food'}","name":"known dish name or blank","dish_name":"exact dish name if known","plate_count":"visible plate count if reliable","item_count":"visible item count if reliable","serving_vessel":"visible plate/bowl/tray","sauce":"visible sauce/dip","side_components":"visible sides/components","garnish":"visible garnish","texture_notes":"visible texture notes","shape_structure":"shape/arrangement/count structure","meal_period":"Breakfast|Business Lunch|Dinner|Traffic Hours|unknown","do_not_add":"what not to invent","do_not_remove":"critical visible count/components","asset_origin":"Original Photo"}`
                    : category === 'drinks'
                      ? `Analyze image ${idx + 1} as a drink reference for generation fidelity. Return JSON ONLY:
{"type":"Cocktail","name":"known drink name or blank","drink_name":"exact drink name if known","glass_shape":"visible glass shape","liquid_color":"visible liquid color","garnish":"visible garnish","foam_or_clarity":"foam/clarity/layering if visible","scale":"realistic scale note","contains_smoke_effect":"yes|no|uncertain","do_not_add":"smoke/flames/debris/extra garnish unless visible","asset_origin":"Original Photo"}`
                    : ['interiors', 'exteriors'].includes(category)
                      ? `Analyze image ${idx + 1} as a venue environment anchor. Return JSON ONLY:
{"type":"${category === 'interiors' ? 'Interior' : 'Exterior'}","name":"area name if known","zone":"visible venue zone if known","table_shape":"visible table shape","table_material":"visible table material","table_edge":"visible rim/edge detail","seating":"visible seating type","lighting":"visible lighting behavior","mirror_reflection_behavior":"reflection behavior if visible","background_constraints":"visible background constraints only","do_not_invent":"unsupported architecture/furniture/views to avoid","features":"short visible features","asset_origin":"Original Photo"}`
                    : category === 'venue_items'
                      ? `Analyze image ${idx + 1} as a venue item/tableware reference for generation fidelity. Return JSON ONLY:
{"type":"Venue Item","name":"known item name or blank","item_type":"cutlery|plate|glassware|napkin|service object|other","service_style":"short service style","cutlery":"cutlery facts if visible","tableware":"plate/glassware/tableware facts if visible","material":"visible material","color":"visible color/metal tone","usage":"how this item should appear in venue service","do_not_add":"random decorative cutlery, candles, extra plates, unrelated props","asset_origin":"Original Photo"}`
                    : `Analyze image ${idx + 1} and extract metadata. Return JSON ONLY:
{"tags":["tag1",...8-12],"mood":"mood words","colors":["#hex",...5-8],"orientation":"landscape|portrait|square","notes":"1-2 sentences","confidence":75-90}`,
                },
              ],
            },
          ],
        })

        const metaText = metaRes.content.find(b => b.type === 'text')
        if (metaText && metaText.type === 'text') {
          const jsonMatch = metaText.text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const metadata = JSON.parse(jsonMatch[0])
            metadata.content_pillar = category
            metadataUpdates.push({ id: u.id, metadata })
            metadataSuccessCount++
          } else {
            console.warn(`[batch-metadata] ${u.file_name}: no JSON in response`)
            metadataFailCount++
          }
        } else {
          console.warn(`[batch-metadata] ${u.file_name}: no text in response`)
          metadataFailCount++
        }
      } catch (err) {
        console.error(`[batch-metadata] ${u.file_name}:`, err instanceof Error ? err.message : String(err))
        metadataFailCount++
      }
    }

    console.info(`[batch-metadata] extracted: ${metadataSuccessCount} success, ${metadataFailCount} failed out of ${toAnalyze.length}`)

    // ── 6.5 Save image metadata directly (no proposals for image data) ────────
    const metadataSaveResults = await Promise.all(
      metadataUpdates.map(m =>
        sb.from('asset_uploads').update({ metadata: m.metadata }).eq('id', m.id).then(
          res => ({ id: m.id, error: res.error }),
          err => ({ id: m.id, error: err })
        )
      )
    )
    const metadataSaveErrors = metadataSaveResults.filter(r => r.error)
    if (metadataSaveErrors.length > 0) {
      console.error('[batch-metadata-save] failed to save:', metadataSaveErrors)
    }
    console.info(`[batch-metadata-save] saved ${metadataUpdates.length - metadataSaveErrors.length}/${metadataUpdates.length}`)

    // ── 7. Insert proposals (brain questions only, not image metadata) ────────
    const primaryId      = uploads[0]?.id
    const validProposals = proposals.filter(p => p.question_key && p.proposed_answer?.trim() && BRAIN_QUESTIONS[p.question_key])
    let proposalsInserted = 0

    if (validProposals.length > 0) {
      const rows = validProposals.map(p => ({
        client_brain_id:         brainIdMap[p.question_key] ?? null,
        asset_upload_id:         primaryId ?? null,
        client_id:               clientId,
        question_key:            p.question_key,
        proposed_answer:         p.proposed_answer.trim(),
        current_answer_snapshot: currentBrain[p.question_key] ?? null,
        reasoning:               `[Batch ${toAnalyze.length} images — ${category}] ${p.reasoning ?? ''}`,
        confidence:              Math.min(5, Math.max(1, Number(p.confidence) || 3)),
        status:                  'pending',
      }))
      const { error } = await sb.from('brain_update_proposals').insert(rows)
      if (!error) proposalsInserted = rows.length
    }

    // ── 8. Finalize upload records ────────────────────────────────────────────
    await Promise.all(uploads.map(u =>
      sb.from('asset_uploads').update({
        extraction_status:  'extracted',
        extracted_summary:  summary.slice(0, 500),
        proposals_count:    u.id === primaryId ? proposalsInserted : 0,
        cost_usd:           u.id === primaryId ? Math.round(tokenCost * 100000) / 100000 : 0,
        pages_processed:    null,
      }).eq('id', u.id)
    ))

    const totalOriginal  = uploads.reduce((s, u) => s + u.original_bytes, 0)
    const totalOptimized = uploads.reduce((s, u) => s + u.ai_preview_bytes, 0)

    return NextResponse.json({
      uploads_count:           uploads.length,
      images_analyzed:         toAnalyze.length,
      skipped:                 uploads.length - toAnalyze.length,
      proposals_count:         proposalsInserted,
      superseded_count:        supersededCount,
      enrichment_mode:         sourceQuality === 'original' && supersededCount > 0,
      source_quality:          sourceQuality,
      cost_usd:                Math.round(tokenCost * 100000) / 100000,
      summary,
      metadata_status:         metadataSuccessCount > 0 ? 'partial_success' : (metadataFailCount > 0 ? 'failed' : 'skipped'),
      metadata_success_count:  metadataSuccessCount,
      metadata_fail_count:     metadataFailCount,
      total_original_bytes:    totalOriginal,
      total_ai_preview_bytes:  totalOptimized,
      compression_ratio:       Math.round((1 - totalOptimized / totalOriginal) * 100),
      files: uploads.map(u => ({
        id:               u.id,
        file_name:        u.file_name,
        original_bytes:   u.original_bytes,
        optimized_bytes:  u.optimized_bytes,
        ai_preview_bytes: u.ai_preview_bytes,
      })),
    })

  } catch (err) {
    console.error('[brain/upload/batch]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

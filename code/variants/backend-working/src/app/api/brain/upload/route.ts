import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, writeFile, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { trackUsage, calcCost } from '@/lib/ai-tracker'

const execFileAsync = promisify(execFile)

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const BUCKET   = 'client-assets'
const MAX_PAGES = 5   // default page cap for vision extraction
const PDFTOPPM_BIN = process.env.PDFTOPPM_BIN ?? (process.platform === 'darwin' ? '/opt/homebrew/bin/pdftoppm' : 'pdftoppm')

// ─── 20 brain questions ───────────────────────────────────────────────────────

const BRAIN_QUESTIONS: Record<string, string> = {
  venue_overview:          'What is this venue? (concept, location, parent group, opening date)',
  hours_and_service:       'What are the hours and service periods?',
  offers_activations:      'What offers are currently running?',
  menu_overview:           'What is the menu? (cuisine, hero dishes, price point)',
  brand_story:             'What is the brand story?',
  audience:                'Who is the audience?',
  visual_identity:         'What is the visual identity?',
  content_pillars:         'What are the content pillars?',
  tone_of_voice:           'What is the tone of voice?',
  brand_rules:             "What are the brand rules? (DOs, DON'Ts, forbidden words)",
  competitors_positioning: 'Who are the competitors and how is the brand positioned?',
  reputation_reviews:      'What do reputation and reviews say?',
  conversion:              'How does conversion work? (booking, delivery, CTA)',
  assets_available:        'What assets are available? (photos, video, logo, menu PDF)',
  assets_missing:          'What assets are missing?',
  social_strategy:         'What is the social media strategy?',
  paid_ads_strategy:       'What is the paid ads strategy?',
  campaigns_priorities:    'What are the upcoming campaigns or priorities?',
  agent_writing_guide:     'What do agents need to know to write for this client?',
  jarvis_internal_notes:   'What critical context, edge cases, or internal notes should Jarvis remember?',
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

async function uploadToStorage(path: string, buffer: Buffer, contentType: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false })
  return { error: error?.message }
}

// ─── Image optimization (sharp) ───────────────────────────────────────────────

interface ImageVariant { buffer: Buffer; width: number; height: number; mimeType: string; outputExt: string }
interface OptimizationResult {
  original:  { width: number; height: number }
  optimized: ImageVariant
  aiPreview: ImageVariant
}

async function optimizeImage(buffer: Buffer, inputMime: string): Promise<OptimizationResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp') as typeof import('sharp')
  const meta  = await sharp(buffer).metadata()
  const useWebP = inputMime === 'image/webp'
  const outMime = useWebP ? 'image/webp' : 'image/jpeg'
  const outExt  = useWebP ? 'webp'       : 'jpg'

  const optRes = await (useWebP
    ? sharp(buffer).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 87 })
    : sharp(buffer).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 87, mozjpeg: true })
  ).toBuffer({ resolveWithObject: true })

  const aiRes = await (useWebP
    ? sharp(buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 77 })
    : sharp(buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 77, mozjpeg: true })
  ).toBuffer({ resolveWithObject: true })

  return {
    original:  { width: meta.width ?? 0, height: meta.height ?? 0 },
    optimized: { buffer: optRes.data, width: optRes.info.width, height: optRes.info.height, mimeType: outMime, outputExt: outExt },
    aiPreview: { buffer: aiRes.data,  width: aiRes.info.width,  height: aiRes.info.height,  mimeType: outMime, outputExt: outExt },
  }
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

interface PdfExtractResult {
  text:        string
  isImageBased: boolean
  pageCount?:  number
}

async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const fn       = pdfParse.default ?? pdfParse
    const result   = await fn(buffer)
    const text     = (result.text as string).trim()
    const pages    = result.numpages ?? 1
    const isImageBased = text.length < pages * 80  // < 80 chars per page → image-based
    return { text: text.slice(0, 8000), isImageBased, pageCount: pages }
  } catch {
    return { text: '', isImageBased: true, pageCount: undefined }
  }
}

// ─── PDF pages → optimized JPEG images via pdftoppm ──────────────────────────

interface PdfPageImage {
  buffer:  Buffer
  page:    number
  width:   number
  height:  number
}

async function pdfPagesToImages(
  pdfBuffer:  Buffer,
  maxPages:   number = MAX_PAGES,
  resolution: number = 150     // dpi — 150 gives ~1200px wide for A4
): Promise<PdfPageImage[]> {
  const dir       = join(tmpdir(), `pdf_${randomUUID()}`)
  const pdfPath   = join(dir, 'input.pdf')
  const outPrefix = join(dir, 'page')

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(pdfPath, pdfBuffer)

    // pdftoppm: -jpeg -r <dpi> -l <lastPage> input.pdf outPrefix
    await execFileAsync(PDFTOPPM_BIN, [
      '-jpeg',
      '-r', String(resolution),
      '-l', String(maxPages),
      pdfPath,
      outPrefix,
    ])

    // Read generated files (page-1.jpg, page-2.jpg, ...)
    const files   = (await readdir(dir)).filter(f => f.endsWith('.jpg') || f.endsWith('.ppm')).sort()
    const results: PdfPageImage[] = []

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp')

    for (let i = 0; i < Math.min(files.length, maxPages); i++) {
      const raw  = await readFile(join(dir, files[i]))
      // Resize for AI analysis: max 1600px long edge, jpeg 77q
      const res  = await sharp(raw)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 77, mozjpeg: true })
        .toBuffer({ resolveWithObject: true })

      results.push({ buffer: res.data, page: i + 1, width: res.info.width, height: res.info.height })
    }

    return results
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ─── Vision extraction prompt ─────────────────────────────────────────────────

function buildVisionPrompt(assetCategory: string, clientName: string, pageCount: number): string {
  const isMennu = assetCategory.includes('menu') || assetCategory === 'pdf_menu' || assetCategory === 'offer_flyer'
  const isBlueprintLayout = assetCategory === 'blueprint_layouts' || assetCategory.includes('blueprint') || assetCategory.includes('layout')
  return `You are analyzing ${pageCount} page(s) of a ${assetCategory.replace(/_/g, ' ')} for restaurant "${clientName}".

${isBlueprintLayout ? `BLUEPRINT / SPATIAL LAYOUT RULES:
Extract only visible, reliable spatial facts:
1. Layout type (floor plan, terrace plan, seating map, zone diagram)
2. Zones and their rough relationships
3. Table shapes, table placement, seating clusters, and spacing
4. Walkways, circulation paths, entrances, service paths, and no-table zones
5. Chandelier/table alignment or furniture/fixture relationships if clearly shown

Do NOT treat this as visual inspiration. Do NOT invent details that are not visible.
` : ''}

${isMennu ? `MENU EXTRACTION RULES:
For menus, extract verbatim:
1. Menu section/category names (e.g. Starters, Mains, Desserts, Cocktails)
2. Every dish/drink name exactly as printed
3. Prices as printed (AED amounts)
4. Brief descriptions if legible
5. Dietary codes (V, GF, D, N, etc.) if visible
6. Any offer terms (set menu price, inclusions, conditions)

DO NOT invent, guess, or paraphrase items. If text is unclear, omit it.
` : ''}

Return a structured text extraction:
${isBlueprintLayout ? `- Use section headers such as ## Layout Type, ## Zones, ## Tables, ## Walkways, ## Seating, ## Spatial Relationships, ## Unclear Areas
- Keep all spatial notes factual and concise.
- Note if any areas are unclear or unreadable.` : `- Use section headers (## Section Name)
- List items as: "Item Name — Description (AED price)"
- Include any offer/set menu details at the end
- Note if any pages are unclear or unreadable`}

After extraction, identify which of these brain questions the content answers:
${Object.entries(BRAIN_QUESTIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Return your response in two parts:
=== EXTRACTION ===
[your structured extraction]

=== BRAIN_JSON ===
[JSON array: [{"question_key":"...","proposed_answer":"...","reasoning":"...","confidence":5}]]`
}

// ─── Text extraction prompt ───────────────────────────────────────────────────

function buildTextPrompt(
  assetCategory: string,
  clientName: string,
  content: string,
  currentBrain: Record<string, string | null>
): string {
  const snippets = Object.entries(BRAIN_QUESTIONS).map(([k, v]) => {
    const cur = currentBrain[k]
    return `- ${k}: ${v}\n  Current: ${cur ? `"${cur.slice(0, 120)}…"` : '[empty]'}`
  }).join('\n')

  return `You are analyzing a ${assetCategory.replace(/_/g, ' ')} for client "${clientName}".

CONTENT:
---
${content}
---

BRAIN QUESTIONS:
${snippets}

RULES:
1. Extract ONLY information explicitly present in the content.
2. Never invent dishes, prices, or offers.
3. Only propose where content adds genuine new value over current answer.
4. Max 350 words per proposed answer.
5. Confidence 5 = verbatim, 4 = clearly implied.

Return JSON array only:
[{"question_key":"...","proposed_answer":"...","reasoning":"...","confidence":5}]`
}

// ─── Claude calls ─────────────────────────────────────────────────────────────

type Proposal = { question_key: string; proposed_answer: string; reasoning: string; confidence: number }

async function extractViaVision(
  pages:          PdfPageImage[],
  assetCategory:  string,
  clientName:     string
): Promise<{ proposals: Proposal[]; extraction: string; tokenCost: number }> {
  const content: Anthropic.MessageParam['content'] = []

  for (const page of pages) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: page.buffer.toString('base64') },
    })
    content.push({ type: 'text', text: `[Page ${page.page}]` })
  }

  content.push({ type: 'text', text: buildVisionPrompt(assetCategory, clientName, pages.length) })

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 3000,
    messages:   [{ role: 'user', content }],
  })

  const raw        = (response.content.find(b => b.type === 'text') as { text: string } | undefined)?.text ?? ''
  const tokenCost  = calcCost('claude-haiku-4-5', response.usage)

  // Log actual usage (vision — images count for debug traceability)
  trackUsage({
    model:       'claude-haiku-4-5',
    route:       '/api/brain/upload',
    feature:     'vision_extract',
    usage:       response.usage,
    imagesCount: pages.length,
  }).catch(() => {})

  // Parse extraction + JSON sections
  const extractionMatch = raw.match(/=== EXTRACTION ===([\s\S]*?)(?:=== BRAIN_JSON ===|$)/i)
  const jsonMatch       = raw.match(/=== BRAIN_JSON ===([\s\S]*?)$/i)

  const extraction = extractionMatch?.[1]?.trim() ?? raw.slice(0, 2000)
  const jsonStr    = (jsonMatch?.[1] ?? '[]').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim()

  let proposals: Proposal[] = []
  try { proposals = JSON.parse(jsonStr) } catch { proposals = [] }

  return { proposals, extraction, tokenCost }
}

async function extractViaText(
  content:       string,
  assetCategory: string,
  clientName:    string,
  currentBrain:  Record<string, string | null>
): Promise<{ proposals: Proposal[]; tokenCost: number }> {
  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 2000,
    messages:   [{ role: 'user', content: buildTextPrompt(assetCategory, clientName, content, currentBrain) }],
  })

  const raw     = (response.content.find(b => b.type === 'text') as { text: string } | undefined)?.text ?? '[]'
  const jsonStr = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim()
  const cost    = calcCost('claude-haiku-4-5', response.usage)

  trackUsage({
    model:   'claude-haiku-4-5',
    route:   '/api/brain/upload',
    feature: 'text_extract',
    usage:   response.usage,
  }).catch(() => {})

  let proposals: Proposal[] = []
  try { proposals = JSON.parse(jsonStr) } catch { proposals = [] }
  return { proposals, tokenCost: cost }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData      = await req.formData()
    const file          = formData.get('file')          as File | null
    const clientId      = formData.get('client_id')     as string | null
    const clientName    = formData.get('client_name')   as string | null
    const assetCategory = formData.get('asset_category') as string | null
    const skipAnalysis  = formData.get('skip_analysis') === 'true'

    if (!file || !clientId || !assetCategory) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const bytes    = await file.arrayBuffer()
    const origBuf  = Buffer.from(bytes)
    const mimeType = file.type
    const isImage  = mimeType.startsWith('image/')
    const isPdf    = mimeType === 'application/pdf'
    const isText   = mimeType.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')

    await ensureBucket()

    const slug     = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const origPath = slug

    // ── 1. Upload original ────────────────────────────────────────────────────
    const { error: origErr } = await uploadToStorage(origPath, origBuf, mimeType)
    if (origErr) return NextResponse.json({ error: `Storage error: ${origErr}` }, { status: 500 })

    if (skipAnalysis) {
      const { data: uploadRecord, error: uploadErr } = await sb.from('asset_uploads').insert({
        client_id:           clientId,
        file_name:           file.name,
        file_path:           origPath,
        file_type:           mimeType,
        asset_category:      assetCategory,
        file_size:           origBuf.length,
        extraction_status:   'uploaded',
        extraction_method:   'manual_file_upload',
        optimization_status: 'skipped',
        original_size_bytes: origBuf.length,
        original_file_path:  origPath,
      }).select().single()

      if (uploadErr || !uploadRecord) {
        return NextResponse.json({ error: `DB insert failed: ${uploadErr?.message}` }, { status: 500 })
      }

      return NextResponse.json({
        upload_id: uploadRecord.id,
        proposals_count: 0,
        file_name: file.name,
        asset_category: assetCategory,
        extraction_method: 'manual_file_upload',
        extraction_status: 'uploaded',
        pages_processed: null,
        cost_usd: 0,
        metadata_status: 'skipped',
        has_metadata: false,
        skipped_analysis: true,
        optimization: null,
      })
    }

    // ── 2. Initialize tracking vars ───────────────────────────────────────────
    let optimizationMeta: Record<string, unknown> = {
      optimization_status: 'skipped',
      original_size_bytes: origBuf.length,
      original_file_path:  origPath,
    }
    let extractedText     = ''
    let extractionMethod  = 'manual_text'
    let pdfPageImages:    PdfPageImage[] = []
    let visionExtraction  = ''
    let totalTokenCost    = 0

    // ── 3. Image: optimize + prepare for vision analysis ────────────────────────
    let imageForVision: { buffer: Buffer; width: number; height: number } | null = null
    if (isImage) {
      try {
        const opt     = await optimizeImage(origBuf, mimeType)
        const optPath = slug.replace(/\.[^.]+$/, `_optimized.${opt.optimized.outputExt}`)
        const aiPath  = slug.replace(/\.[^.]+$/, `_ai_preview.${opt.aiPreview.outputExt}`)
        await uploadToStorage(optPath, opt.optimized.buffer, opt.optimized.mimeType)
        await uploadToStorage(aiPath,  opt.aiPreview.buffer, opt.aiPreview.mimeType)

        optimizationMeta = {
          optimization_status:   'optimized',
          original_size_bytes:   origBuf.length,
          optimized_size_bytes:  opt.optimized.buffer.length,
          ai_preview_size_bytes: opt.aiPreview.buffer.length,
          compression_ratio:     Math.round((1 - opt.aiPreview.buffer.length / origBuf.length) * 100) / 100,
          original_width:        opt.original.width,
          original_height:       opt.original.height,
          optimized_width:       opt.optimized.width,
          optimized_height:      opt.optimized.height,
          ai_preview_width:      opt.aiPreview.width,
          ai_preview_height:     opt.aiPreview.height,
          original_file_path:    origPath,
          optimized_file_path:   optPath,
          ai_preview_path:       aiPath,
        }
        // Prepare AI preview for both vision extraction AND metadata extraction
        imageForVision = { buffer: opt.aiPreview.buffer, width: opt.aiPreview.width, height: opt.aiPreview.height }
        pdfPageImages = [{ ...imageForVision, page: 1 }]
        extractionMethod = 'pdf_vision'
      } catch (err) {
        console.error('[image-optimize]', err)
        // Fallback: use original image for vision/metadata if optimization fails
        // This ensures metadata is ALWAYS extracted even if optimization fails
        imageForVision = null  // Mark that optimization failed
        extractionMethod = 'image_fallback'
      }

    // ── 4. PDF: text-layer first, vision fallback ─────────────────────────────
    } else if (isPdf) {
      const pdfResult = await extractPdfText(origBuf)

      if (!pdfResult.isImageBased && pdfResult.text.length > 100) {
        // Has text layer — free extraction
        extractedText    = pdfResult.text
        extractionMethod = 'pdf_text'
      } else {
        // Image-based PDF — render pages via pdftoppm, extract via vision
        extractionMethod = 'pdf_vision'
        try {
          pdfPageImages = await pdfPagesToImages(origBuf, MAX_PAGES)
        } catch (err) {
          console.error('[pdftoppm]', err)
          extractedText    = '[PDF page rendering failed]'
          extractionMethod = 'manual_text'
        }
      }

      optimizationMeta = {
        ...optimizationMeta,
        original_size_bytes:  origBuf.length,
        original_file_path:   origPath,
        optimization_status:  'skipped',
      }

    // ── 5. Text/other ─────────────────────────────────────────────────────────
    } else if (isText) {
      extractedText    = origBuf.toString('utf-8').slice(0, 8000)
      extractionMethod = 'pdf_text'  // treat as plain text
    } else {
      extractedText    = origBuf.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ').slice(0, 4000)
      extractionMethod = 'manual_text'
    }

    // ── 6. Load current brain ─────────────────────────────────────────────────
    const { data: brainEntries } = await sb.from('client_brain').select('id, question_key, answer').eq('client_id', clientId)
    const currentBrain: Record<string, string | null> = {}
    const brainIdMap:   Record<string, string>        = {}
    for (const e of brainEntries ?? []) {
      currentBrain[e.question_key] = e.answer
      brainIdMap[e.question_key]   = e.id
    }

    // ── 7. AI extraction ──────────────────────────────────────────────────────
    let proposals: Proposal[] = []

    if (pdfPageImages.length > 0) {
      // Vision path (image-based PDF or uploaded image)
      const result = await extractViaVision(pdfPageImages, assetCategory, clientName ?? 'Unknown')
      proposals         = result.proposals
      visionExtraction  = result.extraction
      extractedText     = result.extraction.slice(0, 2000)
      totalTokenCost   += result.tokenCost
    } else if (extractedText.length > 50) {
      // Text path
      const result  = await extractViaText(extractedText, assetCategory, clientName ?? 'Unknown', currentBrain)
      proposals        = result.proposals
      totalTokenCost  += result.tokenCost
    }

    // ── 8. Insert asset_uploads record ───────────────────────────────────────
    const { data: uploadRecord, error: uploadErr } = await sb.from('asset_uploads').insert({
      client_id:         clientId,
      file_name:         file.name,
      file_path:         origPath,
      file_type:         mimeType,
      asset_category:    assetCategory,
      file_size:         origBuf.length,
      extraction_status: 'pending',
      ...optimizationMeta,
    }).select().single()

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({ error: `DB insert failed: ${uploadErr?.message}` }, { status: 500 })
    }

    // ── 8.5 For images: extract metadata ALWAYS (independent of optimization) ──
    let imageMetadata: Record<string, unknown> | null = null
    let metadataStatus = 'pending'
    if (isImage) {
      // Use AI preview if available, otherwise use original
      const imageBuffer = pdfPageImages[0]?.buffer || origBuf
      try {
        const metadataResponse = await anthropic.messages.create({
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
                    data: imageBuffer.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: assetCategory === 'blueprint_layouts'
                    ? `Analyze this image as a blueprint/spatial layout. Extract only reliable visible spatial facts. Return valid JSON ONLY:
{
  "layout_type": "floor plan|terrace plan|seating map|zone diagram|unknown",
  "zones": "visible zones only",
  "tables": "table shapes/counts/placement if visible",
  "walkways": "walking paths, circulation, entrances, service paths if visible",
  "seating_clusters": "seating groups and spacing notes if visible",
  "relationships": "zone/table/chandelier/entrance/terrace relationships if visible",
  "spatial_notes": "short continuity notes; do not invent",
  "confidence": 60-95
}`
                    : ['food', 'breakfast'].includes(assetCategory)
                      ? `Analyze this food image for AI generation fidelity metadata. Return valid JSON ONLY:
{
  "type": "${assetCategory === 'breakfast' ? 'Breakfast' : 'Food'}",
  "name": "known/visible dish name or blank",
  "dish_name": "exact dish name if known",
  "plate_count": "visible plate count if reliable",
  "item_count": "visible item count if reliable",
  "serving_vessel": "plate/bowl/tray details if visible",
  "sauce": "visible sauce or dip",
  "side_components": "visible sides/components",
  "garnish": "visible garnish",
  "texture_notes": "short visible texture notes",
  "shape_structure": "shape/arrangement/count structure",
  "meal_period": "Breakfast|Business Lunch|Dinner|Traffic Hours|unknown",
  "do_not_add": "components/props that should not be invented",
  "do_not_remove": "critical visible items/counts to preserve",
  "asset_origin": "Original Photo"
}`
                    : assetCategory === 'drinks'
                      ? `Analyze this drink image for AI generation fidelity metadata. Return valid JSON ONLY:
{
  "type": "Cocktail",
  "name": "known/visible drink name or blank",
  "drink_name": "exact drink name if known",
  "glass_shape": "visible glass shape",
  "liquid_color": "visible liquid color",
  "garnish": "visible garnish",
  "foam_or_clarity": "foam/clarity/layering if visible",
  "scale": "short realistic scale note",
  "contains_smoke_effect": "yes|no|uncertain",
  "do_not_add": "smoke/flames/debris/extra garnish unless visible",
  "asset_origin": "Original Photo"
}`
                    : ['interiors', 'exteriors'].includes(assetCategory)
                      ? `Analyze this venue image for AI generation environment-anchor metadata. Return valid JSON ONLY:
{
  "type": "${assetCategory === 'interiors' ? 'Interior' : 'Exterior'}",
  "name": "area name if known",
  "zone": "visible venue zone if known",
  "table_shape": "visible table shape",
  "table_material": "visible table material",
  "table_edge": "visible table rim/edge detail",
  "seating": "visible seating type",
  "lighting": "visible lighting behavior",
  "mirror_reflection_behavior": "reflection behavior if visible",
  "background_constraints": "visible background constraints only",
  "do_not_invent": "unsupported architecture/furniture/views to avoid",
  "features": "short visible features",
  "asset_origin": "Original Photo"
}`
                    : assetCategory === 'venue_items'
                      ? `Analyze this venue item/tableware image for AI generation service-continuity metadata. Return valid JSON ONLY:
{
  "type": "Venue Item",
  "name": "known item name or blank",
  "item_type": "cutlery|plate|glassware|napkin|service object|other",
  "service_style": "short service style",
  "cutlery": "cutlery facts if visible",
  "tableware": "plate/glassware/tableware facts if visible",
  "material": "visible material",
  "color": "visible color/metal tone",
  "usage": "how this item should appear in venue service",
  "do_not_add": "random decorative cutlery, candles, extra plates, unrelated props",
  "asset_origin": "Original Photo"
}`
                    : `Analyze this image and extract metadata. Return valid JSON ONLY:
{
  "tags": ["tag1", "tag2", ...8-12 specific descriptive tags],
  "mood": "comma-separated mood words",
  "colors": ["#hexcolor", "color name", ...5-8 colors],
  "orientation": "landscape|portrait|square",
  "notes": "1-2 sentences of visible details",
  "confidence": 75-90
}`,
                },
              ],
            },
          ],
        })

        const metaText = metadataResponse.content.find(b => b.type === 'text')
        if (metaText && metaText.type === 'text') {
          try {
            const jsonMatch = metaText.text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              imageMetadata = JSON.parse(jsonMatch[0]) as Record<string, unknown>
              imageMetadata.content_pillar = assetCategory
              metadataStatus = 'success'
            }
          } catch (parseErr) {
            metadataStatus = 'parse_failed'
            console.warn('[metadata-parse-error]', parseErr)
          }
        }

        totalTokenCost += calcCost('claude-haiku-4-5', metadataResponse.usage)
      } catch (visionErr) {
        metadataStatus = 'vision_failed'
        console.warn('[metadata-vision-error]', visionErr)
        // Don't block upload — metadata is optional but we track the failure
      }
    }

    // Save image metadata directly to asset_uploads (no proposals for image data)
    if (imageMetadata && metadataStatus === 'success') {
      const { error: metaErr } = await sb.from('asset_uploads').update({ metadata: imageMetadata }).eq('id', uploadRecord.id)
      if (metaErr) {
        console.warn('[metadata-save-error]', metaErr)
        metadataStatus = 'save_failed'
      }
    } else if (metadataStatus !== 'success') {
      // Mark asset with metadata_status so UI can show retry option
      console.info(`[upload-metadata-status] ${file.name}: ${metadataStatus}`)
    }

    // ── 9. Insert proposals (brain questions only, not image metadata) ─────────
    const validProposals = proposals.filter(p => p.question_key && p.proposed_answer?.trim() && BRAIN_QUESTIONS[p.question_key])
    let proposalsInserted = 0
    if (validProposals.length > 0) {
      const rows = validProposals.map(p => ({
        client_brain_id:         brainIdMap[p.question_key] ?? null,
        asset_upload_id:         uploadRecord.id,
        client_id:               clientId,
        question_key:            p.question_key,
        proposed_answer:         p.proposed_answer.trim(),
        current_answer_snapshot: currentBrain[p.question_key] ?? null,
        reasoning:               p.reasoning ?? null,
        confidence:              Math.min(5, Math.max(1, Number(p.confidence) || 3)),
        status:                  'pending',
      }))
      const { error: propErr } = await sb.from('brain_update_proposals').insert(rows)
      if (!propErr) proposalsInserted = rows.length
    }

    // ── 10. Finalize upload record ────────────────────────────────────────────
    await sb.from('asset_uploads').update({
      extracted_summary:  (visionExtraction || extractedText).slice(0, 1000),
      extraction_status:  'extracted',
      proposals_count:    proposalsInserted,
      extraction_method:  extractionMethod,
      pages_processed:    pdfPageImages.length > 0 ? pdfPageImages.length : null,
      cost_usd:           totalTokenCost > 0 ? Math.round(totalTokenCost * 100000) / 100000 : null,
    }).eq('id', uploadRecord.id)

    const costUsd = Math.round(totalTokenCost * 100000) / 100000

    return NextResponse.json({
      upload_id:         uploadRecord.id,
      proposals_count:   proposalsInserted,
      file_name:         file.name,
      asset_category:    assetCategory,
      extraction_method: extractionMethod,
      pages_processed:   pdfPageImages.length || null,
      cost_usd:          costUsd,
      metadata_status:   isImage ? metadataStatus : 'skipped',
      has_metadata:      !!imageMetadata,
      optimization: isImage ? {
        status:                optimizationMeta.optimization_status,
        original_size_bytes:   optimizationMeta.original_size_bytes,
        optimized_size_bytes:  optimizationMeta.optimized_size_bytes,
        ai_preview_size_bytes: optimizationMeta.ai_preview_size_bytes,
        compression_ratio:     optimizationMeta.compression_ratio,
        original_dimensions:   `${optimizationMeta.original_width}×${optimizationMeta.original_height}`,
        optimized_dimensions:  `${optimizationMeta.optimized_width}×${optimizationMeta.optimized_height}`,
        ai_preview_dimensions: `${optimizationMeta.ai_preview_width}×${optimizationMeta.ai_preview_height}`,
      } : null,
    })

  } catch (err) {
    console.error('[brain/upload]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

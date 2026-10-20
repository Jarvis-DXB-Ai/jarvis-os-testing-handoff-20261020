import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// POST { client_id, asset_category, batch_size }
export async function POST(req: NextRequest) {
  try {
    const { client_id, asset_category, batch_size = 5 } = await req.json() as {
      client_id: string
      asset_category: string
      batch_size?: number
    }

    if (!client_id || !asset_category) {
      return NextResponse.json(
        { error: 'Missing required fields: client_id, asset_category' },
        { status: 400 }
      )
    }

    // ── 1. Fetch empty metadata images ─────────────────────────────────────

    const { data: images, error: queryErr } = await sb
      .from('asset_uploads')
      .select('id, file_name, file_path, ai_preview_path')
      .eq('client_id', client_id)
      .eq('asset_category', asset_category)
      .or('metadata.is.null,metadata.eq.{}')
      .limit(batch_size)
      .order('uploaded_at', { ascending: false })

    if (queryErr) {
      return NextResponse.json(
        { error: `Query failed: ${queryErr.message}` },
        { status: 500 }
      )
    }

    if (!images || images.length === 0) {
      return NextResponse.json({
        updated_count: 0,
        skipped_count: 0,
        token_usage: 0,
        cost_estimate: '$0.00',
        message: 'No images with empty metadata found',
      })
    }

    // ── 2. Process each image ─────────────────────────────────────────────

    let updatedCount = 0
    let skippedCount = 0
    let totalTokens = 0
    const errors: string[] = []

    for (const img of images) {
      try {
        // Fetch image from storage
        const imagePath = img.ai_preview_path || img.file_path
        if (!imagePath) {
          skippedCount++
          errors.push(`${img.file_name}: No file path`)
          continue
        }

        const { data: imageData, error: fetchErr } = await sb.storage
          .from('client-assets')
          .download(imagePath)

        if (fetchErr || !imageData) {
          skippedCount++
          errors.push(`${img.file_name}: Storage fetch failed`)
          continue
        }

        // Convert to base64 for vision
        const buffer = await imageData.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')

        // ── 3. Call Haiku vision ──────────────────────────────────────

        const response = await anthropic.messages.create({
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
                    data: base64,
                  },
                },
                {
                  type: 'text',
                  text: `Analyze this interior photograph and extract structured metadata. Return valid JSON only:

{
  "tags": ["tag1", "tag2", ...8-12 specific tags for interior design, materials, mood, style],
  "mood": "comma-separated mood descriptors like refined, warm, cinematic, intimate",
  "colors": ["#hexcolor", "color name", ...5-8 dominant colors],
  "orientation": "landscape|portrait|square",
  "notes": "1-2 sentences describing visible details only (no invention)",
  "confidence": 75-90 (be conservative if uncertain)
}

Rules:
- Tags should be specific and useful for search/ads/moodboards
- Colors as hex codes or color names (avoid generic)
- Notes describe only what's visible (furniture, lighting, materials, layout)
- Confidence 75-85 if any uncertainty`,
                },
              ],
            },
          ],
        })

        // Parse response
        let metadata: Record<string, unknown>
        try {
          const text = response.content
            .filter((b) => b.type === 'text')
            .map((b) => (b.type === 'text' ? b.text : ''))
            .join('')

          // Extract JSON if wrapped in markdown
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('No JSON found in response')

          metadata = JSON.parse(jsonMatch[0])
          metadata.content_pillar = asset_category // Always set to category
        } catch (parseErr) {
          skippedCount++
          errors.push(`${img.file_name}: Vision parse failed`)
          continue
        }

        // ── 4. Update database ────────────────────────────────────────

        const { error: updateErr } = await sb
          .from('asset_uploads')
          .update({ metadata })
          .eq('id', img.id)

        if (updateErr) {
          skippedCount++
          errors.push(`${img.file_name}: DB update failed`)
          continue
        }

        updatedCount++
        totalTokens += response.usage.input_tokens + response.usage.output_tokens
      } catch (err) {
        skippedCount++
        errors.push(`${img.file_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // ── 5. Calculate cost ─────────────────────────────────────────────

    // Haiku: $0.80 per 1M input, $4.00 per 1M output (cached tokens different)
    const inputTokens = Math.ceil(totalTokens * 0.4) // Rough estimate
    const outputTokens = Math.ceil(totalTokens * 0.6)
    const costEstimate = (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000

    return NextResponse.json({
      updated_count: updatedCount,
      skipped_count: skippedCount,
      token_usage: totalTokens,
      cost_estimate: `$${costEstimate.toFixed(4)}`,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[backfill-metadata]', err)
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}

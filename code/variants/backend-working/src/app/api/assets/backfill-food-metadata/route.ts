import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MENUS = ['Breakfast', 'Lunch', 'Dinner', 'À La Carte', 'Business Lunch', 'Traffic Hours', 'Dubai Restaurant Week Lunch', 'Dubai Restaurant Week Dinner']

export async function POST(req: NextRequest) {
  try {
    const { client_id, batch_size = 20 } = await req.json() as {
      client_id: string
      batch_size?: number
    }

    if (!client_id) {
      return NextResponse.json({ error: 'Missing client_id' }, { status: 400 })
    }

    // Fetch food assets with empty/null metadata
    const { data: images, error: queryErr } = await sb
      .from('asset_uploads')
      .select('id, file_name, file_path, ai_preview_path, metadata')
      .eq('client_id', client_id)
      .eq('asset_category', 'food')
      .or('metadata.is.null,metadata.eq.{}')
      .limit(batch_size)
      .order('uploaded_at', { ascending: false })

    if (queryErr) {
      return NextResponse.json({ error: `Query failed: ${queryErr.message}` }, { status: 500 })
    }

    if (!images || images.length === 0) {
      return NextResponse.json({
        updated_count: 0,
        total_found: 0,
        uncertain_matches: [],
        failed_matches: [],
        message: 'No food assets with empty metadata found',
      })
    }

    // Process each image
    let updatedCount = 0
    let skippedCount = 0
    const uncertainMatches: string[] = []
    const failedMatches: string[] = []
    let totalTokens = 0

    for (const img of images) {
      try {
        // Fetch image from storage
        const imagePath = img.ai_preview_path || img.file_path
        if (!imagePath) {
          skippedCount++
          failedMatches.push(`${img.file_name}: No file path`)
          continue
        }

        const { data: imageData, error: fetchErr } = await sb.storage
          .from('client-assets')
          .download(imagePath)

        if (fetchErr || !imageData) {
          skippedCount++
          failedMatches.push(`${img.file_name}: Storage fetch failed`)
          continue
        }

        // Convert to base64
        const buffer = await imageData.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')

        // Extract OPERATIONAL metadata only (no visual/aesthetic fields)
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 400,
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
                  text: `You are analyzing a food dish photograph to extract OPERATIONAL METADATA ONLY.

CRITICAL RULES:
- Extract ONLY operational/structural fields
- DO NOT extract visual descriptions, mood, colors, lighting, or aesthetic qualities
- DO NOT infer allergens unless explicitly obvious from standard menu symbols
- DO NOT hallucinate dish names - leave blank if unsure
- Leave fields empty if uncertain rather than guessing

Extract and return ONLY this JSON structure:
{
  "name": "exact dish name from menu or blank if uncertain",
  "dish_name": "exact dish name from menu or blank if uncertain",
  "category": "Burger|Dessert|Steak|Seafood|Salad|Breakfast|Pasta|Starter|Main Course|Other - leave blank if unsure",
  "ingredients": "comma-separated list of visible ingredients only",
  "plate_count": "visible plate count if reliable",
  "item_count": "visible item count/pieces if reliable",
  "serving_vessel": "visible plate/bowl/tray/vessel details",
  "sauce": "visible sauce or dip",
  "side_components": "visible side components",
  "garnish": "visible garnish",
  "texture_notes": "short food texture notes",
  "shape_structure": "visible shape/structure/arrangement",
  "meal_period": "Breakfast|Business Lunch|Dinner|Traffic Hours|unknown",
  "do_not_add": "components/props not visible and not to invent",
  "do_not_remove": "critical visible items/counts/components to preserve",
  "allergens": "comma-separated allergens from standard menu symbols (Seafood, Nuts, Dairy, Gluten, etc.) - only if obvious",
  "price": "numeric price if visible on plate/packaging, else blank",
  "menus_offers": ["Breakfast", "Lunch", "Dinner", "À La Carte", "Business Lunch", "Traffic Hours", "Dubai Restaurant Week Lunch", "Dubai Restaurant Week Dinner"],
  "asset_origin": "Original Photo"
}

MENUS_OFFERS LOGIC:
- If clearly a breakfast dish (eggs, pancakes, oatmeal): include "Breakfast"
- If presentation/plating suggests lunch/dinner: include both "Lunch" and "Dinner"
- If minimalist/simple plating: include "À La Carte"
- Only include "Business Lunch" if clearly a business lunch portion
- Only include specific DRWL/D if text/branding visible
- If unsure: return empty array

ALLERGENS: Only include if standard allergen symbols visible on menu or dish clearly contains (e.g., whole shrimp = Seafood)

Return ONLY valid JSON, no markdown, no explanation.`,
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

          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('No JSON found')

          metadata = JSON.parse(jsonMatch[0])

          // Validate structure
          if (!metadata.asset_origin) {
            metadata.asset_origin = 'Original Photo'
          }

          // Clean empty/null keys
          Object.keys(metadata).forEach(k => {
            if (!metadata[k] || (Array.isArray(metadata[k]) && (metadata[k] as unknown[]).length === 0)) {
              delete metadata[k]
            }
          })

          // Track uncertain matches (empty name)
          if (!metadata.name) {
            uncertainMatches.push(img.file_name)
          }
        } catch (parseErr) {
          skippedCount++
          failedMatches.push(`${img.file_name}: Vision response invalid`)
          continue
        }

        // Save to database
        const { error: updateErr } = await sb
          .from('asset_uploads')
          .update({
            metadata: {
              type: 'Food',
              ...metadata,
            },
          })
          .eq('id', img.id)

        if (updateErr) {
          skippedCount++
          failedMatches.push(`${img.file_name}: DB update failed`)
          continue
        }

        updatedCount++
        totalTokens += response.usage.input_tokens + response.usage.output_tokens
      } catch (err) {
        skippedCount++
        failedMatches.push(`${img.file_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Calculate cost
    const inputTokens = Math.ceil(totalTokens * 0.4)
    const outputTokens = Math.ceil(totalTokens * 0.6)
    const costEstimate = (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000

    return NextResponse.json({
      updated_count: updatedCount,
      skipped_count: skippedCount,
      total_found: images.length,
      uncertain_matches: uncertainMatches,
      failed_matches: failedMatches,
      token_usage: totalTokens,
      cost_estimate: `$${costEstimate.toFixed(4)}`,
    })
  } catch (err) {
    console.error('[backfill-food-metadata]', err)
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}

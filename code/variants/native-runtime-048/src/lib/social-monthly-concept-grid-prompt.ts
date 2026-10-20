import 'server-only'

export const MONTHLY_CONCEPT_GRID_PROMPT_VERSION = 'monthly-concept-grid-stage-2b.v2'
export const MONTHLY_CONCEPT_GRID_ASPECT_RATIO = '9:16'
export const MONTHLY_CONCEPT_GRID_OUTPUT_RESOLUTION = '4K'
// Gemini 3 Pro Image accepts more mixed input images overall, but documents
// high-fidelity object grounding for six. Storyboards treat every attached
// asset as truth, so Jarvis deliberately stays at that stricter boundary.
export const MONTHLY_CONCEPT_GRID_REFERENCE_LIMIT = 6

export type ConceptGridReference = {
  id: string
  file_object_id: string
  name: string
  category: 'food' | 'drinks' | 'interiors' | 'exteriors' | 'venue_items'
  role: 'product_truth' | 'venue_truth' | 'brand_reference'
  perspective_flexibility: 'low' | 'medium' | 'high' | null
  visual_summary: string | null
  file_name: string
  storage_bucket: string
  storage_path: string
}

export type ConceptGridCell = {
  grid_cell: number
  plan_item_id: string
  publishing_position: number
  planned_date: string | null
  pillar: string
  subject: string
  subject_type: string | null
  production_method: string
  grid_role: string
  concept: string
  shot_scale: string
  camera_angle: string
  composition: string
  human_presence: string
  interaction: string
  motion: string
  visual_direction: string
  production_aspect_ratio: '4:5'
  grid_crop_behavior: string
  truth_reference_ids: string[]
  venue_reference_ids: string[]
  truth_status: 'ready' | 'conceptual_only' | 'missing_truth'
  missing_truth: string | null
  negative_constraints: string[]
}

export type VisualStoryboardPackage = {
  client: { id: string; name: string }
  plan: { id: string; month: string; target_feed_count: number; strategy: Record<string, unknown>; visual_direction: string; visual_rhythm: string }
  grid_order: 'instagram_display_newest_to_oldest'
  cells: ConceptGridCell[]
  brand: string[]
  references: ConceptGridReference[]
  correction: string
  plan_snapshot_hash: string
}

function clean(value: unknown, limit = 320) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''
}

function visualMode(method: string) {
  if (method === 'graphic_design') return 'designed editorial tile: type rhythm, layout blocks, colour composition, and a reserved brand-mark area; no exact readable copy or reconstructed logo'
  if (method === 'photo_graphic_overlay') return 'photographic base with restrained editorial graphic treatment; no exact readable copy or reconstructed logo'
  if (method === 'carousel') return 'one representative hero-frame concept for a future carousel, not multiple panels'
  if (method === 'existing_asset') return 'grounded photographic treatment that retains the selected product or venue reference identity'
  return 'photographic editorial treatment'
}

function perspectiveRule(reference: ConceptGridReference) {
  if (reference.category !== 'interiors' && reference.category !== 'exteriors') return ''
  if (reference.perspective_flexibility === 'low') return 'Crop, zoom, or make only a tiny camera adjustment; do not reveal unseen architecture.'
  if (reference.perspective_flexibility === 'medium') return 'Use only a modest reframing; do not invent unseen architecture.'
  if (reference.perspective_flexibility === 'high') return 'Broader viewpoint movement is permitted only when it remains recognisably within the selected venue truth.'
  return 'Keep venue architecture within the visible reference truth.'
}

export function buildMonthlyConceptGridPrompt(input: VisualStoryboardPackage) {
  const monthlyStrategy = input.plan.strategy
  const primaryObjective = clean(monthlyStrategy.primary_objective, 280)
  const creativeDirection = clean(monthlyStrategy.creative_direction, 360) || clean(input.plan.visual_direction, 360)
  const visualRhythm = clean(monthlyStrategy.visual_rhythm, 320) || clean(input.plan.visual_rhythm, 320)
  const referenceMap = input.references.map((reference, index) => [
    `REF ${String(index + 1).padStart(2, '0')} | ${reference.role.toUpperCase()} | ${reference.name} | ${reference.category}`,
    reference.visual_summary ? `Visible truth: ${reference.visual_summary}` : '',
    perspectiveRule(reference),
  ].filter(Boolean).join('\n')).join('\n\n') || 'No reference image is attached. Use only the textual constraints; do not fabricate proprietary venue or product truth.'

  const cells = input.cells.map(cell => {
    const references = [
      ...cell.truth_reference_ids.map(id => input.references.find(reference => reference.id === id)?.name).filter(Boolean),
      ...cell.venue_reference_ids.map(id => input.references.find(reference => reference.id === id)?.name).filter(Boolean),
    ]
    return [
      `CELL ${String(cell.grid_cell).padStart(2, '0')} | Publishing P${cell.publishing_position}${cell.planned_date ? ` | ${cell.planned_date}` : ''}`,
      `Pillar: ${cell.pillar}; Grid role: ${cell.grid_role}; Method: ${cell.production_method}.`,
      `Canonical subject: ${cell.subject}.`,
      `Concept: ${cell.concept || 'Use the saved canonical subject as the visual focus.'}`,
      `Approved visual direction: Scale ${cell.shot_scale}; Angle ${cell.camera_angle}; Composition ${cell.composition}; People ${cell.human_presence}; Interaction ${cell.interaction}; Motion ${cell.motion}; Crop ${cell.grid_crop_behavior}.`,
      cell.visual_direction ? `Creative Director brief: ${cell.visual_direction}` : 'No post-level Visual Direction has been approved; preserve the canonical concept without inventing a default camera language.',
      `Visual treatment: ${visualMode(cell.production_method)}.`,
      references.length ? `Relevant references: ${references.join('; ')}.` : 'No exact product reference is attached for this cell.',
      `Truth state: ${cell.truth_status}${cell.missing_truth ? ` (${cell.missing_truth})` : ''}.`,
      cell.negative_constraints.length ? `Do not: ${cell.negative_constraints.join('; ')}.` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return `OBJECTIVE
Create one low-resolution art-direction storyboard for ${input.client.name}'s ${input.plan.month} Instagram Feed. It is a coherent 3-column by 5-row contact sheet with exactly 15 square visual cells. This is not a phone mockup, social-media screenshot, final campaign artwork, or a set of separately usable post images.

MONTHLY CREATIVE DIRECTION
${primaryObjective ? `Objective: ${primaryObjective}` : 'Objective: establish coherent month-level visual rhythm.'}
${creativeDirection ? `Creative direction: ${creativeDirection}` : ''}
${visualRhythm ? `Visual rhythm: ${visualRhythm}` : ''}
Brand feeling: ${input.brand.join('; ') || 'warm, authentic, Italian, social, welcoming, easy-going, cinematic, realistic, refined without formality'}.

GRID ORDER
The contact sheet is read left-to-right, top-to-bottom in Instagram profile display order: newest planned post first. CELL 01 is the newest plan item. Maintain variation across close/wide, product/people, food/drinks, interior/lifestyle, calm/dense, and photographic/graphic visual treatments.

REFERENCE MAP
${referenceMap}

15 CELL BRIEFS
${cells}

TRUTH LIMITS
- Attached approved references are client truth. Preserve their product identity, vessel, and visible venue character when used.
- Do not turn one dish into another. Do not turn juice or other zero-proof drinks into alcohol.
- Generic people are permitted only as anonymous conceptual figures. Do not claim a generated person is Chef Antonio or any canonical client model.
- For unresolved Pizza of the Month, use only an abstract, intentionally non-specific pizza silhouette, reveal-style treatment, or graphic-led activation placeholder. Do not invent toppings, ingredients, price, or substitute Margherita.
- Dogs are secondary background details only in the cells that call for them.
- For cultural direction, use modest styling and restrained local representation only where the brief calls for it; do not turn the whole month into a cultural theme.

STRICT NEGATIVE
- No iPhone frame, Instagram UI, profile name, likes, comments, navigation, status bar, or readable marketing copy.
- No yacht, boat, DemoClientC, nightclub styling, generic Dubai luxury, stiff fine-dining aesthetic, fake logo, or fake logo variants.
- No invented venue architecture, invented restaurant details, invented dish identity, or repeated identical table/camera composition.

CONTACT-SHEET GEOMETRY
- Generate ONE centered monthly contact sheet with exactly 3 columns, 5 rows, and 15 equal square cells. Each square is one independent future Instagram Feed post.
- Fit the 3:5 board primarily to the full canvas width. On this taller 9:16 canvas, leave only small, intentional neutral margins above and below the board; do not add side margins.
- Use thin, consistent visual gutters between every cell. Keep every cell the same size and square.
- Never overlap or merge cells. Never create irregular tile sizes, a panorama spanning multiple cells, or content that bleeds across a cell boundary.
- Maintaining 15 clearly separated square compositions is more important than filling every provider-canvas pixel. The outer margin must remain plain, neutral, and visually unobtrusive: no photography, decorative graphics, logos, text, Instagram UI, or extra tiles.

OUTPUT FORMAT
Return one single 9:16 source image containing the centered 3 by 5 contact sheet only. Use square cells with no labels, no numbered overlays, no separators carrying text, and no individual crops. Make the board readable as a whole monthly visual storyboard.
${input.correction ? `\nUSER CORRECTION FOR THIS VERSION\n${input.correction}` : ''}`.trim()
}

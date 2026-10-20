import 'server-only'

import {
  parseClientBrainV2RetrievalRequest,
  retrieveClientBrainContext,
  type ClientBrainV2RetrievalContext,
  type RetrievalDebugTrace,
  type ClientBrainV2RetrievalRequest,
  type ClientBrainV2RetrievalTaskType,
  type RetrievedAsset,
  type RetrievedBrandAsset,
  type RetrievedIntelligence,
  type RetrievalWarning,
} from '@/lib/client-brain-v2-retrieval'
import { ClientBrainV2HttpError } from '@/lib/client-brain-v2-server-core'

export const PROMPT_ASSEMBLY_EXECUTION_TARGETS = [
  'generic_llm',
  'image_generation',
  'video_generation',
  'social_caption',
  'campaign_strategy',
  'client_response',
] as const

export type PromptAssemblyExecutionTarget = typeof PROMPT_ASSEMBLY_EXECUTION_TARGETS[number]
export type PromptPriority = 'must_obey' | 'strong_guidance' | 'supporting_context'
export type PromptConstraintLevel = 'hard_rule' | 'strong_preference' | 'preference'
export type PromptWarningDisposition = 'hard_constraint' | 'missing_information' | 'review_warning' | 'executor_instruction'

export type PromptAssemblyRequest = Omit<ClientBrainV2RetrievalRequest, 'client_id' | 'intent' | 'debug'> & {
  task: string
  execution_target: PromptAssemblyExecutionTarget
  max_context_chars?: number
  debug?: boolean
}

export type PromptSection = {
  id: string
  label: string
  priority: PromptPriority
  items: string[]
}

export type PromptConstraint = {
  id: string
  level: PromptConstraintLevel
  instruction: string
  origin: string
}

export type PromptWarning = {
  code: string
  message: string
  disposition: PromptWarningDisposition
  executor_instruction: string
}

export type PromptAssetReference = Pick<
  RetrievedAsset,
  'id' | 'semantic_name' | 'category' | 'role' | 'approved_for_generation' | 'url' | 'url_strategy' | 'description' | 'ingredients' | 'allergens' | 'dietary' | 'visual_presentation' | 'key_visual_details' | 'perspective_flexibility' | 'tags' | 'menu_ids' | 'activation_ids' | 'source_ids' | 'ranking_reason'
>

export type ContextBudgetReport = {
  max_context_chars: number
  structured_payload_chars: number
  rendered_prompt_chars: number
  estimated_tokens: number
  response_payload_bytes: number
  context_trimmed: boolean
  trimmed_sections: string[]
  exceeded_budget_by_chars: number
}

export type PromptDebugTrace = {
  retrieval_profile: ClientBrainV2RetrievalTaskType
  assembly_profile: PromptAssemblyExecutionTarget
  sections_included: string[]
  sections_omitted: string[]
  hard_constraints_created: string[]
  warnings_propagated: string[]
  context_trimmed: boolean
  trimmed_sections: string[]
  asset_order: Array<{ asset_id: string; position: number; ranking_reason: string }>
  retrieval_trace: RetrievalDebugTrace
  rendered_prompt_preview: string
}

export type PromptAssemblyPackage = {
  task: string
  task_type: ClientBrainV2RetrievalTaskType
  execution_target: PromptAssemblyExecutionTarget
  system_context: PromptSection
  client_context: PromptSection
  task_context: PromptSection
  creative_context: PromptSection
  factual_context: PromptSection
  operational_context: PromptSection
  asset_references: PromptAssetReference[]
  brand_assets: RetrievedBrandAsset[]
  constraints: PromptConstraint[]
  warnings: PromptWarning[]
  missing_information: string[]
  source_notes: string[]
  learnings: string[]
  output_instructions: string[]
  rendered_prompt: string
  estimated_context_size: ContextBudgetReport
  timings: { retrieval_ms: number; assembly_ms: number; total_ms: number }
  debug?: PromptDebugTrace
}

type AssemblyProfile = {
  role: string
  outputInstructions: string[]
  includeVisual: boolean
  includeAudience: boolean
  includeMarket: boolean
}

const DEFAULT_CONTEXT_CHARS = 16_000
const MIN_CONTEXT_CHARS = 1_000
const MAX_CONTEXT_CHARS = 50_000

const ASSEMBLY_PROFILES: Record<PromptAssemblyExecutionTarget, AssemblyProfile> = {
  image_generation: {
    role: 'Act as a visual execution assistant. Preserve approved Client Brain truth and prepare structured instructions for a future image-generation skill.',
    outputInstructions: [
      'Return a structured image-execution brief for a future model or skill.',
      'Use approved reference assets in the preserved order only.',
      'Do not generate an image or call a provider in this step.',
    ],
    includeVisual: true,
    includeAudience: false,
    includeMarket: false,
  },
  video_generation: {
    role: 'Act as a video execution assistant. Preserve Client Brain visual truth and prepare structured instructions for a future video-generation skill.',
    outputInstructions: [
      'Return a structured video-execution brief for a future model or skill.',
      'Do not invent motion that contradicts the selected scene or reference truth.',
      'Do not generate video or call a provider in this step.',
    ],
    includeVisual: true,
    includeAudience: false,
    includeMarket: false,
  },
  social_caption: {
    role: 'Act as a hospitality copy execution assistant. Preserve approved brand voice and factual safety boundaries.',
    outputInstructions: [
      'Return writing-context instructions for a future caption-writing skill.',
      'Use only verified operational CTA or contact facts.',
      'Do not write the final caption in this step.',
    ],
    includeVisual: false,
    includeAudience: false,
    includeMarket: false,
  },
  campaign_strategy: {
    role: 'Act as a hospitality campaign strategy assistant. Keep approved strategy, temporal evidence, and opportunities distinct.',
    outputInstructions: [
      'Return a structured campaign-strategy brief for a future strategy skill.',
      'Do not convert review-sensitive market context into approved strategy.',
      'Do not create a final campaign deliverable in this step.',
    ],
    includeVisual: true,
    includeAudience: true,
    includeMarket: true,
  },
  client_response: {
    role: 'Act as a factual hospitality client-response assistant. Use verified facts and preserve uncertainty explicitly.',
    outputInstructions: [
      'Return a response-writing context package for a future client-response skill.',
      'Do not state an unverified operational detail as fact.',
      'Do not send a customer response in this step.',
    ],
    includeVisual: false,
    includeAudience: false,
    includeMarket: false,
  },
  generic_llm: {
    role: 'Act as a Client Brain-aware hospitality assistant. Use the selected truth, guidance, and warnings only.',
    outputInstructions: [
      'Return structured task instructions for a future executor.',
      'Do not invent facts or execute external actions in this step.',
    ],
    includeVisual: false,
    includeAudience: true,
    includeMarket: false,
  },
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} must be an object.`, 400)
  return value as Record<string, unknown>
}

function requiredText(value: unknown, label: string, max = 4_000) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim().replace(/\s+/g, ' ')
  if (!result) throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function optionalPositiveInteger(value: unknown, label: string, fallback: number, minimum: number, maximum: number) {
  if (value == null) return fallback
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new ClientBrainV2HttpError(`${label} must be an integer between ${minimum} and ${maximum}.`, 400)
  }
  return numeric
}

export function parsePromptAssemblyRequest(input: unknown): PromptAssemblyRequest {
  const value = objectValue(input, 'Prompt assembly request')
  if (!PROMPT_ASSEMBLY_EXECUTION_TARGETS.includes(value.execution_target as PromptAssemblyExecutionTarget)) {
    throw new ClientBrainV2HttpError('execution_target is invalid.', 400)
  }
  const task = requiredText(value.task, 'task')
  const retrievalRequest = parseClientBrainV2RetrievalRequest({
    task_type: value.task_type,
    intent: task,
    activation: value.activation,
    menu: value.menu,
    asset_categories: value.asset_categories,
    asset_ids: value.asset_ids,
    asset_role: value.asset_role,
    channel: value.channel,
    output_type: value.output_type,
    include_sources: value.include_sources,
    include_learnings: value.include_learnings,
    max_assets: value.max_assets,
    freshness_mode: value.freshness_mode,
    debug: value.debug,
  })
  return {
    ...retrievalRequest,
    task,
    execution_target: value.execution_target as PromptAssemblyExecutionTarget,
    max_context_chars: optionalPositiveInteger(value.max_context_chars, 'max_context_chars', DEFAULT_CONTEXT_CHARS, MIN_CONTEXT_CHARS, MAX_CONTEXT_CHARS),
    debug: value.debug === true,
  }
}

function textFromValue(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(textFromValue)
  return []
}

function usableFieldLines(record: RetrievedIntelligence) {
  return Object.entries(record.fields)
    .filter(([key]) => key !== 'cleared' && key !== 'seed' && key !== 'section' && key !== 'review_status' && key !== 'refactor' && key !== 'previous_category' && key !== 'previous_title')
    .flatMap(([key, value]) => textFromValue(value).map(text => ['value', 'values'].includes(key) ? text : `${key.replace(/_/g, ' ')}: ${text}`))
}

function intelligenceLines(records: RetrievedIntelligence[], subsection: string) {
  return records.filter(record => record.subsection === subsection).flatMap(record => {
    const fields = usableFieldLines(record)
    if (fields.length) return fields.map(line => `${record.title}: ${line}`)
    if (record.stable_key.startsWith('legacy_knowledge:')) return []
    return record.summary ? [`${record.title}: ${record.summary}`] : []
  })
}

function visualGuardrailConstraints(records: RetrievedIntelligence[]) {
  return records.filter(record => record.subsection === 'visual_dna').flatMap(record => {
    const rules = record.fields.rules
    if (!Array.isArray(rules)) return []
    return rules.flatMap((rule, index) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return []
      const ruleData = rule as Record<string, unknown>
      const rawText = ruleData.text
      const text = typeof rawText === 'string' ? rawText.trim() : ''
      const strength = ruleData.strength
      if (!text) return []
      const level: PromptConstraintLevel = strength === 'hard_guardrail' ? 'hard_rule' : strength === 'strong_preference' ? 'strong_preference' : 'preference'
      return [{ id: `visual-rule:${record.id}:${index}`, level, instruction: level === 'hard_rule' ? `Do not use or introduce: ${text}.` : text, origin: `Visual DNA · ${record.title}` }]
    })
  })
}

function guidelineConstraints(context: ClientBrainV2RetrievalContext): PromptConstraint[] {
  return context.brand_guidelines.flatMap(guideline => Object.entries(guideline.fields).flatMap(([key, value]) => {
    const lines = textFromValue(value)
    if (!lines.length) return []
    const level: PromptConstraintLevel = ['usage_restrictions', 'prohibited_combinations'].includes(key)
      ? 'hard_rule'
      : guideline.status === 'approved'
        ? 'strong_preference'
        : 'preference'
    return lines.map((text, index) => ({
      id: `guideline:${guideline.id}:${key}:${index}`,
      level,
      instruction: level === 'hard_rule' ? `Do not violate ${key.replace(/_/g, ' ')}: ${text}` : `${key.replace(/_/g, ' ')}: ${text}`,
      origin: `Brand Guideline · ${guideline.title}`,
    }))
  }))
}

function brandAssetConstraints(context: ClientBrainV2RetrievalContext): PromptConstraint[] {
  return context.brand_assets.flatMap<PromptConstraint>(asset => {
    const notes = asset.notes ? [asset.notes] : []
    if (asset.kind === 'logo') return [
      { id: `brand-asset:${asset.id}:canonical`, level: 'hard_rule' as const, instruction: `When this ${asset.role.replace(/_/g, ' ')} is used, use the supplied canonical logo file. Do not redraw, approximate, recolour, rotate, or replace it.`, origin: `Brand Kit · ${asset.name}` },
      ...notes.map((note, index) => ({ id: `brand-asset:${asset.id}:note:${index}`, level: 'strong_preference' as const, instruction: note, origin: `Brand Kit · ${asset.name}` })),
    ]
    if (asset.kind === 'font') return [
      { id: `brand-asset:${asset.id}:identity`, level: 'strong_preference' as const, instruction: `Use the supplied ${asset.role.replace(/_/g, ' ')} font where the renderer supports custom font files. Otherwise state the limitation; do not claim a random substitute is brand-accurate.`, origin: `Brand Kit · ${asset.name}` },
      ...notes.map((note, index) => ({ id: `brand-asset:${asset.id}:note:${index}`, level: 'strong_preference' as const, instruction: note, origin: `Brand Kit · ${asset.name}` })),
    ]
    return notes.map((note, index) => ({ id: `brand-asset:${asset.id}:note:${index}`, level: 'preference' as const, instruction: note, origin: `Brand Kit · ${asset.name}` }))
  })
}

function warningForRetrievalWarning(warning: RetrievalWarning): PromptWarning {
  if (warning.code === 'verified_booking_contact_missing') {
    return { ...warning, disposition: 'hard_constraint', executor_instruction: 'Do not include booking, reservation, phone, or contact information unless the user supplies it separately.' }
  }
  if (warning.code === 'activation_current_validity_unverified') {
    return { ...warning, disposition: 'review_warning', executor_instruction: 'Treat the Activation schedule, price, and availability as review-sensitive. Do not present it as verified current truth.' }
  }
  if (warning.code.startsWith('approved_') && warning.code.endsWith('_assets_missing')) {
    return { ...warning, disposition: 'hard_constraint', executor_instruction: 'No approved matching visual reference is available. Do not substitute unrelated assets automatically.' }
  }
  if (warning.code === 'verified_operational_facts_missing') {
    return { ...warning, disposition: 'hard_constraint', executor_instruction: 'Do not state an exact opening or closing time, availability, booking rule, or service policy as fact until it is verified.' }
  }
  if (warning.code.startsWith('knowledge_gap:')) {
    return { ...warning, disposition: 'missing_information', executor_instruction: 'Do not invent the missing information; keep it unresolved or request verification when needed.' }
  }
  return { ...warning, disposition: 'executor_instruction', executor_instruction: 'Preserve this uncertainty. Do not infer a replacement fact.' }
}

function coreConstraints(target: PromptAssemblyExecutionTarget) {
  const constraints: PromptConstraint[] = [
    { id: 'core:no-invention', level: 'hard_rule', instruction: 'Do not invent missing facts, pricing, operational details, dates, contacts, products, or assets.', origin: 'Prompt Assembly V1' },
    { id: 'core:approved-assets-only', level: 'hard_rule', instruction: 'Use only the returned approved Asset references. Do not substitute unrelated visual truth.', origin: 'Prompt Assembly V1' },
  ]
  if (target === 'image_generation' || target === 'video_generation') {
    constraints.push({ id: 'core:visual-truth', level: 'hard_rule', instruction: 'Preserve venue, product, plating, and architectural truth represented by approved Asset references.', origin: 'Prompt Assembly V1' })
  }
  return constraints
}

function menuLines(context: ClientBrainV2RetrievalContext) {
  return context.menus.map(menu => [
    `Menu: ${menu.name}.`,
    menu.service_daypart ? `Service/daypart: ${menu.service_daypart}.` : '',
    menu.service_hours ? `Hours recorded: ${menu.service_hours}.` : '',
    menu.availability ? `Availability recorded: ${menu.availability}.` : '',
    menu.price != null ? `Verified menu/package price: ${menu.currency ? `${menu.currency} ` : ''}${menu.price}. This price belongs to the Menu/package, not each included item.` : '',
    menu.inclusions.length ? `Verified inclusions: ${menu.inclusions.join('; ')}.` : '',
    menu.restrictions.length ? `Verified restrictions: ${menu.restrictions.join('; ')}.` : '',
    menu.notes ? `Verified menu note: ${menu.notes}.` : '',
    menu.verified_details ? `Verified menu details: ${menu.verified_details}.` : '',
    menu.source ? `Authoritative source: ${menu.source}.` : '',
    menu.status !== 'approved' && menu.status !== 'current' ? `Verification state: ${menu.status}. Do not infer item-level facts or prices.` : '',
  ].filter(Boolean).join(' '))
}

function activationLines(context: ClientBrainV2RetrievalContext) {
  return context.activations.map(activation => [
    `Activation: ${activation.name}.`,
    activation.proposition ? `Proposition: ${activation.proposition}.` : '',
    activation.schedule ? `Recorded schedule: ${activation.schedule}.` : '',
    activation.price != null ? `Verified activation/package price: ${activation.currency ? `${activation.currency} ` : ''}${activation.price}. This price belongs to the Activation, not each included item.` : '',
    activation.inclusions.length ? `Verified inclusions: ${activation.inclusions.join('; ')}.` : '',
    activation.restrictions.length ? `Verified restrictions: ${activation.restrictions.join('; ')}.` : '',
    activation.notes ? `Verified activation note: ${activation.notes}.` : '',
    activation.temporal.status !== 'current' ? `Validity: ${activation.temporal.trust_line}` : '',
  ].filter(Boolean).join(' '))
}

function assetReference(asset: RetrievedAsset): PromptAssetReference {
  return {
    id: asset.id,
    semantic_name: asset.semantic_name,
    category: asset.category,
    role: asset.role,
    approved_for_generation: asset.approved_for_generation,
    url: asset.url,
    url_strategy: asset.url_strategy,
    description: asset.description,
    ingredients: asset.ingredients,
    allergens: asset.allergens,
    dietary: asset.dietary,
    visual_presentation: asset.visual_presentation,
    key_visual_details: asset.key_visual_details,
    perspective_flexibility: asset.perspective_flexibility,
    tags: asset.tags,
    menu_ids: asset.menu_ids,
    activation_ids: asset.activation_ids,
    source_ids: asset.source_ids,
    ranking_reason: asset.ranking_reason,
  }
}

function section(id: string, label: string, priority: PromptPriority, items: string[]): PromptSection {
  return { id, label, priority, items: items.filter(item => Boolean(item.trim())) }
}

function renderSection(promptSection: PromptSection) {
  if (!promptSection.items.length) return ''
  return `${promptSection.label.toUpperCase()}\n${promptSection.items.map(item => `- ${item}`).join('\n')}`
}

function renderPrompt(input: {
  system: PromptSection
  client: PromptSection
  task: PromptSection
  warnings: PromptWarning[]
  constraints: PromptConstraint[]
  factual: PromptSection
  creative: PromptSection
  operational: PromptSection
  assets: PromptAssetReference[]
  brandAssets: RetrievedBrandAsset[]
  learnings: string[]
  sources: string[]
  output: string[]
}) {
  const hardConstraints = input.constraints.filter(constraint => constraint.level === 'hard_rule').map(constraint => `${constraint.instruction} (${constraint.origin})`)
  const guidance = input.constraints.filter(constraint => constraint.level !== 'hard_rule').map(constraint => `${constraint.level.replace(/_/g, ' ')}: ${constraint.instruction} (${constraint.origin})`)
  const assetLines = input.assets.map((asset, index) => [
    `${index + 1}. ${asset.semantic_name} (${asset.category}; ${asset.role}; approved=${asset.approved_for_generation}).`,
    asset.description ? `Description: ${asset.description}.` : '',
    asset.ingredients.length ? `Ingredients: ${asset.ingredients.join(', ')}.` : '',
    asset.visual_presentation ? `Visual presentation: ${asset.visual_presentation}.` : '',
    asset.category === 'interiors' || asset.category === 'exteriors'
      ? `Venue truth: reference image is primary; preserve visible details${asset.key_visual_details.length ? ` (${asset.key_visual_details.join(', ')})` : ''}.`
      : '',
    asset.perspective_flexibility === 'low'
      ? 'Perspective: allow only crop, zoom, and minimal angle shift; do not extrapolate unseen room geometry, walls, or architecture.'
      : asset.perspective_flexibility === 'medium'
        ? 'Perspective: small viewpoint changes within established visible geometry are allowed; do not invent new architecture.'
        : asset.perspective_flexibility === 'high'
          ? 'Perspective: broader viewpoint variation is allowed only where supporting venue references establish the geometry.'
          : '',
    `Selection: ${asset.ranking_reason}.`,
    asset.url ? `Reference URL: ${asset.url}` : '',
  ].filter(Boolean).join(' '))
  const brandAssetLines = input.brandAssets.map(asset => [
    `${asset.name} (${asset.kind}; ${asset.role}; canonical=${asset.hard_truth}).`,
    asset.notes ? `Usage notes: ${asset.notes}.` : '',
    asset.file_type ? `File type: ${asset.file_type}.` : '',
    asset.url ? `Reference URL: ${asset.url}` : '',
  ].filter(Boolean).join(' '))
  return [
    renderSection(input.system),
    renderSection(input.client),
    renderSection(input.task),
    input.warnings.length ? `WARNINGS / UNKNOWN INFORMATION\n${input.warnings.map(warning => `- ${warning.message} ${warning.executor_instruction}`).join('\n')}` : '',
    hardConstraints.length ? `HARD CONSTRAINTS\n${hardConstraints.map(item => `- ${item}`).join('\n')}` : '',
    renderSection(input.factual),
    renderSection(input.creative),
    guidance.length ? `GUIDANCE\n${guidance.map(item => `- ${item}`).join('\n')}` : '',
    renderSection(input.operational),
    assetLines.length ? `REFERENCE ASSETS\n${assetLines.map(item => `- ${item}`).join('\n')}` : '',
    brandAssetLines.length ? `BRAND ASSETS\n${brandAssetLines.map(item => `- ${item}`).join('\n')}` : '',
    input.learnings.length ? `ACTIVE LEARNINGS\n${input.learnings.map(item => `- ${item}`).join('\n')}` : '',
    input.sources.length ? `SOURCE / TRUST NOTES\n${input.sources.map(item => `- ${item}`).join('\n')}` : '',
    `OUTPUT REQUIREMENTS\n${input.output.map(item => `- ${item}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

function renderStateSize(state: {
  system: PromptSection
  client: PromptSection
  task: PromptSection
  warnings: PromptWarning[]
  constraints: PromptConstraint[]
  factual: PromptSection
  creative: PromptSection
  operational: PromptSection
  assets: PromptAssetReference[]
  brandAssets: RetrievedBrandAsset[]
  learnings: string[]
  sources: string[]
  output: string[]
}) {
  return renderPrompt(state).length
}

export async function assembleClientBrainPrompt(clientId: string, request: PromptAssemblyRequest): Promise<PromptAssemblyPackage> {
  const assemblyStartedAt = Date.now()
  const retrievalRequest: ClientBrainV2RetrievalRequest = {
    task_type: request.task_type,
    intent: request.task,
    activation: request.activation,
    menu: request.menu,
    asset_categories: request.asset_categories,
    asset_ids: request.asset_ids,
    asset_role: request.asset_role,
    channel: request.channel,
    output_type: request.output_type,
    include_sources: request.include_sources,
    include_learnings: request.include_learnings,
    max_assets: request.max_assets,
    freshness_mode: request.freshness_mode,
    debug: request.debug,
  }
  const context = await retrieveClientBrainContext(clientId, retrievalRequest)
  const profile = ASSEMBLY_PROFILES[request.execution_target]
  const warnings = context.warnings.map(warningForRetrievalWarning)
  const systemContext = section('system_context', 'Role / Objective', 'must_obey', [profile.role])
  const clientContext = section('client_context', 'Client Context', 'strong_guidance', [
    `Client: ${context.client.name}.`,
    context.client.subtype ? `Industry: ${context.client.subtype}.` : '',
    ...intelligenceLines(context.intelligence, 'brand_identity'),
  ])
  const taskContext = section('task_context', 'User Task', 'must_obey', [
    request.task,
    `Task type: ${request.task_type.replace(/_/g, ' ')}.`,
    `Execution target: ${request.execution_target.replace(/_/g, ' ')}.`,
    ...activationLines(context),
    ...menuLines(context),
  ])
  const creativeLines = profile.includeVisual
    ? intelligenceLines(context.intelligence, 'visual_dna')
    : []
  const creativeContext = section('creative_context', 'Visual / Copy / Strategic Guidance', 'strong_guidance', creativeLines)
  const audienceLines = profile.includeAudience
    ? intelligenceLines(context.intelligence, 'audience').map(item => `Audience: ${item}`)
    : []
  const marketLines = profile.includeMarket
    ? intelligenceLines(context.intelligence, 'market_intelligence').map(item => `Market intelligence: ${item}`)
    : []
  const commercialLines = intelligenceLines(context.intelligence, 'commercial_strategy')
  const factualLines = [
    ...audienceLines,
    ...commercialLines,
    ...marketLines,
  ]
  const factualContext = section('factual_context', 'Task-Specific Context', 'strong_guidance', factualLines)
  const operationalContext = section('operational_context', 'Verified Operational Context', 'must_obey', context.operations.map(operation => `${operation.title}: ${operation.value}`))
  if (profile.includeAudience && audienceLines.length === 0) {
    warnings.push({
      code: 'structured_audience_context_missing',
      message: 'No current structured Audience facts are available for this task.',
      disposition: 'missing_information',
      executor_instruction: 'Do not infer an audience segment or audience behavior; request or verify the needed audience context.',
    })
  }
  if (request.execution_target === 'campaign_strategy' && commercialLines.length === 0) {
    warnings.push({
      code: 'structured_commercial_strategy_missing',
      message: 'No current structured Commercial Strategy fact is available for this campaign decision.',
      disposition: 'missing_information',
      executor_instruction: 'Keep commercial decisions provisional. Do not invent targets, priorities, margins, or approved strategy.',
    })
  }
  if (request.execution_target === 'client_response' && operationalContext.items.length === 0) {
    warnings.push({
      code: 'verified_operational_facts_missing',
      message: 'No verified current operational fact is available for this customer-facing response.',
      disposition: 'hard_constraint',
      executor_instruction: 'Do not state an exact opening or closing time, availability, booking rule, or service policy as fact until it is verified.',
    })
  }
  const constraints = [
    ...coreConstraints(request.execution_target),
    ...visualGuardrailConstraints(context.intelligence),
    ...guidelineConstraints(context),
    ...brandAssetConstraints(context),
    ...warnings.filter(warning => warning.disposition === 'hard_constraint').map(warning => ({
      id: `warning:${warning.code}`,
      level: 'hard_rule' as const,
      instruction: warning.executor_instruction,
      origin: `Retrieval warning · ${warning.code}`,
    })),
  ]
  const assets = context.assets.map(assetReference)
  const learnings = context.learnings.map(learning => `${learning.category}: ${learning.statement} (confidence: ${learning.confidence_level}).`)
  const sources = context.sources.map(source => `${source.title} — ${source.status}${source.source_date ? `; date: ${source.source_date}` : ''}.`)
  const missingInformation = warnings.filter(warning => warning.disposition === 'missing_information' || warning.disposition === 'hard_constraint').map(warning => warning.message)
  const state = {
    system: systemContext,
    client: clientContext,
    task: taskContext,
    warnings,
    constraints,
    factual: factualContext,
    creative: creativeContext,
    operational: operationalContext,
    assets,
    brandAssets: context.brand_assets,
    learnings,
    sources,
    output: profile.outputInstructions,
  }
  const trimmedSections: string[] = []
  const omitLowerPriority = (label: string, callback: () => void) => {
    if (renderStateSize(state) <= (request.max_context_chars ?? DEFAULT_CONTEXT_CHARS)) return
    callback()
    trimmedSections.push(label)
  }
  omitLowerPriority('source_notes', () => { state.sources = [] })
  omitLowerPriority('market_context', () => {
    state.factual.items = state.factual.items.filter(item => !item.startsWith('Market'))
  })
  omitLowerPriority('secondary_audience_detail', () => {
    const audience = state.factual.items.filter(item => item.startsWith('Audience'))
    state.factual.items = [...state.factual.items.filter(item => !item.startsWith('Audience')), ...audience.slice(0, 1)]
  })
  omitLowerPriority('low_confidence_learnings', () => {
    state.learnings = state.learnings.filter((_, index) => context.learnings[index]?.confidence_level !== 'low')
  })
  const renderedPrompt = renderPrompt(state)
  const structuredPayloadChars = JSON.stringify({
    system_context: state.system,
    client_context: state.client,
    task_context: state.task,
    creative_context: state.creative,
    factual_context: state.factual,
    operational_context: state.operational,
    asset_references: state.assets,
    brand_assets: state.brandAssets,
    constraints: state.constraints,
    warnings: state.warnings,
    source_notes: state.sources,
    learnings: state.learnings,
  }).length
  const assemblyMs = Date.now() - assemblyStartedAt - context.metrics.duration_ms
  const contextTrimmed = trimmedSections.length > 0
  const estimatedContextSize: ContextBudgetReport = {
    max_context_chars: request.max_context_chars ?? DEFAULT_CONTEXT_CHARS,
    structured_payload_chars: structuredPayloadChars,
    rendered_prompt_chars: renderedPrompt.length,
    estimated_tokens: Math.ceil(renderedPrompt.length / 4),
    response_payload_bytes: 0,
    context_trimmed: contextTrimmed,
    trimmed_sections: trimmedSections,
    exceeded_budget_by_chars: Math.max(0, renderedPrompt.length - (request.max_context_chars ?? DEFAULT_CONTEXT_CHARS)),
  }
  const result: PromptAssemblyPackage = {
    task: request.task,
    task_type: request.task_type,
    execution_target: request.execution_target,
    system_context: state.system,
    client_context: state.client,
    task_context: state.task,
    creative_context: state.creative,
    factual_context: state.factual,
    operational_context: state.operational,
    asset_references: state.assets,
    brand_assets: state.brandAssets,
    constraints: state.constraints,
    warnings: state.warnings,
    missing_information: missingInformation,
    source_notes: state.sources,
    learnings: state.learnings,
    output_instructions: state.output,
    rendered_prompt: renderedPrompt,
    estimated_context_size: estimatedContextSize,
    timings: {
      retrieval_ms: context.metrics.duration_ms,
      assembly_ms: Math.max(0, assemblyMs),
      total_ms: Date.now() - assemblyStartedAt,
    },
    ...(request.debug && context.debug ? {
      debug: {
        retrieval_profile: request.task_type,
        assembly_profile: request.execution_target,
        sections_included: [state.system, state.client, state.task, state.creative, state.factual, state.operational].filter(item => item.items.length).map(item => item.id),
        sections_omitted: trimmedSections,
        hard_constraints_created: state.constraints.filter(item => item.level === 'hard_rule').map(item => item.id),
        warnings_propagated: state.warnings.map(item => item.code),
        context_trimmed: contextTrimmed,
        trimmed_sections: trimmedSections,
        asset_order: state.assets.map((asset, index) => ({ asset_id: asset.id, position: index + 1, ranking_reason: asset.ranking_reason })),
        retrieval_trace: context.debug!,
        rendered_prompt_preview: renderedPrompt,
      },
    } : {}),
  }
  result.estimated_context_size.response_payload_bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  return result
}

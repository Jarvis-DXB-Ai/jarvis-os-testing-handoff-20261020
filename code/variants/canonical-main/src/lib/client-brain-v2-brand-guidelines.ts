import type {
  ClientBrainV2EditBaseline,
  ClientBrainV2EditField,
  ClientBrainV2EditorKind,
  ClientBrainV2EditorWorkspace,
} from '@/lib/client-brain-v2-edit'
import type { ClientBrainV2File, ClientBrainV2Record } from '@/lib/client-brain-v2'

export const CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS = [
  'logos', 'caption_intelligence',
  'colours',
  'typography',
  'graphics_icons',
] as const

export type ClientBrainV2BrandGuidelineSubsection = typeof CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS[number]
export type ClientBrainV2BrandGuidelineRetrievalSubsection = ClientBrainV2BrandGuidelineSubsection | 'copy_language_system'

export type ClientBrainV2BrandGuidelineFieldConfig = {
  id: string
  label: string
  kind: ClientBrainV2EditorKind
  description?: string
}

export const CLIENT_BRAIN_V2_GRAPHIC_TYPES = [
  'graphic_element', 'icon', 'pattern', 'illustration', 'texture', 'other',
] as const

export const CLIENT_BRAIN_V2_BRAND_GUIDELINE_CONFIG: Record<ClientBrainV2BrandGuidelineSubsection, {
  label: string
  eyebrow: string
  description: string
  fields: ClientBrainV2BrandGuidelineFieldConfig[]
}> = {
  caption_intelligence: {
    label: 'Caption Intelligence',
    eyebrow: 'Social Media',
    description: 'Client-scoped writing intelligence used by Social Publishing. Rules are selected by post type; they are not a generic prompt dump.',
    fields: [
      { id: 'core_voice', label: 'Voice & Personality', kind: 'textarea' },
      { id: 'structure_length', label: 'Structure & Length', kind: 'textarea' },
      { id: 'hooks', label: 'Hooks', kind: 'textarea' },
      { id: 'emoji_rules', label: 'Emoji Rules', kind: 'textarea' },
      { id: 'cta_rules', label: 'CTA Rules', kind: 'textarea' },
      { id: 'hashtag_rules', label: 'Hashtag Rules', kind: 'textarea' },
      { id: 'food', label: 'Food', kind: 'textarea' },
      { id: 'pizza', label: 'Pizza', kind: 'textarea' },
      { id: 'ingredients', label: 'Ingredients', kind: 'textarea' },
      { id: 'lifestyle_venue', label: 'Lifestyle / Venue', kind: 'textarea' },
      { id: 'people_playful', label: 'People / Playful', kind: 'textarea' },
      { id: 'dogs', label: 'Dogs', kind: 'textarea' },
      { id: 'dessert', label: 'Dessert', kind: 'textarea' },
      { id: 'breakfast', label: 'Breakfast', kind: 'textarea' },
      { id: 'business_lunch', label: 'Business Lunch', kind: 'textarea' },
      { id: 'activations', label: 'Activations', kind: 'textarea' },
      { id: 'italian_language', label: 'Italian Language', kind: 'textarea' },
      { id: 'encouraged_language', label: 'Encouraged Language', kind: 'textarea' },
      { id: 'avoided_language', label: 'Avoided Language', kind: 'textarea' },
      { id: 'hard_factual_guardrails', label: 'Hard Factual Guardrails', kind: 'textarea' },
      { id: 'recent_repetition_rules', label: 'Recent / Repetition Rules', kind: 'textarea' },
      { id: 'footer', label: 'Footer', kind: 'textarea' },
    ],
  },
  logos: {
    label: 'Logos',
    eyebrow: 'Canonical identity files',
    description: 'The current logo files Jarvis may use in branded output. Transparent PNG is recommended.',
    fields: [
      { id: 'logos', label: 'Logos', kind: 'asset_refs' },
      { id: 'section_notes', label: 'Section Notes', kind: 'textarea' },
    ],
  },
  colours: {
    label: 'Colours',
    eyebrow: 'Exact production values',
    description: 'Brand colours are stored as exact HEX values, with optional guidance for their use.',
    fields: [
      { id: 'colours', label: 'Colours', kind: 'colours' },
      { id: 'section_notes', label: 'Section Notes', kind: 'textarea' },
    ],
  },
  typography: {
    label: 'Typography',
    eyebrow: 'Canonical type files',
    description: 'Primary and body font files for branded design. A file is only claimed as usable where the target renderer supports it.',
    fields: [
      { id: 'fonts', label: 'Fonts', kind: 'asset_refs' },
      { id: 'section_notes', label: 'Section Notes', kind: 'textarea' },
    ],
  },
  graphics_icons: {
    label: 'Graphics & Icons',
    eyebrow: 'Reusable visual elements',
    description: 'Optional reusable elements that support the brand without replacing venue or product truth.',
    fields: [
      { id: 'graphics', label: 'Graphics & Icons', kind: 'asset_refs' },
      { id: 'section_notes', label: 'Section Notes', kind: 'textarea' },
    ],
  },
}

export type ClientBrainV2BrandGuidelineOption = {
  id: string
  title: string
  status: string
  subsection: string
  record_type: string
  files: ClientBrainV2File[]
}

export type ClientBrainV2BrandGuidelineOptions = {
  assets: ClientBrainV2BrandGuidelineOption[]
  sources: ClientBrainV2BrandGuidelineOption[]
}

export type ClientBrainV2BrandGuidelineEditWorkspace = ClientBrainV2EditorWorkspace & {
  section: 'brand_guidelines'
  subsection: ClientBrainV2BrandGuidelineSubsection
}

export type ClientBrainV2BrandGuidelineWorkspace = {
  subsection: ClientBrainV2BrandGuidelineSubsection
  record: ClientBrainV2Record | null
  edit: ClientBrainV2BrandGuidelineEditWorkspace
  warnings: string[]
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultField(field: ClientBrainV2BrandGuidelineFieldConfig): ClientBrainV2EditField {
  if (field.kind === 'asset_refs' || field.kind === 'colours') return { ...field, items: [] }
  return { ...field, value: '' }
}

function normalizedField(field: ClientBrainV2BrandGuidelineFieldConfig, data: Record<string, unknown>) {
  const value = data[field.id]
  if (field.kind === 'asset_refs' || field.kind === 'colours') {
    return {
      ...field,
      items: Array.isArray(value) ? cloneValue(value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>) : [],
    } satisfies ClientBrainV2EditField
  }
  return { ...field, value: typeof value === 'string' ? value : '' } satisfies ClientBrainV2EditField
}

export function brandGuidelineStableKey(subsection: ClientBrainV2BrandGuidelineSubsection) {
  return `brand_guideline:${subsection}`
}

export function isBrandGuidelineSubsection(value: unknown): value is ClientBrainV2BrandGuidelineSubsection {
  return typeof value === 'string' && CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS.includes(value as ClientBrainV2BrandGuidelineSubsection)
}

export function buildBrandGuidelineWorkspaces(records: ClientBrainV2Record[]) {
  return Object.fromEntries(CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS.map(subsection => {
    const config = CLIENT_BRAIN_V2_BRAND_GUIDELINE_CONFIG[subsection]
    const record = records.find(item => item.stable_key === brandGuidelineStableKey(subsection)) ?? null
    const data = record?.metadata?.editor_data && typeof record.metadata.editor_data === 'object' && !Array.isArray(record.metadata.editor_data)
      ? record.metadata.editor_data as Record<string, unknown>
      : {}
    const fields = config.fields.map(field => record ? normalizedField(field, data) : defaultField(field))
    const baseline: ClientBrainV2EditBaseline = {
      record: { recordId: record?.id ?? null, updatedAt: record?.updated_at ?? null },
    }
    return [subsection, {
      subsection,
      record,
      edit: { section: 'brand_guidelines', subsection, fields, baseline },
      warnings: [],
    } satisfies ClientBrainV2BrandGuidelineWorkspace]
  })) as unknown as Record<ClientBrainV2BrandGuidelineSubsection, ClientBrainV2BrandGuidelineWorkspace>
}

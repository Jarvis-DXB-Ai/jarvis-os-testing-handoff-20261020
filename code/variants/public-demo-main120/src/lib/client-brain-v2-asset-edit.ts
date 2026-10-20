import type { ClientBrainV2RestaurantAssetCategory } from '@/lib/client-brain-v2'

export const EDITABLE_RESTAURANT_ASSET_CATEGORIES = [
  'food',
  'drinks',
  'interiors',
  'exteriors',
  'venue_items',
  'staff',
] as const

export const EDITABLE_ASSET_ROLES = [
  'truth_reference',
  'creative_reference',
  'approved_marketing_asset',
  'generated_asset',
  'raw_asset',
  'archived_asset',
] as const

export const ASSET_RECORD_STATUSES = [
  'draft',
  'needs_review',
  'approved',
  'active',
  'resolved',
  'current',
  'unverified',
  'conflicting',
  'contradicted',
  'superseded',
  'historical',
  'restricted',
  'archived',
] as const

export const ASSET_REVIEW_STATES = [
  'draft',
  'needs_review',
  'approved',
  'archived',
] as const

export type AssetReviewState = typeof ASSET_REVIEW_STATES[number]

export const ASSET_ALCOHOL_STATUSES = ['unknown', 'alcoholic', 'non_alcoholic'] as const
export const RESTAURANT_SUPPORTED_CURRENCIES = ['', 'AED', 'USD', 'EUR', 'GBP'] as const
export const DEFAULT_RESTAURANT_ASSET_CURRENCY = 'AED' as const

export type EditableRestaurantAssetCategory = typeof EDITABLE_RESTAURANT_ASSET_CATEGORIES[number]
export type ManualRestaurantAssetCategory = EditableRestaurantAssetCategory | 'unclassified'
export type AssetEditorFieldKind = 'text' | 'textarea' | 'list' | 'number' | 'date' | 'select' | 'boolean'

export type AssetEditorFieldConfig = {
  id: string
  label: string
  kind: AssetEditorFieldKind
  aliases: string[]
  wide?: boolean
  options?: readonly string[]
}

const COMMON_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'approved_for_generation', label: 'Approved for Generation', kind: 'boolean', aliases: ['approved_for_generation'] },
  { id: 'asset_role', label: 'Asset Role', kind: 'select', aliases: ['asset_role', 'reference_type', 'purpose'], options: EDITABLE_ASSET_ROLES },
  { id: 'last_verified', label: 'Last Verified', kind: 'date', aliases: ['last_verified', 'last_verified_at', 'metadata_last_generated_at'] },
]

const FOOD_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'dish_name', label: 'Dish Name', kind: 'text', aliases: ['dish_name', 'name'] },
  { id: 'menu_category', label: 'Menu Category', kind: 'text', aliases: ['menu_category', 'category'] },
  { id: 'price', label: 'Item Price', kind: 'number', aliases: ['price'] },
  { id: 'currency', label: 'Currency', kind: 'select', aliases: ['currency'], options: RESTAURANT_SUPPORTED_CURRENCIES },
  { id: 'ingredients', label: 'Ingredients', kind: 'list', aliases: ['ingredients', 'menu_ingredients'], wide: true },
  { id: 'allergens', label: 'Allergens', kind: 'list', aliases: ['allergens'], wide: true },
  { id: 'dietary_information', label: 'Dietary Information', kind: 'list', aliases: ['dietary_information', 'dietary'] },
  { id: 'visual_presentation', label: 'Visual Presentation', kind: 'textarea', aliases: ['visual_presentation'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  { id: 'status', label: 'Status', kind: 'select', aliases: ['status', 'metadata_status'], options: ASSET_RECORD_STATUSES },
  ...COMMON_FIELDS,
]

const DRINK_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'drink_name', label: 'Drink Name', kind: 'text', aliases: ['drink_name', 'name'] },
  { id: 'drink_category', label: 'Category', kind: 'text', aliases: ['drink_category', 'menu_category', 'category'] },
  { id: 'price', label: 'Item Price', kind: 'number', aliases: ['price'] },
  { id: 'currency', label: 'Currency', kind: 'select', aliases: ['currency'], options: RESTAURANT_SUPPORTED_CURRENCIES },
  { id: 'ingredients', label: 'Ingredients', kind: 'list', aliases: ['ingredients', 'menu_ingredients'], wide: true },
  { id: 'alcohol_status', label: 'Alcohol Status', kind: 'select', aliases: ['alcohol_status', 'alcoholic'], options: ASSET_ALCOHOL_STATUSES },
  { id: 'visual_presentation', label: 'Visual Presentation', kind: 'textarea', aliases: ['visual_presentation'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  ...COMMON_FIELDS,
]

const INTERIOR_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'key_visual_details', label: 'Key Visual Details', kind: 'list', aliases: ['key_visual_details'], wide: true },
  { id: 'visual_presentation', label: 'Visual Presentation', kind: 'textarea', aliases: ['visual_presentation'], wide: true },
  { id: 'perspective_flexibility', label: 'Perspective Flexibility', kind: 'select', aliases: ['perspective_flexibility'], options: ['low', 'medium', 'high'] },
  { id: 'space_area', label: 'Space / Area', kind: 'text', aliases: ['space_area', 'venue_area', 'area'] },
  { id: 'interior_type', label: 'Interior Type', kind: 'text', aliases: ['interior_type', 'venue_type'] },
  { id: 'description', label: 'Description', kind: 'textarea', aliases: ['description'], wide: true },
  { id: 'architectural_features', label: 'Key Architectural Features', kind: 'list', aliases: ['architectural_features', 'key_features'], wide: true },
  { id: 'materials', label: 'Materials', kind: 'list', aliases: ['materials'] },
  { id: 'furniture_fixtures', label: 'Furniture / Fixtures', kind: 'list', aliases: ['furniture_fixtures', 'furniture', 'fixtures'], wide: true },
  { id: 'recognizable_elements', label: 'Recognizable Elements', kind: 'list', aliases: ['recognizable_elements', 'venue_truth_anchors'], wide: true },
  { id: 'camera_angle_notes', label: 'Camera / Angle Notes', kind: 'textarea', aliases: ['camera_angle_notes', 'angle'], wide: true },
  { id: 'accuracy_notes', label: 'Accuracy / Truth Notes', kind: 'textarea', aliases: ['accuracy_notes', 'truth_notes'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  ...COMMON_FIELDS,
]

const EXTERIOR_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'key_visual_details', label: 'Key Visual Details', kind: 'list', aliases: ['key_visual_details'], wide: true },
  { id: 'visual_presentation', label: 'Visual Presentation', kind: 'textarea', aliases: ['visual_presentation'], wide: true },
  { id: 'perspective_flexibility', label: 'Perspective Flexibility', kind: 'select', aliases: ['perspective_flexibility'], options: ['low', 'medium', 'high'] },
  { id: 'area_view', label: 'Area / View', kind: 'text', aliases: ['area_view', 'venue_area', 'area'] },
  { id: 'exterior_type', label: 'Exterior Type', kind: 'text', aliases: ['exterior_type', 'venue_type'] },
  { id: 'description', label: 'Description', kind: 'textarea', aliases: ['description'], wide: true },
  { id: 'architectural_features', label: 'Architectural Features', kind: 'list', aliases: ['architectural_features', 'key_features'], wide: true },
  { id: 'venue_relationship', label: 'Entrance / Facade / Terrace Relationship', kind: 'textarea', aliases: ['venue_relationship', 'entrance_facade_terrace'], wide: true },
  { id: 'recognizable_features', label: 'Recognizable Features', kind: 'list', aliases: ['recognizable_features', 'venue_truth_anchors'], wide: true },
  { id: 'surroundings', label: 'Surroundings', kind: 'textarea', aliases: ['surroundings'], wide: true },
  { id: 'accuracy_notes', label: 'Accuracy Notes', kind: 'textarea', aliases: ['accuracy_notes', 'truth_notes'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  ...COMMON_FIELDS,
]

const VENUE_ITEM_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'item_name', label: 'Item Name', kind: 'text', aliases: ['item_name', 'name'] },
  { id: 'item_type', label: 'Item Type', kind: 'text', aliases: ['item_type', 'venue_item_type'] },
  { id: 'description', label: 'Description', kind: 'textarea', aliases: ['description'], wide: true },
  { id: 'materials', label: 'Materials', kind: 'list', aliases: ['materials'] },
  { id: 'colour', label: 'Colour', kind: 'text', aliases: ['colour', 'color'] },
  { id: 'shape_design', label: 'Shape / Design', kind: 'textarea', aliases: ['shape_design', 'shape', 'design'], wide: true },
  { id: 'location_in_venue', label: 'Location in Venue', kind: 'text', aliases: ['location_in_venue', 'venue_area'] },
  { id: 'accuracy_notes', label: 'Accuracy Notes', kind: 'textarea', aliases: ['accuracy_notes', 'truth_notes'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  ...COMMON_FIELDS,
]

const STAFF_FIELDS: AssetEditorFieldConfig[] = [
  { id: 'staff_name', label: 'Name', kind: 'text', aliases: ['staff_name', 'name'] },
  { id: 'staff_position', label: 'Job Title / Position', kind: 'text', aliases: ['staff_position', 'position', 'job_title'] },
  { id: 'staff_department', label: 'Department', kind: 'text', aliases: ['staff_department', 'department'] },
  { id: 'staff_active', label: 'Active Staff Member', kind: 'boolean', aliases: ['staff_active', 'active'] },
  { id: 'identity_notes', label: 'Identity Notes', kind: 'textarea', aliases: ['identity_notes', 'notes'], wide: true },
  { id: 'tags', label: 'Tags', kind: 'list', aliases: ['tags'], wide: true },
  ...COMMON_FIELDS,
]

export const ASSET_EDITOR_FIELDS: Record<EditableRestaurantAssetCategory, AssetEditorFieldConfig[]> = {
  food: FOOD_FIELDS,
  drinks: DRINK_FIELDS,
  interiors: INTERIOR_FIELDS,
  exteriors: EXTERIOR_FIELDS,
  venue_items: VENUE_ITEM_FIELDS,
  staff: STAFF_FIELDS,
}

const CORE_FIELD_IDS: Record<EditableRestaurantAssetCategory, readonly string[]> = {
  food: ['dish_name', 'menu_category', 'price', 'currency', 'ingredients', 'allergens', 'dietary_information', 'visual_presentation', 'approved_for_generation'],
  drinks: ['drink_name', 'drink_category', 'price', 'currency', 'ingredients', 'alcohol_status', 'visual_presentation', 'approved_for_generation'],
  interiors: ['key_visual_details', 'visual_presentation', 'perspective_flexibility', 'asset_role', 'approved_for_generation'],
  exteriors: ['key_visual_details', 'visual_presentation', 'perspective_flexibility', 'asset_role', 'approved_for_generation'],
  venue_items: ['item_name', 'item_type', 'asset_role', 'approved_for_generation'],
  staff: ['staff_name', 'staff_position', 'staff_department', 'staff_active', 'identity_notes', 'approved_for_generation'],
}

export function coreAssetEditorFields(category: ClientBrainV2RestaurantAssetCategory) {
  const fields = assetEditorFields(category)
  const coreIds = new Set(CORE_FIELD_IDS[isEditableRestaurantAssetCategory(category) ? category : 'interiors'])
  return fields.filter(field => coreIds.has(field.id))
}

export function advancedAssetEditorFields(category: ClientBrainV2RestaurantAssetCategory) {
  const fields = assetEditorFields(category)
  const coreIds = new Set(CORE_FIELD_IDS[isEditableRestaurantAssetCategory(category) ? category : 'interiors'])
  return fields.filter(field => !coreIds.has(field.id))
}

export type AssetEditOption = {
  id: string
  title: string
  status: string
}

export type ClientBrainV2AssetEditOptions = {
  menus: AssetEditOption[]
  activations: AssetEditOption[]
  sources: AssetEditOption[]
}

export type ClientBrainV2AssetEnrichmentApply = {
  menuItemId: string
  visualTruth?: Record<string, unknown>
  appliedFieldIds: string[]
}

export type ClientBrainV2AssetEditRequest = {
  expectedUpdatedAt: string
  category: EditableRestaurantAssetCategory
  fields: Record<string, unknown>
  menuRecordIds: string[]
  activationRecordIds: string[]
  sourceRecordIds: string[]
  clearLegacyMenu?: boolean
  clearLegacySource?: boolean
  /** Removes the single exact menu-item identity without removing the Asset. */
  clearCanonicalMenuMatch?: boolean
  enrichment?: ClientBrainV2AssetEnrichmentApply
}

export type ClientBrainV2AssetClassificationRequest = {
  action: 'classify'
  expectedUpdatedAt: string
  category: ManualRestaurantAssetCategory
}

export function isEditableRestaurantAssetCategory(value: unknown): value is EditableRestaurantAssetCategory {
  return EDITABLE_RESTAURANT_ASSET_CATEGORIES.includes(value as EditableRestaurantAssetCategory)
}

export function isManualRestaurantAssetCategory(value: unknown): value is ManualRestaurantAssetCategory {
  return value === 'unclassified' || isEditableRestaurantAssetCategory(value)
}

/**
 * Older records sometimes carried a record lifecycle status in review_state.
 * This keeps review state distinct from lifecycle and generation approval.
 */
export function normalizeAssetReviewState(value: unknown, fallback: AssetReviewState = 'needs_review'): AssetReviewState {
  const candidate = typeof value === 'string' ? value.trim().toLocaleLowerCase('en').replace(/[\s-]+/g, '_') : ''
  if (ASSET_REVIEW_STATES.includes(candidate as AssetReviewState)) return candidate as AssetReviewState
  if (candidate === 'historical') return 'archived'
  if (['pending', 'pending_review', 'not_reviewed', 'needs_metadata', 'requires_visual_review', 'manual_review', 'unverified', 'restricted', 'active', 'current', 'resolved', 'conflicting', 'contradicted', 'superseded'].includes(candidate)) return fallback
  return fallback
}

export function assetEditorFields(category: ClientBrainV2RestaurantAssetCategory) {
  return isEditableRestaurantAssetCategory(category) ? ASSET_EDITOR_FIELDS[category] : ASSET_EDITOR_FIELDS.interiors
}

/**
 * Category changes retain shared facts, but must not leave hidden facts from a
 * former category available to approval or retrieval logic.
 */
export function categorySpecificAssetEditorFields(category: EditableRestaurantAssetCategory) {
  const commonFieldIds = new Set(COMMON_FIELDS.map(field => field.id))
  return ASSET_EDITOR_FIELDS[category].filter(field => !commonFieldIds.has(field.id))
}

function hasMeaningfulText(value: unknown) {
  return typeof value === 'string' && Boolean(value.trim())
}

function hasMeaningfulList(value: unknown) {
  return Array.isArray(value) && value.some(item => hasMeaningfulText(item))
}

function hasAnyMeaningfulField(fields: Record<string, unknown>, ids: string[]) {
  return ids.some(id => hasMeaningfulText(fields[id]) || hasMeaningfulList(fields[id]))
}

/**
 * Approval is deliberately lighter than a completeness score: one canonical,
 * category-relevant fact is enough to identify a usable generation reference.
 */
export function hasMeaningfulRestaurantAssetMetadata(
  category: ClientBrainV2RestaurantAssetCategory,
  fields: Record<string, unknown>,
  menuRecordIds: readonly string[] = [],
) {
  if (category === 'food') {
    return menuRecordIds.length > 0 || hasAnyMeaningfulField(fields, [
      'dish_name', 'menu_category', 'ingredients', 'allergens', 'dietary_information', 'dietary', 'visual_presentation',
    ])
  }
  if (category === 'drinks') {
    const alcoholStatus = String(fields.alcohol_status ?? '').trim()
    return menuRecordIds.length > 0 || alcoholStatus === 'alcoholic' || alcoholStatus === 'non_alcoholic' || hasAnyMeaningfulField(fields, [
      'drink_name', 'drink_category', 'ingredients', 'visual_presentation',
    ])
  }
  if (category === 'interiors') {
    return hasAnyMeaningfulField(fields, [
      'key_visual_details', 'visual_presentation', 'space_area', 'interior_type', 'description', 'architectural_features', 'materials', 'furniture_fixtures',
      'recognizable_elements', 'venue_truth_anchors', 'camera_angle_notes', 'accuracy_notes',
    ])
  }
  if (category === 'exteriors') {
    return hasAnyMeaningfulField(fields, [
      'key_visual_details', 'visual_presentation', 'area_view', 'exterior_type', 'description', 'architectural_features', 'recognizable_features',
      'venue_truth_anchors', 'venue_relationship', 'surroundings', 'accuracy_notes',
    ])
  }
  if (category === 'venue_items') {
    return hasAnyMeaningfulField(fields, [
      'item_name', 'item_type', 'description', 'materials', 'colour', 'shape_design', 'location_in_venue', 'accuracy_notes',
    ])
  }
  if (category === 'staff') {
    // A Staff image is valid source material on its own. Identity and
    // employment details are optional enrichment, not an ingestion gate.
    return true
  }
  return false
}

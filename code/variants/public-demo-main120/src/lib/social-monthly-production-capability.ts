import 'server-only'

import { humanConfirmedRestaurantAssetCategory } from '@/lib/client-brain-v2'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'

type Json = Record<string, unknown>

type AssetCategory = 'food' | 'drinks' | 'interiors' | 'exteriors' | 'venue_items' | 'people' | 'pets'
type CapabilityState =
  | 'production_ready'
  | 'production_ready_with_supporting_truth'
  | 'missing_product_truth'
  | 'needs_supporting_food_drink'
  | 'missing_venue_truth'
  | 'missing_person_truth'
  | 'missing_pet_truth'
  | 'invalid_existing_asset'
  | 'conceptual_only'

type AssetRow = {
  id: string
  title: string
  status: string
  metadata: Json | null
}

type MenuRow = {
  id: string
  canonical_name: string
  menu_section: string | null
  aliases: unknown
}

type ActivationRow = {
  id: string
  title: string
  status: string
  metadata: Json | null
}

type FileAssignment = { record_id: string; approval_status: string }

export type ProductionCapabilityAsset = {
  id: string
  name: string
  category: AssetCategory
  canonical_menu_item_id: string | null
  canonical_menu_item_name: string | null
  perspective_flexibility: string | null
  metadata_complete: boolean
}

export type ProductionCapabilityProduct = {
  menu_item_id: string
  canonical_name: string
  menu_section: string | null
  asset_ids: string[]
  metadata_complete: boolean
  perspective_flexibility: string[]
}

export type ProductionCapabilityVenue = {
  zone: string
  category: 'interiors' | 'exteriors' | 'venue_items'
  asset_ids: string[]
}

export type ProductionCapabilityNamedSubject = {
  id: string
  name: string
  category: 'people' | 'pets'
  asset_ids: string[]
}

export type ProductionCapabilityActivation = {
  id: string
  name: string
  product_truth_status: 'not_applicable' | 'confirmed' | 'unresolved'
  visual_truth_available: boolean
}

export type ProductionCapabilityInventory = {
  client_id: string
  generated_at: string
  assets: ProductionCapabilityAsset[]
  food: ProductionCapabilityProduct[]
  drinks: ProductionCapabilityProduct[]
  venues: ProductionCapabilityVenue[]
  people: ProductionCapabilityNamedSubject[]
  pets: ProductionCapabilityNamedSubject[]
  brand_truth: { available: boolean; record_count: number }
  activations: ProductionCapabilityActivation[]
  anonymous_human_policy: 'allowed_without_named_likeness_truth'
  warnings: string[]
}

export type MonthlyPlanProductionFeasibility = {
  state: CapabilityState
  label: string
  reasons: string[]
  primary_asset_ids: string[]
  supporting_asset_ids: string[]
}

export type MonthlyPlanningReadiness = {
  state: 'ready' | 'needs_review' | 'needs_production_setup' | 'blocked'
  label: 'Ready' | 'Needs Review' | 'Setup Needed' | 'Blocked'
  reason: string | null
}

type PlanItemLike = {
  pillar: string
  subject: string
  creative_concept: string
  production_method: string
  status?: string | null
  missing_asset_note?: string | null
  activation_record_id?: string | null
  required_assets?: string[] | null
  metadata?: Json | null
}

function isRecord(value: unknown): value is Json {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function dataFor(metadata: Json | null | undefined) {
  const root = metadata ?? {}
  return isRecord(root.editor_data) ? root.editor_data : root
}

function stringValue(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function stringList(value: unknown, max = 24) {
  return Array.isArray(value)
    ? [...new Set(value.flatMap(entry => typeof entry === 'string' && entry.trim() ? [entry.trim().slice(0, 400)] : []))].slice(0, max)
    : []
}

function normalized(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function booleanValue(value: unknown) {
  return value === true || value === 'true'
}

function assetCategory(row: AssetRow): AssetCategory | null {
  const data = dataFor(row.metadata)
  const confirmed = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
  if (confirmed === 'staff') return 'people'
  if (confirmed !== 'unclassified') return confirmed
  const role = stringValue(data.asset_role, 80).toLocaleLowerCase('en-US')
  const subjectType = stringValue(data.subject_type, 80).toLocaleLowerCase('en-US')
  if (role === 'person_truth' || ['person', 'model', 'staff', 'chef'].includes(subjectType)) return 'people'
  if (role === 'animal_truth' || ['pet', 'animal', 'dog'].includes(subjectType)) return 'pets'
  return null
}

function generationReady(row: AssetRow, fileIds: Set<string>) {
  const data = dataFor(row.metadata)
  return row.status === 'approved'
    && booleanValue(data.approved_for_generation)
    && fileIds.has(row.id)
}

function assetName(row: AssetRow, category: AssetCategory) {
  const data = dataFor(row.metadata)
  const field = category === 'food' ? 'dish_name' : category === 'drinks' ? 'drink_name' : category === 'people' || category === 'pets' ? 'display_name' : 'space_area'
  return stringValue(data[field], 240)
    || stringValue(data.canonical_menu_item_name, 240)
    || stringValue(data.menu_display_name, 240)
    || row.title
}

function productIdentity(row: AssetRow) {
  const data = dataFor(row.metadata)
  return {
    ids: [
      stringValue(data.canonical_menu_item_id, 80),
      stringValue(data.menu_item_id, 80),
      ...stringList(data.menu_item_ids, 12),
    ].filter(Boolean),
    names: [
      stringValue(data.canonical_menu_item_name, 240),
      stringValue(data.menu_display_name, 240),
      stringValue(data.dish_name, 240),
      stringValue(data.drink_name, 240),
    ].filter(Boolean),
  }
}

function perspectiveFlexibility(row: AssetRow) {
  const data = dataFor(row.metadata)
  return stringValue(data.perspective_flexibility, 160)
    || stringValue(data.visual_perspective, 160)
    || null
}

function completeAssetMetadata(row: AssetRow, category: AssetCategory, canonicalId: string | null) {
  const data = dataFor(row.metadata)
  if (category === 'food' || category === 'drinks') return Boolean(canonicalId) && Boolean(assetName(row, category))
  if (category === 'interiors' || category === 'exteriors' || category === 'venue_items') return Boolean(stringValue(data.venue_zone, 160) || stringValue(data.space_area, 160) || stringValue(data.physical_zone, 160) || row.title)
  return Boolean(assetName(row, category))
}

function venueZone(row: AssetRow) {
  const data = dataFor(row.metadata)
  return stringValue(data.venue_zone, 160)
    || stringValue(data.physical_zone, 160)
    || stringValue(data.space_area, 160)
    || stringValue(data.area_view, 160)
    || row.title
}

function activationProductTruth(row: ActivationRow) {
  const data = dataFor(row.metadata)
  const explicit = stringValue(data.product_truth_status, 40).toLocaleLowerCase('en-US')
  if (explicit === 'unresolved') return { status: 'unresolved' as const, names: [] as string[] }
  const productBound = explicit === 'confirmed' || /\b(pizza|burger|dessert|mocktail|drink|beverage|seasonal|monthly)\b/i.test(`${row.title} ${stringValue(data.type, 160)}`)
  if (!productBound) return { status: 'not_applicable' as const, names: [] as string[] }
  const names = [
    stringValue(data.dish, 240),
    stringValue(data.product_name, 240),
    stringValue(data.featured_product, 240),
    ...stringList(data.inclusions, 24),
  ].filter(Boolean)
  return names.length ? { status: 'confirmed' as const, names } : { status: 'unresolved' as const, names: [] as string[] }
}

/**
 * Builds a compact inventory from approved client truth with approved image files.
 * Menu existence alone is deliberately never enough to put a product in this inventory.
 */
export async function buildProductionCapabilityInventory(clientId: string): Promise<ProductionCapabilityInventory> {
  await requireClientBrainV2(clientId)
  const [assetResult, menuResult, fileResult, brandResult, activationResult] = await Promise.all([
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id,title,status,metadata')
      .eq('client_id', clientId)
      .eq('top_section', 'assets')
      .eq('status', 'approved')
      .eq('metadata->>asset_category_source', 'human_confirmed')
      .eq('metadata->>approved_for_generation', 'true'),
    clientBrainV2ServerClient
      .from('client_brain_v2_menu_items')
      .select('id,canonical_name,menu_section,aliases')
      .eq('client_id', clientId)
      .eq('source_status', 'current')
      .order('menu_section')
      .order('canonical_name')
      .order('id'),
    clientBrainV2ServerClient
      .from('client_brain_v2_record_files')
      .select('record_id,approval_status')
      .eq('client_id', clientId)
      .eq('approval_status', 'approved'),
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id')
      .eq('client_id', clientId)
      .eq('top_section', 'brand_guidelines')
      .eq('status', 'approved'),
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id,title,status,metadata')
      .eq('client_id', clientId)
      .eq('top_section', 'intelligence')
      .eq('subsection', 'activations')
      .eq('record_type', 'activation')
      .in('status', ['active', 'approved', 'current', 'resolved']),
  ])
  if (assetResult.error || menuResult.error || fileResult.error || brandResult.error || activationResult.error) {
    throw new ClientBrainV2HttpError('Unable to build the current Production Capability Inventory.', 500)
  }

  const menus = (menuResult.data ?? []) as MenuRow[]
  const menuById = new Map(menus.map(menu => [menu.id, menu]))
  const menuByName = new Map<string, MenuRow>()
  for (const menu of menus) {
    menuByName.set(normalized(menu.canonical_name), menu)
    for (const alias of stringList(menu.aliases, 24)) menuByName.set(normalized(alias), menu)
  }
  const fileIds = new Set(((fileResult.data ?? []) as FileAssignment[]).map(file => file.record_id))
  const prepared = ((assetResult.data ?? []) as AssetRow[]).flatMap(row => {
    const category = assetCategory(row)
    if (!category || !generationReady(row, fileIds)) return []
    const identity = productIdentity(row)
    const matchedMenu = identity.ids.map(id => menuById.get(id)).find(Boolean)
      ?? identity.names.map(name => menuByName.get(normalized(name))).find(Boolean)
      ?? null
    // Food/drink truth without an explicit canonical menu relationship is useful in Asset
    // review, but is not eligible for a named factual production plan.
    if ((category === 'food' || category === 'drinks') && !matchedMenu) return []
    return [{ row, category, menu: matchedMenu }]
  })

  const assets = prepared.map(({ row, category, menu }) => ({
    id: row.id,
    name: assetName(row, category),
    category,
    canonical_menu_item_id: menu?.id ?? null,
    canonical_menu_item_name: menu?.canonical_name ?? null,
    perspective_flexibility: perspectiveFlexibility(row),
    metadata_complete: completeAssetMetadata(row, category, menu?.id ?? null),
  })).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))

  const productGroups = (category: 'food' | 'drinks') => [...new Set(
    assets
      .filter(asset => asset.category === category)
      .map(asset => asset.canonical_menu_item_id)
      .filter((menuId): menuId is string => Boolean(menuId)),
  )].map(menuId => {
    const menu = menuById.get(menuId)!
    const group = assets.filter(asset => asset.category === category && asset.canonical_menu_item_id === menuId)
    return {
      menu_item_id: menu.id,
      canonical_name: menu.canonical_name,
      menu_section: menu.menu_section,
      asset_ids: group.map(asset => asset.id),
      metadata_complete: group.every(asset => asset.metadata_complete),
      perspective_flexibility: [...new Set(group.map(asset => asset.perspective_flexibility).filter((value): value is string => Boolean(value)))],
    }
  }).sort((left, right) => left.canonical_name.localeCompare(right.canonical_name))

  const venues = ['interiors', 'exteriors', 'venue_items'].flatMap(category => {
    const grouped = new Map<string, string[]>()
    for (const preparedAsset of prepared.filter(entry => entry.category === category as AssetCategory)) {
      const zone = venueZone(preparedAsset.row)
      grouped.set(zone, [...(grouped.get(zone) ?? []), preparedAsset.row.id])
    }
    return [...grouped.entries()].map(([zone, asset_ids]) => ({ zone, category: category as ProductionCapabilityVenue['category'], asset_ids }))
  }).sort((left, right) => left.zone.localeCompare(right.zone) || left.category.localeCompare(right.category))

  const namedSubjects = (category: 'people' | 'pets') => assets.filter(asset => asset.category === category).map(asset => ({
    id: asset.id,
    name: asset.name,
    category,
    asset_ids: [asset.id],
  }))
  const productNames = new Set([...productGroups('food'), ...productGroups('drinks')].map(product => normalized(product.canonical_name)))
  const activations = ((activationResult.data ?? []) as ActivationRow[]).map(row => {
    const truth = activationProductTruth(row)
    return {
      id: row.id,
      name: row.title,
      product_truth_status: truth.status,
      visual_truth_available: truth.status === 'not_applicable' || (truth.status === 'confirmed' && truth.names.every(name => productNames.has(normalized(name)))),
    }
  })
  const warnings: string[] = []
  if (!productGroups('food').length) warnings.push('No approved exact Food Product Truth is currently available.')
  if (!productGroups('drinks').length) warnings.push('No approved exact Drink Product Truth is currently available.')
  if (!venues.length) warnings.push('No approved Venue Truth is currently available.')

  return {
    client_id: clientId,
    generated_at: new Date().toISOString(),
    assets,
    food: productGroups('food'),
    drinks: productGroups('drinks'),
    venues,
    people: namedSubjects('people'),
    pets: namedSubjects('pets'),
    brand_truth: { available: (brandResult.data ?? []).length > 0, record_count: (brandResult.data ?? []).length },
    activations,
    anonymous_human_policy: 'allowed_without_named_likeness_truth',
    warnings,
  }
}

function planningMetadata(item: PlanItemLike) {
  const metadata = item.metadata ?? {}
  return isRecord(metadata.planning_ai) ? metadata.planning_ai : {}
}

function subjectMenuIds(item: PlanItemLike) {
  return stringList(planningMetadata(item).menu_item_ids, 12)
}

function supportingAssetIds(item: PlanItemLike) {
  return stringList(planningMetadata(item).supporting_product_asset_ids, 12)
}

function requiresSupportingProducts(item: PlanItemLike) {
  const planning = planningMetadata(item)
  if (planning.scene_requires_visible_products === true) return true
  return item.pillar === 'lifestyle' && /\b(dining|dinner|lunch|breakfast|table|gathering|guest|guests|meal|sharing)\b/i.test(`${item.subject} ${item.creative_concept}`)
}

function namedPersonRequired(item: PlanItemLike) {
  const identity = planningMetadata(item).subject_identity
  return (isRecord(identity) && identity.type === 'person')
    || /\b(?:chef|staff|waiter|waitress|bartender)\s+[A-Z][a-z]+\b/.test(`${item.subject} ${item.creative_concept}`)
}

function petRequired(item: PlanItemLike) {
  const identity = planningMetadata(item).subject_identity
  // Generic pets are allowed when planning truth establishes the positioning.
  // Production needs Pet Truth only for a specific identifiable animal.
  return (isRecord(identity) && identity.type === 'animal')
    || /\b(?:our|client(?:'s)?|named|beloved)\s+(?:dog|pet|animal)\b/i.test(`${item.subject} ${item.creative_concept}`)
}

function activationId(item: PlanItemLike) {
  const identity = planningMetadata(item).subject_identity
  return stringValue(item.activation_record_id, 80)
    || (isRecord(identity) ? stringValue(identity.activation_record_id, 80) || stringValue(identity.canonical_id, 80) : '')
}

function labelFor(state: CapabilityState) {
  return ({
    production_ready: 'Production Ready',
    production_ready_with_supporting_truth: 'Production Ready With Supporting Truth',
    missing_product_truth: 'Missing Product Truth',
    needs_supporting_food_drink: 'Needs Supporting Food/Drink',
    missing_venue_truth: 'Missing Venue Truth',
    missing_person_truth: 'Missing Person Truth',
    missing_pet_truth: 'Missing Pet Truth',
    invalid_existing_asset: 'Existing Asset Unavailable',
    conceptual_only: 'Conceptual Only',
  } as const)[state]
}

/** Read-only feasibility evaluation shared by plan generation, plan display and production. */
export function assessMonthlyPlanProductionFeasibility(item: PlanItemLike, inventory: ProductionCapabilityInventory): MonthlyPlanProductionFeasibility {
  if (item.production_method === 'other') return { state: 'conceptual_only', label: labelFor('conceptual_only'), reasons: ['This concept is intentionally outside the current production workflow.'], primary_asset_ids: [], supporting_asset_ids: [] }
  const requiredAssets = new Set(Array.isArray(item.required_assets) ? item.required_assets : [])
  const menuIds = subjectMenuIds(item)
  const subjectProduct = [...inventory.food, ...inventory.drinks].find(product => menuIds.includes(product.menu_item_id))
  const primaryAssetIds = subjectProduct?.asset_ids ?? []
  const selectedPrimary = primaryAssetIds.filter(id => requiredAssets.has(id))

  if (['food', 'drinks'].includes(item.pillar)) {
    if (!subjectProduct) return { state: 'missing_product_truth', label: labelFor('missing_product_truth'), reasons: [`${item.subject || 'This named menu item'} has no approved exact Product Truth.`], primary_asset_ids: [], supporting_asset_ids: [] }
    if (item.production_method === 'existing_asset' && !selectedPrimary.length) return { state: 'invalid_existing_asset', label: labelFor('invalid_existing_asset'), reasons: ['Existing Asset requires one approved exact Product Truth asset to be selected.'], primary_asset_ids: primaryAssetIds, supporting_asset_ids: [] }
    return { state: 'production_ready', label: labelFor('production_ready'), reasons: [], primary_asset_ids: primaryAssetIds, supporting_asset_ids: [] }
  }

  if (item.pillar === 'events') {
    if (item.production_method === 'graphic_design' || item.production_method === 'photo_graphic_overlay') {
      return { state: 'conceptual_only', label: labelFor('conceptual_only'), reasons: ['This activation is currently a graphic-led concept, not an Individual Production image package.'], primary_asset_ids: [], supporting_asset_ids: [] }
    }
    const activation = inventory.activations.find(candidate => candidate.id === activationId(item))
    if (!activation || activation.product_truth_status !== 'confirmed' || !activation.visual_truth_available) {
      return { state: 'missing_product_truth', label: labelFor('missing_product_truth'), reasons: ['This activation has no confirmed product with approved exact Product Truth.'], primary_asset_ids: [], supporting_asset_ids: [] }
    }
    return { state: 'production_ready', label: labelFor('production_ready'), reasons: [], primary_asset_ids: [], supporting_asset_ids: [] }
  }

  const needsVenue = ['lifestyle', 'bts_service', 'interiors'].includes(item.pillar)
  const reasons: string[] = []
  // Planning only establishes whether the client has approved venue truth. The
  // production package later selects the one appropriate interior/exterior
  // reference; requiring a preselected file here made the two stages disagree.
  const missingVenue = needsVenue && !inventory.venues.length
  const missingPerson = namedPersonRequired(item) && ![...requiredAssets].some(id => inventory.people.some(person => person.asset_ids.includes(id)))
  const missingPet = petRequired(item) && ![...requiredAssets].some(id => inventory.pets.some(pet => pet.asset_ids.includes(id)))
  if (missingVenue) reasons.push('No approved Venue Truth is currently available for this visible client environment.')
  if (missingPerson) reasons.push('A named person requires approved likeness truth.')
  if (missingPet) reasons.push('A dog or other named pet requires approved pet truth.')
  const supportingIds = supportingAssetIds(item)
  if (requiresSupportingProducts(item)) {
    const approvedSupporting = supportingIds.filter(id => inventory.assets.some(asset => (asset.category === 'food' || asset.category === 'drinks') && asset.id === id))
    if (!approvedSupporting.length) reasons.push('Visible dining products need selected approved Food or Drink Truth.')
    if (reasons.length) {
      const state: CapabilityState = missingPet ? 'missing_pet_truth' : missingPerson ? 'missing_person_truth' : missingVenue ? 'missing_venue_truth' : 'needs_supporting_food_drink'
      return { state, label: labelFor(state), reasons, primary_asset_ids: [], supporting_asset_ids: approvedSupporting }
    }
    return { state: 'production_ready_with_supporting_truth', label: labelFor('production_ready_with_supporting_truth'), reasons: [], primary_asset_ids: [], supporting_asset_ids: approvedSupporting }
  }
  if (reasons.length) {
    const state: CapabilityState = missingPet ? 'missing_pet_truth' : missingPerson ? 'missing_person_truth' : 'missing_venue_truth'
    return { state, label: labelFor(state), reasons, primary_asset_ids: [], supporting_asset_ids: [] }
  }
  return { state: 'production_ready', label: labelFor('production_ready'), reasons: [], primary_asset_ids: [], supporting_asset_ids: [] }
}

export function isProductionFeasible(feasibility: MonthlyPlanProductionFeasibility) {
  return feasibility.state === 'production_ready' || feasibility.state === 'production_ready_with_supporting_truth'
}

/**
 * A planning decision can be strategically valid before it is ready for strict
 * Individual Production. This is the non-blocking bridge shown in Feed Plan.
 */
export function assessMonthlyPlanningReadiness(item: PlanItemLike, inventory: ProductionCapabilityInventory): MonthlyPlanningReadiness {
  const planning = planningMetadata(item)
  const stored = isRecord(planning.planning_readiness) ? planning.planning_readiness : null
  if (stored && typeof stored.state === 'string' && ['ready', 'needs_review', 'needs_production_setup', 'blocked'].includes(stored.state)) {
    const state = stored.state as MonthlyPlanningReadiness['state']
    const label = state === 'ready' ? 'Ready' : state === 'needs_review' ? 'Needs Review' : state === 'needs_production_setup' ? 'Setup Needed' : 'Blocked'
    return { state, label, reason: stringValue(stored.reason, 1_000) || null }
  }
  const feasibility = assessMonthlyPlanProductionFeasibility(item, inventory)
  if (isProductionFeasible(feasibility)) return { state: 'ready', label: 'Ready', reason: null }
  return {
    state: 'needs_production_setup',
    label: 'Setup Needed',
    reason: stringValue(item.missing_asset_note, 1_000) || feasibility.reasons[0] || 'Production inputs need review before this concept can be made.',
  }
}

export function runMonthlyProductionCapabilityFixtures() {
  const inventory: ProductionCapabilityInventory = {
    client_id: 'fixture', generated_at: '2026-01-01T00:00:00.000Z', assets: [
      { id: 'cotoletta-asset', name: 'Cotoletta alla milanese', category: 'food', canonical_menu_item_id: 'cotoletta', canonical_menu_item_name: 'Cotoletta alla milanese', perspective_flexibility: null, metadata_complete: true },
      { id: 'juice-asset', name: 'Juice', category: 'drinks', canonical_menu_item_id: 'juice', canonical_menu_item_name: 'Juice', perspective_flexibility: null, metadata_complete: true },
      { id: 'terrace', name: 'Terrace', category: 'exteriors', canonical_menu_item_id: null, canonical_menu_item_name: null, perspective_flexibility: null, metadata_complete: true },
    ], food: [{ menu_item_id: 'cotoletta', canonical_name: 'Cotoletta alla milanese', menu_section: 'Mains', asset_ids: ['cotoletta-asset'], metadata_complete: true, perspective_flexibility: [] }], drinks: [{ menu_item_id: 'juice', canonical_name: 'Juice', menu_section: 'Drinks', asset_ids: ['juice-asset'], metadata_complete: true, perspective_flexibility: [] }], venues: [{ zone: 'Terrace', category: 'exteriors', asset_ids: ['terrace'] }], people: [], pets: [], brand_truth: { available: true, record_count: 1 }, activations: [], anonymous_human_policy: 'allowed_without_named_likeness_truth', warnings: [],
  }
  const inspect = (name: string, item: PlanItemLike, expected: CapabilityState) => {
    const result = assessMonthlyPlanProductionFeasibility(item, inventory)
    return { name, expected, outcome: result.state, passed: result.state === expected }
  }
  return [
    inspect('Tartare without exact truth is invalid', { pillar: 'food', subject: 'Tartare', creative_concept: '', production_method: 'ai_photography', metadata: { planning_ai: { menu_item_ids: ['tartare'] } } }, 'missing_product_truth'),
    inspect('Cotoletta with exact truth is ready', { pillar: 'food', subject: 'Cotoletta', creative_concept: '', production_method: 'ai_photography', required_assets: ['cotoletta-asset'], metadata: { planning_ai: { menu_item_ids: ['cotoletta'] } } }, 'production_ready'),
    inspect('Lifestyle dining uses available venue truth and selected supporting truth', { pillar: 'lifestyle', subject: 'Terrace gathering', creative_concept: 'Dinner table', production_method: 'ai_photography', required_assets: [], metadata: { planning_ai: { scene_requires_visible_products: true, supporting_product_asset_ids: ['cotoletta-asset', 'juice-asset'] } } }, 'production_ready_with_supporting_truth'),
    inspect('Lifestyle dining with no support is blocked', { pillar: 'lifestyle', subject: 'Terrace gathering', creative_concept: 'Dinner table', production_method: 'ai_photography', required_assets: [], metadata: { planning_ai: { scene_requires_visible_products: true } } }, 'needs_supporting_food_drink'),
    inspect('Existing asset cannot be claimed without a selected exact asset', { pillar: 'food', subject: 'Cotoletta', creative_concept: '', production_method: 'existing_asset', metadata: { planning_ai: { menu_item_ids: ['cotoletta'] } } }, 'invalid_existing_asset'),
  ]
}

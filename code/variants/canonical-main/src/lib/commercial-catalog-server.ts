import 'server-only'

import { clientBrainV2ServerClient as db, isUuid } from '@/lib/client-brain-v2-server-core'
import { isCommercialBillingUnit, isCommercialPricingModel, isCommercialServiceState, type CommercialCatalogSnapshot, type CommercialCombination, type CommercialProduct, type CommercialProductRelationship } from '@/lib/commercial-catalog'

export class CommercialCatalogError extends Error { constructor(message: string, public status = 400) { super(message) } }

// The catalog migration ships independently of generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const catalogDb = db as any
const productColumns = 'id,slug,name,catalog_type,family,summary,price_amount,currency,billing_unit,pricing_model,minimum_commitment_months,requires_standard,max_eligible,service_state,availability_note,scope_notes,includes,requirements,exclusions,metadata,position,active,created_at,updated_at'

const string = (value: unknown, label: string, max = 2000, required = false) => {
  if (typeof value !== 'string') { if (required) throw new CommercialCatalogError(`${label} is required.`); return '' }
  const clean = value.trim()
  if (clean.length > max) throw new CommercialCatalogError(`${label} is too long.`)
  if (required && !clean) throw new CommercialCatalogError(`${label} is required.`)
  return clean
}

function stringList(value: unknown, label: string, maxItems = 40) {
  if (!Array.isArray(value)) throw new CommercialCatalogError(`${label} must be a list.`)
  if (value.length > maxItems) throw new CommercialCatalogError(`${label} has too many items.`)
  return value.map(item => string(item, label, 360, true))
}

function numberOrNull(value: unknown, label: string) {
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new CommercialCatalogError(`${label} is invalid.`)
  return Math.round(parsed * 100) / 100
}

function normaliseProduct(row: Record<string, unknown>, roadmapPhases: CommercialProduct['roadmap_phases'], relationships: CommercialProductRelationship[]): CommercialProduct {
  return {
    ...row,
    catalog_type: row.catalog_type as CommercialProduct['catalog_type'],
    family: typeof row.family === 'string' ? row.family : null,
    price_amount: row.price_amount === null ? null : Number(row.price_amount),
    billing_unit: row.billing_unit as CommercialProduct['billing_unit'],
    pricing_model: row.pricing_model as CommercialProduct['pricing_model'],
    minimum_commitment_months: row.minimum_commitment_months === null ? null : Number(row.minimum_commitment_months),
    requires_standard: row.requires_standard === true,
    max_eligible: row.max_eligible === true,
    service_state: row.service_state as CommercialProduct['service_state'],
    availability_note: typeof row.availability_note === 'string' ? row.availability_note : null,
    scope_notes: typeof row.scope_notes === 'string' ? row.scope_notes : null,
    includes: Array.isArray(row.includes) ? row.includes.filter((item): item is string => typeof item === 'string') : [],
    requirements: Array.isArray(row.requirements) ? row.requirements.filter((item): item is string => typeof item === 'string') : [],
    exclusions: Array.isArray(row.exclusions) ? row.exclusions.filter((item): item is string => typeof item === 'string') : [],
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    roadmap_phases: roadmapPhases,
    relationships,
  } as CommercialProduct
}

export async function loadCommercialCatalogSnapshot(): Promise<CommercialCatalogSnapshot> {
  const [productsResult, relationshipsResult, phaseLinksResult, phasesResult, combinationsResult, combinationItemsResult] = await Promise.all([
    catalogDb.from('commercial_products').select(productColumns).eq('active', true).order('position').order('name'),
    catalogDb.from('commercial_product_relationships').select('id,product_id,related_product_id,relationship_type,note'),
    catalogDb.from('commercial_product_roadmap_phases').select('product_id,roadmap_phase_id,relationship_type'),
    catalogDb.from('roadmap_phases').select('id,name'),
    catalogDb.from('commercial_recommended_combinations').select('id,slug,name,description,position').eq('active', true).order('position'),
    catalogDb.from('commercial_recommended_combination_items').select('combination_id,product_id,position').order('position'),
  ])
  for (const result of [productsResult, relationshipsResult, phaseLinksResult, phasesResult, combinationsResult, combinationItemsResult]) {
    if (result.error) throw new CommercialCatalogError('Commercial catalog could not be loaded.', 500)
  }
  const productRows = (productsResult.data ?? []) as Record<string, unknown>[]
  const productsById = new Map(productRows.map(row => [String(row.id), row]))
  const phaseNames = new Map(((phasesResult.data ?? []) as Array<{ id: string; name: string }>).map(phase => [phase.id, phase.name]))
  const phaseMap = new Map<string, CommercialProduct['roadmap_phases']>()
  for (const link of (phaseLinksResult.data ?? []) as Array<{ product_id: string; roadmap_phase_id: string; relationship_type: 'supports' | 'candidate_for' }>) {
    const name = phaseNames.get(link.roadmap_phase_id)
    if (!name) continue
    const current = phaseMap.get(link.product_id) ?? []
    current.push({ id: link.roadmap_phase_id, name, relationship_type: link.relationship_type })
    phaseMap.set(link.product_id, current)
  }
  const relationshipMap = new Map<string, CommercialProductRelationship[]>()
  for (const relation of (relationshipsResult.data ?? []) as Array<{ id: string; product_id: string; related_product_id: string; relationship_type: CommercialProductRelationship['relationship_type']; note: string | null }>) {
    const related = productsById.get(relation.related_product_id)
    if (!related) continue
    const current = relationshipMap.get(relation.product_id) ?? []
    current.push({ id: relation.id, relationship_type: relation.relationship_type, note: relation.note, related_product_id: relation.related_product_id, related_product_name: String(related.name), related_product_slug: String(related.slug) })
    relationshipMap.set(relation.product_id, current)
  }
  const products = productRows.map(row => normaliseProduct(row, phaseMap.get(String(row.id)) ?? [], relationshipMap.get(String(row.id)) ?? []))
  const productMap = new Map(products.map(product => [product.id, product]))
  const combinationItems = new Map<string, CommercialCombination['products']>()
  for (const item of (combinationItemsResult.data ?? []) as Array<{ combination_id: string; product_id: string }>) {
    const product = productMap.get(item.product_id)
    if (!product) continue
    const current = combinationItems.get(item.combination_id) ?? []
    current.push({ id: product.id, slug: product.slug, name: product.name, price_amount: product.price_amount, billing_unit: product.billing_unit, service_state: product.service_state })
    combinationItems.set(item.combination_id, current)
  }
  const combinations = ((combinationsResult.data ?? []) as Array<Omit<CommercialCombination, 'products'>>).map(combo => ({ ...combo, products: combinationItems.get(combo.id) ?? [] }))
  return { products, combinations, generatedAt: new Date().toISOString() }
}

export async function updateCommercialProduct(productId: string, input: Record<string, unknown>) {
  if (!isUuid(productId)) throw new CommercialCatalogError('Product ID is invalid.')
  const expectedUpdatedAt = string(input.expectedUpdatedAt, 'Expected update timestamp', 80)
  const { data: current, error: currentError } = await catalogDb.from('commercial_products').select(productColumns).eq('id', productId).maybeSingle()
  if (currentError || !current) throw new CommercialCatalogError('Commercial product was not found.', 404)
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) throw new CommercialCatalogError('This product changed elsewhere. Refresh before saving.', 409)
  const patch: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(input, 'summary')) patch.summary = string(input.summary, 'Summary', 1000, true)
  if (Object.prototype.hasOwnProperty.call(input, 'price_amount')) patch.price_amount = numberOrNull(input.price_amount, 'Price')
  if (Object.prototype.hasOwnProperty.call(input, 'billing_unit')) { if (!isCommercialBillingUnit(input.billing_unit)) throw new CommercialCatalogError('Billing unit is invalid.'); patch.billing_unit = input.billing_unit }
  if (Object.prototype.hasOwnProperty.call(input, 'pricing_model')) { if (!isCommercialPricingModel(input.pricing_model)) throw new CommercialCatalogError('Pricing model is invalid.'); patch.pricing_model = input.pricing_model }
  if (Object.prototype.hasOwnProperty.call(input, 'service_state')) { if (!isCommercialServiceState(input.service_state)) throw new CommercialCatalogError('Availability status is invalid.'); patch.service_state = input.service_state }
  if (Object.prototype.hasOwnProperty.call(input, 'availability_note')) patch.availability_note = string(input.availability_note, 'Availability note', 1000) || null
  if (Object.prototype.hasOwnProperty.call(input, 'scope_notes')) patch.scope_notes = string(input.scope_notes, 'Scope note', 1200) || null
  if (Object.prototype.hasOwnProperty.call(input, 'includes')) patch.includes = stringList(input.includes, 'Includes')
  if (Object.prototype.hasOwnProperty.call(input, 'requirements')) patch.requirements = stringList(input.requirements, 'Requirements')
  if (Object.prototype.hasOwnProperty.call(input, 'exclusions')) patch.exclusions = stringList(input.exclusions, 'Exclusions')
  if (Object.keys(patch).length === 0) throw new CommercialCatalogError('No supported product fields were supplied.')
  const { error: updateError } = await catalogDb.from('commercial_products').update(patch).eq('id', productId)
  if (updateError) throw new CommercialCatalogError('Commercial product could not be saved.', 500)
  return loadCommercialCatalogSnapshot()
}

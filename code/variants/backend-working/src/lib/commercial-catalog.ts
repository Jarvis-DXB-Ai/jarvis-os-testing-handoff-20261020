export const COMMERCIAL_SERVICE_STATES = ['available', 'hybrid', 'planned'] as const
export const COMMERCIAL_BILLING_UNITS = ['month', 'video', 'custom'] as const
export const COMMERCIAL_PRICING_MODELS = ['fixed', 'working', 'calculated', 'custom'] as const

export type CommercialServiceState = typeof COMMERCIAL_SERVICE_STATES[number]
export type CommercialBillingUnit = typeof COMMERCIAL_BILLING_UNITS[number]
export type CommercialPricingModel = typeof COMMERCIAL_PRICING_MODELS[number]
export type CommercialCatalogType = 'package' | 'addon' | 'enterprise'

export type CommercialRoadmapPhase = { id: string; name: string; relationship_type: 'supports' | 'candidate_for' }
export type CommercialProductRelationship = { id: string; relationship_type: 'requires' | 'enhances' | 'replaces' | 'excludes'; note: string | null; related_product_id: string; related_product_name: string; related_product_slug: string }

export type CommercialProduct = {
  id: string
  slug: string
  name: string
  catalog_type: CommercialCatalogType
  family: string | null
  summary: string
  price_amount: number | null
  currency: string
  billing_unit: CommercialBillingUnit
  pricing_model: CommercialPricingModel
  minimum_commitment_months: number | null
  requires_standard: boolean
  max_eligible: boolean
  service_state: CommercialServiceState
  availability_note: string | null
  scope_notes: string | null
  includes: string[]
  requirements: string[]
  exclusions: string[]
  metadata: Record<string, unknown>
  position: number
  active: boolean
  created_at: string
  updated_at: string
  roadmap_phases: CommercialRoadmapPhase[]
  relationships: CommercialProductRelationship[]
}

export type CommercialCombination = {
  id: string
  slug: string
  name: string
  description: string
  position: number
  products: Array<{ id: string; slug: string; name: string; price_amount: number | null; billing_unit: CommercialBillingUnit; service_state: CommercialServiceState }>
}

export type CommercialCatalogSnapshot = {
  products: CommercialProduct[]
  combinations: CommercialCombination[]
  generatedAt: string
}

export const isCommercialServiceState = (value: unknown): value is CommercialServiceState => typeof value === 'string' && COMMERCIAL_SERVICE_STATES.includes(value as CommercialServiceState)
export const isCommercialBillingUnit = (value: unknown): value is CommercialBillingUnit => typeof value === 'string' && COMMERCIAL_BILLING_UNITS.includes(value as CommercialBillingUnit)
export const isCommercialPricingModel = (value: unknown): value is CommercialPricingModel => typeof value === 'string' && COMMERCIAL_PRICING_MODELS.includes(value as CommercialPricingModel)

export function commercialStateLabel(value: CommercialServiceState) {
  return value === 'available' ? 'Available now' : value === 'hybrid' ? 'Hybrid delivery' : 'Planned'
}

export function commercialStateClass(value: CommercialServiceState) {
  return value === 'available'
    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
    : value === 'hybrid'
      ? 'border-sky-300/25 bg-sky-300/10 text-sky-100'
      : 'border-amber-300/25 bg-amber-300/10 text-amber-100'
}

export function commercialMoney(amount: number | null, currency = 'EUR') {
  if (amount === null) return 'Custom'
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function commercialPriceLabel(product: Pick<CommercialProduct, 'price_amount' | 'currency' | 'billing_unit' | 'pricing_model' | 'metadata'>) {
  if (product.pricing_model === 'custom') return 'Custom pricing'
  if (product.pricing_model === 'calculated') return product.billing_unit === 'month' ? 'Calculated monthly' : 'Calculated'
  const base = commercialMoney(product.price_amount, product.currency)
  const unit = product.billing_unit === 'month' ? '/ month' : product.billing_unit === 'video' ? '/ video' : ''
  const working = product.pricing_model === 'working' || product.metadata.price_label === 'Working / TBD'
  return `${base}${unit}${working ? ' · Working / TBD' : ''}`
}

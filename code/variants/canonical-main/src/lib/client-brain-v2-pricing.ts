export type RestaurantPriceOwnership = 'item' | 'menu_package' | 'activation_package' | 'not_listed'

export type RestaurantPackagePricingContext = {
  ownership: Extract<RestaurantPriceOwnership, 'menu_package' | 'activation_package'>
  ownerRecordId: string
  ownerName: string
  price: number
  currency: string | null
  inclusions: string[]
}

export type RestaurantPricingContext = {
  ownership: RestaurantPriceOwnership
  itemPrice: number | null
  currency: string | null
  package: RestaurantPackagePricingContext | null
}

type PricingRecord = {
  id: string
  title: string
  subsection?: string | null
  record_type?: string | null
  metadata?: Record<string, unknown> | null
}

type MenuItemPricingInput = {
  itemKind: 'item' | 'offer_component' | 'service_rule'
  price: number | null
  currency: string | null
  menu: PricingRecord | null
  activation: PricingRecord | null
}

function recordData(record: PricingRecord) {
  const editorData = record.metadata?.editor_data
  return editorData && typeof editorData === 'object' && !Array.isArray(editorData)
    ? editorData as Record<string, unknown>
    : record.metadata ?? {}
}

function finitePrice(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim())) return Number(value)
  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : [])
    : []
}

function packageContext(record: PricingRecord, ownership: RestaurantPackagePricingContext['ownership']): RestaurantPackagePricingContext | null {
  const data = recordData(record)
  const price = finitePrice(data.price)
  if (price == null) return null
  return {
    ownership,
    ownerRecordId: record.id,
    ownerName: record.title,
    price,
    currency: stringValue(data.currency),
    inclusions: stringList(data.inclusions),
  }
}

/**
 * A source-menu row may name a component of a paid package, but its parent
 * Menu or Activation owns that price. Asset.price is reserved for item rows.
 */
export function pricingContextForOfficialMenuItem(input: MenuItemPricingInput): RestaurantPricingContext {
  if (input.itemKind === 'item' && input.price != null) {
    return { ownership: 'item', itemPrice: input.price, currency: input.currency, package: null }
  }

  const activationPackage = input.activation
    ? packageContext(input.activation, 'activation_package')
    : null
  if (activationPackage) {
    return { ownership: 'activation_package', itemPrice: null, currency: activationPackage.currency, package: activationPackage }
  }

  const menuPackage = input.menu
    ? packageContext(input.menu, 'menu_package')
    : null
  if (menuPackage) {
    return { ownership: 'menu_package', itemPrice: null, currency: menuPackage.currency, package: menuPackage }
  }

  return { ownership: 'not_listed', itemPrice: null, currency: null, package: null }
}

export function packagePricingContextForAsset(input: {
  itemPrice: number | null
  relations: Array<{ record: PricingRecord }>
}): RestaurantPackagePricingContext | null {
  if (input.itemPrice != null) return null

  const activations = input.relations
    .filter(relation => relation.record.subsection === 'activations' && relation.record.record_type === 'activation')
    .map(relation => packageContext(relation.record, 'activation_package'))
    .filter((context): context is RestaurantPackagePricingContext => Boolean(context))
  if (activations.length) return activations[0]

  const menus = input.relations
    .filter(relation => relation.record.subsection === 'menus' && relation.record.record_type === 'menu')
    .map(relation => packageContext(relation.record, 'menu_package'))
    .filter((context): context is RestaurantPackagePricingContext => Boolean(context))
  return menus[0] ?? null
}

export function formatRestaurantPrice(price: number | string, currency: string | null | undefined) {
  const numeric = typeof price === 'number' ? price : Number(price)
  const formatted = Number.isFinite(numeric)
    ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(numeric)
    : String(price)
  return `${currency?.trim().toUpperCase() || 'AED'} ${formatted}`
}

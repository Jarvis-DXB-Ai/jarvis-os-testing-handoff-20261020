import 'server-only'

import {
  pricingContextForOfficialMenuItem,
  type RestaurantPricingContext,
} from '@/lib/client-brain-v2-pricing'
import {
  normalizeOfficialMenuName,
  rankOfficialMenuNameMatches,
  type OfficialMenuNameMatchType,
} from '@/lib/client-brain-v2-menu-name-match'
import { clientBrainV2ServerClient } from '@/lib/client-brain-v2-server'

export type MenuItemTruth = {
  id: string
  client_id: string
  menu_record_id: string
  activation_record_id: string | null
  source_record_id: string
  source_file_object_id: string | null
  item_kind: 'item' | 'offer_component' | 'service_rule'
  canonical_name: string
  normalized_name: string
  aliases: string[]
  menu_section: string | null
  description: string | null
  price: number | null
  currency: string | null
  listed_ingredients: string[]
  allergens: string[]
  dietary_markers: string[]
  notes: string | null
  raw_source_text: string | null
  source_page: number | null
  source_document_version: string
  source_status: 'current' | 'historical' | 'superseded' | 'conflicting'
  metadata: Record<string, unknown>
}

export type MenuMatchCandidate = MenuItemTruth & {
  matchType: OfficialMenuNameMatchType
  score: number
}

export type MenuMatchResult = {
  status: 'exact_match' | 'strong_match' | 'multiple_matches' | 'no_match'
  searchedName: string
  candidates: MenuMatchCandidate[]
  searchedMenuRecordIds: string[]
  searchedActivationRecordIds: string[]
}

type PricingParentRecord = {
  id: string
  title: string
  subsection: string | null
  record_type: string | null
  metadata: Record<string, unknown> | null
}

export { normalizeOfficialMenuName }

export async function findOfficialMenuMatches(input: {
  clientId: string
  name: string
  menuRecordIds: string[]
  activationRecordIds?: string[]
}) : Promise<MenuMatchResult> {
  const searchedName = input.name.trim()
  const searchedMenuRecordIds = [...new Set(input.menuRecordIds)]
  const searchedActivationRecordIds = [...new Set(input.activationRecordIds ?? [])]
  if (!searchedName) {
    return { status: 'no_match', searchedName, candidates: [], searchedMenuRecordIds, searchedActivationRecordIds }
  }

  let query = clientBrainV2ServerClient
    .from('client_brain_v2_menu_items')
    .select('*')
    .eq('client_id', input.clientId)
    .eq('source_status', 'current')

  // An Asset may not yet know which menu it belongs to. Search the client's
  // complete current official menu library first; applying a chosen result
  // adds the precise menu/source links to the unsaved metadata draft.
  if (searchedMenuRecordIds.length) query = query.in('menu_record_id', searchedMenuRecordIds)

  if (searchedActivationRecordIds.length) {
    query = query.or(`activation_record_id.is.null,activation_record_id.in.(${searchedActivationRecordIds.join(',')})`)
  } else {
    query = query.is('activation_record_id', null)
  }

  const { data, error } = await query.limit(500)
  if (error) throw new Error('Unable to search official menu items.')
  const candidates = rankOfficialMenuNameMatches(data as MenuItemTruth[], searchedName) as MenuMatchCandidate[]

  const exact = candidates.filter(candidate => candidate.matchType === 'exact_name' || candidate.matchType === 'exact_alias')
  if (exact.length === 1) return { status: 'exact_match', searchedName, candidates: exact, searchedMenuRecordIds, searchedActivationRecordIds }
  if (exact.length > 1) return { status: 'multiple_matches', searchedName, candidates: exact, searchedMenuRecordIds, searchedActivationRecordIds }
  if (!candidates.length) return { status: 'no_match', searchedName, candidates, searchedMenuRecordIds, searchedActivationRecordIds }
  if (candidates[0].score >= 0.86 && (!candidates[1] || candidates[0].score - candidates[1].score >= 0.07)) {
    return { status: 'strong_match', searchedName, candidates, searchedMenuRecordIds, searchedActivationRecordIds }
  }
  return { status: 'multiple_matches', searchedName, candidates, searchedMenuRecordIds, searchedActivationRecordIds }
}

export async function resolveOfficialMenuItemPricing(clientId: string, item: MenuItemTruth): Promise<RestaurantPricingContext> {
  const parentIds = [item.menu_record_id, item.activation_record_id].filter((id): id is string => Boolean(id))
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .in('id', parentIds)
  if (error) throw new Error('Unable to resolve official menu pricing ownership.')
  const parents = new Map((data ?? []).map(record => [record.id, record as PricingParentRecord]))
  return pricingContextForOfficialMenuItem({
    itemKind: item.item_kind,
    price: item.price,
    currency: item.currency,
    menu: parents.get(item.menu_record_id) ?? null,
    activation: item.activation_record_id ? parents.get(item.activation_record_id) ?? null : null,
  })
}

export function menuTruthToAssetFields(item: MenuItemTruth, category: 'food' | 'drinks', pricing: RestaurantPricingContext) {
  const shared = {
    // Only a literal menu item price belongs on an Asset. Package and
    // Activation pricing remains on its linked parent record.
    ...(pricing.ownership === 'item' && pricing.itemPrice != null
      ? { price: String(pricing.itemPrice), currency: pricing.currency ?? item.currency ?? 'AED' }
      : {}),
    ingredients: item.listed_ingredients ?? [],
    allergens: item.allergens ?? [],
  }
  return category === 'food'
    ? { ...shared, dish_name: item.canonical_name, menu_category: item.menu_section ?? '', dietary_information: item.dietary_markers ?? [] }
    : {
        ...shared,
        drink_name: item.canonical_name,
        drink_category: item.menu_section ?? '',
        ...(item.dietary_markers.includes('non-alcoholic') ? { alcohol_status: 'non_alcoholic' } : {}),
      }
}

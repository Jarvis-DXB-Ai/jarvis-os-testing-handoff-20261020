export const CLIENT_BRAIN_V2_BUSINESS_VERSION = 'business_v2' as const

export const CLIENT_BRAIN_V2_VERSION = 'hospitality_v2' as const
export const CLIENT_BRAIN_V2_RESTAURANT_VERSION = 'hospitality_restaurant_v2' as const

export type ClientBrainV2ArchitectureVersion =
  | typeof CLIENT_BRAIN_V2_BUSINESS_VERSION
  | typeof CLIENT_BRAIN_V2_VERSION
  | typeof CLIENT_BRAIN_V2_RESTAURANT_VERSION

export const CLIENT_BRAIN_V2_SECTIONS = [
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Stable, dynamic, operational, and time-bound knowledge about the business.',
  },
  {
    id: 'logins',
    label: 'Logins',
    description: 'Secure operational credentials. This vault is not Client Brain knowledge and is never AI-readable.',
  },
  {
    id: 'products_offers',
    label: 'Products & Offers',
    description: 'Commercial truth for what the business sells, serves, promotes, or allows guests to book.',
  },
  {
    id: 'assets',
    label: 'Assets',
    description: 'Client-owned files and references with explicit semantic and approval roles.',
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Final marketing output and history, separate from source-of-truth Assets.',
  },
  {
    id: 'brand_guidelines',
    label: 'Brand Guidelines',
    description: 'Formal rules for applying the brand consistently across copy and design.',
  },
  {
    id: 'sources',
    label: 'Sources',
    description: 'Evidence, provenance, authority, recency, and confidence behind Client Brain records.',
  },
  {
    id: 'learnings',
    label: 'Learnings',
    description: 'Evidence-backed preferences, patterns, and execution insights.',
  },
] as const

export type ClientBrainV2Section = typeof CLIENT_BRAIN_V2_SECTIONS[number]['id']

export const CLIENT_BRAIN_V2_RESTAURANT_SECTIONS = CLIENT_BRAIN_V2_SECTIONS.filter(
  section => section.id !== 'products_offers',
)

export const CLIENT_BRAIN_V2_SUBSECTIONS: Record<ClientBrainV2Section, readonly { id: string; label: string; description: string }[]> = {
  intelligence: [
    { id: 'overview', label: 'Overview', description: 'A concise operating summary of the client.' },
    { id: 'brand_identity', label: 'Brand Identity', description: 'Meaning, positioning, differentiation, principles, and voice.' },
    { id: 'audience', label: 'Audience', description: 'Segments, motivations, behaviors, and objections.' },
    { id: 'visual_dna', label: 'Visual DNA', description: 'How the creative world should feel and what it must preserve.' },
    { id: 'commercial_strategy', label: 'Commercial Strategy', description: 'Revenue priorities, channels, and dynamic commercial direction.' },
    { id: 'operations', label: 'Operations', description: 'Current factual operating information and constraints.' },
    { id: 'market_intelligence', label: 'Market Intelligence', description: 'Competitors, reputation, public perception, and opportunities.' },
    { id: 'knowledge_gaps', label: 'Knowledge Gaps', description: 'Missing, uncertain, conflicting, stale, or unsupported knowledge.' },
  ],
  products_offers: [
    { id: 'products', label: 'Products', description: 'Individual dishes, drinks, services, or bookable items.' },
    { id: 'collections', label: 'Collections', description: 'Menu families and grouped commercial ranges.' },
    { id: 'offers', label: 'Offers', description: 'Defined value propositions, set menus, and promotions.' },
    { id: 'experiences_events', label: 'Experiences & Events', description: 'Occasions, activations, and date-bound guest experiences.' },
    { id: 'packages', label: 'Packages', description: 'Bundled bookable or group propositions.' },
  ],
  assets: [
    { id: 'images', label: 'Images', description: 'Photography, truth references, creative references, and generated imagery.' },
    { id: 'video', label: 'Video', description: 'Raw, approved, generated, and reference video.' },
    { id: 'brand_files', label: 'Brand Files', description: 'Logos, artwork, templates, and design source files.' },
    { id: 'documents', label: 'Documents', description: 'Menus, reports, briefs, and operational documents.' },
    { id: 'people', label: 'People', description: 'Approved staff, talent, guests, and reusable human references.' },
  ],
  logins: [{ id: 'all', label: 'All Logins', description: 'Client-scoped secure credentials and access records.' }],
  content: [{ id: 'all', label: 'View All', description: 'Final client content organised by actual content months.' }],
  brand_guidelines: [
    { id: 'logos', label: 'Logos', description: 'Canonical wordmark and brand-mark files for branded output.' },
    { id: 'colours', label: 'Colours', description: 'Exact brand colour values and any specific usage notes.' },
    { id: 'typography', label: 'Typography', description: 'Typefaces, hierarchy, sizing, and application rules.' },
    { id: 'graphics_icons', label: 'Graphics & Icons', description: 'Reusable graphic elements, icons, patterns, illustrations, and textures.' },
  ],
  sources: [
    { id: 'all', label: 'All Sources', description: 'Browse every evidence and provenance record for this client.' },
    { id: 'files', label: 'Files', description: 'Private uploaded documents, artwork, and reference files.' },
    { id: 'urls', label: 'URLs', description: 'Official and public web sources recorded as provenance.' },
    { id: 'manual', label: 'Manual', description: 'Client-confirmed notes and internal working evidence.' },
  ],
  learnings: [
    { id: 'all', label: 'All Learnings', description: 'Browse every evidence-backed preference, pattern, and execution insight.' },
    { id: 'creative_preference', label: 'Creative Preference', description: 'Creative direction preferences supported by execution or feedback.' },
    { id: 'copy_preference', label: 'Copy Preference', description: 'Language and messaging preferences supported by feedback.' },
    { id: 'visual_preference', label: 'Visual Preference', description: 'Visual treatment preferences supported by execution or review.' },
    { id: 'brand_rule', label: 'Brand Rule', description: 'Reusable execution rules learned through confirmed feedback.' },
    { id: 'audience_insight', label: 'Audience Insight', description: 'Observed audience preferences and behavior patterns.' },
    { id: 'content_performance', label: 'Content Performance', description: 'Measured content outcomes with real evidence.' },
    { id: 'campaign_performance', label: 'Campaign Performance', description: 'Measured campaign outcomes with real evidence.' },
    { id: 'offer_performance', label: 'Offer Performance', description: 'Measured offer outcomes with real evidence.' },
    { id: 'operational_learning', label: 'Operational Learning', description: 'Repeatable operating insights.' },
    { id: 'customer_feedback', label: 'Customer Feedback', description: 'Reusable patterns in guest or client feedback.' },
    { id: 'workflow_learning', label: 'Workflow Learning', description: 'Process and execution improvements.' },
    { id: 'other', label: 'Other', description: 'Evidence-backed learnings that do not fit another category.' },
  ],
}

export const CLIENT_BRAIN_V2_RESTAURANT_INTELLIGENCE_SUBSECTIONS = [
  { id: 'overview', label: 'Overview', description: 'A concise operating summary of the restaurant.' },
  { id: 'brand_identity', label: 'Brand Identity', description: 'Meaning, positioning, differentiation, principles, and voice.' },
  { id: 'audience', label: 'Audience', description: 'Segments, motivations, behaviors, and objections.' },
  { id: 'visual_dna', label: 'Visual DNA', description: 'How the creative world should feel and what it must preserve.' },
  { id: 'commercial_strategy', label: 'Commercial Strategy', description: 'Revenue priorities, channels, and dynamic commercial direction.' },
  { id: 'menus', label: 'Menus', description: 'Service-level menu truth, availability, verification, and related food or drink assets.' },
  { id: 'activations', label: 'Activations', description: 'Current and historical offers, experiences, recurring events, and campaignable propositions.' },
  { id: 'operations', label: 'Operations', description: 'Current factual operating information and constraints.' },
  { id: 'market_intelligence', label: 'Market Intelligence', description: 'Competitors, reputation, public perception, and opportunities.' },
  { id: 'knowledge_gaps', label: 'Knowledge Gaps', description: 'Missing, uncertain, conflicting, stale, or unsupported knowledge.' },
] as const

export const CLIENT_BRAIN_V2_RESTAURANT_ASSET_SUBSECTIONS = [
  { id: 'all', label: 'All', description: 'Every restaurant asset, including records awaiting semantic classification.' },
  { id: 'food', label: 'Food', description: 'Food photography and studio food truth references.' },
  { id: 'drinks', label: 'Drinks', description: 'Drink photography and studio drink truth references.' },
  { id: 'interiors', label: 'Interiors', description: 'Interior spaces and architectural truth.' },
  { id: 'exteriors', label: 'Exteriors', description: 'Exterior, terrace, facade, and surrounding venue truth.' },
  { id: 'venue_items', label: 'Venue Items', description: 'Reusable physical venue objects such as serviceware, furniture, and signage.' },
  { id: 'staff', label: 'Staff', description: 'Approved staff identity references for future AI generation.' },
] as const

export function isClientBrainV2ArchitectureVersion(value: string | null | undefined): value is ClientBrainV2ArchitectureVersion {
  return value === CLIENT_BRAIN_V2_BUSINESS_VERSION || value === CLIENT_BRAIN_V2_VERSION || value === CLIENT_BRAIN_V2_RESTAURANT_VERSION
}

export function isRestaurantClientBrainV2(value: string | null | undefined) {
  return value === CLIENT_BRAIN_V2_RESTAURANT_VERSION
}

export function clientBrainV2SectionsForVersion(value: string | null | undefined) {
  return isRestaurantClientBrainV2(value) ? CLIENT_BRAIN_V2_RESTAURANT_SECTIONS : CLIENT_BRAIN_V2_SECTIONS
}

export function clientBrainV2SubsectionsForVersion(value: string | null | undefined, section: ClientBrainV2Section) {
  if (!isRestaurantClientBrainV2(value)) return CLIENT_BRAIN_V2_SUBSECTIONS[section]
  if (section === 'intelligence') return CLIENT_BRAIN_V2_RESTAURANT_INTELLIGENCE_SUBSECTIONS
  if (section === 'assets') return CLIENT_BRAIN_V2_RESTAURANT_ASSET_SUBSECTIONS
  return CLIENT_BRAIN_V2_SUBSECTIONS[section]
}

export type ClientBrainV2RestaurantAssetCategory = 'food' | 'drinks' | 'interiors' | 'exteriors' | 'venue_items' | 'staff' | 'unclassified'

export function humanConfirmedRestaurantAssetCategory(
  record: Pick<ClientBrainV2Record, 'metadata'>,
): ClientBrainV2RestaurantAssetCategory {
  if (record.metadata.asset_category_source !== 'human_confirmed') return 'unclassified'
  const category = String(record.metadata.asset_category ?? 'unclassified').toLowerCase()
  if (category === 'food' || category === 'drinks' || category === 'interiors' || category === 'exteriors' || category === 'venue_items' || category === 'staff') return category
  return 'unclassified'
}

export function restaurantAssetCategory(record: Pick<ClientBrainV2Record, 'metadata' | 'subsection'>): ClientBrainV2RestaurantAssetCategory {
  const raw = String(record.metadata.asset_category ?? record.metadata.legacy_asset_category ?? record.subsection ?? '').toLowerCase()
  if (raw === 'food' || raw === 'food_studio_shots') return 'food'
  if (raw === 'drinks' || raw === 'drink_studio_shots') return 'drinks'
  if (raw === 'interiors' || raw === 'interior') return 'interiors'
  if (raw === 'exteriors' || raw === 'exterior') return 'exteriors'
  if (['venue_items', 'venue_item', 'serviceware', 'tableware'].includes(raw)) return 'venue_items'
  if (['staff', 'staff_member', 'employee', 'person'].includes(raw)) return 'staff'
  return 'unclassified'
}

export const CLIENT_BRAIN_V2_STATUSES = [
  'draft', 'needs_review', 'approved', 'active', 'resolved', 'current',
  'unverified', 'conflicting', 'contradicted', 'superseded', 'historical',
  'restricted', 'archived', 'rejected',
] as const

export const CLIENT_BRAIN_V2_KNOWLEDGE_CLASSES = [
  'stable', 'dynamic', 'operational', 'temporal', 'commercial', 'asset',
  'brand_guideline', 'source', 'learning', 'knowledge_gap',
] as const

export const CLIENT_BRAIN_V2_ASSET_ROLES = [
  'truth_reference', 'creative_reference', 'approved_marketing_asset',
  'generated_asset', 'raw_asset', 'archived_asset', 'source_document',
] as const

export const CLIENT_BRAIN_V2_COMMERCIAL_TYPES = [
  'product', 'collection', 'offer', 'experience_event', 'package',
] as const

export const CLIENT_BRAIN_V2_SOURCE_TYPES = [
  'client_provided', 'document', 'official_digital', 'internal_mc_studios',
  'external_research', 'system_derived',
] as const

export const CLIENT_BRAIN_V2_SOURCE_STATUSES = [
  'current', 'needs_review', 'superseded', 'historical', 'unverified', 'conflicting',
] as const

export const CLIENT_BRAIN_V2_LEARNING_CATEGORIES = [
  'creative_preference', 'copy_preference', 'visual_preference', 'brand_rule',
  'audience_insight', 'content_performance', 'campaign_performance',
  'offer_performance', 'operational_learning', 'customer_feedback',
  'workflow_learning', 'other',
] as const

export const CLIENT_BRAIN_V2_LEARNING_STATUSES = [
  'active', 'needs_review', 'historical', 'rejected',
] as const

export const CLIENT_BRAIN_V2_KNOWLEDGE_GAP_TYPES = [
  'missing', 'uncertain', 'conflict', 'stale', 'missing_asset', 'missing_source',
] as const

export type ClientBrainV2Status = typeof CLIENT_BRAIN_V2_STATUSES[number]
export type ClientBrainV2KnowledgeClass = typeof CLIENT_BRAIN_V2_KNOWLEDGE_CLASSES[number]
export type ClientBrainV2SourceType = typeof CLIENT_BRAIN_V2_SOURCE_TYPES[number]
export type ClientBrainV2SourceStatus = typeof CLIENT_BRAIN_V2_SOURCE_STATUSES[number]
export type ClientBrainV2LearningCategory = typeof CLIENT_BRAIN_V2_LEARNING_CATEGORIES[number]
export type ClientBrainV2LearningStatus = typeof CLIENT_BRAIN_V2_LEARNING_STATUSES[number]
export type ClientBrainV2KnowledgeGapType = typeof CLIENT_BRAIN_V2_KNOWLEDGE_GAP_TYPES[number]

export const CLIENT_BRAIN_V2_OVERVIEW_FIELDS = [
  { id: 'business_venue', label: 'Business / Venue' },
  { id: 'venue_type', label: 'Venue Type' },
  { id: 'location', label: 'Location' },
  { id: 'positioning', label: 'Positioning' },
  { id: 'core_proposition', label: 'Core Proposition' },
  { id: 'primary_experience', label: 'Primary Experience' },
  { id: 'key_differentiators', label: 'Key Differentiators' },
  { id: 'current_context', label: 'Current Context' },
] as const

export type ClientBrainV2OverviewFieldId = typeof CLIENT_BRAIN_V2_OVERVIEW_FIELDS[number]['id']

export type ClientBrainV2OverviewSource = {
  record_id: string
  title: string
  status: ClientBrainV2Status
  confidence: number | null
  knowledge_class: ClientBrainV2KnowledgeClass
  last_verified_at: string | null
  review_at: string | null
  source_type: string | null
  updated_at: string
}

export type ClientBrainV2OverviewField = {
  id: ClientBrainV2OverviewFieldId
  label: string
  value: string | null
  supporting_context: string | null
  source: ClientBrainV2OverviewSource | null
}

export type ClientBrainV2Overview = {
  fields: ClientBrainV2OverviewField[]
  sources: ClientBrainV2OverviewSource[]
}

export const CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS = [
  { id: 'positioning', label: 'Positioning', group: 'brand_position' },
  { id: 'mission_purpose', label: 'Mission / Purpose', group: 'brand_position' },
  { id: 'brand_promise', label: 'Brand Promise', group: 'brand_position' },
  { id: 'personality', label: 'Personality', group: 'brand_character' },
  { id: 'values', label: 'Values', group: 'brand_character' },
  { id: 'tone_of_voice', label: 'Tone of Voice', group: 'brand_character' },
  { id: 'messaging_pillars', label: 'Messaging Pillars', group: 'brand_message' },
  { id: 'differentiators', label: 'Differentiators', group: 'brand_message' },
  { id: 'brand_is', label: 'What the Brand Is', group: 'brand_boundaries' },
  { id: 'brand_is_not', label: 'What the Brand Is Not', group: 'brand_boundaries' },
] as const

export const CLIENT_BRAIN_V2_BRAND_IDENTITY_GROUPS = [
  { id: 'brand_position', label: 'Brand Position' },
  { id: 'brand_character', label: 'Brand Character' },
  { id: 'brand_message', label: 'Brand Message' },
  { id: 'brand_boundaries', label: 'Brand Boundaries' },
] as const

export type ClientBrainV2BrandIdentityFieldId = typeof CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS[number]['id']
export type ClientBrainV2BrandIdentityGroupId = typeof CLIENT_BRAIN_V2_BRAND_IDENTITY_GROUPS[number]['id']
export type ClientBrainV2BrandIdentityFieldState = 'supported' | 'needs_confirmation' | 'not_defined'

export type ClientBrainV2BrandIdentityGap = {
  record_id: string
  title: string
  status: ClientBrainV2Status
  priority: number
  why_it_matters: string | null
  recommended_resolution: string | null
}

export type ClientBrainV2BrandIdentityField = {
  id: ClientBrainV2BrandIdentityFieldId
  label: string
  group: ClientBrainV2BrandIdentityGroupId
  value: string | null
  supporting_context: string | null
  state: ClientBrainV2BrandIdentityFieldState
  sources: ClientBrainV2OverviewSource[]
  gap: ClientBrainV2BrandIdentityGap | null
}

export type ClientBrainV2BrandIdentity = {
  fields: ClientBrainV2BrandIdentityField[]
  sources: ClientBrainV2OverviewSource[]
}

export type ClientBrainV2AudienceImportance = 'primary' | 'secondary' | 'unconfirmed'
export type ClientBrainV2AudienceFieldState = 'supported' | 'needs_confirmation' | 'not_defined'

export type ClientBrainV2AudienceSegment = {
  id: string
  name: string
  description: string | null
  importance: ClientBrainV2AudienceImportance
  motivation: string | null
  occasions: string | null
  source: ClientBrainV2OverviewSource
}

export type ClientBrainV2AudienceGap = {
  record_id: string
  title: string
  status: ClientBrainV2Status
  priority: number
  why_it_matters: string | null
  recommended_resolution: string | null
}

export type ClientBrainV2AudienceFieldId =
  | 'needs_motivations'
  | 'decision_drivers'
  | 'occasions_use_cases'
  | 'geographic_behavioral_context'
  | 'barriers_objections'

export type ClientBrainV2AudienceField = {
  id: ClientBrainV2AudienceFieldId
  label: string
  values: string[]
  supporting_context: string | null
  state: ClientBrainV2AudienceFieldState
  sources: ClientBrainV2OverviewSource[]
  gap: ClientBrainV2AudienceGap | null
}

export type ClientBrainV2Audience = {
  segments: ClientBrainV2AudienceSegment[]
  fields: ClientBrainV2AudienceField[]
  sources: ClientBrainV2OverviewSource[]
}

export const CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS = [
  { id: 'visual_identity', label: 'Visual Identity', group: 'visual_world' },
  { id: 'photography_style', label: 'Photography Style', group: 'image_language' },
  { id: 'lighting_dna', label: 'Lighting DNA', group: 'image_language' },
  { id: 'colour_grade', label: 'Colour & Grade', group: 'image_language' },
  { id: 'human_hospitality_style', label: 'Human & Hospitality Style', group: 'people_hospitality' },
  { id: 'creative_guardrails', label: 'Creative Guardrails', group: 'creative_boundaries' },
] as const

export const CLIENT_BRAIN_V2_VISUAL_DNA_GROUPS = [
  { id: 'visual_world', label: 'Visual World' },
  { id: 'image_language', label: 'Image Language' },
  { id: 'people_hospitality', label: 'People & Hospitality' },
  { id: 'creative_boundaries', label: 'Creative Boundaries' },
] as const

export type ClientBrainV2VisualDnaFieldId = typeof CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS[number]['id']
export type ClientBrainV2VisualDnaGroupId = typeof CLIENT_BRAIN_V2_VISUAL_DNA_GROUPS[number]['id']
export type ClientBrainV2VisualDnaRuleStrength = 'hard' | 'preference'

export type ClientBrainV2VisualDnaRule = {
  text: string
  strength: ClientBrainV2VisualDnaRuleStrength
}

export type ClientBrainV2VisualDnaField = {
  id: ClientBrainV2VisualDnaFieldId
  label: string
  group: ClientBrainV2VisualDnaGroupId
  values: string[]
  rules: ClientBrainV2VisualDnaRule[]
  sources: ClientBrainV2OverviewSource[]
}

export type ClientBrainV2VisualAssetReference = {
  record_id: string
  title: string
  category: string | null
  record_status: ClientBrainV2Status
  semantic_role: string
  approval_status: string
  file_name: string
  signed_url: string | null
}

export type ClientBrainV2VisualDnaGap = {
  record_id: string
  title: string
  status: ClientBrainV2Status
  priority: number
  why_it_matters: string | null
  recommended_resolution: string | null
}

export type ClientBrainV2VisualDna = {
  fields: ClientBrainV2VisualDnaField[]
  sources: ClientBrainV2OverviewSource[]
  asset_references: ClientBrainV2VisualAssetReference[]
  asset_gap: ClientBrainV2VisualDnaGap | null
}

export const CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS = [
  { id: 'business_objectives', label: 'Business Objectives', group: 'current_objectives' },
  { id: 'marketing_priorities', label: 'Marketing Priorities', group: 'current_objectives' },
  { id: 'revenue_drivers', label: 'Revenue Drivers', group: 'revenue_demand' },
  { id: 'priority_offers', label: 'Priority Offers', group: 'revenue_demand' },
  { id: 'demand_gaps', label: 'Demand Gaps', group: 'revenue_demand' },
  { id: 'customer_acquisition_priorities', label: 'Customer Acquisition Priorities', group: 'growth' },
  { id: 'retention_repeat_behaviour', label: 'Retention & Repeat Behaviour', group: 'growth' },
  { id: 'commercial_constraints', label: 'Commercial Constraints', group: 'commercial_frame' },
  { id: 'commercial_kpis', label: 'Commercial KPIs / Desired Outcomes', group: 'commercial_frame' },
] as const

export const CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_GROUPS = [
  { id: 'current_objectives', label: 'Current Objectives' },
  { id: 'revenue_demand', label: 'Revenue & Demand' },
  { id: 'growth', label: 'Growth' },
  { id: 'commercial_frame', label: 'Commercial Frame' },
] as const

export type ClientBrainV2CommercialStrategyFieldId = typeof CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS[number]['id']
export type ClientBrainV2CommercialStrategyGroupId = typeof CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_GROUPS[number]['id']
export type ClientBrainV2CommercialStrategyState = 'active' | 'needs_review' | 'historical' | 'scheduled' | 'superseded' | 'not_defined'

export type ClientBrainV2CommercialStrategySource = ClientBrainV2OverviewSource & {
  effective_date: string | null
  valid_until: string | null
  superseded_by_id: string | null
}

export type ClientBrainV2CommercialStrategyGap = {
  record_id: string
  title: string
  status: ClientBrainV2Status
  priority: number
  why_it_matters: string | null
  recommended_resolution: string | null
}

export type ClientBrainV2CommercialStrategyObject = {
  record_id: string
  title: string
  object_type: string
  subsection: string
  status: ClientBrainV2Status
  confidence: number | null
  summary: string | null
  price_amount: number | null
  currency: string | null
  last_verified_at: string | null
  review_at: string | null
  relationship: 'revenue_context' | 'priority_candidate'
}

export type ClientBrainV2CommercialStrategyField = {
  id: ClientBrainV2CommercialStrategyFieldId
  label: string
  group: ClientBrainV2CommercialStrategyGroupId
  state: ClientBrainV2CommercialStrategyState
  statements: string[]
  supporting_context: string | null
  sources: ClientBrainV2CommercialStrategySource[]
  linked_objects: ClientBrainV2CommercialStrategyObject[]
  gaps: ClientBrainV2CommercialStrategyGap[]
}

export type ClientBrainV2CommercialStrategy = {
  fields: ClientBrainV2CommercialStrategyField[]
  sources: ClientBrainV2CommercialStrategySource[]
  lifecycle_counts: Record<ClientBrainV2CommercialStrategyState, number>
}

export const CLIENT_BRAIN_V2_OPERATIONS_FIELDS = [
  { id: 'venue_location', label: 'Venue & Location', group: 'venue_access' },
  { id: 'reservations_contact', label: 'Reservations & Contact', group: 'venue_access' },
  { id: 'opening_service_hours', label: 'Opening & Service Hours', group: 'service' },
  { id: 'service_availability', label: 'Service Availability', group: 'service' },
  { id: 'capacity_booking_rules', label: 'Capacity & Booking Rules', group: 'booking_guest_rules' },
  { id: 'guest_policies', label: 'Guest Policies', group: 'booking_guest_rules' },
  { id: 'dietary_service_capabilities', label: 'Dietary & Service Capabilities', group: 'service_capabilities' },
  { id: 'operational_constraints', label: 'Operational Constraints', group: 'service_capabilities' },
] as const

export const CLIENT_BRAIN_V2_OPERATIONS_GROUPS = [
  { id: 'venue_access', label: 'Venue & Access' },
  { id: 'service', label: 'Service' },
  { id: 'booking_guest_rules', label: 'Booking & Guest Rules' },
  { id: 'service_capabilities', label: 'Service Capabilities' },
] as const

export type ClientBrainV2OperationsFieldId = typeof CLIENT_BRAIN_V2_OPERATIONS_FIELDS[number]['id']
export type ClientBrainV2OperationsGroupId = typeof CLIENT_BRAIN_V2_OPERATIONS_GROUPS[number]['id']
export type ClientBrainV2OperationsState = 'verified' | 'needs_review' | 'conflict' | 'not_defined'

export type ClientBrainV2OperationsFact = {
  label: string
  value: string
  state: ClientBrainV2OperationsState
  note: string | null
}

export type ClientBrainV2OperationsSource = ClientBrainV2CommercialStrategySource & {
  authority_rank: number
  source_role: 'evidence' | 'verification_candidate'
}

export type ClientBrainV2OperationsGap = ClientBrainV2CommercialStrategyGap

export type ClientBrainV2OperationsObject = {
  record_id: string
  title: string
  object_type: string
  subsection: string
  status: ClientBrainV2Status
  confidence: number | null
  availability: string | null
  capacity: number | null
  booking_requirements: string | null
  review_at: string | null
  relationship: 'availability_context' | 'booking_context' | 'capability_context' | 'constraint_context'
}

export type ClientBrainV2OperationsField = {
  id: ClientBrainV2OperationsFieldId
  label: string
  group: ClientBrainV2OperationsGroupId
  state: ClientBrainV2OperationsState
  facts: ClientBrainV2OperationsFact[]
  supporting_context: string | null
  sources: ClientBrainV2OperationsSource[]
  linked_objects: ClientBrainV2OperationsObject[]
  gaps: ClientBrainV2OperationsGap[]
}

export type ClientBrainV2Operations = {
  fields: ClientBrainV2OperationsField[]
  sources: ClientBrainV2OperationsSource[]
  state_counts: Record<ClientBrainV2OperationsState, number>
}

export const CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS = [
  { id: 'market_context', label: 'Market Context', group: 'market' },
  { id: 'market_trends', label: 'Market Trends', group: 'market' },
  { id: 'customer_cultural_trends', label: 'Customer & Cultural Trends', group: 'market' },
  { id: 'competitor_landscape', label: 'Competitor Landscape', group: 'competition' },
  { id: 'competitive_positioning', label: 'Competitive Positioning', group: 'competition' },
  { id: 'competitor_activity', label: 'Competitor Activity', group: 'competition' },
  { id: 'opportunities', label: 'Opportunities', group: 'strategic_signals' },
  { id: 'threats', label: 'Threats', group: 'strategic_signals' },
] as const

export const CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_GROUPS = [
  { id: 'market', label: 'Market' },
  { id: 'competition', label: 'Competition' },
  { id: 'strategic_signals', label: 'Strategic Signals' },
] as const

export type ClientBrainV2MarketIntelligenceFieldId = typeof CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS[number]['id']
export type ClientBrainV2MarketIntelligenceGroupId = typeof CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_GROUPS[number]['id']
export type ClientBrainV2MarketIntelligenceState = 'current' | 'needs_review' | 'historical' | 'expired' | 'superseded' | 'not_defined'
export type ClientBrainV2MarketSignalKind = 'observation' | 'analysis' | 'opportunity' | 'threat'

export type ClientBrainV2MarketSignal = {
  text: string
  kind: ClientBrainV2MarketSignalKind
  status: ClientBrainV2MarketIntelligenceState
  confidence: number | null
  observed_at: string | null
  source_record_id: string | null
}

export type ClientBrainV2Competitor = {
  name: string
  comparison_set: string
  classification: 'direct' | 'indirect' | 'aspirational' | 'unclassified'
  status: ClientBrainV2MarketIntelligenceState
  confidence: number | null
  observed_at: string | null
  source_record_id: string
}

export type ClientBrainV2MarketSource = ClientBrainV2CommercialStrategySource & {
  authority_rank: number
  source_role: 'evidence' | 'verification_candidate'
  observed_at: string | null
}

export type ClientBrainV2MarketGap = ClientBrainV2CommercialStrategyGap

export type ClientBrainV2MarketIntelligenceField = {
  id: ClientBrainV2MarketIntelligenceFieldId
  label: string
  group: ClientBrainV2MarketIntelligenceGroupId
  state: ClientBrainV2MarketIntelligenceState
  signals: ClientBrainV2MarketSignal[]
  competitors: ClientBrainV2Competitor[]
  supporting_context: string | null
  sources: ClientBrainV2MarketSource[]
  gaps: ClientBrainV2MarketGap[]
}

export type ClientBrainV2MarketIntelligence = {
  fields: ClientBrainV2MarketIntelligenceField[]
  sources: ClientBrainV2MarketSource[]
  state_counts: Record<ClientBrainV2MarketIntelligenceState, number>
}

export type ClientBrainV2KnowledgeGapLifecycle = 'open' | 'in_review' | 'blocked' | 'resolved' | 'dismissed' | 'superseded'
export type ClientBrainV2KnowledgeGapPriority = 'high' | 'medium' | 'low'

export type ClientBrainV2KnowledgeGapRelationship = {
  relationship: 'related_area' | 'source_record' | 'superseded_by'
  label: string
  record_id: string | null
}

export type ClientBrainV2KnowledgeGapItem = {
  record_id: string
  stable_key: string
  title: string
  gap_type: ClientBrainV2KnowledgeGapType
  lifecycle: ClientBrainV2KnowledgeGapLifecycle
  source_status: ClientBrainV2Status
  priority: number
  priority_band: ClientBrainV2KnowledgeGapPriority
  related_area_id: string
  related_area_label: string
  description: string | null
  why_it_matters: string | null
  recommended_resolution: string | null
  resolution_question: string
  confidence: number | null
  source_type: string | null
  provenance: Record<string, unknown>
  created_at: string
  updated_at: string
  relationships: ClientBrainV2KnowledgeGapRelationship[]
}

export type ClientBrainV2KnowledgeGapWorkspace = {
  gaps: ClientBrainV2KnowledgeGapItem[]
  counts: {
    total: number
    by_type: Record<ClientBrainV2KnowledgeGapType, number>
    by_priority: Record<ClientBrainV2KnowledgeGapPriority, number>
    by_lifecycle: Record<ClientBrainV2KnowledgeGapLifecycle, number>
    by_area: Record<string, number>
  }
  duplicate_audit: {
    equivalent_active_groups: string[][]
    superseded_count: number
  }
}

export type ClientBrainV2Record = {
  id: string
  client_id: string
  stable_key: string
  top_section: ClientBrainV2Section
  subsection: string
  record_type: string
  title: string
  summary: string | null
  content: string | null
  knowledge_class: ClientBrainV2KnowledgeClass
  status: ClientBrainV2Status
  confidence: number | null
  priority: number
  effective_date: string | null
  last_verified_at: string | null
  valid_until: string | null
  review_at: string | null
  source_type: string | null
  provenance: Record<string, unknown>
  superseded_by_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  commercial?: ClientBrainV2CommercialDetails | null
  files?: ClientBrainV2File[]
  legacy_asset?: ClientBrainV2LegacyAsset | null
  relationships?: ClientBrainV2RecordRelationship[]
  versions?: ClientBrainV2RecordVersion[]
  activation_temporal?: ClientBrainV2ActivationTemporalResolution
}

export type ClientBrainV2ActivationTemporalStatus =
  | 'current'
  | 'scheduled'
  | 'needs_review'
  | 'expired'
  | 'historical'
  | 'superseded'

export type ClientBrainV2ActivationTemporalResolution = {
  status: ClientBrainV2ActivationTemporalStatus
  trust_line: string
  evidence_line: string
  eligible_for_current_retrieval: boolean
  start_date: string | null
  valid_until: string | null
  last_verified: string | null
  review_date: string | null
  source_statuses: string[]
}

export type ClientBrainV2CommercialDetails = {
  object_type: typeof CLIENT_BRAIN_V2_COMMERCIAL_TYPES[number]
  price_amount: number | null
  currency: string | null
  pricing_mechanism: string | null
  availability: string | null
  schedule: Record<string, unknown>
  restrictions: string | null
  capacity: number | null
  booking_requirements: string | null
  ingredients: string[]
  allergens: string[]
  key_selling_points: string[]
  metadata: Record<string, unknown>
}

export type ClientBrainV2File = {
  id: string
  file_object_id?: string
  semantic_role: string
  approval_status: string
  file_name: string
  file_type: string | null
  storage_path: string
  preview_path: string | null
  optimized_path: string | null
  signed_url: string | null
  file_size_bytes?: number | null
  width?: number | null
  height?: number | null
  metadata?: Record<string, unknown>
}

export type ClientBrainV2AssetListFile = Pick<
  ClientBrainV2File,
  'id' | 'semantic_role' | 'approval_status' | 'file_name' | 'file_type'
>

export type ClientBrainV2AssetListRecord = Pick<
  ClientBrainV2Record,
  'id' | 'client_id' | 'stable_key' | 'top_section' | 'subsection' | 'record_type' | 'title' | 'status' | 'priority' | 'updated_at'
> & {
  metadata: {
    asset_category: string
    asset_category_source: string | null
    legacy_asset_category: string | null
    approved_for_generation: boolean
    dish_name: string | null
    drink_name: string | null
    menu_display_name: string | null
    menu_category: string | null
    drink_category: string | null
    price: string | null
    currency: string | null
    package_price: string | null
    package_currency: string | null
    staff_name: string | null
    staff_position: string | null
    staff_department: string | null
    staff_active: boolean | null
  }
  files: ClientBrainV2AssetListFile[]
}

export type ClientBrainV2LegacyAsset = {
  id: string
  asset_category: string | null
  file_name: string
  file_type: string | null
  status: string | null
  original_width: number | null
  original_height: number | null
  metadata: Record<string, unknown>
}

export type ClientBrainV2RecordRelationship = {
  id: string
  relation_type: string
  direction: 'outgoing' | 'incoming'
  metadata: Record<string, unknown>
  record: Pick<ClientBrainV2Record, 'id' | 'stable_key' | 'top_section' | 'subsection' | 'record_type' | 'title' | 'summary' | 'status' | 'effective_date' | 'last_verified_at' | 'valid_until' | 'review_at' | 'source_type' | 'metadata' | 'files'>
}

export type ClientBrainV2CommercialRelationship = {
  id: string
  relation_type: string
  direction: 'outgoing' | 'incoming'
  metadata: Record<string, unknown>
  record: ClientBrainV2Record
}

export type ClientBrainV2CommercialGap = {
  record: ClientBrainV2Record
  relevance: string
}

export type ClientBrainV2RecordVersion = {
  id: string
  changed_at: string
  version_snapshot: Record<string, unknown>
}

export type ClientBrainV2CommercialDetail = {
  client: {
    id: string
    name: string
    industry: string | null
    status: string | null
  }
  record: ClientBrainV2Record
  related_commercial_objects: ClientBrainV2CommercialRelationship[]
  related_assets: ClientBrainV2CommercialRelationship[]
  sources: ClientBrainV2CommercialRelationship[]
  knowledge_gaps: ClientBrainV2CommercialGap[]
  versions: ClientBrainV2RecordVersion[]
}

export function isClientBrainV2Section(value: string | null): value is ClientBrainV2Section {
  return CLIENT_BRAIN_V2_SECTIONS.some(section => section.id === value)
}

export function humanizeClientBrainV2Value(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

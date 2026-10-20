export const INDIVIDUAL_PRODUCTION_STATUSES = ['not_started', 'blocked', 'ready', 'generating', 'generated', 'selected', 'failed', 'stale'] as const
export const INDIVIDUAL_PRODUCTION_ARTIFACT_STATUSES = ['blocked', 'ready', 'generating', 'generated', 'selected', 'failed', 'stale'] as const

export type IndividualProductionStatus = typeof INDIVIDUAL_PRODUCTION_STATUSES[number]
export type IndividualProductionArtifactStatus = typeof INDIVIDUAL_PRODUCTION_ARTIFACT_STATUSES[number]
export type IndividualProductionMode = 'dry_run' | 'live'

export type IndividualProductionReferenceRole = 'subject_truth' | 'supporting_food_truth' | 'supporting_drink_truth' | 'venue_truth' | 'person_truth' | 'animal_truth' | 'pinterest_inspiration'
export type IndividualProductionPinterestInfluenceStrength = 'replicate_composition' | 'strong_inspiration' | 'loose_inspiration'
export type IndividualProductionPinterestCompatibility = 'compatible' | 'technique_fallback' | 'incompatible'
export type IndividualProductionPinterestArchetype =
  | 'food_hero'
  | 'food_action'
  | 'drink_hero'
  | 'drink_action'
  | 'single_person_lifestyle'
  | 'couple_lifestyle'
  | 'group_communal_dining'
  | 'dog_pet_lifestyle'
  | 'chef_bts'
  | 'service'
  | 'interior_venue'
  | 'exterior'
  | 'graphic_editorial'
  | 'event_commercial'
  | 'other'

export type IndividualProductionReferenceControlRole =
  | 'product_truth'
  | 'venue_truth'
  | 'person_identity_truth'
  | 'composition_inspiration'
  | 'pose_inspiration'
  | 'lighting_inspiration'
  | 'creative_technique_inspiration'
  | 'brand_graphic_truth'

export type IndividualProductionReferenceAssignment = {
  reference_id: string
  reference_title: string
  role: IndividualProductionReferenceControlRole
  controls: string[]
  may_influence: string[]
  must_not_influence: string[]
}

export type IndividualProductionVenueRequirement = {
  required: boolean
  reason: string
  preferred_categories: Array<'interiors' | 'exteriors'>
  allow_second_reference: boolean
}

export type IndividualProductionVenueTruthRole =
  | 'primary_composition_truth'
  | 'same_zone_detail_truth'
  | 'spatial_support_truth'
  | 'ceiling_lighting_truth'
  | 'furniture_material_truth'
  | 'surface_truth'

export type IndividualProductionStrictVenueTruth = {
  active: boolean
  reason: string
  requested_camera_flexibility: 'low' | 'medium' | 'high'
  allowed_camera_flexibility: 'low' | 'medium' | 'high'
  coverage: Array<{
    area: 'foreground' | 'midground' | 'background' | 'ceiling' | 'furniture_materials' | 'lighting_fixtures'
    supported: boolean
    reference_ids: string[]
  }>
  gaps: string[]
  primary_reference_id: string | null
  supporting_reference_ids: string[]
  normalization: {
    applied: boolean
    ignored_direction_terms: string[]
    effective_camera_instruction: string
    effective_composition_instruction: string
  }
}

export type IndividualProductionEnvironmentTruth = {
  required_elements: string[]
  supported_elements: string[]
  gaps: string[]
  requires_table_surface: boolean
  table_surface_materials: string[]
  table_surface_reference_ids: string[]
}

export type IndividualProductionProductionDirection = {
  venue_requirement: IndividualProductionVenueRequirement
  strict_venue_truth: IndividualProductionStrictVenueTruth
  environment_truth: IndividualProductionEnvironmentTruth
  camera: {
    body: string
    lens: string
    focal_length: string
    aperture: string
    iso: string
    shutter_speed: string
    camera_height: string
    camera_distance: string
    rationale: string
  }
  focus: {
    target: string
    depth_of_field: string
    falloff: string
  }
  lighting: {
    geometry: string[]
    motion_treatment: string
  }
  scene_description: string[]
  interaction_requirements: string[]
  realism_requirements: string[]
  task_negative_constraints: string[]
  wardrobe_rules: string[]
}

export type IndividualProductionReference = {
  id: string
  role: IndividualProductionReferenceRole
  title: string
  category: string
  source: 'client_brain_asset' | 'pinterest_inspiration'
  signed_url: string | null
  storage_bucket?: string | null
  storage_path?: string | null
  updated_at?: string | null
  metadata?: Record<string, unknown>
  match_score?: number
  match_strength?: IndividualProductionPinterestInfluenceStrength
  match_explanation?: string
  scene_archetype?: IndividualProductionPinterestArchetype
  compatibility?: IndividualProductionPinterestCompatibility
  compatibility_reason?: string
  manual_mismatch?: boolean
  environment_role?: 'room_identity' | 'surface_truth'
  venue_truth_role?: IndividualProductionVenueTruthRole
  venue_zone?: string | null
  venue_support_reason?: string | null
}

export type IndividualProductionPinterestSelection = {
  mode: 'auto' | 'manual' | 'none'
  selected_id: string | null
  suggested_id: string | null
  suggested_strength: IndividualProductionPinterestInfluenceStrength | null
  suggested_explanation: string | null
  candidates: IndividualProductionReference[]
}

export type IndividualProductionPackage = {
  client_id: string
  plan_id: string
  plan_item_id: string
  plan_item_ref: string
  status: 'blocked' | 'ready'
  blocked_reasons: string[]
  warnings: string[]
  correction: string
  production: {
    provider: 'google-gemini'
    model: 'gemini-3-pro-image-preview'
    mode: IndividualProductionMode
    aspect_ratio: '4:5'
    output_resolution: '4K'
    max_references: number
    prompt_version: string
  }
  plan_truth: Record<string, unknown>
  visual_direction: Record<string, unknown>
  client_truth: Record<string, unknown>
  brand_context: string[]
  truth_references: IndividualProductionReference[]
  pinterest_references: IndividualProductionReference[]
  provider_references: IndividualProductionReference[]
  pinterest_selection: IndividualProductionPinterestSelection
  reference_assignments: IndividualProductionReferenceAssignment[]
  production_direction: IndividualProductionProductionDirection
  negative_constraints: string[]
  prompt: string
  package_hash: string
}

export type IndividualProductionArtifact = {
  id: string
  client_id: string
  monthly_plan_id: string
  monthly_plan_item_id: string
  version: number
  status: IndividualProductionArtifactStatus
  execution_mode: IndividualProductionMode
  is_selected: boolean
  correction_text: string
  prompt_version: string
  provider: string | null
  model: string | null
  aspect_ratio: '4:5'
  output_resolution: string
  package_snapshot: IndividualProductionPackage
  package_hash: string
  reference_snapshot: IndividualProductionReference[]
  prompt_text: string
  execution: Record<string, unknown>
  image_url: string | null
  failure_reason: string | null
  generated_at: string | null
  selected_at: string | null
  created_at: string
  updated_at: string
}

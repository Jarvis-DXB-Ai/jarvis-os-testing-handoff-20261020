'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { ownerMediaPath } from '@/lib/private-media'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { isClientModuleEnabled, isDemoClientFProfile } from '@/lib/client-workspace-config'
import {
  INSPIRATION_FOLDERS,
  INSPIRATION_SOURCES,
  INSPIRATION_USAGES,
  inspirationFolder,
  inspirationMetadata,
  inspirationTags,
  inspirationTitle,
  isInspirationAsset,
  stringArrayValue,
  stringValue,
  type InspirationSource,
  type InspirationUsage,
} from '@/lib/inspiration-references'
import {
  METADATA_ASSET_ORIGIN,
  METADATA_MENUS,
  type AssetMetadata,
  type AssetMetadataFieldKey,
  type AssetMetadataRecord,
  type AssetMetadataValue,
  type MetadataAssetOrigin,
  type MetadataFieldDefinition,
  type MetadataMenu,
  formatMetadataValue,
  getMetadataSchema,
  hasMetadataValue,
} from '@/lib/metadata-schemas'
import {
  applyVenueSpatialMetadataToAssetMetadata,
  getAssetMetadataCompleteness,
  isVenueLikeSpatialAsset,
  readStoredVenueSpatialMetadata,
  resolveStoredOrInferredVenueSpatialMetadata,
  venueSpatialDisplaySummary,
  type VenueSpatialMetadata,
  type VenueSpatialMetadataCompleteness,
} from '@/lib/venue-spatial-metadata'
import {
  classifyClientAsset,
  drinkTruthEligibility,
  foodTruthEligibility,
} from '@/lib/asset-eligibility'
import { SIGNATURE_SYSTEMS, WEEKLY_EMOTIONAL_ARCS } from '@/lib/editorial-feed-intelligence'
import { MENU_SOURCE_OPTIONS, menuSourceLabel, resolveMenuSource, type MenuSourceId } from '@/lib/menu-sources'
import {
  GRAPHIC_DESIGN_CATEGORIES,
  GraphicDesignAssetsPanel,
  isGraphicDesignAsset,
} from './components/graphic-design-assets-panel'
import {
  buildAiPhotographyModelSummaries,
  type AiModelRelationship,
  type AiPhotographyAvailableModel,
} from '@/lib/ai-photography-models'
import type { AiModel, AiModelAsset, AiModelOutfit } from '@/lib/ai-model-library'
import { CrmPanel, type CrmWorkspaceView } from './components/crm-panel'

// ─── Questions ────────────────────────────────────────────────────────────────

// ─── Memory tiers ─────────────────────────────────────────────────────────────

type MemoryTier = { tier: number; label: string; desc: string; keys: string[] }

const MEMORY_TIERS: MemoryTier[] = [
  {
    tier: 1, label: 'Core Brand Memory', desc: 'Positioning · Audience · Voice · Identity',
    keys: ['venue_overview', 'brand_story', 'audience', 'tone_of_voice', 'visual_identity', 'brand_rules'],
  },
  {
    tier: 2, label: 'Operational Data', desc: 'Menus · Hours · Offers · Conversion',
    keys: ['hours_and_service', 'menu_overview', 'offers_activations', 'conversion', 'campaigns_priorities'],
  },
  {
    tier: 3, label: 'Creative Intelligence', desc: 'Content · Social · Ads · Competitors',
    keys: ['content_pillars', 'social_strategy', 'paid_ads_strategy', 'competitors_positioning', 'reputation_reviews'],
  },
  {
    tier: 4, label: 'Research & Context', desc: 'Assets · Writing guide · Internal notes',
    keys: ['assets_available', 'assets_missing', 'agent_writing_guide', 'jarvis_internal_notes'],
  },
]

const QUESTIONS: { key: string; text: string }[] = [
  { key: 'venue_overview',          text: 'Venue overview' },
  { key: 'brand_story',             text: 'Brand story' },
  { key: 'audience',                text: 'Target audience' },
  { key: 'tone_of_voice',           text: 'Tone of voice' },
  { key: 'visual_identity',         text: 'Visual identity' },
  { key: 'visual_dna',              text: 'Visual DNA' },
  { key: 'brand_rules',             text: 'Brand rules' },
  { key: 'hours_and_service',       text: 'Hours & service' },
  { key: 'menu_overview',           text: 'Menu overview' },
  { key: 'offers_activations',      text: 'Offers & activations' },
  { key: 'conversion',              text: 'Conversion & booking' },
  { key: 'campaigns_priorities',    text: 'Campaigns & priorities' },
  { key: 'content_pillars',         text: 'Content pillars' },
  { key: 'social_strategy',         text: 'Social strategy' },
  { key: 'paid_ads_strategy',       text: 'Paid ads strategy' },
  { key: 'competitors_positioning', text: 'Competitors & positioning' },
  { key: 'reputation_reviews',      text: 'Reputation & reviews' },
  { key: 'assets_available',        text: 'Assets available' },
  { key: 'assets_missing',          text: 'Assets missing' },
  { key: 'agent_writing_guide',     text: 'Agent writing guide' },
  { key: 'jarvis_internal_notes',   text: 'Internal notes' },
]

const CONSTRUCTION_QUESTION_TEXT: Record<string, string> = {
  venue_overview: 'Business overview',
  hours_and_service: 'Process & service',
  menu_overview: 'Service categories',
  offers_activations: 'Revenue drivers',
  conversion: 'Lead conversion',
}

function questionsForClient(isConstructionClient: boolean) {
  if (!isConstructionClient) return QUESTIONS
  return QUESTIONS.map(question => ({
    ...question,
    text: CONSTRUCTION_QUESTION_TEXT[question.key] ?? question.text,
  }))
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BrainStatus = 'draft' | 'needs_review' | 'approved' | 'rejected'

interface BrainEntry {
  id: string
  client_id: string
  question_key: string
  question_text: string
  answer: string | null
  source: string | null
  confidence: number
  calvin_notes: string | null
  status: BrainStatus
  updated_at: string
  approved_at: string | null
}

interface Client {
  id: string
  name: string
  industry: string | null
  notes?: string | null
  brain_architecture_version?: string | null
}

type VisualDNAKey =
  | 'camera_identity'
  | 'primary_lenses'
  | 'depth_of_field'
  | 'lighting_rules'
  | 'color_science'
  | 'skin_realism'
  | 'composition_rules'
  | 'motion_rules'
  | 'night_scene_rules'
  | 'avoid_list'

type VisualDNAField = {
  key: VisualDNAKey
  label: string
  defaultValue: string
}

type VisualDNAValues = Record<VisualDNAKey, string>

const VISUAL_DNA_QUESTION_KEY = 'visual_dna'
const VISUAL_DNA_TITLE = 'Visual DNA'
const ENVIRONMENT_PRESETS_QUESTION_KEY = 'environment_presets'
const ENVIRONMENT_PRESETS_TITLE = 'Environment Presets'

const BRAIN_DARK_COMPAT_CSS = `
  .brain-dark .bg-white,
  .brain-dark .bg-gray-50,
  .brain-dark .bg-gray-100,
  .brain-dark .bg-blue-50,
  .brain-dark .bg-green-50,
  .brain-dark .bg-amber-50,
  .brain-dark .bg-red-50,
  .brain-dark .bg-indigo-50,
  .brain-dark [class*="bg-[var(--surface)]"] {
    background-color: rgba(255,255,255,0.055) !important;
  }
  .brain-dark .bg-gray-900 {
    background-color: rgba(52,211,153,0.16) !important;
  }
  .brain-dark .border-gray-100,
  .brain-dark .border-gray-200,
  .brain-dark .border-gray-300,
  .brain-dark .border-indigo-200,
  .brain-dark .border-green-200,
  .brain-dark .border-amber-200,
  .brain-dark .border-red-100,
  .brain-dark .border-red-200,
  .brain-dark [class*="border-[var(--b2)]"] {
    border-color: rgba(255,255,255,0.11) !important;
  }
  .brain-dark .border-gray-900 {
    border-color: rgba(110,231,183,0.34) !important;
  }
  .brain-dark .text-gray-900,
  .brain-dark .text-gray-800 {
    color: rgba(255,255,255,0.92) !important;
  }
  .brain-dark .text-gray-700,
  .brain-dark [class*="text-[var(--t2)]"] {
    color: rgba(255,255,255,0.68) !important;
  }
  .brain-dark .text-gray-600,
  .brain-dark .text-gray-500,
  .brain-dark [class*="text-[var(--t3)]"] {
    color: rgba(255,255,255,0.52) !important;
  }
  .brain-dark .text-gray-400,
  .brain-dark [class*="text-[var(--t4)]"] {
    color: rgba(255,255,255,0.38) !important;
  }
  .brain-dark .text-gray-300 {
    color: rgba(255,255,255,0.28) !important;
  }
  .brain-dark .text-indigo-600,
  .brain-dark .text-indigo-400 {
    color: rgba(167,243,208,0.82) !important;
  }
  .brain-dark input,
  .brain-dark textarea,
  .brain-dark select {
    border-color: rgba(255,255,255,0.13) !important;
    background-color: rgba(0,0,0,0.30) !important;
    color: rgba(255,255,255,0.90) !important;
  }
  .brain-dark input::placeholder,
  .brain-dark textarea::placeholder {
    color: rgba(255,255,255,0.28) !important;
  }
  .brain-dark .hover\\:bg-gray-50:hover,
  .brain-dark .hover\\:bg-gray-100:hover,
  .brain-dark .hover\\:bg-white:hover {
    background-color: rgba(255,255,255,0.085) !important;
  }
  .brain-dark .hover\\:border-gray-300:hover,
  .brain-dark .hover\\:border-gray-400:hover {
    border-color: rgba(110,231,183,0.28) !important;
  }
  .brain-dark .metadata-modal-light .bg-white {
    background-color: #ffffff !important;
  }
  .brain-dark .metadata-modal-light .bg-gray-50 {
    background-color: #f9fafb !important;
  }
  .brain-dark .metadata-modal-light .bg-gray-100 {
    background-color: #f3f4f6 !important;
  }
  .brain-dark .metadata-modal-light .border-gray-100 {
    border-color: #f3f4f6 !important;
  }
  .brain-dark .metadata-modal-light .border-gray-200 {
    border-color: #e5e7eb !important;
  }
  .brain-dark .metadata-modal-light .border-gray-300 {
    border-color: #d1d5db !important;
  }
  .brain-dark .metadata-modal-light .text-gray-950 {
    color: #030712 !important;
  }
  .brain-dark .metadata-modal-light .text-gray-900,
  .brain-dark .metadata-modal-light .text-gray-800 {
    color: #111827 !important;
  }
  .brain-dark .metadata-modal-light .text-gray-700 {
    color: #374151 !important;
  }
  .brain-dark .metadata-modal-light .text-gray-600,
  .brain-dark .metadata-modal-light .text-gray-500 {
    color: #6b7280 !important;
  }
  .brain-dark .metadata-modal-light .text-gray-400 {
    color: #9ca3af !important;
  }
  .brain-dark .metadata-modal-light input,
  .brain-dark .metadata-modal-light textarea,
  .brain-dark .metadata-modal-light select {
    border-color: #e5e7eb !important;
    background-color: #ffffff !important;
    color: #111827 !important;
  }
  .brain-dark .metadata-modal-light input::placeholder,
  .brain-dark .metadata-modal-light textarea::placeholder {
    color: #9ca3af !important;
  }
`

const VISUAL_DNA_FIELDS: VisualDNAField[] = [
  {
    key: 'camera_identity',
    label: 'Camera Identity',
    defaultValue: 'Sony FX3 / Sony A7R V aesthetic. Cinematic hospitality meets luxury fashion editorial. Natural Sony color science, realistic skin tones, soft digital sharpness, cinematic low-light performance.',
  },
  {
    key: 'primary_lenses',
    label: 'Primary Lenses',
    defaultValue: '85mm is the hero lens for portraits, guest models, dinner scenes, accessories, and emotional closeups. 50mm is used for lifestyle, table moments, cocktails, couples, and storytelling. 35mm is used only for interiors, group scenes, and environmental cinema. Avoid ultra-wide distortion.',
  },
  {
    key: 'depth_of_field',
    label: 'Depth of Field',
    defaultValue: 'Use shallow depth of field for luxury separation and intimacy. Prefer f/1.4, f/1.8, f/2.0, or f/2.8 maximum. Avoid deep-focus AI sharpness where everything looks equally sharp.',
  },
  {
    key: 'lighting_rules',
    label: 'Lighting Rules',
    defaultValue: 'Luxury available light: warm practical lamps, candlelight, sconces, bar glow, terrace sunset, soft ambient reflections. Lighting should feel natural, cinematic, moody, sensual, and expensive. Avoid overlit influencer lighting, white nightclub lighting, and obvious studio flash unless generating studio reference images.',
  },
  {
    key: 'color_science',
    label: 'Color Science',
    defaultValue: 'Warm blacks, creamy skin tones, deep olives, espresso browns, champagne golds, charcoal, tungsten warmth, soft shadows. Avoid oversaturated reds, neon blues, teal-orange blockbuster grading, harsh HDR, and TikTok-style color.',
  },
  {
    key: 'skin_realism',
    label: 'Skin & Realism',
    defaultValue: 'Skin must retain realistic pores, texture, natural shine, soft imperfections, subtle under-eye detail, and human realism. Avoid plastic AI skin, beauty-filter skin, overly glossy faces, and hyper-airbrushed portraits.',
  },
  {
    key: 'composition_rules',
    label: 'Composition Rules',
    defaultValue: 'Elegant negative space, cinematic asymmetry, layered foregrounds, foreground blur, reflections, intimate crops, luxury editorial balance. Avoid e-commerce framing, generic catalog poses, centered influencer posing, and flat AI compositions.',
  },
  {
    key: 'motion_rules',
    label: 'Motion Rules',
    defaultValue: 'For lifestyle and cinematic scenes, allow subtle motion blur, fabric movement, hair movement, walking movement, and handheld realism. Avoid frozen mannequin energy.',
  },
  {
    key: 'night_scene_rules',
    label: 'Night Scene Rules',
    defaultValue: 'Night scenes should feel mysterious, sensual, warm, intimate, and expensive. Think Monaco dinner, Saint Laurent campaign, Aman hotel bar, late-night DIFC terrace. Avoid Vegas nightclub, flashy Dubai influencer content, and overdone party lighting.',
  },
  {
    key: 'avoid_list',
    label: 'Avoid List',
    defaultValue: 'No ultra-wide distortion. No smartphone look. No plastic skin. No AI gloss. No over-HDR. No neon club lighting. No cheap influencer styling. No fake luxury logos. No excessive jewelry. No unrealistic anatomy. No duplicated limbs or fingers. No generic AI model faces.',
  },
]

type EnvironmentLens = '85mm' | '50mm' | '35mm'

type EnvironmentPreset = {
  id: string
  name: string
  scene_description: string
  mood: string
  lighting_style: string
  primary_camera_lens: EnvironmentLens
  best_time_of_day: string
  ideal_shot_types: string
  recommended_outfit_style: string
  avoid_rules: string
  prompt_notes: string
}

type SourceConfidence = 'confirmed_from_photos' | 'inferred_from_photos' | 'inferred_from_blueprint' | 'needs_owner_confirmation'
type SpatialImportance = 'critical' | 'high' | 'medium' | 'low'

type SpatialZone = {
  id: string
  name: string
  purpose: string
  relative_position: string
  connected_zone_ids: string[]
  visual_identity: string
  lighting_style: string
  restrictions: string[]
  photo_evidence_asset_ids: string[]
  source_confidence: SourceConfidence
}

type SpatialRule = {
  id: string
  title: string
  rule: string
  applies_to_zone_ids: string[]
  importance: SpatialImportance
  source_confidence: SourceConfidence
  photo_evidence_asset_ids: string[]
}

type PromptSnippet = {
  id: string
  title: string
  snippet: string
  applies_to_zone_ids: string[]
}

type SpatialIntelligence = {
  version: 1
  source_truth_policy: {
    primary_source: 'real_photos'
    secondary_source: 'blueprint'
    conflict_rule: 'photos_win'
  }
  zones: SpatialZone[]
  continuity_rules: SpatialRule[]
  do_not_invent_rules: SpatialRule[]
  prompt_assembly_snippets: PromptSnippet[]
}

type EnvironmentPresetsPayload = {
  version: 1 | 2
  presets: EnvironmentPreset[]
  spatial_intelligence?: SpatialIntelligence
  [key: string]: unknown
}

const DEFAULT_ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'democlientd_terrace_night',
    name: 'DemoClientD Terrace Night',
    scene_description: 'Late-night DIFC terrace with warm table light, skyline depth, reflective glass, intimate dinner energy, and cinematic luxury hospitality atmosphere.',
    mood: 'warm, intimate, mysterious, sensual, editorial, expensive',
    lighting_style: 'tungsten practicals, candlelight, terrace glow, soft reflections, warm ambient skyline light',
    primary_camera_lens: '85mm',
    best_time_of_day: 'late night dinner service',
    ideal_shot_types: 'portrait hero, couple seated, cocktail detail, candid dining, terrace fashion moment',
    recommended_outfit_style: 'formal dinnerwear, monochrome tailoring, silk, cocktail attire, refined jewelry',
    avoid_rules: 'no nightclub lighting, no ultra-wide distortion, no empty tables, no influencer posing, no cold blue LEDs',
    prompt_notes: 'Use shallow depth of field, foreground blur, warm blacks, cinematic asymmetry, and natural guest interaction.',
  },
  {
    id: 'main_dining_room',
    name: 'Main Dining Room',
    scene_description: 'Elegant indoor dining room with layered tables, soft practical lighting, warm material texture, polished hospitality rhythm, and premium dinner-service atmosphere.',
    mood: 'elegant, warm, cinematic, intimate, composed',
    lighting_style: 'soft practical lighting, sconces, candlelight, gentle table reflections, warm ceiling ambience',
    primary_camera_lens: '50mm',
    best_time_of_day: 'dinner service',
    ideal_shot_types: 'candid dining, table moment, guest portrait, food arrival, couple conversation',
    recommended_outfit_style: 'smart casual, tailored dinnerwear, understated luxury, dark neutrals',
    avoid_rules: 'no flat restaurant catalog lighting, no empty-room staging, no harsh flash, no over-HDR interiors',
    prompt_notes: 'Keep the room alive but uncluttered, with editorial framing and realistic dining behavior.',
  },
  {
    id: 'cocktail_bar',
    name: 'Cocktail Bar',
    scene_description: 'Moody cocktail bar scene with glowing bottles, polished counter reflections, close guest energy, glassware detail, and cinematic nightlife without club aesthetics.',
    mood: 'sensual, energetic, refined, mysterious, editorial',
    lighting_style: 'bar ambience, tungsten glow, backlit bottles, soft practical highlights, reflective counter light',
    primary_camera_lens: '50mm',
    best_time_of_day: 'late night',
    ideal_shot_types: 'cocktail detail, bar portrait, couple leaning, hands and glassware, bartender-adjacent ambience',
    recommended_outfit_style: 'cocktail attire, sleek tailoring, satin, black, champagne, deep olive',
    avoid_rules: 'no Vegas nightclub lighting, no neon blue wash, no exaggerated party posing, no cheap bottle-service energy',
    prompt_notes: 'Prioritize hands, glass, reflection, shallow focus, and Saint Laurent-style hospitality mood.',
  },
  {
    id: 'difc_arrival',
    name: 'DIFC Arrival',
    scene_description: 'Editorial arrival moment around DIFC and Al Fattan Currency House, with city architecture, polished evening styling, and cinematic anticipation before dining.',
    mood: 'fashion editorial, elegant, urban, composed, premium',
    lighting_style: 'golden hour or warm evening city light, soft reflections, architectural shadows, practical exterior glow',
    primary_camera_lens: '35mm',
    best_time_of_day: 'golden hour or early evening',
    ideal_shot_types: 'fashion arrival, walking movement, couple arrival, environmental portrait, candid entrance',
    recommended_outfit_style: 'monochrome tailoring, cocktail attire, structured silhouettes, smart eveningwear',
    avoid_rules: 'no tourist framing, no ultra-wide distortion, no generic Dubai influencer posing, no fake luxury logos',
    prompt_notes: 'Use environmental cinema with controlled perspective, subtle motion, and understated DIFC sophistication.',
  },
  {
    id: 'private_dining_table',
    name: 'Private Dining Table',
    scene_description: 'Close, intimate private dining table with layered plates, glassware, candles, fabric texture, quiet conversation, and luxury hosting energy.',
    mood: 'intimate, calm, warm, refined, romantic, expensive',
    lighting_style: 'candlelight, warm practical lamps, soft table reflections, low ambient fill, creamy shadows',
    primary_camera_lens: '85mm',
    best_time_of_day: 'dinner service',
    ideal_shot_types: 'emotional closeup, hands at table, private toast, dish detail, couple seated',
    recommended_outfit_style: 'formal dinnerwear, soft tailoring, elegant jewelry, understated evening styling',
    avoid_rules: 'no empty tables, no banquet-hall feel, no deep-focus AI sharpness, no stiff mannequin posing',
    prompt_notes: 'Keep compositions intimate and layered, with foreground glass blur and realistic skin texture.',
  },
]

const DEFAULT_SPATIAL_ZONES: SpatialZone[] = [
  {
    id: 'entrance_transition',
    name: 'Entrance Transition',
    purpose: 'Arrival and first impression zone for exterior hospitality scenes.',
    relative_position: 'At the approach into the venue terrace and dining sequence.',
    connected_zone_ids: ['main_bar_threshold', 'difc_arrival'],
    visual_identity: 'DIFC urban arrival, premium threshold, warm exterior glow, polished hospitality entry.',
    lighting_style: 'Warm practical exterior light with city reflections and controlled evening ambience.',
    restrictions: ['do not make it look like a hotel lobby', 'avoid tourist framing', 'avoid fake luxury logos'],
    photo_evidence_asset_ids: [],
    source_confidence: 'inferred_from_photos',
  },
  {
    id: 'main_bar_threshold',
    name: 'Main Bar Threshold',
    purpose: 'Transition point between arrival energy and the bar/dining atmosphere.',
    relative_position: 'Near the bar-facing entry into the main guest flow.',
    connected_zone_ids: ['entrance_transition', 'main_dining_corridor', 'cocktail_bar'],
    visual_identity: 'Moody hospitality threshold, glassware/reflection potential, warm bar-adjacent energy.',
    lighting_style: 'Tungsten bar glow, soft practicals, reflective counter and glass highlights.',
    restrictions: ['no nightclub lighting', 'no blue LED wash', 'do not turn into bottle-service club scene'],
    photo_evidence_asset_ids: [],
    source_confidence: 'inferred_from_photos',
  },
  {
    id: 'main_dining_corridor',
    name: 'Main Dining Corridor',
    purpose: 'Primary guest movement and dining continuity path.',
    relative_position: 'Runs through the core exterior dining area connecting seating clusters.',
    connected_zone_ids: ['main_bar_threshold', 'pergola_dining_strip', 'rug_pathway_system'],
    visual_identity: 'Layered dining corridor with rugs, tables, chairs, warm light, and editorial depth.',
    lighting_style: 'Warm table light, canopy/practical glow, candlelight, soft shadows.',
    restrictions: ['no empty corridor', 'no overcrowded banquet layout', 'avoid flat restaurant catalog lighting'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'pergola_dining_strip',
    name: 'Pergola Dining Strip',
    purpose: 'Signature exterior dining run under rope pergola structures.',
    relative_position: 'Linear strip aligned with canopy structures and dining furniture.',
    connected_zone_ids: ['main_dining_corridor', 'vip_pergola_lounge', 'reflection_water_axis'],
    visual_identity: 'Rope pergola canopy, warm integrated light, wood/brass tables, red patterned chairs.',
    lighting_style: 'Integrated warm canopy lighting with intimate table glow.',
    restrictions: ['never remove pergolas', 'keep pergolas linear', 'no cold white light'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'vip_pergola_lounge',
    name: 'VIP Pergola Lounge',
    purpose: 'Premium lounge seating and intimate hosted scenes.',
    relative_position: 'Within or adjacent to the pergola sequence as a more private seating pocket.',
    connected_zone_ids: ['pergola_dining_strip', 'shisha_lounge_corner', 'outer_edge_seating'],
    visual_identity: 'Green banquettes, lounge texture, brass frames, rugs, warm private atmosphere.',
    lighting_style: 'Soft warm practicals, candlelight, canopy glow, low ambient fill.',
    restrictions: ['do not make it sparse', 'avoid generic lounge furniture', 'preserve green banquette language'],
    photo_evidence_asset_ids: [],
    source_confidence: 'inferred_from_photos',
  },
  {
    id: 'reflection_water_axis',
    name: 'Reflection Water Axis',
    purpose: 'Reflective black water feature used for cinematic depth and continuity.',
    relative_position: 'Runs alongside seating and palm/terrace edges.',
    connected_zone_ids: ['pergola_dining_strip', 'palm_corridor', 'sculpture_viewpoint'],
    visual_identity: 'Reflective black water channels, warm light reflections, luxury exterior geometry.',
    lighting_style: 'Warm highlights mirrored in dark water with restrained ambient contrast.',
    restrictions: ['do not remove water channels', 'no pool/resort styling', 'avoid bright blue water'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'palm_corridor',
    name: 'Palm Corridor',
    purpose: 'Palm-lined spatial rhythm and outdoor Dubai terrace identity.',
    relative_position: 'Along the water/edge condition framing terrace depth.',
    connected_zone_ids: ['reflection_water_axis', 'outer_edge_seating', 'rug_pathway_system'],
    visual_identity: 'Palm trees, terrace edge, urban backdrop, warm hospitality lighting.',
    lighting_style: 'Warm uplight/practical spill with palm shadows and skyline ambience.',
    restrictions: ['no tropical resort look', 'do not overpopulate with palms', 'avoid fantasy jungle lighting'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'sculpture_viewpoint',
    name: 'Sculpture Viewpoint',
    purpose: 'Architectural hero view toward the futuristic curved silver structure.',
    relative_position: 'Sightline-facing area where the silver architectural structure is visible.',
    connected_zone_ids: ['reflection_water_axis', 'architectural_hero_axis', 'outer_edge_seating'],
    visual_identity: 'Futuristic curved silver architecture, DIFC exterior, sculptural backdrop.',
    lighting_style: 'Warm venue foreground against cooler reflective architectural surfaces.',
    restrictions: ['do not distort the silver structure', 'avoid replacing it with random modern facade', 'no sci-fi exaggeration'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'shisha_lounge_corner',
    name: 'Shisha Lounge Corner',
    purpose: 'Lifestyle lounge area for shisha, relaxed hospitality, and intimate guest scenes.',
    relative_position: 'Corner/pocket adjacent to lounge and outer seating zones.',
    connected_zone_ids: ['vip_pergola_lounge', 'outer_edge_seating', 'rug_pathway_system'],
    visual_identity: 'Hookah setup, lounge seating, rugs, warm ambient evening hospitality.',
    lighting_style: 'Low warm light, table practicals, soft lounge shadows.',
    restrictions: ['do not make it nightclub-like', 'avoid excessive smoke', 'keep shisha setup elegant and restrained'],
    photo_evidence_asset_ids: [],
    source_confidence: 'inferred_from_photos',
  },
  {
    id: 'outer_edge_seating',
    name: 'Outer Edge Seating',
    purpose: 'Terrace perimeter seating with open-air dining and urban context.',
    relative_position: 'Along the outside edge of the terrace near skyline/palm/water views.',
    connected_zone_ids: ['palm_corridor', 'shisha_lounge_corner', 'sculpture_viewpoint'],
    visual_identity: 'Burnt orange circular chairs, outdoor dining edge, DIFC city atmosphere.',
    lighting_style: 'Warm table glow balanced with darker exterior ambience.',
    restrictions: ['do not use random patio furniture', 'avoid empty edge seating', 'keep outdoor DIFC context'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'rug_pathway_system',
    name: 'Rug Pathway System',
    purpose: 'Persian rug continuity system guiding walkways and zone transitions.',
    relative_position: 'Runs through pathway areas between seating, lounge, and dining zones.',
    connected_zone_ids: ['main_dining_corridor', 'palm_corridor', 'shisha_lounge_corner'],
    visual_identity: 'Persian rugs throughout paths, warm textile detail, layered hospitality texture.',
    lighting_style: 'Warm grazing light and soft shadows over patterned rug texture.',
    restrictions: ['never remove Persian rugs', 'do not replace with plain concrete paths', 'avoid generic carpet patterns'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
  {
    id: 'architectural_hero_axis',
    name: 'Architectural Hero Axis',
    purpose: 'Primary wide identity axis combining venue furniture, terrace, and silver architecture.',
    relative_position: 'Compositional sightline through terrace toward the sculptural architectural backdrop.',
    connected_zone_ids: ['sculpture_viewpoint', 'reflection_water_axis', 'pergola_dining_strip'],
    visual_identity: 'DemoClientD terrace identity anchors: pergolas, rugs, water, palms, warm light, silver backdrop.',
    lighting_style: 'Warm venue lighting with cinematic depth and controlled architectural contrast.',
    restrictions: ['do not simplify into generic terrace', 'preserve all core identity anchors', 'no ultra-wide distortion'],
    photo_evidence_asset_ids: [],
    source_confidence: 'confirmed_from_photos',
  },
]

const DEFAULT_CONTINUITY_RULES: SpatialRule[] = [
  {
    id: 'preserve_identity_anchors',
    title: 'Preserve Core Identity Anchors',
    rule: 'Keep rope pergolas, Persian rugs, green banquettes, red patterned chairs, orange circular chairs, reflective black water channels, palms, and the curved silver architectural backdrop consistent across generations.',
    applies_to_zone_ids: [],
    importance: 'critical',
    source_confidence: 'confirmed_from_photos',
    photo_evidence_asset_ids: [],
  },
  {
    id: 'warm_lighting_only',
    title: 'Warm Lighting Continuity',
    rule: 'Exterior night scenes should use warm tungsten/practical/candle/bar glow only; avoid cold white, neon blue, or nightclub wash lighting.',
    applies_to_zone_ids: [],
    importance: 'critical',
    source_confidence: 'confirmed_from_photos',
    photo_evidence_asset_ids: [],
  },
]

const DEFAULT_DO_NOT_INVENT_RULES: SpatialRule[] = [
  {
    id: 'no_random_furniture',
    title: 'No Random Furniture Families',
    rule: 'Do not introduce unrelated furniture styles such as Scandinavian chairs, white marble tables, generic resort loungers, or random patio sets.',
    applies_to_zone_ids: [],
    importance: 'critical',
    source_confidence: 'confirmed_from_photos',
    photo_evidence_asset_ids: [],
  },
  {
    id: 'no_layout_replacement',
    title: 'Do Not Replace Venue Geometry',
    rule: 'Do not remove or rearrange major spatial anchors such as pergola lines, water channels, rug pathways, palm corridor, or the silver architectural backdrop.',
    applies_to_zone_ids: [],
    importance: 'critical',
    source_confidence: 'confirmed_from_photos',
    photo_evidence_asset_ids: [],
  },
]

const DEFAULT_PROMPT_SNIPPETS: PromptSnippet[] = [
  {
    id: 'exterior_spatial_grounding',
    title: 'Exterior Spatial Grounding',
    snippet: 'Use the real DemoClientD DIFC exterior terrace geometry: rope pergola dining strip, Persian rug pathways, reflective black water channels, palm corridor, warm tungsten lighting, and the curved silver architectural backdrop.',
    applies_to_zone_ids: ['pergola_dining_strip', 'reflection_water_axis', 'palm_corridor', 'architectural_hero_axis'],
  },
]

// ─── Additional types ─────────────────────────────────────────────────────────

interface AssetUpload {
  id: string
  client_id?: string
  file_name: string
  asset_category: string
  file_path?: string
  optimized_file_path?: string
  ai_preview_path?: string
  file_type?: string
  file_size?: number
  original_width?: number | null
  original_height?: number | null
  optimized_width?: number | null
  optimized_height?: number | null
  ai_preview_width?: number | null
  ai_preview_height?: number | null
  uploaded_at: string
  proposals_count: number
  extraction_status: string
  extracted_summary?: string | null
  source_quality?: string
  superseded?: boolean
  status?: string
  metadata?: AssetMetadata
}

interface BrainProposal {
  id: string
  client_brain_id: string | null
  asset_upload_id: string
  question_key: string
  proposed_answer: string
  current_answer_snapshot: string | null
  reasoning: string | null
  confidence: number
  status: string
  created_at: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<BrainStatus, { label: string; dot: string; text: string; bg: string }> = {
  draft:        { label: 'Draft',        dot: 'bg-gray-300',   text: 'text-[var(--t2)]',   bg: 'bg-[var(--surface)] border-[var(--b2)]' },
  needs_review: { label: 'Needs review', dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/25' },
  approved:     { label: 'Approved',     dot: 'bg-green-400',   text: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/20' },
  rejected:     { label: 'Rejected',     dot: 'bg-red-500',     text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

const CONF_LABEL: Record<number, string> = { 1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Confirmed' }
const CONF_COLOR: Record<number, string> = {
  1: 'text-red-400', 2: 'text-orange-400', 3: 'text-yellow-400', 4: 'text-lime-400', 5: 'text-green-400'
}

// Confidence classification from status + source
// confirmed = approved by Calvin | inferred = from AI/asset analysis | speculative = draft
function inferConfClass(entry: BrainEntry | null): { label: string; color: string; dot: string } {
  if (!entry?.answer) return { label: 'empty',       color: 'text-[var(--t4)]',  dot: 'bg-gray-300' }
  if (entry.status === 'approved')
                       return { label: 'confirmed',  color: 'text-emerald-400', dot: 'bg-emerald-400' }
  if (entry.source === 'asset_upload' || entry.source === 'audit')
                       return { label: 'inferred',   color: 'text-indigo-400',  dot: 'bg-indigo-400' }
  return               { label: 'speculative',       color: 'text-amber-500',   dot: 'bg-amber-500' }
}

// Render answer: bullet list → <ul>, prose → plain text
function renderAnswer(answer: string | null) {
  if (!answer) return null
  const lines = answer.split('\n').map(l => l.trim()).filter(Boolean)
  const allBullets = lines.every(l => l.startsWith('-') || l.startsWith('•'))
  if (allBullets) {
    return (
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug" style={{ color: 'var(--t2)' }}>
            <span className="shrink-0 mt-[3px] text-[8px]" style={{ color: 'var(--accent)' }}>◆</span>
            <span>{l.replace(/^[-•]\s*/, '')}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--t2)' }}>{answer}</p>
}

// ─── Single entry card ────────────────────────────────────────────────────────

function BrainCard({
  index,
  question,
  entry,
  onUpdate,
  onToast,
}: {
  index: number
  question: { key: string; text: string }
  entry: BrainEntry | null
  onUpdate: (e: BrainEntry) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [open,          setOpen]          = useState(false)
  const [quickEdit,     setQuickEdit]     = useState(false)
  const [draft,         setDraft]         = useState(entry?.answer ?? '')
  const [draftSource,   setDraftSource]   = useState(entry?.source ?? '')
  const [draftConf,     setDraftConf]     = useState(entry?.confidence ?? 3)
  const [draftNotes,    setDraftNotes]    = useState(entry?.calvin_notes ?? '')
  const [draftStatus,   setDraftStatus]   = useState<BrainStatus>(entry?.status ?? 'draft')
  const [saving,        setSaving]        = useState(false)

  // Sync if entry changes (e.g. after init)
  useEffect(() => {
    setDraft(entry?.answer ?? '')
    setDraftSource(entry?.source ?? '')
    setDraftConf(entry?.confidence ?? 3)
    setDraftNotes(entry?.calvin_notes ?? '')
    setDraftStatus(entry?.status ?? 'draft')
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(statusOverride?: BrainStatus) {
    setSaving(true)
    const now    = new Date().toISOString()
    const status = statusOverride ?? draftStatus
    const fields = {
      question_text: question.text,
      answer:        draft.trim() || null,
      source:        draftSource.trim() || null,
      confidence:    draftConf,
      calvin_notes:  draftNotes.trim() || null,
      status,
      updated_at:    now,
      approved_at:   status === 'approved' ? now : (status === 'draft' || status === 'rejected' ? null : entry?.approved_at ?? null),
    }

    let result: BrainEntry | null = null

    if (entry) {
      const { data, error } = await supabase.from('client_brain').update(fields).eq('id', entry.id).select().single()
      if (error) { onToast(`Failed: ${error.message}`, false); setSaving(false); return }
      result = data as BrainEntry
    } else {
      // This shouldn't happen after init, but handle gracefully
      onToast('Entry not initialised — refresh the page', false)
      setSaving(false)
      return
    }

    onUpdate(result)
    if (statusOverride) setDraftStatus(statusOverride)
    onToast(
      status === 'approved' ? '✓ Approved' :
      status === 'rejected' ? '✕ Rejected' :
      status === 'needs_review' ? '↑ Flagged for review' :
      '✓ Saved',
      status !== 'rejected'
    )
    setSaving(false)
  }

  const hasAnswer  = !!(entry?.answer?.trim())
  const cfg        = STATUS_CFG[entry?.status ?? 'draft']
  const confClass  = inferConfClass(entry)
  const wordCount  = (entry?.answer ?? '').trim().split(/\s+/).filter(Boolean).length

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${
      entry?.status === 'approved'        ? 'border-green-500/15'
      : entry?.status === 'rejected'     ? 'border-[var(--b2)] opacity-70'
      : entry?.status === 'needs_review' ? 'border-amber-500/20'
      : open                             ? 'border-[var(--b3)]'
      : 'border-[var(--b2)]'
    }`}>

      {/* ── Collapsed header ────────────────────────────────────────────── */}
      {/* div role="button" avoids nested <button> — quick-edit trigger is a sibling, not a child */}
      <div className="flex items-center justify-between gap-2 bg-[var(--surface)] hover:bg-[var(--raised)] transition-colors">
        {/* Clickable area: expand/collapse */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
          className="flex items-center gap-4 min-w-0 flex-1 px-6 py-5 cursor-pointer text-left">
          <div className="min-w-0 flex-1">
            <p className={`text-[13px] font-semibold leading-snug ${hasAnswer ? 'text-gray-800' : 'text-[var(--t3)]'}`}>
              {question.text}
            </p>
            {hasAnswer && !open && (
              <div className="mt-1.5 pr-4">
                {renderAnswer(entry!.answer!.split('\n').slice(0,3).join('\n') + (entry!.answer!.split('\n').length > 3 ? '\n…' : ''))}
              </div>
            )}
          </div>
        </div>
        {/* Badges + controls — separate from the clickable area */}
        <div className="flex items-center gap-2 pr-5 shrink-0">
          {hasAnswer && (
            <span className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              confClass.label === 'confirmed'   ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : confClass.label === 'inferred' ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-500'
            }`}>
              <span className={`w-1 h-1 rounded-full ${confClass.dot}`} />
              {confClass.label}
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
          {/* Quick edit — real button, no longer nested */}
          <button
            onClick={() => { setQuickEdit(q => !q); if (!quickEdit) setOpen(false) }}
            title="Quick edit"
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all text-[11px] ${
              quickEdit ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-[var(--t4)] hover:text-[var(--t2)] hover:bg-white/[0.05]'
            }`}>
            ✎
          </button>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpen(o => !o)}
            onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
            className="cursor-pointer py-5">
            <span className={`text-[var(--t3)] text-xs transition-transform block ${open ? 'rotate-180' : ''}`}>▾</span>
          </div>
        </div>
      </div>

      {/* ── Quick edit inline panel ───────────────────────────────────────── */}
      {quickEdit && !open && (
        <div className="px-5 py-4 space-y-3" style={{ borderTop: '1px solid var(--b2)', background: 'var(--void)' }}>
          {/* Answer body */}
          <textarea
            autoFocus
            rows={Math.max(4, draft.split('\n').length + 1)}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write the answer… (use - for bullets)"
            className="w-full rounded-xl px-3 py-2.5 text-[13px] leading-relaxed outline-none resize-y"
            style={{ background: 'var(--surface)', border: '1px solid var(--b3)', color: 'var(--t1)' }}
          />
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={draftSource}
              onChange={e => setDraftSource(e.target.value)}
              placeholder="Source (e.g. client call, audit)"
              className="flex-1 min-w-[140px] rounded-lg px-3 py-1.5 text-[12px] outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--b2)', color: 'var(--t2)' }}
            />
            <select
              value={draftConf}
              onChange={e => setDraftConf(Number(e.target.value))}
              className="rounded-lg px-2 py-1.5 text-[12px] outline-none cursor-pointer"
              style={{ background: 'var(--surface)', border: '1px solid var(--b2)', color: 'var(--t2)' }}>
              <option value={1}>Conf 1 — Very low</option>
              <option value={2}>Conf 2 — Low</option>
              <option value={3}>Conf 3 — Medium</option>
              <option value={4}>Conf 4 — High</option>
              <option value={5}>Conf 5 — Confirmed</option>
            </select>
            <select
              value={draftStatus}
              onChange={e => setDraftStatus(e.target.value as BrainStatus)}
              className="rounded-lg px-2 py-1.5 text-[12px] outline-none cursor-pointer"
              style={{ background: 'var(--surface)', border: '1px solid var(--b2)', color: 'var(--t2)' }}>
              <option value="draft">Draft</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { await save(); setQuickEdit(false) }}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-30"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
              {saving ? '…' : '✓ Save'}
            </button>
            <button
              onClick={async () => { await save('approved'); setQuickEdit(false) }}
              disabled={saving || !draft.trim()}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/[0.18] transition-all disabled:opacity-30">
              {saving ? '…' : '✓ Approve'}
            </button>
            <button
              onClick={() => {
                setQuickEdit(false)
                setDraft(entry?.answer ?? '')
                setDraftSource(entry?.source ?? '')
                setDraftConf(entry?.confidence ?? 3)
                setDraftStatus(entry?.status ?? 'draft')
              }}
              className="px-3 py-2 rounded-xl text-[12px] transition-colors"
              style={{ color: 'var(--t4)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded editor ──────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-[var(--b2)] bg-[var(--void)] px-6 py-6">

          {/* Answer textarea */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest">Answer</label>
              <span className="text-[10px] text-[var(--t3)] tabular-nums">
                {draft.trim().split(/\s+/).filter(Boolean).length} / 1000 words
              </span>
            </div>
            <textarea
              rows={10}
              className="w-full bg-[var(--surface)] border border-[var(--b2)] focus:border-[var(--b-accent)] rounded-xl px-4 py-3 text-[13px] text-[var(--t1)] leading-relaxed outline-none resize-y placeholder:text-[var(--t4)] transition-all"
              placeholder="Write a thorough answer — up to 1,000 words. Be specific, factual, operational."
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
          </div>

          {/* Metadata row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {/* Source */}
            <div>
              <label className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-1.5 block">Source</label>
              <input
                type="text"
                placeholder="e.g. Google Maps, client call, audit 2026-05-15"
                className="w-full bg-[var(--surface)] border border-[var(--b2)] focus:border-[var(--b-accent)] rounded-lg px-3 py-2 text-xs text-[var(--t2)] outline-none placeholder:text-[var(--t4)] transition-all"
                value={draftSource}
                onChange={e => setDraftSource(e.target.value)}
              />
            </div>

            {/* Confidence */}
            <div>
              <label className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-1.5 block">
                Confidence — <span className={`${CONF_COLOR[draftConf]} normal-case font-semibold tracking-normal`}>{CONF_LABEL[draftConf]}</span>
              </label>
              <input
                type="range" min={1} max={5} step={1}
                className="w-full accent-indigo-500 cursor-pointer"
                value={draftConf}
                onChange={e => setDraftConf(Number(e.target.value))}
              />
              <div className="flex justify-between text-[9px] text-[var(--t4)] mt-0.5 px-0.5">
                {[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-1.5 block">Status</label>
              <select
                value={draftStatus}
                onChange={e => setDraftStatus(e.target.value as BrainStatus)}
                className="w-full bg-[var(--surface)] border border-[var(--b2)] text-[var(--t2)] text-xs rounded-lg px-3 py-2 outline-none">
                <option value="draft">Draft</option>
                <option value="needs_review">Needs review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Calvin notes */}
          <div className="mb-5">
            <label className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-1.5 block">
              Calvin notes <span className="normal-case font-normal text-[var(--t4)]">(private — not sent to agents)</span>
            </label>
            <textarea
              rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--b2)] focus:border-[var(--b-accent)] rounded-lg px-3 py-2 text-xs text-[var(--t2)] leading-relaxed outline-none resize-none placeholder:text-[var(--t4)] transition-all"
              placeholder="Internal notes, follow-up questions, things to verify…"
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => save('approved')} disabled={saving || !draft.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-30">
              {saving ? '…' : '✓ Approve'}
            </button>
            <button
              onClick={() => save()} disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all disabled:opacity-30">
              {saving ? '…' : '↓ Save draft'}
            </button>
            <button
              onClick={() => save('needs_review')} disabled={saving || !draft.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-30">
              {saving ? '…' : '↑ Flag for review'}
            </button>
            <button
              onClick={() => save('rejected')} disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--surface)] border border-[var(--b2)] text-[var(--t3)] hover:border-red-500/20 hover:text-red-400 transition-all disabled:opacity-30">
              {saving ? '…' : '✕ Reject'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto px-4 py-2 rounded-lg text-xs text-[var(--t3)] hover:text-[var(--t2)] transition-all">
              Collapse
            </button>
          </div>

          {/* Last updated */}
          {entry?.updated_at && (
            <p className="mt-4 text-[10px] text-[var(--t4)]">
              Last saved {new Date(entry.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {entry.approved_at && ` · Approved ${new Date(entry.approved_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function createDefaultVisualDNA(): VisualDNAValues {
  return VISUAL_DNA_FIELDS.reduce((acc, field) => {
    acc[field.key] = field.defaultValue
    return acc
  }, {} as VisualDNAValues)
}

function parseVisualDNA(answer: string | null): VisualDNAValues {
  const defaults = createDefaultVisualDNA()
  if (!answer?.trim()) return defaults

  try {
    const parsed: unknown = JSON.parse(answer)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults
    const record = parsed as Partial<Record<VisualDNAKey, unknown>>
    return VISUAL_DNA_FIELDS.reduce((acc, field) => {
      const value = record[field.key]
      acc[field.key] = typeof value === 'string' && value.trim() ? value : defaults[field.key]
      return acc
    }, {} as VisualDNAValues)
  } catch {
    return defaults
  }
}

function VisualDNAPanel({
  clientId,
  entry,
  onUpdate,
  onToast,
}: {
  clientId: string
  entry: BrainEntry | null
  onUpdate: (e: BrainEntry) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [values, setValues] = useState<VisualDNAValues>(() => parseVisualDNA(entry?.answer ?? null))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(parseVisualDNA(entry?.answer ?? null))
  }, [entry?.id, entry?.answer])

  function updateField(key: VisualDNAKey, value: string) {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    const payload = JSON.stringify(values, null, 2)
    const fields = {
      question_text: VISUAL_DNA_TITLE,
      answer: payload,
      source: 'manual_visual_dna',
      confidence: 5,
      calvin_notes: null,
      status: 'approved' as BrainStatus,
      updated_at: now,
      approved_at: now,
    }

    if (entry) {
      const { data, error } = await supabase
        .from('client_brain')
        .update(fields)
        .eq('id', entry.id)
        .select()
        .single()
      if (error) {
        onToast(`Visual DNA failed: ${error.message}`, false)
        setSaving(false)
        return
      }
      onUpdate(data as BrainEntry)
    } else {
      const { data, error } = await supabase
        .from('client_brain')
        .insert({
          client_id: clientId,
          question_key: VISUAL_DNA_QUESTION_KEY,
          ...fields,
        })
        .select()
        .single()
      if (error) {
        onToast(`Visual DNA failed: ${error.message}`, false)
        setSaving(false)
        return
      }
      onUpdate(data as BrainEntry)
    }

    onToast('Visual DNA saved', true)
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{VISUAL_DNA_TITLE}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Permanent creative and camera rules for AI-generated DemoClientD content.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {entry ? 'Saved' : 'Default'}
          </span>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {VISUAL_DNA_FIELDS.map(field => (
            <div key={field.key}>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {field.label}
              </label>
              <textarea
                value={values[field.key]}
                onChange={e => updateField(field.key, e.target.value)}
                rows={field.key === 'avoid_list' || field.key === 'primary_lenses' ? 4 : 3}
                className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            Stored as <span className="font-mono">client_brain.{VISUAL_DNA_QUESTION_KEY}</span> with stable JSON keys.
          </p>
          <button
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save Visual DNA'}
          </button>
        </div>
      </div>
    </div>
  )
}

function createDefaultEnvironmentPresets(): EnvironmentPresetsPayload {
  return {
    version: 2,
    presets: DEFAULT_ENVIRONMENT_PRESETS.map(preset => ({ ...preset })),
    spatial_intelligence: createDefaultSpatialIntelligence(),
  }
}

function createDefaultSpatialIntelligence(): SpatialIntelligence {
  return {
    version: 1,
    source_truth_policy: {
      primary_source: 'real_photos',
      secondary_source: 'blueprint',
      conflict_rule: 'photos_win',
    },
    zones: DEFAULT_SPATIAL_ZONES.map(zone => ({ ...zone, connected_zone_ids: [...zone.connected_zone_ids], restrictions: [...zone.restrictions], photo_evidence_asset_ids: [] })),
    continuity_rules: DEFAULT_CONTINUITY_RULES.map(rule => ({ ...rule, applies_to_zone_ids: [...rule.applies_to_zone_ids], photo_evidence_asset_ids: [] })),
    do_not_invent_rules: DEFAULT_DO_NOT_INVENT_RULES.map(rule => ({ ...rule, applies_to_zone_ids: [...rule.applies_to_zone_ids], photo_evidence_asset_ids: [] })),
    prompt_assembly_snippets: DEFAULT_PROMPT_SNIPPETS.map(snippet => ({ ...snippet, applies_to_zone_ids: [...snippet.applies_to_zone_ids] })),
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asSourceConfidence(value: unknown, fallback: SourceConfidence): SourceConfidence {
  return value === 'confirmed_from_photos' || value === 'inferred_from_photos' || value === 'inferred_from_blueprint' || value === 'needs_owner_confirmation' ? value : fallback
}

function asSpatialImportance(value: unknown, fallback: SpatialImportance): SpatialImportance {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : fallback
}

function parseSpatialZone(value: unknown, fallback: SpatialZone): SpatialZone {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<keyof SpatialZone, unknown>> : {}
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : fallback.id,
    name: typeof record.name === 'string' ? record.name : fallback.name,
    purpose: typeof record.purpose === 'string' ? record.purpose : fallback.purpose,
    relative_position: typeof record.relative_position === 'string' ? record.relative_position : fallback.relative_position,
    connected_zone_ids: asStringArray(record.connected_zone_ids),
    visual_identity: typeof record.visual_identity === 'string' ? record.visual_identity : fallback.visual_identity,
    lighting_style: typeof record.lighting_style === 'string' ? record.lighting_style : fallback.lighting_style,
    restrictions: asStringArray(record.restrictions),
    photo_evidence_asset_ids: asStringArray(record.photo_evidence_asset_ids),
    source_confidence: asSourceConfidence(record.source_confidence, fallback.source_confidence),
  }
}

function parseSpatialRule(value: unknown, fallback: SpatialRule): SpatialRule {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<keyof SpatialRule, unknown>> : {}
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : fallback.id,
    title: typeof record.title === 'string' ? record.title : fallback.title,
    rule: typeof record.rule === 'string' ? record.rule : fallback.rule,
    applies_to_zone_ids: asStringArray(record.applies_to_zone_ids),
    importance: asSpatialImportance(record.importance, fallback.importance),
    source_confidence: asSourceConfidence(record.source_confidence, fallback.source_confidence),
    photo_evidence_asset_ids: asStringArray(record.photo_evidence_asset_ids),
  }
}

function parsePromptSnippet(value: unknown, fallback: PromptSnippet): PromptSnippet {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<keyof PromptSnippet, unknown>> : {}
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : fallback.id,
    title: typeof record.title === 'string' ? record.title : fallback.title,
    snippet: typeof record.snippet === 'string' ? record.snippet : fallback.snippet,
    applies_to_zone_ids: asStringArray(record.applies_to_zone_ids),
  }
}

function parseSpatialIntelligence(value: unknown): SpatialIntelligence {
  const defaults = createDefaultSpatialIntelligence()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const record = value as Partial<Record<keyof SpatialIntelligence, unknown>>

  const zoneValues = Array.isArray(record.zones) ? record.zones : []
  const zones = defaults.zones.map((fallback, index) => parseSpatialZone(zoneValues[index], fallback))
  const extraZones = zoneValues.slice(defaults.zones.length).map((zone, index) => parseSpatialZone(zone, {
    ...DEFAULT_SPATIAL_ZONES[0],
    id: `custom_zone_${index + 1}`,
    name: `Custom Zone ${index + 1}`,
    purpose: '',
    relative_position: '',
    connected_zone_ids: [],
    visual_identity: '',
    lighting_style: '',
    restrictions: [],
    photo_evidence_asset_ids: [],
    source_confidence: 'needs_owner_confirmation',
  }))

  const continuityValues = Array.isArray(record.continuity_rules) ? record.continuity_rules : []
  const doNotInventValues = Array.isArray(record.do_not_invent_rules) ? record.do_not_invent_rules : []
  const snippetValues = Array.isArray(record.prompt_assembly_snippets) ? record.prompt_assembly_snippets : []

  return {
    version: 1,
    source_truth_policy: defaults.source_truth_policy,
    zones: [...zones, ...extraZones],
    continuity_rules: continuityValues.length > 0 ? continuityValues.map((rule, index) => parseSpatialRule(rule, defaults.continuity_rules[index] ?? {
      id: `continuity_rule_${index + 1}`,
      title: `Continuity Rule ${index + 1}`,
      rule: '',
      applies_to_zone_ids: [],
      importance: 'high',
      source_confidence: 'needs_owner_confirmation',
      photo_evidence_asset_ids: [],
    })) : defaults.continuity_rules,
    do_not_invent_rules: doNotInventValues.length > 0 ? doNotInventValues.map((rule, index) => parseSpatialRule(rule, defaults.do_not_invent_rules[index] ?? {
      id: `do_not_invent_rule_${index + 1}`,
      title: `Do Not Invent Rule ${index + 1}`,
      rule: '',
      applies_to_zone_ids: [],
      importance: 'high',
      source_confidence: 'needs_owner_confirmation',
      photo_evidence_asset_ids: [],
    })) : defaults.do_not_invent_rules,
    prompt_assembly_snippets: snippetValues.length > 0 ? snippetValues.map((snippet, index) => parsePromptSnippet(snippet, defaults.prompt_assembly_snippets[index] ?? {
      id: `prompt_snippet_${index + 1}`,
      title: `Prompt Snippet ${index + 1}`,
      snippet: '',
      applies_to_zone_ids: [],
    })) : defaults.prompt_assembly_snippets,
  }
}

function parseEnvironmentPresets(answer: string | null): EnvironmentPresetsPayload {
  const defaults = createDefaultEnvironmentPresets()
  if (!answer?.trim()) return defaults

  try {
    const parsed: unknown = JSON.parse(answer)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults
    const payload = parsed as Partial<{ version: unknown; presets: unknown; spatial_intelligence: unknown }> & Record<string, unknown>
    if (!Array.isArray(payload.presets)) return defaults

    const presets = payload.presets.map((item, index): EnvironmentPreset => {
      const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Partial<Record<keyof EnvironmentPreset, unknown>> : {}
      const fallback = defaults.presets[index] ?? DEFAULT_ENVIRONMENT_PRESETS[0]
      const lens = record.primary_camera_lens
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `environment_${Date.now()}_${index}`,
        name: typeof record.name === 'string' ? record.name : fallback.name,
        scene_description: typeof record.scene_description === 'string' ? record.scene_description : fallback.scene_description,
        mood: typeof record.mood === 'string' ? record.mood : fallback.mood,
        lighting_style: typeof record.lighting_style === 'string' ? record.lighting_style : fallback.lighting_style,
        primary_camera_lens: lens === '85mm' || lens === '50mm' || lens === '35mm' ? lens : fallback.primary_camera_lens,
        best_time_of_day: typeof record.best_time_of_day === 'string' ? record.best_time_of_day : fallback.best_time_of_day,
        ideal_shot_types: typeof record.ideal_shot_types === 'string' ? record.ideal_shot_types : fallback.ideal_shot_types,
        recommended_outfit_style: typeof record.recommended_outfit_style === 'string' ? record.recommended_outfit_style : fallback.recommended_outfit_style,
        avoid_rules: typeof record.avoid_rules === 'string' ? record.avoid_rules : fallback.avoid_rules,
        prompt_notes: typeof record.prompt_notes === 'string' ? record.prompt_notes : fallback.prompt_notes,
      }
    })

    return {
      ...payload,
      version: payload.spatial_intelligence ? 2 : 1,
      presets: presets.length > 0 ? presets : defaults.presets,
      spatial_intelligence: parseSpatialIntelligence(payload.spatial_intelligence),
    }
  } catch {
    return defaults
  }
}

function createBlankEnvironmentPreset(): EnvironmentPreset {
  return {
    id: `environment_${Date.now()}`,
    name: 'New Environment',
    scene_description: '',
    mood: '',
    lighting_style: '',
    primary_camera_lens: '50mm',
    best_time_of_day: '',
    ideal_shot_types: '',
    recommended_outfit_style: '',
    avoid_rules: '',
    prompt_notes: '',
  }
}

function EnvironmentsPanel({
  clientId,
  entry,
  assetUploads,
  onUpdate,
  onToast,
}: {
  clientId: string
  entry: BrainEntry | null
  assetUploads: AssetUpload[]
  onUpdate: (e: BrainEntry) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [payload, setPayload] = useState<EnvironmentPresetsPayload>(() => parseEnvironmentPresets(entry?.answer ?? null))
  const [openIds, setOpenIds] = useState<string[]>([])
  const [showLegacyPresets, setShowLegacyPresets] = useState(false)
  const [openZoneIds, setOpenZoneIds] = useState<string[]>([])
  const [showRules, setShowRules] = useState(false)
  const [evidenceSearch, setEvidenceSearch] = useState('')
  const [evidenceCategory, setEvidenceCategory] = useState<'all' | 'exteriors' | 'interiors' | 'venue_items'>('all')
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const spatial = payload.spatial_intelligence ?? createDefaultSpatialIntelligence()
  const evidenceAssets = assetUploads.filter(asset => ['interiors', 'exteriors', 'venue_items'].includes(asset.asset_category || ''))
  const evidenceCategoryLabels: Record<'exteriors' | 'interiors' | 'venue_items', string> = {
    exteriors: 'Exteriors',
    interiors: 'Interiors',
    venue_items: 'Venue Items',
  }
  const filteredEvidenceAssets = evidenceAssets.filter(asset => {
    const matchesSearch = !evidenceSearch.trim() || asset.file_name.toLowerCase().includes(evidenceSearch.trim().toLowerCase())
    const matchesCategory = evidenceCategory === 'all' || asset.asset_category === evidenceCategory
    return matchesSearch && matchesCategory
  })

  useEffect(() => {
    const next = parseEnvironmentPresets(entry?.answer ?? null)
    setPayload(next)
    setOpenIds(current => current.filter(id => next.presets.some(preset => preset.id === id)))
    setOpenZoneIds(current => current.filter(id => next.spatial_intelligence?.zones.some(zone => zone.id === id)))
  }, [entry?.id, entry?.answer])

  useEffect(() => {
    const missing = evidenceAssets
      .filter(asset => !evidenceUrls[asset.id])
      .map(asset => ({ id: asset.id, path: asset.ai_preview_path || asset.optimized_file_path || asset.file_path }))
      .filter((item): item is { id: string; path: string } => !!item.path)
    if (missing.length === 0) return
    ;(async () => {
      const res = await fetch('/api/brain/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: missing }),
      })
      if (!res.ok) return
      const { urls } = await res.json() as { urls: Record<string, string> }
      setEvidenceUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [assetUploads]) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePreset(id: string) {
    setOpenIds(prev => prev.includes(id) ? prev.filter(openId => openId !== id) : [...prev, id])
  }

  function toggleZone(id: string) {
    setOpenZoneIds(prev => prev.includes(id) ? prev.filter(openId => openId !== id) : [...prev, id])
  }

  function updatePreset(id: string, patch: Partial<EnvironmentPreset>) {
    setPayload(prev => ({
      ...prev,
      version: 2,
      presets: prev.presets.map(preset => preset.id === id ? { ...preset, ...patch } : preset),
      spatial_intelligence: prev.spatial_intelligence ?? createDefaultSpatialIntelligence(),
    }))
  }

  function addPreset() {
    const next = createBlankEnvironmentPreset()
    setPayload(prev => ({ ...prev, version: 2, presets: [next, ...prev.presets], spatial_intelligence: prev.spatial_intelligence ?? createDefaultSpatialIntelligence() }))
    setOpenIds(prev => [next.id, ...prev])
  }

  function deletePreset(id: string) {
    setPayload(prev => ({ ...prev, version: 2, presets: prev.presets.filter(preset => preset.id !== id), spatial_intelligence: prev.spatial_intelligence ?? createDefaultSpatialIntelligence() }))
    setOpenIds(prev => prev.filter(openId => openId !== id))
  }

  function csvToArray(value: string): string[] {
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }

  function updateSpatial(next: SpatialIntelligence) {
    setPayload(prev => ({ ...prev, version: 2, presets: prev.presets, spatial_intelligence: next }))
  }

  function updateZone(id: string, patch: Partial<SpatialZone>) {
    updateSpatial({
      ...spatial,
      zones: spatial.zones.map(zone => zone.id === id ? { ...zone, ...patch } : zone),
    })
  }

  function updateRule(collection: 'continuity_rules' | 'do_not_invent_rules', id: string, patch: Partial<SpatialRule>) {
    updateSpatial({
      ...spatial,
      [collection]: spatial[collection].map(rule => rule.id === id ? { ...rule, ...patch } : rule),
    })
  }

  function updateSnippet(id: string, patch: Partial<PromptSnippet>) {
    updateSpatial({
      ...spatial,
      prompt_assembly_snippets: spatial.prompt_assembly_snippets.map(snippet => snippet.id === id ? { ...snippet, ...patch } : snippet),
    })
  }

  function toggleZoneEvidence(zone: SpatialZone, assetId: string) {
    const next = zone.photo_evidence_asset_ids.includes(assetId)
      ? zone.photo_evidence_asset_ids.filter(id => id !== assetId)
      : [...zone.photo_evidence_asset_ids, assetId]
    updateZone(zone.id, { photo_evidence_asset_ids: next })
  }

  function clearZoneEvidence(zoneId: string) {
    updateZone(zoneId, { photo_evidence_asset_ids: [] })
  }

  function renderEvidenceCards(zone: SpatialZone) {
    const selectedIds = new Set(zone.photo_evidence_asset_ids)
    const selectedAssets = evidenceAssets.filter(asset => selectedIds.has(asset.id))

    if (evidenceAssets.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-xs text-gray-400">
          No Interiors, Exteriors, or Venue Items assets available.
        </p>
      )
    }

    const categories: Array<'exteriors' | 'interiors' | 'venue_items'> = ['exteriors', 'interiors', 'venue_items']

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">Selected evidence</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {selectedAssets.length > 0 ? selectedAssets.map(asset => asset.file_name).join(', ') : 'None selected for this zone.'}
              </p>
            </div>
            {zone.photo_evidence_asset_ids.length > 0 && (
              <button
                type="button"
                onClick={() => clearZoneEvidence(zone.id)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-500 transition hover:border-red-200 hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={evidenceSearch}
            onChange={e => setEvidenceSearch(e.target.value)}
            placeholder="Search filenames"
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-gray-400"
          />
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...categories] as const).map(category => (
              <button
                key={category}
                type="button"
                onClick={() => setEvidenceCategory(category)}
                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                  evidenceCategory === category
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                {category === 'all' ? 'All' : evidenceCategoryLabels[category]}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Available photo options. A card is evidence only when it is selected for this zone.
        </p>

        {categories.map(category => {
          if (evidenceCategory !== 'all' && evidenceCategory !== category) return null
          const assets = filteredEvidenceAssets.filter(asset => asset.asset_category === category)
          if (assets.length === 0) return null
          return (
            <div key={category}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{evidenceCategoryLabels[category]}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map(asset => {
                  const selected = selectedIds.has(asset.id)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggleZoneEvidence(zone, asset.id)}
                      className={`overflow-hidden rounded-xl border bg-white text-left transition ${
                        selected ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="relative aspect-[4/3] bg-gray-100">
                        {evidenceUrls[asset.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={evidenceUrls[asset.id]} alt={asset.file_name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-gray-400">Preview</div>
                        )}
                        <span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-semibold shadow-sm ${selected ? 'bg-gray-900 text-white' : 'bg-white/90 text-gray-500'}`}>
                          {selected ? 'Selected' : 'Available'}
                        </span>
                      </div>
                      <div className="space-y-1 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800">{asset.file_name}</p>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            {evidenceCategoryLabels[category]}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {filteredEvidenceAssets.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-xs text-gray-400">
            No matching evidence assets.
          </p>
        )}
      </div>
    )
  }

  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    const savePayload: EnvironmentPresetsPayload = {
      ...payload,
      version: 2,
      presets: payload.presets,
      spatial_intelligence: payload.spatial_intelligence ?? createDefaultSpatialIntelligence(),
    }
    const fields = {
      question_text: ENVIRONMENT_PRESETS_TITLE,
      answer: JSON.stringify(savePayload, null, 2),
      source: 'manual_environment_presets',
      confidence: 5,
      calvin_notes: null,
      status: 'approved' as BrainStatus,
      updated_at: now,
      approved_at: now,
    }

    if (entry) {
      const { data, error } = await supabase
        .from('client_brain')
        .update(fields)
        .eq('id', entry.id)
        .select()
        .single()
      if (error) {
        onToast(`Environments failed: ${error.message}`, false)
        setSaving(false)
        return
      }
      onUpdate(data as BrainEntry)
    } else {
      const { data, error } = await supabase
        .from('client_brain')
        .insert({
          client_id: clientId,
          question_key: ENVIRONMENT_PRESETS_QUESTION_KEY,
          ...fields,
        })
        .select()
        .single()
      if (error) {
        onToast(`Environments failed: ${error.message}`, false)
        setSaving(false)
        return
      }
      onUpdate(data as BrainEntry)
    }

    onToast('Environments saved', true)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="order-1 rounded-2xl border border-gray-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Environments</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Spatial venue memory for photo-grounded AI continuity. Evidence references are stored as asset IDs only.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Environments'}
            </button>
          </div>
        </div>
      </div>

      <div className="order-3 rounded-2xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setShowLegacyPresets(v => !v)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Legacy Scene Presets</h3>
            <p className="mt-0.5 text-xs text-gray-400">{payload.presets.length} saved presets · preserved for compatibility</p>
          </div>
          <span className={`text-[10px] text-gray-400 transition-transform ${showLegacyPresets ? 'rotate-90' : ''}`}>▶</span>
        </button>

        {showLegacyPresets && (
          <div className="space-y-3 border-t border-gray-100 px-6 py-5">
            <button
              onClick={addPreset}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-gray-400"
            >
              + Add Preset
            </button>
      {payload.presets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-400">No environment presets yet.</p>
          <button onClick={addPreset} className="mt-3 text-xs font-medium text-indigo-600 hover:underline">+ Create the first preset</button>
        </div>
      ) : (
        <div className="space-y-3">
          {payload.presets.map((preset, index) => {
            const open = openIds.includes(preset.id)
            return (
              <div key={preset.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => togglePreset(preset.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{preset.name || `Environment ${index + 1}`}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-400">{preset.mood || 'No mood set'} · {preset.primary_camera_lens}</p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(preset.id)}
                    className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>

                {open && (
                  <div className="border-t border-gray-100 px-5 py-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Environment Name</label>
                        <input
                          value={preset.name}
                          onChange={e => updatePreset(preset.id, { name: e.target.value })}
                          placeholder="DemoClientD Terrace Night"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Primary Camera Lens</label>
                        <select
                          value={preset.primary_camera_lens}
                          onChange={e => updatePreset(preset.id, { primary_camera_lens: e.target.value as EnvironmentLens })}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white"
                        >
                          <option value="85mm">85mm</option>
                          <option value="50mm">50mm</option>
                          <option value="35mm">35mm</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Scene Description</label>
                        <textarea
                          value={preset.scene_description}
                          onChange={e => updatePreset(preset.id, { scene_description: e.target.value })}
                          rows={3}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Mood</label>
                        <textarea
                          value={preset.mood}
                          onChange={e => updatePreset(preset.id, { mood: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Lighting Style</label>
                        <textarea
                          value={preset.lighting_style}
                          onChange={e => updatePreset(preset.id, { lighting_style: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Best Time of Day</label>
                        <input
                          value={preset.best_time_of_day}
                          onChange={e => updatePreset(preset.id, { best_time_of_day: e.target.value })}
                          placeholder="golden hour, dinner service, late night"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Recommended Outfit Style</label>
                        <input
                          value={preset.recommended_outfit_style}
                          onChange={e => updatePreset(preset.id, { recommended_outfit_style: e.target.value })}
                          placeholder="formal dinnerwear, smart casual"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Ideal Shot Types</label>
                        <textarea
                          value={preset.ideal_shot_types}
                          onChange={e => updatePreset(preset.id, { ideal_shot_types: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Avoid Rules</label>
                        <textarea
                          value={preset.avoid_rules}
                          onChange={e => updatePreset(preset.id, { avoid_rules: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Prompt Notes</label>
                        <textarea
                          value={preset.prompt_notes}
                          onChange={e => updatePreset(preset.id, { prompt_notes: e.target.value })}
                          rows={3}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
          </div>
        )}
      </div>

      <div className="order-2 rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-5">
          <h3 className="text-sm font-semibold text-gray-900">Spatial Intelligence</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Venue continuity memory for AI generation. V1 stores zones, evidence asset IDs, and strict rules inside the existing environment payload.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">Primary: real photos</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">Secondary: blueprint</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">Photos win conflicts</span>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Zones</h4>
              <p className="text-[11px] text-gray-400">{spatial.zones.length} zones</p>
            </div>
            <div className="space-y-3">
              {spatial.zones.map(zone => {
                const open = openZoneIds.includes(zone.id)
                return (
                  <div key={zone.id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => toggleZone(zone.id)}
                      className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-white"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                          <p className="text-sm font-semibold text-gray-900">{zone.name}</p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{zone.purpose}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500">
                          {zone.source_confidence.replaceAll('_', ' ')}
                        </span>
                        <span className="text-[11px] text-gray-400">{zone.photo_evidence_asset_ids.length} photos</span>
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-gray-100 px-4 py-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <p className="font-mono text-[10px] text-gray-400">{zone.id}</p>
                          <select
                            value={zone.source_confidence}
                            onChange={e => updateZone(zone.id, { source_confidence: e.target.value as SourceConfidence })}
                            className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-600 outline-none"
                          >
                            <option value="confirmed_from_photos">Confirmed from photos</option>
                            <option value="inferred_from_photos">Inferred from photos</option>
                            <option value="inferred_from_blueprint">Inferred from blueprint</option>
                            <option value="needs_owner_confirmation">Needs owner confirmation</option>
                          </select>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Purpose</label>
                            <textarea value={zone.purpose} onChange={e => updateZone(zone.id, { purpose: e.target.value })} rows={2} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Relative Position</label>
                            <textarea value={zone.relative_position} onChange={e => updateZone(zone.id, { relative_position: e.target.value })} rows={2} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Visual Identity</label>
                            <textarea value={zone.visual_identity} onChange={e => updateZone(zone.id, { visual_identity: e.target.value })} rows={2} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Lighting Style</label>
                            <textarea value={zone.lighting_style} onChange={e => updateZone(zone.id, { lighting_style: e.target.value })} rows={2} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Connected Zone IDs</label>
                            <input value={zone.connected_zone_ids.join(', ')} onChange={e => updateZone(zone.id, { connected_zone_ids: csvToArray(e.target.value) })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Restrictions</label>
                            <input value={zone.restrictions.join(', ')} onChange={e => updateZone(zone.id, { restrictions: csvToArray(e.target.value) })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-gray-400" />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Photo Evidence</label>
                            {renderEvidenceCards(zone)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={() => setShowRules(v => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Rules & Prompt Snippets</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {spatial.continuity_rules.length} continuity · {spatial.do_not_invent_rules.length} do-not-invent · {spatial.prompt_assembly_snippets.length} snippets
                </p>
              </div>
              <span className={`text-[10px] text-gray-400 transition-transform ${showRules ? 'rotate-90' : ''}`}>▶</span>
            </button>

            {showRules && (
              <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Continuity Rules</h4>
              <div className="space-y-3">
                {spatial.continuity_rules.map(rule => (
                  <div key={rule.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <input
                      value={rule.title}
                      onChange={e => updateRule('continuity_rules', rule.id, { title: e.target.value })}
                      className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-gray-400"
                    />
                    <textarea
                      value={rule.rule}
                      onChange={e => updateRule('continuity_rules', rule.id, { rule: e.target.value })}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                      value={rule.applies_to_zone_ids.join(', ')}
                      onChange={e => updateRule('continuity_rules', rule.id, { applies_to_zone_ids: csvToArray(e.target.value) })}
                      placeholder="applies_to_zone_ids"
                      className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Do-Not-Invent Rules</h4>
              <div className="space-y-3">
                {spatial.do_not_invent_rules.map(rule => (
                  <div key={rule.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <input
                      value={rule.title}
                      onChange={e => updateRule('do_not_invent_rules', rule.id, { title: e.target.value })}
                      className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-gray-400"
                    />
                    <textarea
                      value={rule.rule}
                      onChange={e => updateRule('do_not_invent_rules', rule.id, { rule: e.target.value })}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                      value={rule.applies_to_zone_ids.join(', ')}
                      onChange={e => updateRule('do_not_invent_rules', rule.id, { applies_to_zone_ids: csvToArray(e.target.value) })}
                      placeholder="applies_to_zone_ids"
                      className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Prompt Assembly Snippets</h4>
            <div className="space-y-3">
              {spatial.prompt_assembly_snippets.map(snippet => (
                <div key={snippet.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <input
                    value={snippet.title}
                    onChange={e => updateSnippet(snippet.id, { title: e.target.value })}
                    className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-gray-400"
                  />
                  <textarea
                    value={snippet.snippet}
                    onChange={e => updateSnippet(snippet.id, { snippet: e.target.value })}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gray-400"
                  />
                  <input
                    value={snippet.applies_to_zone_ids.join(', ')}
                    onChange={e => updateSnippet(snippet.id, { applies_to_zone_ids: csvToArray(e.target.value) })}
                    placeholder="applies_to_zone_ids"
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-gray-400"
                  />
                </div>
              ))}
            </div>
          </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const STORED_CONTENT_CATEGORIES = [
  { value: 'interiors',  label: 'Interiors' },
  { value: 'exteriors',  label: 'Exteriors' },
  { value: 'venue_items', label: 'Venue Items' },
  { value: 'food',       label: 'Food' },
  { value: 'food_studio_shots', label: 'Studio Food Shots' },
  { value: 'drinks',     label: 'Drinks' },
  { value: 'drink_studio_shots', label: 'Studio Drink Shots' },
  { value: 'lifestyle',  label: 'Lifestyle' },
  { value: 'bts_service', label: 'BTS / Service' },
  { value: 'pinterest_inspiration', label: 'Pinterest' },
  { value: 'background_presets', label: 'Background Presets' },
]

const IMAGE_CATEGORIES = STORED_CONTENT_CATEGORIES

function uploadCategoryLabel(value: string | null | undefined) {
  return STORED_CONTENT_CATEGORIES.find(option => option.value === value)?.label
    || GRAPHIC_DESIGN_CATEGORIES.find(option => option.id === value)?.label
    || value
    || 'Unselected'
}

const QUESTION_LABEL: Record<string, string> = Object.fromEntries(
  QUESTIONS.map((q, i) => [q.key, `${i + 1}. ${q.text}`])
)

// ─── Upload panel ─────────────────────────────────────────────────────────────

function fmt_kb(bytes?: number) {
  if (!bytes) return '—'
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

// ─── Batch upload panel ───────────────────────────────────────────────────────

type BatchResult = {
  uploads_count: number
  images_analyzed: number
  skipped: number
  proposals_count: number
  superseded_count: number
  enrichment_mode: boolean
  source_quality: string
  cost_usd: number
  summary: string
  total_original_bytes: number
  total_ai_preview_bytes: number
  compression_ratio: number
  files: { id: string; file_name: string; original_bytes: number; optimized_bytes: number; ai_preview_bytes: number }[]
}

function BatchUploadPanel({
  clientId,
  clientName,
  fixedCategory,
  fixedCategoryLabel,
  onUploaded,
  onToast,
}: {
  clientId: string
  clientName: string
  fixedCategory?: string
  fixedCategoryLabel?: string
  onUploaded: () => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [files,         setFiles]         = useState<File[]>([])
  const [category,      setCategory]      = useState(fixedCategory ?? '')
  const [uploading,     setUploading]     = useState(false)
  const [result,        setResult]        = useState<BatchResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (fixedCategory) setCategory(fixedCategory)
  }, [fixedCategory])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setFiles(selected)
    setResult(null)
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, j) => j !== i))
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  async function handleUpload() {
    if (files.length === 0) return
    const uploadCategory = fixedCategory || category
    if (!uploadCategory) {
      onToast('Choose a category before uploading.', false)
      return
    }
    setUploading(true)
    setResult(null)

    const fd = new FormData()
    fd.append('client_id',      clientId)
    fd.append('client_name',    clientName)
    fd.append('asset_category', uploadCategory)
    fd.append('source_quality', 'original')
    fd.append('skip_analysis', 'true')
    for (const f of files) fd.append('files[]', f)

    try {
      const res  = await fetch('/api/brain/upload/batch', { method: 'POST', body: fd })
      const data: BatchResult = await res.json()
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Batch upload failed')

      setResult(data)
      onToast(`✓ ${data.uploads_count} image${data.uploads_count === 1 ? '' : 's'} uploaded. Metadata can be added manually.`, true)
      setFiles([])
      setCategory(fixedCategory ?? '')
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    } catch (err) {
      onToast(`Batch upload error: ${String(err)}`, false)
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Upload Images</p>
        <p className="mt-1 text-xs text-gray-500">No AI analysis runs on upload. Metadata is added later from the asset editor.</p>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          setFiles(Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/')))
          setResult(null)
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all ${
          files.length > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'
        }`}>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
        {files.length > 0 ? (
          <div>
            <p className="text-sm font-semibold text-emerald-800">{files.length} image{files.length > 1 ? 's' : ''} selected</p>
            <p className="mt-1 text-xs text-gray-500">{fmt_kb(totalBytes)} total</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-gray-800">Click or drag images here</p>
            <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP</p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="flex-1 truncate text-xs text-gray-700">{file.name}</span>
              <span className="shrink-0 text-[11px] text-gray-400">{fmt_kb(file.size)}</span>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); removeFile(index) }}
                className="ml-1 shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {fixedCategory ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>
          <p className="mt-1 text-sm font-semibold text-gray-800">{fixedCategoryLabel || uploadCategoryLabel(fixedCategory)}</p>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400">
            <option value="">Unselected</option>
            {IMAGE_CATEGORIES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={files.length === 0 || !(fixedCategory || category) || uploading}
        className="w-full rounded-xl border border-gray-900 bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400">
        {uploading ? `Uploading ${files.length} image${files.length === 1 ? '' : 's'}...` : 'Upload Images'}
      </button>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-800">{result.uploads_count} image{result.uploads_count === 1 ? '' : 's'} uploaded.</p>
          <p className="mt-1 text-xs text-emerald-700">Metadata was not generated automatically. New assets will show a Missing Metadata badge until edited.</p>
        </div>
      )}
    </div>
  )
}

// ─── Proposals panel ──────────────────────────────────────────────────────────

function ProposalsPanel({
  proposals,
  onApprove,
  onReject,
}: {
  proposals: BrainProposal[]
  onApprove: (p: BrainProposal) => void
  onReject:  (p: BrainProposal) => void
}) {
  const [actioning, setActioning] = useState<string | null>(null)
  // editingId → which proposal is open in inline editor
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editedText,  setEditedText]  = useState('')
  const [editNote,    setEditNote]    = useState('')

  if (proposals.length === 0) return null

  async function approve(p: BrainProposal, finalAnswer?: string, correctionNote?: string) {
    setActioning(p.id)
    const body = finalAnswer
      ? JSON.stringify({ final_answer: finalAnswer, correction_note: correctionNote ?? '' })
      : undefined
    const res = await fetch(`/api/brain/proposals/${p.id}/approve`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body,
    })
    if (res.ok) { setEditingId(null); onApprove(p) }
    setActioning(null)
  }

  async function reject(p: BrainProposal) {
    setActioning(p.id)
    const res = await fetch(`/api/brain/proposals/${p.id}/reject`, { method: 'POST' })
    if (res.ok) onReject(p)
    setActioning(null)
  }

  function openEdit(p: BrainProposal) {
    setEditingId(p.id)
    setEditedText(p.proposed_answer)
    setEditNote('')
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          {proposals.length} pending update{proposals.length > 1 ? 's' : ''} from uploaded assets
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {proposals.map(p => {
          const busy    = actioning === p.id
          const editing = editingId === p.id
          return (
            <div key={p.id} className="border border-amber-500/20 rounded-2xl bg-[var(--surface)] overflow-hidden">
              {/* Question label */}
              <div className="px-5 pt-4 pb-3">
                <p className="text-[10px] font-semibold text-amber-400/50 uppercase tracking-wider mb-1.5">
                  Proposed update
                </p>
                <p className="text-xs font-semibold text-[var(--t2)]">
                  {QUESTION_LABEL[p.question_key] ?? p.question_key}
                </p>
              </div>

              {/* Diff view */}
              <div className="px-5 pb-5 space-y-4">
                {/* Current answer */}
                {p.current_answer_snapshot && (
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">Current</p>
                    <div className="border-l-2 border-[var(--b3)] pl-3">
                      <p className="text-[12px] text-[var(--t3)] leading-relaxed">
                        {p.current_answer_snapshot.slice(0, 300)}{p.current_answer_snapshot.length > 300 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Proposed answer — or inline editor */}
                <div>
                  <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider mb-2">
                    {editing ? 'Edit before applying' : 'Proposed'}
                  </p>
                  {editing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        rows={Math.max(4, editedText.split('\n').length + 1)}
                        className="w-full bg-[var(--void)] border border-indigo-500/30 rounded-xl px-3 py-2.5 text-[13px] text-[var(--t1)] leading-relaxed resize-y outline-none focus:border-indigo-500/60 transition-colors"
                      />
                      <input
                        type="text"
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        placeholder="Correction note (optional)"
                        className="w-full bg-[var(--void)] border border-[var(--b2)] rounded-xl px-3 py-2 text-[12px] text-[var(--t2)] outline-none focus:border-[#303038] placeholder:text-[var(--t4)] transition-colors"
                      />
                    </div>
                  ) : (
                    <div className="border-l-2 border-amber-500/40 pl-3 pr-3 py-2 rounded-r-lg bg-amber-500/[0.04]">
                      <p className="text-[13px] text-[var(--t1)] leading-relaxed whitespace-pre-wrap">
                        {p.proposed_answer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Reasoning + confidence */}
                {!editing && (
                  <div className="flex items-start justify-between gap-4">
                    {p.reasoning && (
                      <p className="text-[11px] text-[var(--t3)] leading-relaxed flex-1">{p.reasoning}</p>
                    )}
                    <span className={`text-[10px] font-semibold shrink-0 mt-0.5 ${CONF_COLOR[p.confidence]}`}>
                      {CONF_LABEL[p.confidence]}
                    </span>
                  </div>
                )}

                {/* Actions */}
                {editing ? (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => approve(p, editedText, editNote)}
                      disabled={!!actioning || !editedText.trim()}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/20 transition-all disabled:opacity-30">
                      {busy ? '…' : '✓ Save & apply'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={!!actioning}
                      className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--surface)] border border-[var(--b2)] text-[var(--t3)] hover:border-[#303038] transition-all disabled:opacity-30">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => approve(p)}
                      disabled={!!actioning}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/[0.18] transition-all disabled:opacity-30">
                      {busy ? '…' : '✓ Apply to brain'}
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      disabled={!!actioning}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all disabled:opacity-30">
                      Edit
                    </button>
                    <button
                      onClick={() => reject(p)}
                      disabled={!!actioning}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--surface)] border border-[var(--b2)] text-[var(--t3)] hover:border-red-500/25 hover:text-red-400/80 transition-all disabled:opacity-30">
                      {busy ? '…' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ─── Knowledge gap questions ──────────────────────────────────────────────────

// Coverage check: title-only match against very specific multi-word phrases
// This avoids false positives from broad words (audience, visual, content) appearing in unrelated entries
type GapQ = { id: string; q: string; category: string; coverageTitle: string[] }

const GAP_QUESTIONS: GapQ[] = [
  { id: 'content_performance',  q: 'What type of content historically generated the strongest engagement for this client?',              category: 'Operations & Insights',  coverageTitle: ['content performance','top performing','best content','engagement data'] },
  { id: 'priority_products',    q: 'Which specific dishes, drinks, or products should be prioritised in future content and ads?',        category: 'Offers & Activations',   coverageTitle: ['hero products','priority products','featured items','hero dishes'] },
  { id: 'visual_references',    q: 'Which brands or competitors best represent the visual direction the client admires?',                category: 'Branding & Copywriting', coverageTitle: ['visual references','brand references','competitor references','moodboard'] },
  { id: 'brand_emotion',        q: 'What emotions or feelings should someone experience when viewing this brand online?',                category: 'Branding & Copywriting', coverageTitle: ['brand emotion','online feeling','brand perception','emotional direction'] },
  { id: 'business_priority',    q: 'Which offering or service is the biggest revenue priority for the next 30–60 days?',                category: 'Operations & Insights',  coverageTitle: ['business priority','revenue priority','current priority','90 day'] },
  { id: 'paid_audience',        q: 'Which specific audience segment should paid campaigns target first?',                               category: 'Operations & Insights',  coverageTitle: ['paid audience','campaign target','ad targeting','paid target'] },
  { id: 'content_dislikes',     q: 'Are there specific content styles, caption tones, or visual trends the client dislikes?',           category: 'Branding & Copywriting', coverageTitle: ['content dislikes','avoid style','brand dislikes','tone avoid'] },
  { id: 'best_activations',     q: 'Which past offers or activations drove the strongest conversions or reservations?',                 category: 'Offers & Activations',   coverageTitle: ['best activation','top activation','performing offer','strongest offer'] },
  { id: 'differentiator',       q: 'What makes this brand the obvious choice over other DIFC or nearby alternatives?',                  category: 'Branding & Copywriting', coverageTitle: ['differentiator','obvious choice','vs competitors','competitive advantage'] },
  { id: 'platform_priority',    q: 'Which social or ad platforms should receive the highest budget and content focus?',                 category: 'Operations & Insights',  coverageTitle: ['platform priority','channel focus','platform focus','instagram priority'] },
  { id: 'visual_avoids',        q: 'Are there visual styles, design approaches, or aesthetics the client wants to actively avoid?',     category: 'Branding & Copywriting', coverageTitle: ['visual avoid','design avoid','aesthetic avoid','do not use'] },
  { id: 'paid_objective',       q: 'What is the primary goal for paid ads — reservations, DMs, website visits, or phone calls?',        category: 'Operations & Insights',  coverageTitle: ['paid objective','ad objective','paid goal','conversion goal'] },
  { id: 'reels_direction',      q: 'What is the desired tone, pacing, and style for video content and Reels?',                          category: 'Branding & Copywriting', coverageTitle: ['reels direction','video direction','reel style','video tone'] },
  { id: 'campaign_calendar',    q: 'What campaigns, events, or seasonal moments should be planned for the next 90 days?',               category: 'Offers & Activations',   coverageTitle: ['campaign calendar','content calendar','upcoming campaign','90 day plan'] },
  { id: 'signature_content',    q: 'Is there a signature dish, drink, experience, or visual the brand wants to consistently own online?',category: 'Branding & Copywriting', coverageTitle: ['signature content','brand signature','owned asset','iconic'] },
  { id: 'graphic_style',        q: 'What graphic design style should all branded collateral and social graphics follow?',                category: 'Branding & Copywriting', coverageTitle: ['graphic style','design style','collateral style','graphic direction'] },
  { id: 'ad_creative_format',   q: 'Which ad creative format performs best for this client — single image, carousel, or video?',        category: 'Operations & Insights',  coverageTitle: ['ad format','creative format','ad creative','best format'] },
  { id: 'brand_story',          q: 'What is the founding story or key narrative behind this brand that content should reference?',       category: 'Branding & Copywriting', coverageTitle: ['brand story','founding story','origin story','brand narrative'] },
  { id: 'unanswered_objections',q: 'What objections or doubts do potential guests typically have before booking or visiting?',           category: 'Operations & Insights',  coverageTitle: ['guest objection','booking objection','hesitation','barrier to visit'] },
  { id: 'caption_hooks',        q: 'What types of caption hooks or opening lines perform best with this audience?',                     category: 'Branding & Copywriting', coverageTitle: ['caption hook','opening line','hook style','caption opener'] },
]

const CONSTRUCTION_GAP_QUESTIONS: GapQ[] = [
  { id: 'project_asset_inventory', q: 'Which completed villa projects are approved to use publicly as proof?', category: 'Operations', coverageTitle: ['approved project proof','project asset inventory','public project list'] },
  { id: 'priority_project_types', q: 'Which project type should be the biggest revenue priority for the next 30-60 days?', category: 'Offers & Revenue', coverageTitle: ['priority project type','revenue priority','current priority','60 day'] },
  { id: 'villa_communities', q: 'Which Dubai villa communities should paid campaigns target first?', category: 'Audience', coverageTitle: ['villa communities','paid audience','campaign target','community priority'] },
  { id: 'before_after_assets', q: 'Which before/after transformations are strongest enough to become hero content?', category: 'Visual DNA', coverageTitle: ['before after assets','transformation proof','hero transformation'] },
  { id: 'trust_signals', q: 'Which trust signals can DemoClientF publicly show?', category: 'Market Intelligence', coverageTitle: ['trust signals','quality proof','client trust','public proof'] },
  { id: 'owner_visibility', q: 'Are there any acceptable non-founder authority formats, such as site walkthroughs, team/process clips, or voiceover-only explanations?', category: 'Brand Strategy', coverageTitle: ['owner visibility','founder visibility','authority format','voiceover'] },
  { id: 'lead_qualification', q: 'What qualifies a good lead: location, budget range, property type, timeline, scope, and decision-maker status?', category: 'Offers & Revenue', coverageTitle: ['lead qualification','qualified lead','budget range','decision maker'] },
  { id: 'estimate_flow', q: 'What should the villa estimate / consultation lead flow ask before a sales call?', category: 'Offers & Revenue', coverageTitle: ['estimate flow','consultation flow','lead form','sales call'] },
  { id: 'process_proof', q: 'Which parts of the consultation-to-handover process need the clearest content explanation?', category: 'Operations', coverageTitle: ['process proof','handover process','consultation to handover','build process'] },
  { id: 'construction_objections', q: 'What doubts do homeowners usually have before trusting a contractor with their villa?', category: 'Audience', coverageTitle: ['construction objections','homeowner doubts','trust objection','buyer hesitation'] },
  { id: 'visual_references', q: 'Which architectural studios, developers, or luxury real estate brands best represent the desired visual direction?', category: 'Visual DNA', coverageTitle: ['visual references','architectural references','developer references','moodboard'] },
  { id: 'content_avoids', q: 'Which content styles should DemoClientF avoid so the feed does not look like a generic contractor page?', category: 'Brand Strategy', coverageTitle: ['content avoids','visual avoid','generic contractor','tone avoid'] },
  { id: 'ad_platform_priority', q: 'Which ad platforms and lead sources should receive the first testing budget?', category: 'Offers & Revenue', coverageTitle: ['ad platform priority','platform priority','lead source','testing budget'] },
  { id: 'project_metadata_gaps', q: 'Which project metadata fields are missing from the current asset archive?', category: 'Operations', coverageTitle: ['project metadata gaps','metadata missing','asset archive','project id'] },
  { id: 'competitor_benchmark', q: 'Which Dubai construction, fit-out, design-build, or luxury developer competitors should be benchmarked?', category: 'Market Intelligence', coverageTitle: ['competitor benchmark','competitive landscape','design build competitor','developer benchmark'] },
]

// ─── Knowledge Gaps component ─────────────────────────────────────────────────

function KnowledgeGaps({
  clientId,
  ckEntries,
  onEntryAdded,
  gapQuestions = GAP_QUESTIONS,
}: {
  clientId:     string
  ckEntries:    { id?: string; title: string; content: string; status: string; category?: string; importance?: number }[]
  onEntryAdded: (r: { id: string; created_at: string; client_id: string; category: string; title: string; content: string; importance: number; status: string }) => void
  gapQuestions?: GapQ[]
}) {
  const storageKey = `dismissed_gaps_v2_${clientId}`
  const [dismissed,  setDismissed]  = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { return [] }
  })
  // swapped[id] = replacement id shown in place of the original
  const swapKey = `swapped_gaps_v2_${clientId}`
  const [swapped, setSwapped] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem(swapKey) ?? '{}') } catch { return {} }
  })
  const [answering,  setAnswering]  = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [saving,     setSaving]     = useState(false)

  function persist(d: string[], s: Record<string,string>) {
    localStorage.setItem(storageKey, JSON.stringify(d))
    localStorage.setItem(swapKey,    JSON.stringify(s))
  }

  function dismiss(id: string) {
    const d = [...dismissed, id]
    setDismissed(d); persist(d, swapped)
  }

  function refresh(id: string) {
    // Find a question not yet shown (not dismissed, not in current active set, not the current one)
    const currentActive = getActive(dismissed, swapped)
    const used = [...currentActive.map(q => q.id), id]
    const replacement = gapQuestions.find(q => !used.includes(q.id) && !isCovered(q))
    if (!replacement) { dismiss(id); return }
    const s = { ...swapped, [id]: replacement.id }
    setSwapped(s); persist(dismissed, s)
  }

  // Coverage: title-only exact phrase match — much more conservative than content keyword scan
  const activeTitles = ckEntries
    .filter(r => r.status !== 'archived' && r.status !== 'deleted')
    .map(r => r.title.toLowerCase())
  const storedGaps = ckEntries
    .filter(r => r.status !== 'archived' && r.status !== 'deleted' && normalizeContextValue(r.category ?? '') === 'knowledge gaps')
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))

  function isCovered(q: GapQ) {
    return q.coverageTitle.some(phrase =>
      activeTitles.some(t => t.includes(phrase.toLowerCase()))
    )
  }

  function getActive(d: string[], s: Record<string,string>): GapQ[] {
    const result: GapQ[] = []
    // Walk the original order; apply swaps; skip dismissed
    for (const q of gapQuestions) {
      if (d.includes(q.id)) continue           // dismissed
      if (Object.values(s).includes(q.id) && !Object.keys(s).includes(q.id)) continue // used as replacement elsewhere but not pinned
      if (isCovered(q)) continue
      // Apply swap: if this slot has a replacement, show that instead
      const replacement = s[q.id] ? gapQuestions.find(x => x.id === s[q.id]) : null
      if (replacement && !isCovered(replacement)) {
        result.push(replacement)
      } else {
        result.push(q)
      }
      if (result.length >= 10) break
    }
    return result
  }

  const visible = getActive(dismissed, swapped)

  async function saveAnswer(q: GapQ) {
    if (!answerText.trim()) return
    setSaving(true)
	    const { data, error } = await supabase.from('client_knowledge').insert({
	      client_id:  clientId,
	      category:   contextSectionById(canonicalContextSectionId({ category: q.category, title: q.q, content: answerText })).category,
	      title:      q.q.replace(/[?.]$/, '').slice(0, 80),
	      content:    answerText.trim(),
      importance: 3,
      status:     'approved',
    }).select().single()
    if (!error && data) {
      onEntryAdded(data)
      dismiss(q.id)
      setAnswering(null); setAnswerText('')
    }
    setSaving(false)
  }

  // Find the original id that was swapped to show this question (for Refresh)
  function getSlotId(q: GapQ): string {
    const swapEntry = Object.entries(swapped).find(([, v]) => v === q.id)
    return swapEntry ? swapEntry[0] : q.id
  }

  if (visible.length === 0 && storedGaps.length === 0) return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center">
      <p className="text-sm font-medium text-gray-500">No open knowledge gaps</p>
      <p className="text-xs text-gray-400 mt-1">All key questions are answered or dismissed. Add more context manually at any time.</p>
    </div>
  )

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Knowledge Gaps</p>
          <p className="text-xs text-gray-400 mt-0.5">Missing context that would improve future content, ads, and creative outputs</p>
        </div>
        <span className="text-xs text-gray-300">{storedGaps.length + visible.length} active</span>
      </div>
      <div className="px-6 py-5 space-y-2.5">
        {storedGaps.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Operational queue</p>
            {storedGaps.map((gap, index) => (
              <div key={`stored-gap-${gap.id ?? index}-${gap.title}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-950">{gap.title}</p>
                  <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700">Priority {gap.importance ?? 3}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-amber-900">{gap.content}</p>
              </div>
            ))}
          </div>
        )}
        {visible.map(q => {
          const slotId = getSlotId(q)
          return (
            <div key={q.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              {answering === q.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-800">{q.q}</p>
                  <textarea
                    autoFocus
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    rows={3}
                    placeholder="Write the answer…"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveAnswer(q)} disabled={saving || !answerText.trim()}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40 transition">
                      {saving ? 'Saving…' : 'Save to Brain'}
                    </button>
                    <button onClick={() => { setAnswering(null); setAnswerText('') }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-sm text-gray-700 leading-relaxed">{q.q}</p>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button onClick={() => { setAnswering(q.id); setAnswerText('') }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition">
                      Answer
                    </button>
                    <button onClick={() => refresh(slotId)} title="Show a different question"
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition">
                      ↻
                    </button>
                    <button onClick={() => dismiss(q.id)} title="Dismiss"
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition">
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Knowledge record ─────────────────────────────────────────────────────────

type KR = {
  id: string; created_at: string; client_id: string
  category: string; title: string; content: string
  importance: number; status: string
  updated_at?: string | null
}

type ContextSectionId =
  | 'knowledge_gaps'
  | 'client_snapshot'
  | 'brand_strategy'
  | 'audience'
  | 'visual_dna'
  | 'offers_revenue'
  | 'operations'
  | 'market_intelligence'
  | 'reference_library'

type ContextReviewStatus = 'Current' | 'Needs Review' | 'Outdated' | 'Missing'

const CONTEXT_SECTIONS: Array<{
  id: ContextSectionId
  label: string
  category: string
  description: string
  summary: string
  emptyState: string
}> = [
  {
    id: 'knowledge_gaps',
    label: 'Knowledge Gaps',
    category: 'Knowledge Gaps',
    description: 'Missing, outdated, unclear, or unconfirmed information that could affect future Jarvis work.',
    summary: 'Use this first when the truth layer feels incomplete. Answer only the gaps that are current and useful.',
    emptyState: 'No open knowledge gaps. Add a manual note only if something needs confirmation.',
  },
  {
    id: 'client_snapshot',
    label: 'Client Snapshot',
    category: 'Client Snapshot',
    description: 'A short current truth summary: positioning, USP, audience, offers, location essentials, and priorities.',
    summary: 'This should stay readable in two minutes. Keep only the cleanest current summary here.',
    emptyState: 'No client snapshot yet. Add a short current truth summary for Jarvis to trust.',
  },
  {
    id: 'brand_strategy',
    label: 'Brand Strategy',
    category: 'Brand Strategy',
    description: 'Positioning, differentiators, personality, USP, long-term direction, and what the brand is or is not.',
    summary: 'Voice-level brand truth can live here. Execution copy belongs in Social Media or Reference Library.',
    emptyState: 'No brand strategy truth yet. Add positioning, USP, differentiators, and brand direction.',
  },
  {
    id: 'audience',
    label: 'Audience',
    category: 'Audience',
    description: 'Personas, segments, motivations, objections, lifestyle context, and customer psychology.',
    summary: 'Audience facts live here only, so future plans do not duplicate or distort who the brand is speaking to.',
    emptyState: 'No audience truth yet. Add personas, motivations, objections, and customer context.',
  },
  {
    id: 'visual_dna',
    label: 'Visual DNA',
    category: 'Visual DNA',
    description: 'Photography, design, colour, mood, environment, content pillars, and creative direction truth.',
    summary: 'Creative and visual rules live here so Brand Strategy stays focused on positioning and identity.',
    emptyState: 'No visual DNA truth yet. Add visual systems, photography rules, colour, mood, and creative guardrails.',
  },
  {
    id: 'offers_revenue',
    label: 'Offers & Revenue',
    category: 'Offers & Revenue',
    description: 'Services, menus, offers, prices, revenue-driving campaigns, lead flows, and offer mechanics.',
    summary: 'Revenue entries should connect to structured source material whenever possible.',
    emptyState: 'No offers or revenue truth yet. Add service, offer, campaign, or lead-flow information.',
  },
  {
    id: 'operations',
    label: 'Operations',
    category: 'Operations',
    description: 'Location, contact details, service/process notes, constraints, operating standards, and practical delivery truth.',
    summary: 'Operational facts live here only, so planning and generation do not guess practical details.',
    emptyState: 'No operations truth yet. Add contact, service, process, location, or delivery details.',
  },
  {
    id: 'market_intelligence',
    label: 'Market Intelligence',
    category: 'Market Intelligence',
    description: 'Competitive landscape, review intelligence, reputation signals, press visibility, and market perception.',
    summary: 'Market-facing evidence lives here. Do not duplicate it in Brand Strategy unless it changes positioning.',
    emptyState: 'No market intelligence yet. Add competitors, reviews, press, reputation, and perception signals.',
  },
  {
    id: 'reference_library',
    label: 'Reference Library',
    category: 'Reference Library',
    description: 'Source material: PDFs, menus, old strategy docs, research documents, raw notes, and imported files.',
    summary: 'This is the source shelf. Clean current truth belongs in the sections above.',
    emptyState: 'No source documents or raw notes yet. Add reference material here.',
  },
]

const CONTEXT_ENTRY_CATEGORIES = CONTEXT_SECTIONS
  .filter(section => section.id !== 'knowledge_gaps')
  .map(section => section.category)

const CK_CATS    = CONTEXT_ENTRY_CATEGORIES
const IMP_LABELS: Record<number,string> = { 1:'Low', 2:'Minor', 3:'Normal', 4:'High', 5:'Critical' }

function normalizeContextValue(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function contextSectionById(id: string) {
  return CONTEXT_SECTIONS.find(section => section.id === id) ?? CONTEXT_SECTIONS[0]
}

function contextHaystack(record: Pick<KR, 'category' | 'title' | 'content'>) {
  return normalizeContextValue([record.category, record.title, record.content].join(' '))
}

function canonicalContextSectionId(record: Pick<KR, 'category' | 'title' | 'content'>): ContextSectionId {
  const category = normalizeContextValue(record.category)
  const content = normalizeContextValue(record.content)
  const titleAndCategory = normalizeContextValue([record.category, record.title].join(' '))
  const haystack = contextHaystack(record)

  if (category.includes('client snapshot')) return 'client_snapshot'
  if (category.includes('brand strategy') || category.includes('branding copywriting')) return 'brand_strategy'
  if (category.includes('audience')) return 'audience'
  if (category.includes('visual dna') || category.includes('visual intelligence')) return 'visual_dna'
  if (category.includes('offers revenue') || category.includes('offers activations')) return 'offers_revenue'
  if (category.includes('operations') || category.includes('operations insights')) return 'operations'
  if (category.includes('market intelligence') || category.includes('competitive') || category.includes('reputation') || category.includes('review')) return 'market_intelligence'
  if (category.includes('reference library') || category.includes('internal notes')) return 'reference_library'

  if (titleAndCategory.includes('visual dna') || titleAndCategory.includes('visual system') || titleAndCategory.includes('interior environment') || titleAndCategory.includes('environment intelligence') || titleAndCategory.includes('content intelligence') || titleAndCategory.includes('content pillar') || titleAndCategory.includes('photography') || titleAndCategory.includes('creative direction')) return 'visual_dna'
  if (titleAndCategory.includes('competitive') || titleAndCategory.includes('competitor') || titleAndCategory.includes('review intelligence') || titleAndCategory.includes('reputation') || titleAndCategory.includes('market perception') || titleAndCategory.includes('press') || titleAndCategory.includes('marketing opportunities')) return 'market_intelligence'
  if (titleAndCategory.includes('business overview') || titleAndCategory.includes('operational truth') || titleAndCategory.includes('operating model') || titleAndCategory.includes('location') || titleAndCategory.includes('opening hour') || titleAndCategory.includes('booking') || titleAndCategory.includes('service standard')) return 'operations'
  if (titleAndCategory.includes('revenue') || titleAndCategory.includes('product intelligence') || titleAndCategory.includes('menu') || titleAndCategory.includes('offer')) return 'offers_revenue'
  if (titleAndCategory.includes('audience') || titleAndCategory.includes('customer psychology') || titleAndCategory.includes('persona') || titleAndCategory.includes('segment')) return 'audience'
  if (titleAndCategory.includes('snapshot') || titleAndCategory.includes('executive summary') || titleAndCategory.includes('strategic conclusion')) return 'client_snapshot'
  if (titleAndCategory.includes('brand identity') || titleAndCategory.includes('brand positioning') || titleAndCategory.includes('positioning') || titleAndCategory.includes('brand personality') || titleAndCategory.includes('usp')) return 'brand_strategy'
  if (titleAndCategory.includes('reference') || titleAndCategory.includes('source document') || titleAndCategory.includes('raw note') || titleAndCategory.includes('imported file') || titleAndCategory.includes('old strategy')) return 'reference_library'

  if (content.includes('source document') || content.includes('raw note') || content.includes('imported file') || content.includes('old strategy')) return 'reference_library'
  if (content.includes('review platform') || content.includes('tripadvisor') || content.includes('google review') || content.includes('competitor') || content.includes('press visibility')) return 'market_intelligence'
  if (content.includes('visual dna') || content.includes('photography') || content.includes('colour') || content.includes('color') || content.includes('composition') || content.includes('lighting')) return 'visual_dna'
  if (content.includes('audience') || content.includes('persona') || content.includes('segment') || content.includes('motivation') || content.includes('objection') || content.includes('guest psychology')) return 'audience'
  if (content.includes('opening hour') || content.includes('hours') || content.includes('booking') || content.includes('reservation') || content.includes('contact') || content.includes('location') || content.includes('delivery') || content.includes('takeaway') || content.includes('service note') || content.includes('operational')) return 'operations'
  if (content.includes('menu') || content.includes('business lunch') || content.includes('dubai restaurant week') || content.includes('beverage') || content.includes('dessert') || content.includes('price') || content.includes('offer') || content.includes('activation') || content.includes('revenue')) return 'offers_revenue'
  if (haystack.includes('positioning') || haystack.includes('differentiator') || haystack.includes('brand personality') || haystack.includes('usp') || haystack.includes('brand voice') || haystack.includes('tone of voice') || haystack.includes('what the brand is') || haystack.includes('brand rule') || haystack.includes('storytelling')) return 'brand_strategy'
  return 'reference_library'
}

function contextEntryMatches(record: KR, view: string) {
  if (view === 'knowledge_gaps') return false
  return canonicalContextSectionId(record) === view
}

function dedupeContextEntries(records: KR[]) {
  const byFingerprint = new Map<string, KR>()
  records.forEach(record => {
    const fingerprint = normalizeContextValue(`${record.title} ${record.content}`)
    const existing = byFingerprint.get(fingerprint)
    if (!existing) {
      byFingerprint.set(fingerprint, record)
      return
    }
    const existingScore = (existing.status === 'approved' ? 2 : 0) + (existing.importance ?? 0)
    const nextScore = (record.status === 'approved' ? 2 : 0) + (record.importance ?? 0)
    const existingTime = new Date(existing.updated_at ?? existing.created_at).getTime()
    const nextTime = new Date(record.updated_at ?? record.created_at).getTime()
    if (nextScore > existingScore || (nextScore === existingScore && nextTime > existingTime)) {
      byFingerprint.set(fingerprint, record)
    }
  })
  return Array.from(byFingerprint.values()).sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
}

function contextReviewStatus(records: KR[], sectionId: string): ContextReviewStatus {
  if (sectionId === 'knowledge_gaps') return 'Needs Review'
  if (records.length === 0) return 'Missing'
  const haystack = normalizeContextValue(records.map(record => `${record.title} ${record.content} ${record.status}`).join(' '))
  if (haystack.includes('outdated') || haystack.includes('old ') || haystack.includes('deprecated')) return 'Outdated'
  if (records.some(record => record.status !== 'approved') || haystack.includes('needs review') || haystack.includes('unclear') || haystack.includes('confirm') || haystack.includes('tbd')) return 'Needs Review'
  return 'Current'
}

function formatContextDate(value: string | null | undefined) {
  if (!value) return 'Not updated'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function contextLastUpdated(records: KR[]) {
  if (records.length === 0) return null
  return records.reduce<string | null>((latest, record) => {
    const value = record.updated_at ?? record.created_at
    if (!latest) return value
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  }, null)
}

// ─── Brain Entry Card ─────────────────────────────────────────────────────────

function BrainEntryCard({
  record, onUpdate, onArchive, onDelete,
}: {
  record:    KR
  onUpdate:  (r: KR) => void
  onArchive: () => void
  onDelete:  () => void
}) {
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [title,      setTitle]      = useState(record.title)
  const [content,    setContent]    = useState(record.content)
  const [category,   setCategory]   = useState(record.category)
  const [importance, setImportance] = useState(record.importance)

  // Treat 'active' as 'draft', 'approved' stays 'approved'
  const displayStatus = record.status === 'approved' ? 'approved' : 'draft'

  async function save() {
    setSaving(true)
    const { data, error } = await supabase
      .from('client_knowledge')
      .update({ title, content, category, importance })
      .eq('id', record.id)
      .select().single()
    if (!error && data) { onUpdate(data as KR); setEditing(false) }
    setSaving(false)
  }

  async function toggleStatus() {
    const next = displayStatus === 'approved' ? 'active' : 'approved'
    const { data, error } = await supabase
      .from('client_knowledge').update({ status: next }).eq('id', record.id).select().single()
    if (!error && data) onUpdate(data as KR)
  }

  function cancelEdit() {
    setTitle(record.title); setContent(record.content)
    setCategory(record.category); setImportance(record.importance)
    setEditing(false)
  }

  const PREVIEW = 160

  if (editing) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-white px-4 py-4 space-y-3 shadow-sm">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-gray-500"
        />
        <textarea value={content} onChange={e => setContent(e.target.value)}
          rows={Math.max(3, content.split('\n').length + 1)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 leading-relaxed outline-none focus:border-gray-500 resize-y"
        />
        <div className="flex flex-wrap gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 outline-none">
            {CK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={importance} onChange={e => setImportance(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 outline-none">
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{IMP_LABELS[n]}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !title.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40 transition">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancelEdit}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 hover:border-gray-300 transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{record.title}</p>
            {/* Status pill — click to toggle */}
            <button
              onClick={toggleStatus}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                displayStatus === 'approved'
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {displayStatus === 'approved' ? '✓ Approved' : 'Draft'}
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed">
            {!expanded && record.content.length > PREVIEW ? (
              <>
                {record.content.slice(0, PREVIEW)}…{' '}
                <button onClick={() => setExpanded(true)} className="text-gray-400 underline hover:text-gray-600 text-xs">more</button>
              </>
            ) : (
              <>
                {record.content}
                {record.content.length > PREVIEW &&
                  <button onClick={() => setExpanded(false)} className="ml-1 text-gray-400 underline hover:text-gray-600 text-xs">less</button>
                }
              </>
            )}
          </p>
          <p className="mt-1.5 text-[10px] text-gray-400">{record.category}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button onClick={() => setEditing(true)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-800 transition">
            Edit
          </button>
          <button onClick={onArchive}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:border-amber-200 hover:text-amber-600 transition">
            Archive
          </button>
          <button onClick={() => { if (confirm(`Delete "${record.title}"? It will be hidden but retained in the database.`)) onDelete() }}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:border-red-200 hover:text-red-500 transition">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Content library ─────────────────────────────────────────────────────────

const ALL_UPLOAD_CATS = [
  { id: 'all',              label: 'All' },
  { id: 'interiors',        label: 'Interiors' },
  { id: 'exteriors',        label: 'Exteriors' },
  { id: 'venue_items',      label: 'Venue Items' },
  { id: 'food',             label: 'Food' },
  { id: 'food_studio_shots', label: 'Studio Food Shots' },
  { id: 'drinks',           label: 'Drinks' },
  { id: 'drink_studio_shots', label: 'Studio Drink Shots' },
  { id: 'lifestyle',        label: 'Lifestyle' },
  { id: 'bts_service',      label: 'BTS / Service' },
  { id: 'pinterest_inspiration', label: 'Pinterest' },
  { id: 'background_presets', label: 'Background Presets' },
]

const VIEW_ONLY_UPLOAD_CAT_IDS = new Set(['all'])
const STORED_UPLOAD_CATS = ALL_UPLOAD_CATS.filter(item => !VIEW_ONLY_UPLOAD_CAT_IDS.has(item.id))
const ALWAYS_VISIBLE_UPLOAD_CATS = new Set(['all', 'interiors', 'exteriors', 'venue_items', 'food', 'food_studio_shots', 'drinks', 'drink_studio_shots', 'lifestyle', 'bts_service', 'pinterest_inspiration', 'background_presets'])
const IMAGE_CAT_IDS = new Set(['interiors','exteriors','food','food_studio_shots','breakfast','drinks','drink_studio_shots','venue_items','venue_outfits','blueprint_layouts','guest_models','lifestyle','bts_service','pinterest_inspiration','background_presets'])
const PINTEREST_USAGE_CATEGORY_OPTIONS = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Lifestyle',
  'Food',
  'Drinks',
  'BTS / Service',
  'Terrace',
  'Interior',
  'Exterior',
  'Social Media',
  'Graphic Design',
  'AI Photography',
  'AI Videography',
] as const
const ASSET_SOURCE_TYPE_OPTIONS = [
  'client_uploaded_asset',
  'client_owned_asset',
  'content_database',
  'pinterest_inspiration',
  'external_inspiration',
  'graphics',
  'generated_asset',
] as const
const NORMALIZED_ROLE_OPTIONS = [
  'venue_interior',
  'venue_exterior',
  'studio_food',
  'studio_drink',
  'food',
  'drink',
  'human',
  'staff',
  'tableware',
  'style_reference',
  'graphic',
  'inspiration',
  'uncategorized',
] as const
const GENERATION_APPROVED_SOURCE_TYPES = new Set(['client_uploaded_asset', 'client_owned_asset', 'content_database'])
type AssetSourceTypeOption = typeof ASSET_SOURCE_TYPE_OPTIONS[number]
type NormalizedRoleOption = typeof NORMALIZED_ROLE_OPTIONS[number]
type UniversalAssetMetadataDraft = {
  title: string
  display_name: string
  slug: string
  source_type: AssetSourceTypeOption
  normalized_role: NormalizedRoleOption
  tags: string
  description: string
  usage_notes: string
  client_truth_reference: boolean
  approved_for_generation: boolean
}

type MetadataIntelligenceDraft = {
  dish_name: string
  menu_source_id: string
  menu_source_ids: string[]
  menu_category: string
  menu_description: string
  price: string
  metadata_source: string
  short_description: string
  ingredients: string
  allergens: string
  plating: string
  garnish: string
  vessel: string
  sauces: string
  portion_logic: string
  serving_count: string
  angle: string
  lighting: string
  composition: string
  mood: string
  textures: string
  surface: string
  liquid_color: string
  foam_or_clarity: string
  ice: string
  smoke_or_dry_ice: string
  scale: string
  background: string
  venue_zone: string
  table_family: string
  seating_family: string
  lighting_family: string
  spatial_role: string
  generation_risks: string
  strict_negatives: string
  provider_notes: string
}

type AiMetadataProposal = {
  proposed_metadata?: Record<string, unknown>
  validation?: {
    status?: 'strong_match' | 'needs_review' | 'mismatch' | string
    menuMatchConfidence?: number
    imageValidationConfidence?: number
    finalConfidence?: number
    contradiction?: boolean
    warning?: string
    menuDishFamily?: string
    imageClassification?: {
      visibleFoodType?: string
      dishFamily?: string
      mainVisualComponents?: string[]
      vesselOrPlateType?: string
      confidence?: number
      source?: string
      reasoning?: string
    }
    comparedMenuEntry?: {
      id?: string
      dishName?: string
      menuSourceName?: string
      ingredients?: string[]
      description?: string
      price?: string
    }
  }
  reasoning?: {
    summary?: string
    detected_food_type?: string
    detected_plating?: string
    detected_visual_structure?: string
    uncertainty_warnings?: string[]
    confidence?: Record<string, number>
    sources?: Record<string, string>
  }
  provider?: string
  model?: string
  error?: string
  menu_debug?: {
    searchedDishName?: string
    selectedCategory?: string
    selectedMenuSourceId?: string
    selectedMenuSourceName?: string
    selectedMenuSourceIds?: string[]
    selectedMenuSourceNames?: string[]
    fallbackToAllMenus?: boolean
    menuEntriesSearched?: number
    topMatches?: Array<{
      score?: number
      reason?: string
      dishName?: string
      menuCategory?: string
      menuSourceId?: string | null
      menuSourceName?: string
      menuName?: string
      menuDescription?: string
      ingredients?: string[]
      allergens?: string[]
      price?: string
      source?: string
      sourceFile?: string
      sourceStatus?: string
      menuEntryId?: string
    }>
    sourceFilesSearched?: string[]
    structuredMenuAvailable?: boolean
  }
}

const METADATA_LOCKABLE_FIELDS = [
  'title',
  'display_name',
  'slug',
  'category',
  'source_type',
  'normalized_role',
  'client_truth_reference',
  'approved_for_generation',
  'dish_name',
  'menu_source_id',
  'menu_source_ids',
  'menu_category',
  'menu_description',
  'price',
  'short_description',
  'ingredients',
  'allergens',
  'plating',
  'garnish',
  'vessel',
  'sauces',
  'portion_logic',
  'serving_count',
  'angle',
  'lighting',
  'composition',
  'mood',
  'textures',
  'surface',
  'liquid_color',
  'foam_or_clarity',
  'ice',
  'smoke_or_dry_ice',
  'scale',
  'background',
  'venue_zone',
  'table_family',
  'seating_family',
  'lighting_family',
  'spatial_role',
  'generation_risks',
  'strict_negatives',
  'usage_notes',
  'provider_notes',
] as const

type MetadataLockField = typeof METADATA_LOCKABLE_FIELDS[number]
type PinterestUsageCategory = typeof PINTEREST_USAGE_CATEGORY_OPTIONS[number]
type PinterestMetadataDraft = {
  referenceName: string
  usageCategories: PinterestUsageCategory[]
  learnFrom: string
  sourceUrl: string
  tags: string
  approvedForInspiration: boolean
}

function assetText(asset: AssetUpload) {
  return [
    asset.file_name,
    asset.asset_category,
    asset.status,
    asset.source_quality,
    JSON.stringify(asset.metadata ?? {}),
  ].join(' ').toLowerCase()
}

function assetMetadataRecord(asset: AssetUpload): Record<string, unknown> {
  return isRecord(asset.metadata) ? asset.metadata as Record<string, unknown> : {}
}

function stringMeta(asset: AssetUpload, keys: string[]) {
  const metadata = assetMetadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return ''
}

function booleanMeta(asset: AssetUpload, keys: string[]) {
  const metadata = assetMetadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (value === true) return true
    if (typeof value === 'string' && /^(true|yes|1)$/i.test(value.trim())) return true
  }
  return false
}

function arrayMeta(asset: AssetUpload, keys: string[]) {
  const metadata = assetMetadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
    if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  return []
}

function normalizePinterestUsageCategories(values: string[]) {
  return values.filter((value): value is PinterestUsageCategory =>
    PINTEREST_USAGE_CATEGORY_OPTIONS.includes(value as PinterestUsageCategory)
  )
}

function createPinterestDraft(asset: AssetUpload): PinterestMetadataDraft {
  return {
    referenceName: stringMeta(asset, ['reference_name', 'title', 'name', 'pinTitle']) || assetTitle(asset),
    usageCategories: normalizePinterestUsageCategories(arrayMeta(asset, ['inspiration_usage_categories', 'usage_categories', 'usage'])),
    learnFrom: stringMeta(asset, ['what_to_learn', 'learn_from', 'notes', 'description']),
    sourceUrl: stringMeta(asset, ['source_url', 'sourceUrl', 'url']),
    tags: arrayMeta(asset, ['tags']).join(', '),
    approvedForInspiration: booleanMeta(asset, ['approved_for_inspiration', 'approvedForInspiration']),
  }
}

function pinterestDraftToMetadata(draft: PinterestMetadataDraft, existing: Record<string, unknown>) {
  const tags = draft.tags.split(',').map(tag => tag.trim()).filter(Boolean)
  return {
    ...existing,
    title: draft.referenceName.trim(),
    reference_name: draft.referenceName.trim(),
    source: 'pinterest',
    source_type: 'pinterest_inspiration',
    normalized_role: 'inspiration',
    asset_role: 'inspiration',
    inspirationOnly: true,
    inspiration_only: true,
    inspiration_usage_categories: draft.usageCategories,
    usage_categories: draft.usageCategories,
    what_to_learn: draft.learnFrom.trim(),
    learn_from: draft.learnFrom.trim(),
    notes: draft.learnFrom.trim(),
    source_url: draft.sourceUrl.trim(),
    sourceUrl: draft.sourceUrl.trim(),
    tags,
    approved_for_inspiration: draft.approvedForInspiration,
    approvedForInspiration: draft.approvedForInspiration,
    client_truth_reference: false,
    approved_for_generation: false,
  } as Record<string, unknown>
}

function hasUsefulPinterestMetadata(asset: AssetUpload) {
  return Boolean(
    stringMeta(asset, ['reference_name', 'title', 'name', 'pinTitle'])
    || stringMeta(asset, ['what_to_learn', 'learn_from', 'notes', 'description'])
    || stringMeta(asset, ['source_url', 'sourceUrl', 'url'])
    || arrayMeta(asset, ['inspiration_usage_categories', 'usage_categories', 'usage']).length > 0
    || arrayMeta(asset, ['tags']).length > 0
    || booleanMeta(asset, ['approved_for_inspiration', 'approvedForInspiration'])
  )
}

function normalizeAssetCategoryValue(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function inferAssetSourceType(asset: AssetUpload): AssetSourceTypeOption {
  const explicit = stringMeta(asset, ['source_type', 'asset_source', 'source'])
  if (ASSET_SOURCE_TYPE_OPTIONS.includes(explicit as AssetSourceTypeOption)) return explicit as AssetSourceTypeOption
  const category = normalizeAssetCategoryValue(asset.asset_category)
  const text = assetText(asset)
  if (category === 'pinterest_inspiration' || text.includes('pinterest')) return 'pinterest_inspiration'
  if (text.includes('external_inspiration') || text.includes('competitor') || text.includes('source_url')) return 'external_inspiration'
  if (['offer_flyer', 'brand_deck', 'social_screenshot'].includes(category)) return 'graphics'
  if (text.includes('ai generated') || text.includes('generated_asset') || text.includes('studio_generated')) return 'generated_asset'
  return 'client_uploaded_asset'
}

function inferNormalizedAssetRole(asset: AssetUpload): NormalizedRoleOption {
  const explicit = stringMeta(asset, ['normalized_role', 'asset_role'])
  if (NORMALIZED_ROLE_OPTIONS.includes(explicit as NormalizedRoleOption)) return explicit as NormalizedRoleOption
  const category = normalizeAssetCategoryValue(asset.asset_category)
  const text = assetText(asset)
  if (category === 'food_studio_shots' || text.includes('studio_food')) return 'studio_food'
  if (category === 'drink_studio_shots' || text.includes('studio_drink')) return 'studio_drink'
  if (['interiors', 'interior', 'venue_interior'].includes(category) || text.includes('venue_interior') || text.includes('restaurant interior')) return 'venue_interior'
  if (['exteriors', 'exterior', 'venue_exterior'].includes(category) || text.includes('venue_exterior') || text.includes('terrace')) return 'venue_exterior'
  if (['food', 'breakfast'].includes(category)) return 'food'
  if (category === 'drinks') return 'drink'
  if (category === 'guest_models' || text.includes('model') || text.includes('guest')) return 'human'
  if (category === 'lifestyle') return 'human'
  if (category === 'venue_items' || text.includes('tableware') || text.includes('serviceware')) return 'tableware'
  if (category === 'pinterest_inspiration') return 'inspiration'
  if (['offer_flyer', 'brand_deck', 'social_screenshot'].includes(category)) return 'graphic'
  return 'uncategorized'
}

function normalizeFoodMenuCategory(value: string | null | undefined) {
  return resolveMenuSource(value)?.label ?? ''
}

function normalizeFoodMenuSourceId(value: string | null | undefined) {
  return resolveMenuSource(value)?.id ?? ''
}

function normalizeFoodMenuSourceIds(values: unknown, fallback?: string | null) {
  const rawValues = [
    ...(Array.isArray(values) ? values : typeof values === 'string' && values.trim() ? values.split(',') : []),
    ...(fallback ? [fallback] : []),
  ]
  return Array.from(new Set(rawValues.map(value => resolveMenuSource(String(value))?.id).filter((value): value is MenuSourceId => Boolean(value))))
}

function menuLabelsFromIds(ids: string[]) {
  return ids.map(id => resolveMenuSource(id)?.label).filter(Boolean).map(String)
}

function isFoodMetadataAsset(asset: AssetUpload) {
  const role = inferNormalizedAssetRole(asset)
  const category = normalizeAssetCategoryValue(asset.asset_category)
  return role === 'food' || role === 'studio_food' || foodTruthEligibility(asset).eligible || ['food', 'food_studio_shots', 'breakfast'].includes(category)
}

function isDrinkMetadataAsset(asset: AssetUpload) {
  const role = inferNormalizedAssetRole(asset)
  const category = normalizeAssetCategoryValue(asset.asset_category)
  return role === 'drink' || role === 'studio_drink' || drinkTruthEligibility(asset).eligible || ['drinks', 'drink_studio_shots'].includes(category)
}

function isInteriorMetadataAsset(asset: AssetUpload) {
  const category = normalizeAssetCategoryValue(asset.asset_category)
  const role = inferNormalizedAssetRole(asset)
  return category === 'interiors' || category === 'interior' || role === 'venue_interior'
}

function isBackgroundPresetAsset(asset: AssetUpload) {
  const category = normalizeAssetCategoryValue(asset.asset_category)
  const metadata = assetMetadataRecord(asset)
  const explicitType = [
    metadata.reference_type,
    metadata.workflow_type,
    metadata.asset_type,
    metadata.assetType,
    metadata.normalized_role,
    metadata.asset_role,
    metadata.role,
    metadata.preset_type,
  ].map(value => String(value ?? '').toLowerCase()).join(' ')
  return category === 'background_presets'
    || metadata.background_preset === true
    || metadata.is_background_preset === true
    || typeof metadata.background_preset_id === 'string'
    || explicitType.includes('background_preset')
    || explicitType.includes('background preset')
    || explicitType.includes('surface_texture_background')
    || explicitType.includes('surface texture background')
}

function isInteriorContentAsset(asset: AssetUpload) {
  const category = normalizeAssetCategoryValue(asset.asset_category)
  return category === 'interiors'
}

function isExteriorContentAsset(asset: AssetUpload) {
  const category = normalizeAssetCategoryValue(asset.asset_category)
  return category === 'exteriors'
}

function isVenueItemContentAsset(asset: AssetUpload) {
  return normalizeAssetCategoryValue(asset.asset_category) === 'venue_items'
}

function isBtsServiceContentAsset(asset: AssetUpload) {
  const classification = classifyClientAsset(asset)
  const category = normalizeAssetCategoryValue(asset.asset_category)
  const text = assetText(asset)
  if (classification.primaryType === 'food' || classification.primaryType === 'drink' || classification.primaryType === 'venue' || classification.primaryType === 'graphic' || classification.isInspirationOnly) return false
  return category === 'bts_service'
    || classification.roles.includes('staff')
    || text.includes('bts')
    || text.includes('behind the scenes')
    || text.includes('service standard')
    || text.includes('hospitality moment')
    || text.includes('staff reference')
}

function hasUsefulAssetMetadata(asset: AssetUpload) {
  const metadata = assetMetadataRecord(asset)
  const ignored = new Set(['locked_fields', 'metadata_locks', 'category_migrated_at', 'previous_asset_category'])
  return Object.entries(metadata).some(([key, value]) => !ignored.has(key) && hasMetadataValue(value as AssetMetadataValue))
}

function assetNeedsMetadata(asset: AssetUpload) {
  if (!IMAGE_CAT_IDS.has(normalizeAssetCategoryValue(asset.asset_category))) return false
  if (isInspirationAsset(asset)) return !hasUsefulPinterestMetadata(asset)
  if (isVenueLikeSpatialAsset(asset)) return getAssetMetadataCompleteness(asset) !== 'complete'
  return !hasUsefulAssetMetadata(asset)
}

function normalizedMetadataValue(asset: AssetUpload, keys: string[]) {
  return stringMeta(asset, keys).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function metadataSourceValue(asset: AssetUpload) {
  return normalizedMetadataValue(asset, ['metadata_source'])
}

function metadataConfidenceValue(asset: AssetUpload) {
  return stringMeta(asset, ['metadata_confidence']).trim()
}

function metadataReviewStatusValue(asset: AssetUpload) {
  return normalizedMetadataValue(asset, ['metadata_review_status'])
}

function isStudioFoodShotAsset(asset: AssetUpload) {
  return normalizeAssetCategoryValue(asset.asset_category) === 'food_studio_shots'
}

function isKnownStudioFoodVisionQueueAsset(asset: AssetUpload) {
  if (!isStudioFoodShotAsset(asset)) return false
  const text = normalizeAssetCategoryValue(assetTitle(asset) || asset.file_name)
  return text.includes('tajarin') && (text.includes('seaurchin') || text.includes('sea_urchin') || text.includes('caviar') || text.includes('supplement'))
    || text.includes('sunchoke_risotto') && (text.includes('black_truffle') || text.includes('supplement'))
    || text.includes('australian_black_angus_steak')
}

function assetNeedsVisualMetadataReview(asset: AssetUpload) {
  const reviewStatus = metadataReviewStatusValue(asset)
  const source = metadataSourceValue(asset)
  return reviewStatus === 'requires_visual_review'
    || reviewStatus === 'needs_visual_review'
    || reviewStatus === 'manual_review'
    || reviewStatus === 'needs_review'
    || source === 'vision_queue'
    || isKnownStudioFoodVisionQueueAsset(asset)
}

function assetMetadataApproved(asset: AssetUpload) {
  const reviewStatus = metadataReviewStatusValue(asset)
  return reviewStatus === 'approved_deterministic' || reviewStatus === 'approved' || reviewStatus === 'current'
}

function assetMenuLinked(asset: AssetUpload) {
  const source = metadataSourceValue(asset)
  const reviewStatus = metadataReviewStatusValue(asset)
  return source === 'structured_menu_exact_match'
    || source === 'structured_menu_alias_match'
    || reviewStatus === 'approved_deterministic'
    || Boolean(stringMeta(asset, ['menuEntryId', 'menu_entry_id']))
}

function assetNonMenu(asset: AssetUpload) {
  const source = metadataSourceValue(asset)
  const reviewStatus = metadataReviewStatusValue(asset)
  const contentRole = normalizedMetadataValue(asset, ['content_role', 'menu_item_status'])
  return source === 'deterministic_breakfast_asset_rule'
    || reviewStatus === 'deterministic_non_menu'
    || contentRole.includes('non_menu')
    || contentRole.includes('not_menu_item')
}

function assetPromotional(asset: AssetUpload) {
  const source = metadataSourceValue(asset)
  const contentRole = normalizedMetadataValue(asset, ['content_role', 'menuSourceName', 'menu_source_name'])
  return source === 'deterministic_promotional_food_asset_rule'
    || contentRole.includes('promotional_food_asset')
    || contentRole.includes('promotional')
}

function compactMetadataLabel(value: string) {
  const normalized = value.trim()
  const mapped: Record<string, string> = {
    structured_menu_exact_match: 'structured exact',
    structured_menu_alias_match: 'structured alias',
    deterministic_breakfast_asset_rule: 'breakfast rule',
    deterministic_promotional_food_asset_rule: 'promo rule',
    approved_deterministic: 'approved',
    deterministic_non_menu: 'non-menu',
    exact_match: 'exact',
    alias_match: 'alias',
    'Exact Match': 'exact',
    'Alias Match': 'alias',
    'Promotional Food Asset': 'promo',
    'Non-Menu Breakfast Asset': 'non-menu',
  }
  return mapped[normalized] || normalized.replace(/_/g, ' ')
}

function metadataBadgeClass(tone: 'green' | 'amber' | 'blue' | 'gray' | 'rose') {
  if (tone === 'green') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (tone === 'amber') return 'border-yellow-300 bg-yellow-50 text-yellow-800'
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-gray-200 bg-white text-gray-600'
}

function assetMetadataBadges(asset: AssetUpload) {
  const source = stringMeta(asset, ['metadata_source'])
  const confidence = stringMeta(asset, ['metadata_confidence'])
  const reviewStatus = stringMeta(asset, ['metadata_review_status'])
  const badges: Array<{ key: string; label: string; tone: 'green' | 'amber' | 'blue' | 'gray' | 'rose'; title: string }> = []
  if (source) {
    badges.push({
      key: 'metadata_source',
      label: `source: ${compactMetadataLabel(source)}`,
      tone: source.includes('promotional') ? 'blue' : source.includes('breakfast') ? 'amber' : 'green',
      title: `metadata_source: ${source}`,
    })
  }
  if (confidence) {
    badges.push({
      key: 'metadata_confidence',
      label: `confidence: ${compactMetadataLabel(confidence)}`,
      tone: confidence.toLowerCase().includes('manual') ? 'amber' : 'green',
      title: `metadata_confidence: ${confidence}`,
    })
  }
  if (reviewStatus) {
    badges.push({
      key: 'metadata_review_status',
      label: `review: ${compactMetadataLabel(reviewStatus)}`,
      tone: reviewStatus.includes('non_menu') ? 'amber' : reviewStatus.includes('review') ? 'rose' : 'green',
      title: `metadata_review_status: ${reviewStatus}`,
    })
  }
  if (assetNeedsVisualMetadataReview(asset)) {
    badges.push({
      key: 'needs_visual_review',
      label: 'Needs Visual Review',
      tone: 'rose',
      title: 'Needs Visual Review: deterministic menu metadata was intentionally skipped.',
    })
  }
  return badges
}

type VisualReviewAction = 'approve_menu_item' | 'mark_non_menu_asset' | 'mark_promotional_asset' | 'leave_unresolved'
type VisualReviewSelection = {
  action?: VisualReviewAction
  candidate?: string
  decidedAt: string
}

const VISUAL_REVIEW_ACTION_LABELS: Record<VisualReviewAction, string> = {
  approve_menu_item: 'Approve as menu item',
  mark_non_menu_asset: 'Mark as non-menu asset',
  mark_promotional_asset: 'Mark as promotional asset',
  leave_unresolved: 'Leave unresolved',
}

function studioFoodVisualReviewDetails(asset: AssetUpload) {
  const title = assetTitle(asset)
  const normalizedTitle = normalizeAssetCategoryValue(title || asset.file_name)
  const defaultReason = 'Deterministic structured-menu matching intentionally skipped this asset because the visual/menu relationship needs a human decision before metadata is written.'
  if (normalizedTitle.includes('tajarin')) {
    return {
      reason: 'The filename points to Tajarin with Sea Urchin / Caviar supplement. The base menu item and supplement choice need manual confirmation before assigning menu metadata.',
      candidates: [
        {
          label: 'Tajarin with Sea Urchin supplement',
          note: 'Approve only if the visible dish is the sea urchin supplement version.',
        },
        {
          label: 'Tajarin with Caviar supplement',
          note: 'Approve only if the visible dish is the caviar supplement version.',
        },
        {
          label: 'Tajarin supplement content asset',
          note: 'Use if it should remain a content/reference asset rather than a canonical menu item.',
        },
      ],
    }
  }
  if (normalizedTitle.includes('sunchoke_risotto')) {
    return {
      reason: 'The filename points to Sunchoke Risotto with Black Truffle supplement. The supplement relationship needs human confirmation before structured menu metadata is applied.',
      candidates: [
        {
          label: 'Sunchoke Risotto with Black Truffle supplement',
          note: 'Approve if this is the truffle supplement version of the menu dish.',
        },
        {
          label: 'Sunchoke Risotto content asset',
          note: 'Use if the image should remain a non-menu visual reference.',
        },
      ],
    }
  }
  if (normalizedTitle.includes('australian_black_angus_steak')) {
    return {
      reason: 'The steak asset could be a specific menu item or a broader food/content asset. Human review is required before linking it to structured menu pricing, ingredients, and allergens.',
      candidates: [
        {
          label: 'Australian Black Angus Steak',
          note: 'Approve if this exact dish exists in the current structured menu source.',
        },
        {
          label: 'Steak Frites menu entry',
          note: 'Approve only if this visual clearly represents the Steak Frites menu item.',
        },
        {
          label: 'Steak content asset',
          note: 'Use if this should stay as a food reference without menu truth.',
        },
      ],
    }
  }
  return {
    reason: defaultReason,
    candidates: [
      {
        label: title || 'Manual menu candidate',
        note: 'Review visually before approving as structured menu truth.',
      },
      {
        label: 'Non-menu food asset',
        note: 'Use if this is useful content but not a menu item.',
      },
      {
        label: 'Promotional food asset',
        note: 'Use if this belongs to a campaign, platter, or temporary promotion.',
      },
    ],
  }
}

function assetTitle(asset: AssetUpload) {
  return stringMeta(asset, ['title', 'name', 'dish_name', 'drink_name']) || asset.file_name.replace(/---[a-f0-9-]{36}/, '').replace(/^\d+_\d+_/, '').replace(/\.[^.]+$/, '')
}

function assetDescription(asset: AssetUpload) {
  return stringMeta(asset, ['description', 'notes', 'summary', 'extracted_summary'])
}

function assetDimensions(asset: AssetUpload) {
  const width = (asset.original_width ?? asset.optimized_width ?? asset.ai_preview_width ?? Number(stringMeta(asset, ['width', 'original_width']))) || 0
  const height = (asset.original_height ?? asset.optimized_height ?? asset.ai_preview_height ?? Number(stringMeta(asset, ['height', 'original_height']))) || 0
  return width > 0 && height > 0 ? `${width}×${height}` : '—'
}

function createUniversalDraft(asset: AssetUpload): UniversalAssetMetadataDraft {
  return {
    title: assetTitle(asset),
    display_name: stringMeta(asset, ['display_name']) || assetTitle(asset),
    slug: stringMeta(asset, ['slug']),
    source_type: inferAssetSourceType(asset),
    normalized_role: inferNormalizedAssetRole(asset),
    tags: arrayMeta(asset, ['tags', 'usage']).join(', '),
    description: assetDescription(asset),
    usage_notes: stringMeta(asset, ['usage_notes', 'usage']),
    client_truth_reference: booleanMeta(asset, ['client_truth_reference']) || GENERATION_APPROVED_SOURCE_TYPES.has(inferAssetSourceType(asset)),
    approved_for_generation: booleanMeta(asset, ['approved_for_generation', 'approved_for_generation_truth']),
  }
}

function createIntelligenceDraft(asset: AssetUpload): MetadataIntelligenceDraft {
  const read = (keys: string[]) => stringMeta(asset, keys)
  const menuIngredients = read(['menu_ingredients', 'menuIngredients', 'ingredients']) || read(['menu_description', 'menuDescription', 'menu_wording', 'menu_item_description'])
  const menuSource = resolveMenuSource(read(['menu_source_id', 'menuSourceId', 'menu_id', 'menuId', 'menu_source_name', 'menuSourceName', 'menu_category', 'meal_period', 'category']))
  const drinkAsset = isDrinkMetadataAsset(asset)
  const menuSourceIds = normalizeFoodMenuSourceIds(arrayMeta(asset, ['menu_source_ids', 'menuSourceIds', 'menu_ids', 'menuIds', 'menu_source_labels', 'menuSourceLabels']), menuSource?.id || (drinkAsset ? 'beverage_menu' : undefined))
  return {
    dish_name: read(['drink_name', 'drinkName', 'dish_name', 'foodName', 'food_name', 'dishName', 'name']),
    menu_source_id: menuSourceIds[0] ?? menuSource?.id ?? '',
    menu_source_ids: menuSourceIds,
    menu_category: menuLabelsFromIds(menuSourceIds).join(' + ') || menuSource?.label || normalizeFoodMenuCategory(read(['menu_category', 'meal_period', 'category'])),
    menu_description: read(['menu_description', 'menuDescription', 'menu_wording', 'menu_item_description']),
    price: read(['price', 'menu_price']),
    metadata_source: read(['metadata_source', 'sourceStatus', 'source_status', 'menu_match_status']) || 'manual',
    short_description: read(['shortPlateDescription', 'short_plate_description', 'short_description', 'description', 'notes']),
    ingredients: menuIngredients,
    allergens: read(['allergens', 'allergen_notes']),
    plating: read(['plating', 'presentation', 'shape_structure']),
    garnish: read(['garnish']),
    vessel: read(['serving_vessel', 'vessel', 'glass_shape', 'glass']),
    sauces: read(['sauce', 'sauces']),
    portion_logic: read(['portion_logic', 'scale', 'shape_structure']),
    serving_count: read(['serving_count', 'item_count', 'plate_count']),
    angle: read(['angle', 'camera_angle', 'cameraAngle']),
    lighting: read(['lighting', 'lighting_style', 'lightingStyle']),
    composition: read(['composition', 'composition_type', 'compositionType']),
    mood: read(['mood', 'emotional_tone', 'emotionalTone']),
    textures: read(['textures', 'texture_notes', 'material']),
    surface: read(['surface', 'surface_material', 'table_material']),
    liquid_color: read(['liquid_color', 'liquidColor']),
    foam_or_clarity: read(['foam_or_clarity', 'foamOrClarity']),
    ice: read(['ice']),
    smoke_or_dry_ice: read(['smoke_or_dry_ice', 'smoke', 'contains_smoke_effect', 'dry_ice']),
    scale: read(['scale']),
    background: read(['background', 'background_constraints']),
    venue_zone: read(['venue_zone', 'zone', 'zoneName', 'zone_name']),
    table_family: read(['table_family', 'table_shape', 'table_material']),
    seating_family: read(['seating_family', 'seating']),
    lighting_family: read(['lighting_family', 'chandelier_style']),
    spatial_role: read(['spatial_role', 'spatialRole', 'area']),
    generation_risks: read(['generation_risks', 'risk_warnings']),
    strict_negatives: read(['strict_negatives', 'do_not_add', 'do_not_invent']),
    provider_notes: read(['provider_notes']),
  }
}

function universalDraftToMetadata(draft: UniversalAssetMetadataDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    display_name: draft.display_name.trim(),
    slug: draft.slug.trim(),
    source_type: draft.source_type,
    normalized_role: draft.normalized_role,
    asset_role: draft.normalized_role,
    tags: draft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    description: draft.description.trim(),
    notes: draft.description.trim(),
    usage_notes: draft.usage_notes.trim(),
    client_truth_reference: draft.client_truth_reference,
    approved_for_generation: draft.approved_for_generation,
  }
}

function intelligenceDraftToMetadata(draft: MetadataIntelligenceDraft): Record<string, unknown> {
  const menuIngredients = draft.ingredients.trim()
  const shortPlateDescription = draft.short_description.trim()
  const menuSourceIds = draft.menu_source_ids.length > 0 ? draft.menu_source_ids : draft.menu_source_id ? [draft.menu_source_id] : []
  const menuSourceLabels = menuLabelsFromIds(menuSourceIds)
  return {
    dish_name: draft.dish_name.trim(),
    drink_name: draft.dish_name.trim(),
    drinkName: draft.dish_name.trim(),
    menu_category: menuSourceLabels.join(' + ') || draft.menu_category,
    menu_source_id: menuSourceIds[0] ?? '',
    menuSourceId: menuSourceIds[0] ?? '',
    menu_id: menuSourceIds[0] ?? '',
    menu_source_ids: menuSourceIds,
    menuSourceIds,
    menu_ids: menuSourceIds,
    menuSourceName: menuSourceLabels[0] ?? draft.menu_category,
    menu_source_name: menuSourceLabels[0] ?? draft.menu_category,
    menuSourceLabels,
    menu_source_labels: menuSourceLabels,
    meal_period: menuSourceLabels.join(' + ') || draft.menu_category,
    menu_description: menuIngredients,
    menuIngredients,
    menu_ingredients: menuIngredients,
    price: draft.price.trim(),
    menu_price: draft.price.trim(),
    metadata_source: draft.metadata_source.trim() || 'manual',
    sourceStatus: draft.metadata_source.trim() || 'manual',
    short_description: shortPlateDescription,
    shortPlateDescription,
    short_plate_description: shortPlateDescription,
    description: shortPlateDescription,
    notes: shortPlateDescription,
    ingredients: menuIngredients,
    allergens: draft.allergens.trim(),
    plating: draft.plating.trim(),
    garnish: draft.garnish.trim(),
    serving_vessel: draft.vessel.trim(),
    sauce: draft.sauces.trim(),
    portion_logic: draft.portion_logic.trim(),
    serving_count: draft.serving_count.trim(),
    item_count: draft.serving_count.trim(),
    angle: draft.angle.trim(),
    lighting: draft.lighting.trim(),
    composition: draft.composition.trim(),
    mood: draft.mood.trim(),
    textures: draft.textures.trim(),
    texture_notes: draft.textures.trim(),
    surface: draft.surface.trim(),
    glass_shape: draft.vessel.trim(),
    glass: draft.vessel.trim(),
    liquid_color: draft.liquid_color.trim(),
    liquidColor: draft.liquid_color.trim(),
    foam_or_clarity: draft.foam_or_clarity.trim(),
    foamOrClarity: draft.foam_or_clarity.trim(),
    ice: draft.ice.trim(),
    smoke_or_dry_ice: draft.smoke_or_dry_ice.trim(),
    contains_smoke_effect: draft.smoke_or_dry_ice.trim(),
    scale: draft.scale.trim(),
    background: draft.background.trim(),
    venue_zone: draft.venue_zone.trim(),
    zone: draft.venue_zone.trim(),
    table_family: draft.table_family.trim(),
    seating_family: draft.seating_family.trim(),
    lighting_family: draft.lighting_family.trim(),
    spatial_role: draft.spatial_role.trim(),
    generation_risks: draft.generation_risks.trim(),
    strict_negatives: draft.strict_negatives.trim(),
    provider_notes: draft.provider_notes.trim(),
  }
}

const INTERIOR_PROMPT_HEAVY_METADATA_KEYS = [
  'dish_name',
  'drink_name',
  'drinkName',
  'menu_category',
  'menu_source_id',
  'menuSourceId',
  'menu_id',
  'menu_source_ids',
  'menuSourceIds',
  'menu_ids',
  'menuSourceName',
  'menu_source_name',
  'menuSourceLabels',
  'menu_source_labels',
  'meal_period',
  'menu_description',
  'menuIngredients',
  'menu_ingredients',
  'menu_price',
  'short_description',
  'shortPlateDescription',
  'short_plate_description',
  'ingredients',
  'allergens',
  'plating',
  'garnish',
  'serving_vessel',
  'sauce',
  'portion_logic',
  'serving_count',
  'item_count',
  'composition',
  'strict_negatives',
  'generation_risks',
  'provider_notes',
] as const

function pruneInteriorMetadata(metadata: Record<string, unknown>) {
  const next = { ...metadata }
  for (const key of INTERIOR_PROMPT_HEAVY_METADATA_KEYS) {
    delete next[key]
  }
  return next
}

function matchesContentAssetFilter(asset: AssetUpload, filter: string) {
  const category = normalizeAssetCategoryValue(asset.asset_category || 'other')
  const origin = stringValue(asset.metadata?.asset_origin).toLowerCase()
  if (filter === 'all') return true
  if (filter === 'interiors') return isInteriorContentAsset(asset)
  if (filter === 'exteriors') return isExteriorContentAsset(asset)
  if (filter === 'venue_items') return isVenueItemContentAsset(asset)
  if (filter === 'food') return category === 'food'
  if (filter === 'food_studio_shots' || filter === 'studio_food_shots') return category === 'food_studio_shots'
  if (filter === 'drinks') return category === 'drinks'
  if (filter === 'drink_studio_shots' || filter === 'studio_drink_shots') return category === 'drink_studio_shots'
  if (filter === 'lifestyle') return category === 'lifestyle'
  if (filter === 'bts_service') return isBtsServiceContentAsset(asset)
  if (filter === 'pinterest') return isInspirationAsset(asset)
  if (filter === 'background_presets') return isBackgroundPresetAsset(asset) && !isInspirationAsset(asset)
  if (filter === 'generated') return category.includes('studio_shots') || origin.includes('ai') || origin.includes('generated')
  if (filter === 'approved') return asset.status === 'approved' || asset.source_quality === 'approved'
  if (filter === 'raw') return origin.includes('original') || (!origin && !category.includes('studio_shots'))
  if (filter === 'needs_metadata') return assetNeedsMetadata(asset)
  if (filter === 'metadata_approved') return assetMetadataApproved(asset)
  if (filter === 'needs_visual_review') return assetNeedsVisualMetadataReview(asset)
  if (filter === 'menu_linked_asset') return assetMenuLinked(asset)
  if (filter === 'non_menu_asset') return assetNonMenu(asset)
  if (filter === 'promotional_asset') return assetPromotional(asset)
  if (filter === 'archived') return asset.status === 'archived'
  return category === filter
}

function ContentLibrary({
  uploads,
  filter,
  onUpdate,
  onRemove,
  onToast,
}: {
  uploads:  AssetUpload[]
  filter: string
  onUpdate: (updated: AssetUpload) => void
  onRemove: (id: string) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [signedUrls,  setSignedUrls]  = useState<Record<string,string>>({})
  const [selected,    setSelected]    = useState<AssetUpload | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editCat,      setEditCat]      = useState('')
  const [metadataDraft, setMetadataDraft] = useState<AssetMetadataRecord>({ asset_origin: 'Original Photo' })
  const [universalDraft, setUniversalDraft] = useState<UniversalAssetMetadataDraft>(() => ({
    title: '',
    display_name: '',
    slug: '',
    source_type: 'client_uploaded_asset',
    normalized_role: 'uncategorized',
    tags: '',
    description: '',
    usage_notes: '',
    client_truth_reference: false,
    approved_for_generation: false,
  }))
  const [intelligenceDraft, setIntelligenceDraft] = useState<MetadataIntelligenceDraft>(() => createIntelligenceDraft({ id: '', client_id: '', file_name: '', asset_category: 'other', uploaded_at: '', proposals_count: 0, extraction_status: 'idle' } as AssetUpload))
  const [pinterestDraft, setPinterestDraft] = useState<PinterestMetadataDraft>(() => ({
    referenceName: '',
    usageCategories: [],
    learnFrom: '',
    sourceUrl: '',
    tags: '',
    approvedForInspiration: false,
  }))
  const [metadataLocks, setMetadataLocks] = useState<MetadataLockField[]>([])
  const [aiMetadataProposal, setAiMetadataProposal] = useState<AiMetadataProposal | null>(null)
  const [metadataRegenerating, setMetadataRegenerating] = useState(false)
  const [metadataRegenerationError, setMetadataRegenerationError] = useState('')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])
  const [bulkDraft, setBulkDraft] = useState({
    category: '',
    source_type: '',
    normalized_role: '',
    tags: '',
    approved_for_generation: '',
  })
  const [bulkSaving, setBulkSaving] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [metadataActionId, setMetadataActionId] = useState<string | null>(null)
  const [bulkBackfilling, setBulkBackfilling] = useState(false)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  const [replaceTarget, setReplaceTarget] = useState<AssetUpload | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [imageViewerZoom, setImageViewerZoom] = useState(1)
  const [menuSourcePopoverOpen, setMenuSourcePopoverOpen] = useState(false)
  const [visualReviewSelections, setVisualReviewSelections] = useState<Record<string, VisualReviewSelection>>({})

  // Load signed URLs for all image uploads via server route (uses service role key)
  useEffect(() => {
    // Normalize asset_category: null/undefined → 'other' so filtering works
    const normalized = uploads.map(u => ({ ...u, asset_category: u.asset_category || 'other' }))
    const imageUploads = normalized.filter(u => isPreviewableImageUpload(u) && u.file_path)
    if (imageUploads.length === 0) return
    const missing = imageUploads.filter(u => !signedUrls[u.id])
    if (missing.length === 0) return
    ;(async () => {
      const res = await fetch('/api/brain/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: missing.map(u => ({ id: u.id, path: u.file_path! })) }),
      })
      if (!res.ok) return
      const { urls } = await res.json() as { urls: Record<string,string> }
      setSignedUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [uploads]) // eslint-disable-line react-hooks/exhaustive-deps

  // Also get signed URL for modal preview on demand
  async function getFullUrl(u: AssetUpload): Promise<string | null> {
    if (!u.file_path) return null
    const res = await fetch('/api/brain/signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: u.id, path: u.file_path }] }),
    })
    if (!res.ok) return null
    const { urls } = await res.json() as { urls: Record<string,string> }
    return urls[u.id] ?? null
  }

  // Normalize asset_category: null/undefined → 'other' for consistent filtering + display
  const normalized = uploads.map(u => ({ ...u, asset_category: u.asset_category || 'other' }))
  const filtered = normalized.filter(u => matchesContentAssetFilter(u, filter))
  const needsMetadataCount = normalized.filter(assetNeedsMetadata).length
  const venueNeedsMetadataCount = normalized.filter(u => isVenueLikeSpatialAsset(u) && getAssetMetadataCompleteness(u) !== 'complete').length
  const selectedForBulk = normalized.filter(asset => bulkSelectedIds.includes(asset.id))
	  function isPreviewableImageUpload(u: AssetUpload) {
	    return IMAGE_CAT_IDS.has(normalizeAssetCategoryValue(u.asset_category)) && (u.file_type?.startsWith('image/') ?? true)
	  }

  const fmtSize = (b?: number) => !b ? '' : b > 1_048_576 ? `${(b/1_048_576).toFixed(1)} MB` : `${Math.round(b/1024)} KB`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' })
  const cleanName = (s: string) => s.replace(/---[a-f0-9-]{36}/, '').replace(/^\d+_\d+_/, '').replace(/\.[^.]+$/, '')

  function normalizeAssetOrigin(value: AssetMetadataValue): MetadataAssetOrigin {
    return METADATA_ASSET_ORIGIN.includes(value as MetadataAssetOrigin) ? value as MetadataAssetOrigin : 'Original Photo'
  }

  function readMetadataField(metadata: AssetMetadata | undefined, key: AssetMetadataFieldKey): AssetMetadataValue {
    return metadata?.[key]
  }

  function metadataToDraft(category: string, metadata: AssetMetadata | undefined): AssetMetadataRecord {
    const schema = getMetadataSchema(category)
    const draft: AssetMetadataRecord = {
      asset_origin: normalizeAssetOrigin(metadata?.asset_origin),
    }
    if (!schema) return draft

    for (const field of schema.fields) {
      const value = readMetadataField(metadata, field.key)
      if (field.key === 'asset_origin') {
        draft.asset_origin = normalizeAssetOrigin(value)
      } else if (value !== undefined) {
        draft[field.key] = value
      }
    }
    return draft
  }

  function beginMetadataEdit(asset: AssetUpload) {
    setEditingId(asset.id)
    setEditName(cleanName(asset.file_name))
    setEditCat(asset.asset_category || 'other')
    setMetadataDraft(metadataToDraft(asset.asset_category || 'other', asset.metadata))
    setUniversalDraft(createUniversalDraft(asset))
    setIntelligenceDraft(createIntelligenceDraft(asset))
    setPinterestDraft(createPinterestDraft(asset))
    setMetadataLocks(arrayMeta(asset, ['locked_fields', 'metadata_locks']).filter((field): field is MetadataLockField => METADATA_LOCKABLE_FIELDS.includes(field as MetadataLockField)))
    setAiMetadataProposal(null)
    setMetadataRegenerationError('')
    setMenuSourcePopoverOpen(false)
  }

  function toggleBulkSelected(id: string) {
    setBulkSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  function clearBulkSelection() {
    setBulkSelectedIds([])
    setBulkDraft({ category: '', source_type: '', normalized_role: '', tags: '', approved_for_generation: '' })
  }

  function setDraftField(key: MetadataFieldDefinition['key'], value: AssetMetadataValue) {
    setMetadataDraft(prev => ({ ...prev, [key]: value }))
  }

  function draftText(key: MetadataFieldDefinition['key']) {
    return formatMetadataValue(metadataDraft[key])
  }

  function draftArray(key: MetadataFieldDefinition['key']): string[] {
    const value = metadataDraft[key]
    return Array.isArray(value) ? value.map(String) : []
  }

  function toggleDraftMenu(menu: MetadataMenu) {
    const current = draftArray('menus') as MetadataMenu[]
    setDraftField('menus', current.includes(menu) ? current.filter(m => m !== menu) : [...current, menu])
  }

  function isMetadataLocked(field: string) {
    return metadataLocks.includes(field as MetadataLockField)
  }

  function toggleMetadataLock(field: MetadataLockField) {
    setMetadataLocks(prev => prev.includes(field) ? prev.filter(item => item !== field) : [...prev, field])
  }

  function setIntelligenceField(key: Exclude<keyof MetadataIntelligenceDraft, 'menu_source_ids'>, value: string) {
    setIntelligenceDraft(prev => ({ ...prev, [key]: value }))
  }

  function setIntelligenceMenuSourceIds(ids: string[]) {
    const normalizedIds = Array.from(new Set(ids.map(id => resolveMenuSource(id)?.id).filter((id): id is MenuSourceId => Boolean(id))))
    const labels = menuLabelsFromIds(normalizedIds)
    setIntelligenceDraft(prev => ({
      ...prev,
      menu_source_ids: normalizedIds,
      menu_source_id: normalizedIds[0] ?? '',
      menu_category: labels.join(' + '),
    }))
  }

  function toggleIntelligenceMenuSource(id: string) {
    const resolved = resolveMenuSource(id)
    if (!resolved) return
    const selected = intelligenceDraft.menu_source_ids.includes(resolved.id)
    setIntelligenceMenuSourceIds(selected
      ? intelligenceDraft.menu_source_ids.filter(item => item !== resolved.id)
      : [...intelligenceDraft.menu_source_ids, resolved.id])
  }

  function togglePinterestUsageCategory(category: PinterestUsageCategory) {
    setPinterestDraft(prev => ({
      ...prev,
      usageCategories: prev.usageCategories.includes(category)
        ? prev.usageCategories.filter(item => item !== category)
        : [...prev.usageCategories, category],
    }))
  }

  function updateVisualReviewSelection(asset: AssetUpload, patch: Partial<Omit<VisualReviewSelection, 'decidedAt'>>) {
    setVisualReviewSelections(prev => ({
      ...prev,
      [asset.id]: {
        ...(prev[asset.id] ?? { decidedAt: new Date().toISOString() }),
        ...patch,
        decidedAt: new Date().toISOString(),
      },
    }))
  }

  function chooseVisualReviewAction(asset: AssetUpload, action: VisualReviewAction) {
    const details = studioFoodVisualReviewDetails(asset)
    const current = visualReviewSelections[asset.id]
    const candidate = current?.candidate || (action === 'approve_menu_item' ? details.candidates[0]?.label : current?.candidate)
    updateVisualReviewSelection(asset, { action, candidate })
    onToast(`${VISUAL_REVIEW_ACTION_LABELS[action]} staged locally. Metadata was not changed.`, true)
  }

  function proposalString(proposal: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = proposal[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      if (Array.isArray(value)) {
        const text = value.map(String).map(item => item.trim()).filter(Boolean).join(', ')
        if (text) return text
      }
    }
    return ''
  }

  function proposalStringArray(proposal: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = proposal[key]
      if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
      if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
    }
    return []
  }

  function applyMetadataProposal(proposal: Record<string, unknown>) {
    const updateUniversal = (key: keyof UniversalAssetMetadataDraft, proposalKeys: string[]) => {
      if (isMetadataLocked(key)) return
      const value = proposalString(proposal, proposalKeys)
      if (!value) return
      setUniversalDraft(prev => ({ ...prev, [key]: value }))
    }
    updateUniversal('title', ['title', 'name'])
    updateUniversal('display_name', ['display_name', 'title', 'name'])
    updateUniversal('slug', ['slug'])
    updateUniversal('tags', ['tags'])
    updateUniversal('description', ['shortPlateDescription', 'short_plate_description', 'shortDescription', 'short_description', 'description', 'notes'])
    updateUniversal('usage_notes', ['usage_notes'])
    const sourceType = proposalString(proposal, ['source_type'])
    if (sourceType && !isMetadataLocked('source_type') && ASSET_SOURCE_TYPE_OPTIONS.includes(sourceType as AssetSourceTypeOption)) {
      setUniversalDraft(prev => ({ ...prev, source_type: sourceType as AssetSourceTypeOption }))
    }
    const normalizedRole = proposalString(proposal, ['normalized_role', 'asset_role'])
    if (normalizedRole && !isMetadataLocked('normalized_role') && NORMALIZED_ROLE_OPTIONS.includes(normalizedRole as NormalizedRoleOption)) {
      setUniversalDraft(prev => ({ ...prev, normalized_role: normalizedRole as NormalizedRoleOption }))
    }
    const category = proposalString(proposal, ['asset_category'])
    if (category && !isMetadataLocked('category') && STORED_UPLOAD_CATS.some(item => item.id === category)) setEditCat(category)
    if (normalizeAssetCategoryValue(editCat) === 'interiors' || category === 'interiors') {
      const interiorFieldMap: Array<[AssetMetadataFieldKey, string[]]> = [
        ['zone', ['areaZone', 'area_zone', 'zone', 'zoneName', 'area']],
        ['category', ['category']],
        ['surface_table_truth', ['surfaceTableTruth', 'surface_table_truth', 'surface', 'table_material', 'tableTruth']],
        ['seating_truth', ['seatingTruth', 'seating_truth', 'seating', 'seating_family']],
        ['key_materials', ['keyMaterials', 'key_materials', 'materials', 'material']],
        ['lighting', ['lighting']],
        ['architecture_spatial_features', ['architectureSpatialFeatures', 'architecture_spatial_features', 'architecture', 'features', 'spatial_features']],
        ['do_not_invent', ['doNotInvent', 'do_not_invent', 'negative_rules']],
        ['best_use', ['bestUse', 'best_use', 'usage', 'usage_notes']],
        ['tags', ['tags']],
      ]
      setMetadataDraft(prev => {
        const next = { ...prev }
        for (const [field, proposalKeys] of interiorFieldMap) {
          const value = field === 'tags' ? proposalStringArray(proposal, proposalKeys) : proposalString(proposal, proposalKeys)
          if (Array.isArray(value) ? value.length > 0 : value) next[field] = value as AssetMetadataValue
        }
        return next
      })
    }
    const proposalMenuSourceIds = normalizeFoodMenuSourceIds(
      proposalStringArray(proposal, ['menuSourceIds', 'menu_source_ids', 'menu_ids', 'menuIds']),
      proposalString(proposal, ['menuSourceId', 'menu_source_id', 'menu_id', 'menuId', 'menuSourceName', 'menu_source_name', 'menuCategory', 'menu_category', 'meal_period'])
    )
    const proposalMenuSource = proposalMenuSourceIds[0] ? resolveMenuSource(proposalMenuSourceIds[0]) : null
    const proposalMenuLabels = menuLabelsFromIds(proposalMenuSourceIds)
    const menuCategory = proposalMenuLabels.join(' + ') || proposalMenuSource?.label || proposalString(proposal, ['menuCategory', 'menu_category', 'meal_period'])
    const sourceStatus = proposalString(proposal, ['sourceStatus', 'source_status', 'metadata_source'])

    const intelligenceMap: Array<[Exclude<keyof MetadataIntelligenceDraft, 'menu_source_ids'>, string[]]> = [
      ['dish_name', ['dishName', 'dish_name', 'foodName', 'food_name', 'name']],
      ['menu_description', ['menuIngredients', 'menu_ingredients', 'menuDescription', 'menu_description', 'menu_wording', 'menu_item_description']],
      ['price', ['price', 'menu_price']],
      ['short_description', ['shortPlateDescription', 'short_plate_description', 'shortDescription', 'short_description', 'description', 'notes']],
      ['ingredients', ['menuIngredients', 'menu_ingredients', 'ingredients']],
      ['allergens', ['allergens', 'allergen_notes']],
      ['plating', ['plating', 'presentation', 'shape_structure']],
      ['garnish', ['garnish']],
      ['vessel', ['serving_vessel', 'vessel', 'glass_shape', 'glass']],
      ['sauces', ['sauce', 'sauces']],
      ['portion_logic', ['portion_logic', 'scale', 'shape_structure']],
      ['serving_count', ['serving_count', 'item_count', 'plate_count']],
      ['angle', ['angle', 'camera_angle']],
      ['lighting', ['lighting', 'lighting_style']],
      ['composition', ['composition', 'composition_type']],
      ['mood', ['mood', 'emotional_tone']],
      ['textures', ['textures', 'texture_notes', 'material']],
      ['surface', ['surface', 'surface_material', 'table_material']],
      ['liquid_color', ['liquid_color', 'liquidColor']],
      ['foam_or_clarity', ['foam_or_clarity', 'foamOrClarity']],
      ['ice', ['ice']],
      ['smoke_or_dry_ice', ['smoke_or_dry_ice', 'smoke', 'dry_ice', 'contains_smoke_effect']],
      ['scale', ['scale']],
      ['background', ['background', 'background_constraints']],
      ['venue_zone', ['venue_zone', 'zone']],
      ['table_family', ['table_family', 'table_shape', 'table_material']],
      ['seating_family', ['seating_family', 'seating']],
      ['lighting_family', ['lighting_family', 'chandelier_style']],
      ['spatial_role', ['spatial_role', 'area']],
      ['generation_risks', ['generation_risks', 'risk_warnings']],
      ['strict_negatives', ['strict_negatives', 'do_not_add', 'do_not_invent']],
      ['provider_notes', ['provider_notes']],
    ]
    setIntelligenceDraft(prev => {
      const next = { ...prev }
      if (menuCategory && !isMetadataLocked('menu_category')) {
        next.menu_category = normalizeFoodMenuCategory(menuCategory)
      }
      if (proposalMenuSourceIds.length > 0 && !isMetadataLocked('menu_source_id') && !isMetadataLocked('menu_source_ids')) {
        next.menu_source_ids = proposalMenuSourceIds
        next.menu_source_id = proposalMenuSourceIds[0] ?? ''
        next.menu_category = proposalMenuLabels.join(' + ')
      }
      if (sourceStatus) {
        next.metadata_source = sourceStatus
      }
      for (const [key, proposalKeys] of intelligenceMap) {
        if (isMetadataLocked(key)) continue
        const value = proposalString(proposal, proposalKeys)
        if (value) next[key] = value
      }
      return next
    })
  }

  async function regenerateAssetMetadata(asset: AssetUpload) {
    setMetadataRegenerating(true)
    setMetadataRegenerationError('')
    setAiMetadataProposal(null)
    const activeUniversalDraft = editingId === asset.id ? universalDraft : createUniversalDraft(asset)
    const activeIntelligenceDraft = editingId === asset.id ? intelligenceDraft : createIntelligenceDraft(asset)
    const activeLocks = editingId === asset.id ? metadataLocks : arrayMeta(asset, ['locked_fields', 'metadata_locks']).filter((field): field is MetadataLockField => METADATA_LOCKABLE_FIELDS.includes(field as MetadataLockField))
    try {
      const response = await fetch('/api/assets/regenerate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: {
            id: asset.id,
            client_id: asset.client_id,
            file_name: asset.file_name,
            asset_category: editCat || asset.asset_category,
            file_type: asset.file_type,
            extracted_summary: asset.extracted_summary,
            metadata: asset.metadata,
          },
          image_url: modalUrl,
          title: activeUniversalDraft.title || editName || assetTitle(asset),
          dish_name: activeIntelligenceDraft.dish_name || activeUniversalDraft.title || assetTitle(asset),
          menu_source_id: activeIntelligenceDraft.menu_source_id || undefined,
          menu_source_ids: activeIntelligenceDraft.menu_source_ids,
          menu_category: activeIntelligenceDraft.menu_category,
          tags: activeUniversalDraft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
          locked_fields: activeLocks,
        }),
      })
      const payload = await response.json() as AiMetadataProposal & { success?: boolean; proposed_metadata?: Record<string, unknown> }
      setAiMetadataProposal(payload)
      if (!response.ok || !payload.proposed_metadata) {
        setMetadataRegenerationError(payload.error || 'Metadata regeneration failed.')
        return
      }
      onToast(payload.error ? `Metadata proposal created with fallback: ${payload.error}` : 'AI metadata proposal ready for review.', !payload.error)
    } catch (error) {
      setMetadataRegenerationError(error instanceof Error ? error.message : 'Metadata regeneration failed.')
    } finally {
      setMetadataRegenerating(false)
    }
  }

  function requestMetadataRegeneration(asset: AssetUpload) {
    if ((isFoodMetadataAsset(asset) || isDrinkMetadataAsset(asset)) && editingId !== asset.id) {
      beginMetadataEdit(asset)
      setMetadataRegenerationError(`Type or confirm the ${isDrinkMetadataAsset(asset) ? 'Drink Name' : 'Dish Name'}, then click Search Metadata again.`)
      return
    }
    void regenerateAssetMetadata(asset)
  }

  function cleanedMetadata(category: string): AssetMetadata | null {
    const schema = getMetadataSchema(category)
    if (!schema) return null

    const next: AssetMetadataRecord = { type: schema.typeValue }
    for (const field of schema.fields) {
      const rawValue = metadataDraft[field.key]
      let value: AssetMetadataValue = rawValue

      if (field.key === 'asset_origin') {
        value = normalizeAssetOrigin(rawValue)
      } else if (field.key === 'tags' && typeof rawValue === 'string') {
        value = rawValue.split(',').map(t => t.trim()).filter(Boolean)
      }

      if (hasMetadataValue(value)) {
        next[field.key] = value
      }
    }

    return Object.keys(next).length > 0 ? next as AssetMetadata : null
  }

  function displayFieldsFor(asset: AssetUpload) {
    const schema = getMetadataSchema(asset.asset_category || 'other')
    if (!schema || !asset.metadata) return []
    return schema.fields
      .filter(field => field.display)
      .map(field => ({ field, value: readMetadataField(asset.metadata, field.key) }))
      .filter(({ value }) => hasMetadataValue(value))
  }

  function metadataStatusLabel(status: VenueSpatialMetadataCompleteness) {
    if (status === 'complete') return 'Metadata complete'
    if (status === 'partial') return 'Metadata partial'
    return 'Metadata missing'
  }

  function metadataStatusClass(status: VenueSpatialMetadataCompleteness) {
    if (status === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700'
    return 'border-yellow-300 bg-yellow-50 text-yellow-800'
  }

  function spatialMetadataFor(asset: AssetUpload): VenueSpatialMetadata | null {
    if (!isVenueLikeSpatialAsset(asset)) return null
    return readStoredVenueSpatialMetadata(asset) ?? null
  }

  function inferredSpatialMetadataFor(asset: AssetUpload): VenueSpatialMetadata | null {
    if (!isVenueLikeSpatialAsset(asset)) return null
    return resolveStoredOrInferredVenueSpatialMetadata(asset)
  }

  function spatialMetadataRows(metadata: VenueSpatialMetadata) {
    return [
      ['Zone name', metadata.zoneName],
      ['Camera angle type', metadata.cameraAngleType],
      ['Spatial role', metadata.spatialRole],
      ['Ceiling type', metadata.architecture.ceilingType],
      ['Ceiling pattern', metadata.architecture.ceilingPattern],
      ['Wall materials', metadata.architecture.wallMaterials.join(', ')],
      ['Floor materials', metadata.architecture.floorMaterials.join(', ')],
      ['Mirror usage', metadata.architecture.mirrorUsage],
      ['Lighting fixtures', metadata.architecture.lightingFixtures.join(', ')],
      ['Seating family', metadata.seating.seatingFamily.join(', ')],
      ['Chair colors', metadata.seating.chairColors.join(', ')],
      ['Booth types', metadata.seating.boothTypes.join(', ')],
      ['Table shapes', metadata.seating.tableShapes.join(', ')],
      ['Table materials', metadata.seating.tableMaterials.join(', ')],
      ['Table edge details', metadata.seating.tableEdgeDetails.join(', ')],
      ['Circulation style', metadata.layout.circulationStyle],
      ['Density', metadata.layout.density],
      ['Table spacing', metadata.layout.tableSpacing],
      ['Walkway visibility', metadata.layout.walkwayVisibility],
      ['Focal axis', metadata.layout.focalAxis],
      ['Lighting temperature', metadata.lighting.lightingTemperature],
      ['Chandelier style', metadata.lighting.chandelierStyle],
    ] as const
  }

  async function applyVenueMetadata(asset: AssetUpload) {
    if (!isVenueLikeSpatialAsset(asset)) return
    setMetadataActionId(asset.id)
    const updatedMetadata = applyVenueSpatialMetadataToAssetMetadata(asset) as unknown as AssetMetadata
    const { data, error } = await supabase.from('asset_uploads')
      .update({ metadata: updatedMetadata })
      .eq('id', asset.id)
      .select()
      .single()

    if (error || !data) {
      onToast('Could not apply venue metadata.', false)
    } else {
      const updated = data as unknown as AssetUpload
      onUpdate(updated)
      setSelected(prev => prev?.id === updated.id ? updated : prev)
      onToast('Venue spatial metadata applied.', true)
    }
    setMetadataActionId(null)
  }

  async function backfillVenueMetadata() {
    const targets = normalized.filter(asset => isVenueLikeSpatialAsset(asset) && getAssetMetadataCompleteness(asset) !== 'complete')
    if (targets.length === 0) {
      onToast('All venue assets already have spatial metadata.', true)
      return
    }

    setBulkBackfilling(true)
    let updatedCount = 0
    for (const asset of targets) {
      const updatedMetadata = applyVenueSpatialMetadataToAssetMetadata(asset) as unknown as AssetMetadata
      const { data, error } = await supabase.from('asset_uploads')
        .update({ metadata: updatedMetadata })
        .eq('id', asset.id)
        .select()
        .single()

      if (!error && data) {
        updatedCount += 1
        const updated = data as unknown as AssetUpload
        onUpdate(updated)
        setSelected(prev => prev?.id === updated.id ? updated : prev)
      }
    }

    setBulkBackfilling(false)
    onToast(updatedCount > 0 ? `Backfilled venue metadata for ${updatedCount} asset${updatedCount === 1 ? '' : 's'}.` : 'No venue metadata was updated.', updatedCount > 0)
  }

  function renderMetadataField(field: MetadataFieldDefinition) {
    if (field.key === 'asset_origin') return null
    const commonClass = 'w-full rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 outline-none'

    if (field.input === 'textarea') {
      return (
        <textarea
          key={field.key}
          value={draftText(field.key)}
          onChange={e => setDraftField(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className={`${commonClass} resize-none`}
        />
      )
    }

    if (field.input === 'multiSelect' && field.key === 'menus') {
      return (
        <div key={field.key} className="space-y-0.5">
          <p className="text-[10px] font-medium text-gray-700">{field.label}</p>
          <div className="flex flex-wrap gap-1">
            {METADATA_MENUS.map(menu => (
              <button
                key={menu}
                onClick={() => toggleDraftMenu(menu)}
                type="button"
                className={`text-[10px] px-2 py-0.5 rounded border transition ${draftArray('menus').includes(menu) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                {menu}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (field.input === 'select' && field.options) {
      return (
        <select
          key={field.key}
          value={draftText(field.key)}
          onChange={e => setDraftField(field.key, e.target.value)}
          className={commonClass}>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      )
    }

    return (
      <input
        key={field.key}
        value={draftText(field.key)}
        onChange={e => setDraftField(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={commonClass}
      />
    )
  }

  async function saveEdit(u: AssetUpload) {
    setSaving(true)
    const existingMetadata = assetMetadataRecord(u)
    if (isInspirationAsset({ asset_category: editCat || u.asset_category })) {
      const updatedMetadata = pinterestDraftToMetadata(pinterestDraft, existingMetadata) as unknown as AssetMetadata
      const nextName = pinterestDraft.referenceName.trim() || editName.trim() || u.file_name
      const { data, error } = await supabase.from('asset_uploads')
        .update({
          file_name: nextName,
          asset_category: 'pinterest_inspiration',
          metadata: updatedMetadata,
        })
        .eq('id', u.id)
        .select()
        .single()
      if (!error && data) {
        const updated = data as unknown as AssetUpload
        onUpdate(updated)
        setSelected(updated)
        setEditingId(null)
        onToast('Pinterest reference metadata saved.', true)
      } else if (error) {
        onToast(`Metadata save failed: ${error.message}`, false)
      }
      setSaving(false)
      return
    }
    const schemaMetadata = cleanedMetadata(editCat) ?? {}
    const isInteriorSave = normalizeAssetCategoryValue(editCat) === 'interiors'
    const savedLocks = isFoodMetadataAsset(u) || isDrinkMetadataAsset(u) ? [] : metadataLocks
    let updatedMetadata = {
      ...existingMetadata,
      ...schemaMetadata,
      ...universalDraftToMetadata(universalDraft),
      ...(isInteriorSave ? {} : intelligenceDraftToMetadata(intelligenceDraft)),
      locked_fields: savedLocks,
      metadata_locks: savedLocks,
    } as unknown as AssetMetadata
    if (isInteriorSave) {
      updatedMetadata = pruneInteriorMetadata(updatedMetadata as Record<string, unknown>) as unknown as AssetMetadata
    }
    if (isVenueLikeSpatialAsset({ asset_category: editCat })) {
      updatedMetadata = applyVenueSpatialMetadataToAssetMetadata({ ...u, asset_category: editCat, metadata: updatedMetadata }) as unknown as AssetMetadata
    }

    const { data, error } = await supabase.from('asset_uploads')
      .update({
        file_name: editName.trim() || u.file_name,
        asset_category: editCat,
        metadata: updatedMetadata,
      })
      .eq('id', u.id).select().single()
    if (!error && data) {
      const updated = data as unknown as AssetUpload
      onUpdate(updated)
      setSelected(updated)
      setEditingId(null)
      onToast('Asset metadata saved.', true)
    } else if (error) {
      onToast(`Metadata save failed: ${error.message}`, false)
    }
    setSaving(false)
  }

  async function applyBulkMetadata() {
    if (bulkSelectedIds.length === 0) return
    setBulkSaving(true)
    let updatedCount = 0
    for (const asset of selectedForBulk) {
      const existing = assetMetadataRecord(asset)
      const nextMetadata: Record<string, unknown> = { ...existing }
      if (bulkDraft.source_type) nextMetadata.source_type = bulkDraft.source_type
      if (bulkDraft.normalized_role) {
        nextMetadata.normalized_role = bulkDraft.normalized_role
        nextMetadata.asset_role = bulkDraft.normalized_role
      }
      if (bulkDraft.tags.trim()) nextMetadata.tags = bulkDraft.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      if (bulkDraft.approved_for_generation) nextMetadata.approved_for_generation = bulkDraft.approved_for_generation === 'yes'
      const nextCategory = bulkDraft.category || asset.asset_category
      let finalMetadata = nextMetadata as AssetMetadata
      if (isVenueLikeSpatialAsset({ asset_category: nextCategory })) {
        finalMetadata = applyVenueSpatialMetadataToAssetMetadata({ ...asset, asset_category: nextCategory, metadata: finalMetadata }) as unknown as AssetMetadata
      }
      const { data, error } = await supabase.from('asset_uploads')
        .update({
          asset_category: nextCategory,
          metadata: finalMetadata,
        })
        .eq('id', asset.id)
        .select()
        .single()
      if (!error && data) {
        updatedCount += 1
        onUpdate(data as unknown as AssetUpload)
        setSelected(prev => prev?.id === asset.id ? data as unknown as AssetUpload : prev)
      }
    }
    setBulkSaving(false)
    onToast(updatedCount > 0 ? `Updated ${updatedCount} asset${updatedCount === 1 ? '' : 's'}.` : 'No assets were updated.', updatedCount > 0)
    if (updatedCount > 0) clearBulkSelection()
  }

  async function archive(id: string) {
    if (!confirm('Remove this file from the library? It will be archived, not permanently deleted.')) return
    const { error } = await supabase.from('asset_uploads').update({ status: 'archived' }).eq('id', id)
    if (!error) { onRemove(id); setSelected(null) }
  }

  function beginReplaceImage(asset: AssetUpload) {
    if (!isPreviewableImageUpload(asset)) return
    const ok = confirm('This will replace the image file only. Metadata and asset identity will stay the same.')
    if (!ok) return
    setReplaceTarget(asset)
    replaceFileRef.current?.click()
  }

  async function handleReplaceImageFile(file: File | undefined) {
    if (!file || !replaceTarget) return
    if (!file.type.startsWith('image/')) {
      onToast('Choose an image file to replace this asset.', false)
      return
    }

    setReplacingId(replaceTarget.id)
    const form = new FormData()
    form.append('asset_id', replaceTarget.id)
    form.append('file', file)

    try {
      const response = await fetch('/api/assets/replace-image', {
        method: 'POST',
        body: form,
      })
      const payload = await response.json() as { asset?: AssetUpload; error?: string; warning?: string }
      if (!response.ok || !payload.asset) {
        throw new Error(payload.error || 'Image replacement failed.')
      }

      const updated = payload.asset
      setSignedUrls(prev => {
        const next = { ...prev }
        delete next[updated.id]
        return next
      })
      onUpdate(updated)
      setSelected(prev => prev?.id === updated.id ? updated : prev)
      if (selected?.id === updated.id) {
        setModalUrl(undefined)
        getFullUrl(updated).then(url => setModalUrl(url ?? null))
      }
      onToast(payload.warning ? `Image replaced. Metadata preserved. ${payload.warning}` : 'Image replaced. Metadata preserved.', true)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Image replacement failed.', false)
    } finally {
      setReplacingId(null)
      setReplaceTarget(null)
      if (replaceFileRef.current) replaceFileRef.current.value = ''
    }
  }

  // Modal state for selected file: undefined=loading, null=failed, string=ok
  const [modalUrl, setModalUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!selected) { setModalUrl(undefined); return }
    setModalUrl(undefined)
    getFullUrl(selected).then(url => setModalUrl(url ?? null))
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || (!isFoodMetadataAsset(selected) && !isDrinkMetadataAsset(selected) && !isInspirationAsset(selected)) || editingId === selected.id) return
    beginMetadataEdit(selected)
  }, [selected?.id, editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMetadataStatus = selected ? getAssetMetadataCompleteness(selected) : 'complete'
  const selectedNeedsMetadata = selected ? assetNeedsMetadata(selected) : false
  const selectedStoredSpatialMetadata = selected ? spatialMetadataFor(selected) : null
  const selectedPreviewSpatialMetadata = selected ? inferredSpatialMetadataFor(selected) : null
  const selectedIsEditing = Boolean(selected && editingId === selected.id)
  const selectedIsFoodAsset = Boolean(selected && isFoodMetadataAsset(selected))
  const selectedIsDrinkAsset = Boolean(selected && isDrinkMetadataAsset(selected))
  const selectedIsPinterestAsset = Boolean(selected && isInspirationAsset(selected))
  const selectedIsInteriorAsset = Boolean(selected && isInteriorMetadataAsset(selected))
  const selectedIsMenuAsset = selectedIsFoodAsset || selectedIsDrinkAsset
  const selectedNeedsVisualReview = Boolean(selected && assetNeedsVisualMetadataReview(selected))
  const selectedVisualReviewDetails = selected && selectedNeedsVisualReview ? studioFoodVisualReviewDetails(selected) : null
  const selectedVisualReviewSelection = selected ? visualReviewSelections[selected.id] : undefined
  const selectedFoodSourceStatus = selected
    ? proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['sourceStatus', 'source_status', 'metadata_source'])
      || (selectedIsEditing ? intelligenceDraft.metadata_source : stringMeta(selected, ['metadata_source', 'sourceStatus', 'source_status', 'menu_match_status']))
      || 'manual'
    : 'manual'
  const selectedFoodMenuSourceLabel = selected
    ? (menuLabelsFromIds(normalizeFoodMenuSourceIds(proposalStringArray(aiMetadataProposal?.proposed_metadata ?? {}, ['menuSourceIds', 'menu_source_ids', 'menu_ids', 'menuIds']), proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['menuSourceId', 'menu_source_id', 'menu_id', 'menuId']))).join(' + ')
      || proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['menuSourceName', 'menu_source_name', 'menuCategory', 'menu_category'])
      || (selectedIsEditing ? intelligenceDraft.menu_category : menuLabelsFromIds(normalizeFoodMenuSourceIds(arrayMeta(selected, ['menu_source_ids', 'menuSourceIds', 'menu_ids', 'menuIds', 'menu_source_labels', 'menuSourceLabels']), stringMeta(selected, ['menu_source_id', 'menuSourceId', 'menu_id', 'menuId', 'menu_source_name', 'menuSourceName', 'menu_category', 'meal_period', 'category']))).join(' + ')))
    : ''
  const selectedValidationStatus = selected
    ? (aiMetadataProposal?.validation?.status
      || proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['validationStatus', 'validation_status'])
      || '')
    : ''
  const selectedFinalConfidence = selected
    ? Number(aiMetadataProposal?.validation?.finalConfidence ?? proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['finalConfidence', 'final_confidence']) ?? 0)
    : 0
  const selectedValidationWarning = selected
    ? aiMetadataProposal?.validation?.warning || proposalString(aiMetadataProposal?.proposed_metadata ?? {}, ['warning']) || ''
    : ''
  const selectedValidationBlocksApply = selectedIsMenuAsset
    && Boolean(aiMetadataProposal?.proposed_metadata)
    && (selectedValidationStatus === 'mismatch' || (selectedFinalConfidence > 0 && selectedFinalConfidence < 0.58))

  function metadataValidationLabel(status: string) {
    if (status === 'strong_match') return 'Strong match'
    if (status === 'mismatch') return 'Mismatch detected'
    if (status === 'needs_review') return 'Needs review'
    return 'Not validated'
  }

  function metadataValidationClass(status: string) {
    if (status === 'strong_match') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    if (status === 'mismatch') return 'border-red-200 bg-red-50 text-red-800'
    if (status === 'needs_review') return 'border-amber-200 bg-amber-50 text-amber-800'
    return 'border-gray-200 bg-gray-50 text-gray-600'
  }

  async function rejectMetadataMatch(asset: AssetUpload) {
    const existing = assetMetadataRecord(asset)
    const previous = Array.isArray(existing.wrong_menu_match_memory) ? existing.wrong_menu_match_memory : []
    const proposal = aiMetadataProposal?.proposed_metadata ?? {}
    const validation = aiMetadataProposal?.validation
    const memory = {
      rejectedAt: new Date().toISOString(),
      assetId: asset.id,
      wrongMatch: proposalString(proposal, ['dishName', 'dish_name']) || validation?.comparedMenuEntry?.dishName || '',
      wrongMenuEntryId: proposalString(proposal, ['menuEntryId', 'menu_entry_id']) || validation?.comparedMenuEntry?.id || '',
      correctDishName: intelligenceDraft.dish_name || assetTitle(asset),
      reason: selectedValidationWarning || 'User rejected menu match after image validation.',
      imageFoodType: validation?.imageClassification?.visibleFoodType || proposalString(proposal, ['imageFoodType', 'image_food_type']),
    }
    const { data, error } = await supabase.from('asset_uploads')
      .update({
        metadata: {
          ...existing,
          wrong_menu_match_memory: [...previous, memory].slice(-20),
          metadata_match_feedback: 'rejected',
        },
      })
      .eq('id', asset.id)
      .select()
      .single()

    if (error || !data) {
      onToast('Could not save rejected match memory.', false)
      return
    }
    const updated = data as unknown as AssetUpload
    onUpdate(updated)
    setSelected(prev => prev?.id === updated.id ? updated : prev)
    onToast('Rejected match saved. Future matching will avoid it.', true)
  }

  async function linkMenuMatch(match: NonNullable<NonNullable<AiMetadataProposal['menu_debug']>['topMatches']>[number]) {
    if (!selected) return
    const drinkAsset = isDrinkMetadataAsset(selected)
    const currentDish = (intelligenceDraft.dish_name || assetTitle(selected)).trim()
    const nextDish = (match.dishName || currentDish).trim()
    if (currentDish && nextDish && currentDish.toLowerCase() !== nextDish.toLowerCase()) {
      const ok = confirm(`Link this asset to "${nextDish}" and update the ${drinkAsset ? 'drink' : 'dish'} name?`)
      if (!ok) return
    }
    const menuSourceId = match.menuSourceId || ''
    const menuSourceName = match.menuSourceName || match.menuCategory || ''
    const menuIngredients = typeof match.menuDescription === 'string' && match.menuDescription.trim()
      ? match.menuDescription.trim()
      : (match.ingredients ?? []).join(', ')
    const allergens = (match.allergens ?? []).length > 0 ? match.allergens ?? [] : ['Not listed on menu']
    const existing = assetMetadataRecord(selected)
    const existingTags = arrayMeta(selected, ['tags', 'usage'])
    const menuTags = [
      drinkAsset ? 'drink' : 'food',
      match.menuSourceName || match.menuCategory || '',
      nextDish,
    ]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 2)
    const nextTags = Array.from(new Set([...existingTags, ...menuTags])).slice(0, 18)
    const nextMetadata = {
      ...existing,
      dish_name: nextDish,
      dishName: nextDish,
      ...(drinkAsset ? { drink_name: nextDish, drinkName: nextDish } : {}),
      menu_category: menuSourceName,
      menuSourceName: menuSourceName,
      menu_source_name: menuSourceName,
      menuSourceLabels: menuSourceName ? [menuSourceName] : [],
      menu_source_labels: menuSourceName ? [menuSourceName] : [],
      menu_source_id: menuSourceId,
      menuSourceId: menuSourceId,
      menu_id: menuSourceId,
      menu_source_ids: menuSourceId ? [menuSourceId] : [],
      menuSourceIds: menuSourceId ? [menuSourceId] : [],
      menu_description: menuIngredients,
      menuDescription: menuIngredients,
      menuIngredients,
      menu_ingredients: menuIngredients,
      ingredients: menuIngredients,
      allergens: allergens.join(', '),
      price: match.price || 'Not listed on menu',
      menu_price: match.price || 'Not listed on menu',
      metadata_source: 'menu_matched',
      sourceStatus: 'menu_matched',
      menu_entry_id: match.menuEntryId || '',
      menuEntryId: match.menuEntryId || '',
      tags: nextTags,
    } as AssetMetadata
    const { data, error } = await supabase.from('asset_uploads')
      .update({ metadata: nextMetadata })
      .eq('id', selected.id)
      .select()
      .single()

    if (error || !data) {
      onToast('Could not link menu item.', false)
      return
    }
    const updated = data as unknown as AssetUpload
    onUpdate(updated)
    setSelected(updated)
    beginMetadataEdit(updated)
    onToast(`Linked to ${menuSourceName || 'menu item'}.`, true)
  }

  function renderLockButton(field: MetadataLockField) {
    if (selectedIsMenuAsset) return null
    const locked = isMetadataLocked(field)
    return (
      <button
        type="button"
        onClick={() => toggleMetadataLock(field)}
        className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${locked ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-400 hover:text-gray-700'}`}>
        {locked ? 'Locked' : 'Lock'}
      </button>
    )
  }

  function renderEditInput(label: string, field: MetadataLockField, value: string, onChange: (value: string) => void, placeholder = '') {
    return (
      <label className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
          {renderLockButton(field)}
        </div>
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
        />
      </label>
    )
  }

  function renderEditTextarea(label: string, field: MetadataLockField, value: string, onChange: (value: string) => void, placeholder = '', rows = 3) {
    return (
      <label className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
          {renderLockButton(field)}
        </div>
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
        />
      </label>
    )
  }

  function renderInteriorTextarea(label: string, field: MetadataFieldDefinition['key'], placeholder = '', rows = 3) {
    return (
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
        <textarea
          value={draftText(field)}
          onChange={event => setDraftField(field, event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
        />
      </label>
    )
  }

  function renderDisplayRow(label: string, value: string | number | boolean | null | undefined, rowKey?: string) {
    return (
      <div key={rowKey ?? `display-${label}`} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">{value === undefined || value === null || value === '' ? '—' : String(value)}</p>
      </div>
    )
  }

  function renderFoodSourceBadge(status: string, menuLabel = '') {
    const normalized = status === 'menu_matched' ? `Matched${menuLabel ? `: ${menuLabel}` : ''}` : status === 'ai_inferred' ? 'AI inferred' : status === 'no_menu_match' ? 'No menu match' : 'Manual'
    const classes = status === 'menu_matched'
      ? 'border-[#bbf7d0] bg-[#ffffff] text-[#166534]'
      : status === 'no_menu_match'
        ? 'border-[#fde68a] bg-[#ffffff] text-[#92400e]'
        : status === 'ai_inferred'
          ? 'border-[#e5e7eb] bg-[#ffffff] text-[#374151]'
          : 'border-[#e5e7eb] bg-[#f9fafb] text-[#4b5563]'
    return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes}`}>{normalized}</span>
  }

  function categoryLabel(value: string | null | undefined) {
    return ALL_UPLOAD_CATS.find(item => item.id === value)?.label
      || GRAPHIC_DESIGN_CATEGORIES.find(item => item.id === value)?.label
      || value
      || 'Other'
  }

  if (uploads.length === 0) return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center">
      <p className="text-sm text-gray-400">No files uploaded yet for this client.</p>
    </div>
  )

  return (
    <>
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => handleReplaceImageFile(event.target.files?.[0])}
      />
      {/* Grid */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Library</p>
            {needsMetadataCount > 0 && (
              <p className="mt-0.5 text-[10px] font-medium text-yellow-700">{needsMetadataCount} asset{needsMetadataCount === 1 ? '' : 's'} need metadata</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {bulkSelectedIds.length > 0 && (
              <button
                type="button"
                onClick={clearBulkSelection}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-500 transition hover:border-gray-400">
                Clear {bulkSelectedIds.length} selected
              </button>
            )}
            {venueNeedsMetadataCount > 0 && (
              <button
                type="button"
                onClick={backfillVenueMetadata}
                disabled={bulkBackfilling}
                className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-[10px] font-semibold text-yellow-800 transition hover:bg-yellow-100 disabled:opacity-45">
                {bulkBackfilling ? 'Backfilling...' : 'Backfill Venue Metadata'}
              </button>
            )}
            <span className="text-xs text-gray-400">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {bulkSelectedIds.length > 0 && (
          <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-800">Bulk metadata editing</p>
                <p className="mt-0.5 text-[11px] text-gray-400">Update only the fields you set. Blank fields are ignored.</p>
              </div>
              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500">{bulkSelectedIds.length} selected</span>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <select value={bulkDraft.category} onChange={e => setBulkDraft(prev => ({ ...prev, category: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 outline-none">
                <option value="">Category unchanged</option>
                {STORED_UPLOAD_CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select value={bulkDraft.source_type} onChange={e => setBulkDraft(prev => ({ ...prev, source_type: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 outline-none">
                <option value="">Source unchanged</option>
                {ASSET_SOURCE_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={bulkDraft.normalized_role} onChange={e => setBulkDraft(prev => ({ ...prev, normalized_role: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 outline-none">
                <option value="">Role unchanged</option>
                {NORMALIZED_ROLE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              <input value={bulkDraft.tags} onChange={e => setBulkDraft(prev => ({ ...prev, tags: e.target.value }))} placeholder="Replace tags, comma separated" className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 outline-none" />
              <select value={bulkDraft.approved_for_generation} onChange={e => setBulkDraft(prev => ({ ...prev, approved_for_generation: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 outline-none">
                <option value="">Approval unchanged</option>
                <option value="yes">Approved for generation</option>
                <option value="no">Not approved</option>
              </select>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={applyBulkMetadata} disabled={bulkSaving} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40">
                {bulkSaving ? 'Updating...' : 'Apply bulk metadata'}
              </button>
            </div>
          </div>
        )}

        {/* Image grid */}
        {filtered.some(isPreviewableImageUpload) && (
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {filtered.filter(isPreviewableImageUpload).map(u => {
              const missingMetadata = assetNeedsMetadata(u)
              const needsVisualReview = assetNeedsVisualMetadataReview(u)
              const metadataBadges = assetMetadataBadges(u)
              const sourceType = inferAssetSourceType(u)
              const normalizedRole = inferNormalizedAssetRole(u)
              const checked = bulkSelectedIds.includes(u.id)
              return (
                <div key={u.id} className={`group relative aspect-square rounded-lg overflow-hidden border cursor-pointer bg-gray-100 ${needsVisualReview ? 'border-rose-300 ring-1 ring-rose-300/70' : missingMetadata ? 'border-yellow-300 ring-1 ring-yellow-300/70' : 'border-gray-200'}`}
                  onClick={() => setSelected(u)}>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); toggleBulkSelected(u.id) }}
                    className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold shadow-sm ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-white/70 bg-black/45 text-white/70'}`}
                    title="Select for bulk editing">
                    {checked ? '✓' : '+'}
                  </button>
                  {signedUrls[u.id]
                    ? <img src={signedUrls[u.id]} alt={cleanName(u.file_name)} className="w-full h-full object-cover" loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden') }} />
                    : null}
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl" hidden={!!signedUrls[u.id]}>🖼</div>
                  {needsVisualReview ? (
                    <span className="absolute left-1.5 top-1.5 z-10 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-700 shadow-sm">
                      Needs Visual Review
                    </span>
                  ) : missingMetadata && (
                    <span className="absolute left-1.5 top-1.5 z-10 rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[9px] font-semibold text-yellow-800 shadow-sm">
                      Metadata Missing
                    </span>
                  )}
                  {metadataBadges.length > 0 && (
                    <div className="pointer-events-none absolute bottom-1.5 left-1.5 right-1.5 z-10 flex flex-wrap gap-1 transition-opacity group-hover:opacity-0">
                      {metadataBadges.slice(0, 3).map(badge => (
                        <span
                          key={badge.key}
                          title={badge.title}
                          className={`max-w-full truncate rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] shadow-sm ${metadataBadgeClass(badge.tone)}`}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end">
                    <div className="w-full p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-[10px] font-semibold">{assetTitle(u)}</p>
                      <p className="mt-0.5 truncate text-[9px] text-white/75">{u.file_name}</p>
                      <p className="mt-0.5 text-[9px] text-white/65">{fmtSize(u.file_size) || '—'} · {u.file_type || 'unknown'} · {assetDimensions(u)}</p>
                      <p className="mt-0.5 truncate text-[9px] text-white/65">{u.asset_category || 'other'} · {sourceType} · {normalizedRole}</p>
                      {metadataBadges.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {metadataBadges.map(badge => (
                            <span
                              key={badge.key}
                              title={badge.title}
                              className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${metadataBadgeClass(badge.tone)}`}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); beginReplaceImage(u) }}
                        disabled={replacingId === u.id}
                        className="mt-2 rounded-md border border-white/35 bg-white/12 px-2 py-1 text-[9px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-45">
                        {replacingId === u.id ? 'Replacing...' : 'Replace image'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Document list */}
        {filtered.filter(u => !isPreviewableImageUpload(u)).length > 0 && (
          <div className={`divide-y divide-gray-100 ${filtered.some(isPreviewableImageUpload) ? 'border-t border-gray-100' : ''}`}>
            {filtered.filter(u => !isPreviewableImageUpload(u)).map(u => (
              <div key={u.id}
                className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition ${editingId === u.id ? 'bg-blue-50' : ''}`}
                onClick={() => editingId !== u.id && setSelected(u)}
              >
                <span className="text-gray-300 text-lg shrink-0">📄</span>
                {editingId === u.id ? (
                  <div className="flex-1 flex flex-wrap gap-2 items-center" onClick={e => e.stopPropagation()}>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1 min-w-[140px] rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none"
                      placeholder="File name"
                    />
                    <select value={editCat} onChange={e => setEditCat(e.target.value)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 outline-none">
                      {STORED_UPLOAD_CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <button onClick={() => saveEdit(u)} disabled={saving}
                      className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40 transition">
                      {saving ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-white transition">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{cleanName(u.file_name)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{u.asset_category || 'other'} · {fmtDate(u.uploaded_at)}{fmtSize(u.file_size) ? ` · ${fmtSize(u.file_size)}` : ''}</p>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => {
                        beginMetadataEdit(u)
                      }}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:border-gray-400 transition">Edit</button>
                      <button onClick={() => archive(u.id)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:border-red-200 hover:text-red-500 transition">Remove</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata management modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5" onClick={() => setSelected(null)}>
          <div className="metadata-modal-light flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-[#f8fafc] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[#e5e7eb] bg-[#ffffff]/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">Asset metadata</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-gray-950">{assetTitle(selected)}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{categoryLabel(selected.asset_category)}</span>
                  {selectedNeedsVisualReview ? (
                    <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      Needs Visual Review
                    </span>
                  ) : selectedNeedsMetadata ? (
                    <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">
                      ⚠ Metadata Missing
                    </span>
                  ) : isVenueLikeSpatialAsset(selected) && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${metadataStatusClass(selectedMetadataStatus)}`}>
                      {metadataStatusLabel(selectedMetadataStatus)}
                    </span>
                  )}
                  {selectedIsPinterestAsset && (
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Inspiration only
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedIsPinterestAsset ? (
                  <>
                    <button type="button" onClick={() => saveEdit(selected)} disabled={saving} className="h-9 rounded-lg border border-[#171717] bg-[#171717] px-4 text-xs font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-45">{saving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => archive(selected.id)} className="h-9 rounded-lg border border-[#fecaca] bg-[#ffffff] px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fff1f2]">Delete</button>
                    <button type="button" onClick={() => { setSelected(null); setEditingId(null) }} className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb]">Close</button>
                  </>
                ) : selectedIsMenuAsset ? (
                  <>
                    <button type="button" onClick={() => saveEdit(selected)} disabled={saving} className="h-9 rounded-lg border border-[#171717] bg-[#171717] px-4 text-xs font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-45">{saving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => archive(selected.id)} className="h-9 rounded-lg border border-[#fecaca] bg-[#ffffff] px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fff1f2]">Delete</button>
                    <button type="button" onClick={() => { setSelected(null); setEditingId(null) }} className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb]">Close</button>
                  </>
                ) : (
                  <>
                    {isPreviewableImageUpload(selected) && (
                      <button type="button" onClick={() => beginReplaceImage(selected)} disabled={replacingId === selected.id} className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:opacity-45">
                        {replacingId === selected.id ? 'Replacing...' : 'Replace image'}
                      </button>
                    )}
                    <button type="button" onClick={() => requestMetadataRegeneration(selected)} disabled={metadataRegenerating} className="h-9 rounded-lg border border-[#171717] bg-[#171717] px-3 text-xs font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-45">
                      {metadataRegenerating ? 'Regenerating...' : 'Regenerate Metadata'}
                    </button>
                    <button type="button" onClick={() => { selectedIsEditing ? setEditingId(null) : beginMetadataEdit(selected) }} className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${selectedIsEditing ? 'border-[#171717] bg-[#171717] text-white hover:bg-[#2f2f2f]' : 'border-[#d1d5db] bg-[#ffffff] text-[#374151] hover:bg-[#f9fafb]'}`}>
                      {selectedIsEditing ? 'Editing' : 'Edit Metadata'}
                    </button>
                    <button type="button" onClick={() => archive(selected.id)} className="h-9 rounded-lg border border-[#fecaca] bg-[#ffffff] px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fff1f2]">Delete</button>
                    <button type="button" onClick={() => { setSelected(null); setEditingId(null) }} className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb]">Close</button>
                  </>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    {isPreviewableImageUpload(selected) ? (
                      modalUrl
                        ? <button type="button" onClick={() => { setImageViewerZoom(1); setImageViewerOpen(true) }} className="block w-full rounded-xl bg-white">
                            <img src={modalUrl} alt={cleanName(selected.file_name)} className="max-h-[46vh] w-full rounded-xl bg-white object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          </button>
                        : modalUrl === null
                          ? <div className="flex h-72 items-center justify-center rounded-xl bg-white text-sm text-gray-400">Could not load image</div>
                          : <div className="flex h-72 items-center justify-center rounded-xl bg-white text-sm text-gray-300">Loading image...</div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
                        <p className="text-sm font-medium text-gray-700">{cleanName(selected.file_name)}</p>
                        <p className="mt-1 text-xs text-gray-400">{selected.asset_category}</p>
                        {modalUrl && <a href={modalUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-xl border border-gray-300 px-5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-100">Open / Download</a>}
                      </div>
                    )}
                    {selectedIsMenuAsset && isPreviewableImageUpload(selected) && (
                      <button type="button" onClick={() => beginReplaceImage(selected)} disabled={replacingId === selected.id} className="mt-3 h-9 w-full rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:opacity-45">
                        {replacingId === selected.id ? 'Replacing...' : 'Replace image'}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2">
                    {renderDisplayRow('File name', selected.file_name)}
                    {renderDisplayRow('File type', selected.file_type || '—')}
                    {renderDisplayRow('Dimensions', assetDimensions(selected))}
                    {selectedIsMenuAsset && renderDisplayRow('File Size', fmtSize(selected.file_size) || '—')}
                    {!selectedIsMenuAsset && renderDisplayRow('Source type', inferAssetSourceType(selected))}
                    {!selectedIsMenuAsset && renderDisplayRow('Normalized role', inferNormalizedAssetRole(selected))}
                    {renderDisplayRow('Approved for generation', booleanMeta(selected, ['approved_for_generation']) ? 'Yes' : 'No')}
                  </div>
                </aside>

                <main className="space-y-4">
                  {selectedNeedsVisualReview && selectedVisualReviewDetails && (
                    <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row">
                        <div className="w-full lg:w-44">
                          <div className="overflow-hidden rounded-xl border border-rose-200 bg-white">
                            {modalUrl ? (
                              <img src={modalUrl} alt={cleanName(selected.file_name)} className="h-36 w-full object-cover" />
                            ) : (
                              <div className="flex h-36 w-full items-center justify-center text-xs text-rose-300">Image loading</div>
                            )}
                          </div>
                          <p className="mt-2 truncate text-xs font-semibold text-rose-950">{assetTitle(selected)}</p>
                          <p className="mt-0.5 truncate text-[10px] text-rose-700/70">{selected.file_name}</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">Manual visual review</p>
                              <h4 className="mt-1 text-base font-semibold text-rose-950">Review before writing menu metadata</h4>
                              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-rose-800">{selectedVisualReviewDetails.reason}</p>
                            </div>
                            <span className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                              UI-only
                            </span>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-rose-100 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Proposed candidate dish options</p>
                              <div className="mt-2 space-y-2">
                                {selectedVisualReviewDetails.candidates.map(candidate => {
                                  const active = selectedVisualReviewSelection?.candidate === candidate.label
                                  return (
                                    <button
                                      key={`visual-review-candidate-${candidate.label}`}
                                      type="button"
                                      onClick={() => updateVisualReviewSelection(selected, { candidate: candidate.label })}
                                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${active ? 'border-rose-300 bg-rose-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'}`}
                                    >
                                      <span className="block text-xs font-semibold text-gray-900">{candidate.label}</span>
                                      <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{candidate.note}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div className="rounded-xl border border-rose-100 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Existing metadata fields</p>
                              <div className="mt-2 grid gap-1.5">
                                {[
                                  ['metadata_source', stringMeta(selected, ['metadata_source']) || 'Not set'],
                                  ['metadata_confidence', stringMeta(selected, ['metadata_confidence']) || 'Not set'],
                                  ['metadata_review_status', stringMeta(selected, ['metadata_review_status']) || (isKnownStudioFoodVisionQueueAsset(selected) ? 'requires_visual_review (UI queue)' : 'Not set')],
                                  ['dish_name', stringMeta(selected, ['dish_name', 'foodName', 'name']) || 'Not set'],
                                  ['menu_source', selectedFoodMenuSourceLabel || 'Not set'],
                                  ['price', stringMeta(selected, ['price', 'menu_price']) || 'Not set'],
                                  ['allergens', stringMeta(selected, ['allergens', 'allergen_notes']) || 'Not set'],
                                ].map(([label, value]) => (
                                  <div key={`visual-review-metadata-${label}`} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-2.5 py-1.5">
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</span>
                                    <span className="min-w-0 text-right text-[11px] leading-relaxed text-gray-700">{value}</span>
                                  </div>
                                ))}
                                <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">menu_ingredients</span>
                                  <p className="mt-1 text-[11px] leading-relaxed text-gray-700">{stringMeta(selected, ['menu_ingredients', 'menuIngredients', 'ingredients']) || stringMeta(selected, ['menu_description', 'menuDescription']) || 'Not set'}</p>
                                </div>
                                <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">tags</span>
                                  <p className="mt-1 text-[11px] leading-relaxed text-gray-700">{arrayMeta(selected, ['tags', 'usage']).join(', ') || 'Not set'}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-rose-100 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Manual review action</p>
                                <p className="mt-1 text-xs text-gray-500">These buttons only stage a local decision for review. No metadata write is enabled in this UI pass.</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(['approve_menu_item', 'mark_non_menu_asset', 'mark_promotional_asset', 'leave_unresolved'] as VisualReviewAction[]).map(action => {
                                const active = selectedVisualReviewSelection?.action === action
                                return (
                                  <button
                                    key={`visual-review-action-${action}`}
                                    type="button"
                                    onClick={() => chooseVisualReviewAction(selected, action)}
                                    className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${active ? 'border-rose-500 bg-rose-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                                  >
                                    {VISUAL_REVIEW_ACTION_LABELS[action]}
                                  </button>
                                )
                              })}
                            </div>
                            {selectedVisualReviewSelection && (
                              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                                <span className="font-semibold">Local selection:</span>{' '}
                                {selectedVisualReviewSelection.action ? VISUAL_REVIEW_ACTION_LABELS[selectedVisualReviewSelection.action] : 'Candidate selected'}
                                {selectedVisualReviewSelection.candidate ? ` · ${selectedVisualReviewSelection.candidate}` : ''}
                                {' · '}Not saved to database.
                              </div>
                            )}
                            <div className="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px] text-rose-700">
                              TODO disabled: convert this staged review action into an explicit metadata mutation after review decisions are approved.
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {selectedIsEditing ? (
                    <>
                      <details open className="rounded-2xl border border-gray-100 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-900">{selectedIsPinterestAsset ? 'Pinterest Reference' : selectedIsDrinkAsset ? 'Drink Metadata' : selectedIsFoodAsset ? 'Food Metadata' : selectedIsInteriorAsset ? 'Interior Metadata' : 'Identity'}</summary>
                        {selectedIsPinterestAsset ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-2">
                              <p className="text-xs text-gray-500">Pinterest references are inspiration-only. They can guide composition, crop, pose, mood, styling, and creative direction.</p>
                              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Inspiration only</span>
                            </div>
                            <label className="block md:col-span-2">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Reference Name</span>
                              <input value={pinterestDraft.referenceName} onChange={event => setPinterestDraft(prev => ({ ...prev, referenceName: event.target.value }))} placeholder="Oyster hand composition" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <div className="md:col-span-2">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Inspiration Usage Categories</span>
                              <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-100 bg-gray-50 p-2">
                                {PINTEREST_USAGE_CATEGORY_OPTIONS.map(option => {
                                  const active = pinterestDraft.usageCategories.includes(option)
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => togglePinterestUsageCategory(option)}
                                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                                    >
                                      {option}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <label className="block md:col-span-2">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">What to Learn From This Reference</span>
                              <textarea value={pinterestDraft.learnFrom} onChange={event => setPinterestDraft(prev => ({ ...prev, learnFrom: event.target.value }))} placeholder="Composition, crop, hand pose, mood, styling, lighting, table setup..." rows={4} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <label className="block md:col-span-2">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Source URL</span>
                              <input value={pinterestDraft.sourceUrl} onChange={event => setPinterestDraft(prev => ({ ...prev, sourceUrl: event.target.value }))} placeholder="https://pinterest.com/..." className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <label className="block md:col-span-2">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tags</span>
                              <input value={pinterestDraft.tags} onChange={event => setPinterestDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="oyster, hands, top-down, luxury" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 md:col-span-2">
                              <input type="checkbox" checked={pinterestDraft.approvedForInspiration} onChange={event => setPinterestDraft(prev => ({ ...prev, approvedForInspiration: event.target.checked }))} />
                              Approved for inspiration
                            </label>
                          </div>
                        ) : selectedIsMenuAsset ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-2">
                              <p className="text-xs text-gray-500">Type the correct {selectedIsDrinkAsset ? 'drink' : 'dish'} name, choose the menu source(s), then use Search Metadata if needed.</p>
                              {renderFoodSourceBadge(selectedFoodSourceStatus, selectedFoodMenuSourceLabel)}
                            </div>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{selectedIsDrinkAsset ? 'Drink Name' : 'Dish Name'}</span>
                              <input value={intelligenceDraft.dish_name || universalDraft.title} onChange={event => {
                                setIntelligenceField('dish_name', event.target.value)
                                setUniversalDraft(prev => ({ ...prev, title: event.target.value, display_name: event.target.value }))
                              }} placeholder={selectedIsDrinkAsset ? 'Espresso Martini' : 'DemoClientD Full Breakfast'} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <div className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Menu Category / Menu Source</span>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setMenuSourcePopoverOpen(prev => !prev)}
                                  className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 outline-none transition hover:border-gray-300"
                                >
                                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                    {intelligenceDraft.menu_source_ids.length === 0 ? (
                                      <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-500">Unselected</span>
                                    ) : (
                                      menuLabelsFromIds(intelligenceDraft.menu_source_ids).map(label => (
                                        <span key={`selected-menu-${label}`} className="max-w-[180px] truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">{label}</span>
                                      ))
                                    )}
                                  </span>
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 text-sm font-semibold text-gray-500">+</span>
                                </button>
                                {menuSourcePopoverOpen && (
                                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                                    <button
                                      type="button"
                                      onClick={() => setIntelligenceMenuSourceIds([])}
                                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${intelligenceDraft.menu_source_ids.length === 0 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                      <span>Unselected</span>
                                      {intelligenceDraft.menu_source_ids.length === 0 && <span>✓</span>}
                                    </button>
                                    <div className="my-1 border-t border-gray-100" />
                                    {MENU_SOURCE_OPTIONS.map(option => {
                                      const selected = intelligenceDraft.menu_source_ids.includes(option.id)
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          onClick={() => toggleIntelligenceMenuSource(option.id)}
                                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${selected ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                          <span>{option.label}</span>
                                          {selected && <span>✓</span>}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Price</span>
                              <input value={intelligenceDraft.price} onChange={event => setIntelligenceField('price', event.target.value)} placeholder="AED 75 / Not listed on menu" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>
                              <select
                                value={editCat}
                                onChange={event => { setEditCat(event.target.value); setMetadataDraft({ asset_origin: 'Original Photo' }) }}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                              >
                                {STORED_UPLOAD_CATS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                              </select>
                            </label>
                            <div className="md:col-span-2">
                              <label className="block">
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Menu Ingredients</span>
                                <textarea value={intelligenceDraft.ingredients} onChange={event => {
                                  setIntelligenceField('ingredients', event.target.value)
                                  setIntelligenceField('menu_description', event.target.value)
                                }} placeholder="Exact ingredient wording from the menu only" rows={4} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                              </label>
                            </div>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Allergens</span>
                              <textarea value={intelligenceDraft.allergens} onChange={event => setIntelligenceField('allergens', event.target.value)} placeholder="Not listed on menu / shellfish / dairy..." rows={3} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            {selectedIsDrinkAsset && (
                              <>
                                <label className="block">
                                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Glass Type</span>
                                  <input value={intelligenceDraft.vessel} onChange={event => setIntelligenceField('vessel', event.target.value)} placeholder="Coupe / martini / rocks glass" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                                </label>
                                <label className="block">
                                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Garnish</span>
                                  <input value={intelligenceDraft.garnish} onChange={event => setIntelligenceField('garnish', event.target.value)} placeholder="Coffee beans / citrus twist / none" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                                </label>
                              </>
                            )}
                            <div className="md:col-span-2">
                              <label className="block">
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tags</span>
                                <input value={universalDraft.tags} onChange={event => setUniversalDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="breakfast, wagyu, burger" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                              </label>
                            </div>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 md:col-span-2">
                              <input type="checkbox" checked={universalDraft.approved_for_generation} onChange={e => setUniversalDraft(prev => ({ ...prev, approved_for_generation: e.target.checked, client_truth_reference: e.target.checked ? true : prev.client_truth_reference }))} />
                              Approved for generation
                            </label>
                          </div>
                        ) : selectedIsInteriorAsset ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Area / Zone</span>
                              <input value={draftText('zone')} onChange={event => setDraftField('zone', event.target.value)} placeholder="Main Bar, Lounge, Dining Room, Entrance..." className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>
                              <select value={editCat} onChange={event => { setEditCat(event.target.value); setMetadataDraft({ asset_origin: 'Original Photo' }) }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400">
                                {STORED_UPLOAD_CATS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                              </select>
                            </label>
                            <div className="md:col-span-2">{renderInteriorTextarea('Surface / Table Truth', 'surface_table_truth', 'black marble bar top, dark stone counter, dark brown wood table...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Seating Truth', 'seating_truth', 'blue velvet booth, zebra-pattern bar stools, dark upholstered chairs...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Key Materials', 'key_materials', 'walnut wood, brass trim, marble floor, blue curtains...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Lighting', 'lighting', 'warm bar glow, pendant lights, daylight, ambient wall lighting...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Architecture / Spatial Features', 'architecture_spatial_features', 'arched wood ceiling, back-bar shelving, floor-to-ceiling curtains...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Do Not Invent', 'do_not_invent', 'Do not change table material, add unrelated windows, or turn bar counter into dining table...', 3)}</div>
                            <div className="md:col-span-2">{renderInteriorTextarea('Best Use', 'best_use', 'business lunch, cocktail scene, lifestyle, product photography background...', 3)}</div>
                            <div className="md:col-span-2">
                              <label className="block">
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tags</span>
                                <input value={universalDraft.tags || draftText('tags')} onChange={event => {
                                  setUniversalDraft(prev => ({ ...prev, tags: event.target.value }))
                                  setDraftField('tags', event.target.value)
                                }} placeholder="main bar, interior, black marble, walnut wood, brass" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400" />
                              </label>
                            </div>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 md:col-span-2">
                              <input type="checkbox" checked={universalDraft.approved_for_generation} onChange={e => setUniversalDraft(prev => ({ ...prev, approved_for_generation: e.target.checked, client_truth_reference: e.target.checked ? true : prev.client_truth_reference }))} />
                              Approved for generation
                            </label>
                          </div>
                        ) : (
	                          <div className="mt-4 grid gap-3 md:grid-cols-2">
	                            {renderEditInput('Asset title', 'title', universalDraft.title, value => setUniversalDraft(prev => ({ ...prev, title: value })), 'Emperor Oysters')}
	                            <label className="block">
	                              <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>{renderLockButton('category')}</div>
	                              <select value={editCat} onChange={e => { setEditCat(e.target.value); setMetadataDraft({ asset_origin: 'Original Photo' }) }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none">
	                                {STORED_UPLOAD_CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
	                              </select>
	                            </label>
	                            {renderEditInput('Display name', 'display_name', universalDraft.display_name, value => setUniversalDraft(prev => ({ ...prev, display_name: value })), 'Public display name')}
	                            {renderEditInput('File name', 'title', editName, setEditName, 'File name')}
	                            {renderEditInput('Slug', 'slug', universalDraft.slug, value => setUniversalDraft(prev => ({ ...prev, slug: value })), 'emperor-oysters')}
	                            <label className="block">
	                              <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Source type</span>{renderLockButton('source_type')}</div>
                              <select value={universalDraft.source_type} onChange={e => setUniversalDraft(prev => ({ ...prev, source_type: e.target.value as AssetSourceTypeOption }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none">
                                {ASSET_SOURCE_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                            <label className="block">
                              <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Truth role</span>{renderLockButton('normalized_role')}</div>
                              <select value={universalDraft.normalized_role} onChange={e => setUniversalDraft(prev => ({ ...prev, normalized_role: e.target.value as NormalizedRoleOption }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none">
                                {NORMALIZED_ROLE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                            {renderEditInput('Tags', 'usage_notes', universalDraft.tags, value => setUniversalDraft(prev => ({ ...prev, tags: value })), 'oysters, seafood, shellfish')}
                            {renderEditTextarea('Description / notes', 'usage_notes', universalDraft.description, value => setUniversalDraft(prev => ({ ...prev, description: value })), 'Short searchable description', 3)}
                            {renderEditTextarea('Usage notes', 'usage_notes', universalDraft.usage_notes, value => setUniversalDraft(prev => ({ ...prev, usage_notes: value })), 'How Jarvis should use this asset', 3)}
                            <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                              <input type="checkbox" checked={universalDraft.client_truth_reference} onChange={e => setUniversalDraft(prev => ({ ...prev, client_truth_reference: e.target.checked }))} />
                              Client truth reference
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                              <input type="checkbox" checked={universalDraft.approved_for_generation} onChange={e => setUniversalDraft(prev => ({ ...prev, approved_for_generation: e.target.checked }))} />
                              Approved for generation
                            </label>
                          </div>
                        )}
                      </details>

                      {!selectedIsPinterestAsset && !selectedIsInteriorAsset && (
                      <details className="rounded-2xl border border-gray-100 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-900">{selectedIsMenuAsset ? 'Advanced metadata' : 'Food Intelligence'}</summary>
                        {selectedIsDrinkAsset ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {renderEditInput('Liquid Color', 'liquid_color', intelligenceDraft.liquid_color, value => setIntelligenceField('liquid_color', value), 'amber / clear / deep brown')}
                            {renderEditInput('Foam / Clarity', 'foam_or_clarity', intelligenceDraft.foam_or_clarity, value => setIntelligenceField('foam_or_clarity', value), 'foamy top / clear / cloudy')}
                            {renderEditInput('Ice', 'ice', intelligenceDraft.ice, value => setIntelligenceField('ice', value), 'large cube / crushed / none')}
                            {renderEditInput('Smoke / Dry Ice', 'smoke_or_dry_ice', intelligenceDraft.smoke_or_dry_ice, value => setIntelligenceField('smoke_or_dry_ice', value), 'none / subtle smoke')}
                            {renderEditInput('Scale', 'scale', intelligenceDraft.scale, value => setIntelligenceField('scale', value), 'single glass / bottle / flight')}
                            {renderEditInput('Composition', 'composition', intelligenceDraft.composition, value => setIntelligenceField('composition', value), 'centered / close crop / table detail')}
                            {renderEditInput('Lighting', 'lighting', intelligenceDraft.lighting, value => setIntelligenceField('lighting', value), 'soft daylight / warm bar light')}
                            <div className="md:col-span-2">{renderEditTextarea('Strict Negatives', 'strict_negatives', intelligenceDraft.strict_negatives, value => setIntelligenceField('strict_negatives', value), 'No wrong glass, no fake garnish, no extra props...', 3)}</div>
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {renderEditInput('Serving count', 'serving_count', intelligenceDraft.serving_count, value => setIntelligenceField('serving_count', value), '6 oysters / one sharing plate')}
                            {renderEditTextarea('Plating', 'plating', intelligenceDraft.plating, value => setIntelligenceField('plating', value), 'Plate/vessel layout, count, arrangement', 3)}
                            {renderEditInput('Garnish', 'garnish', intelligenceDraft.garnish, value => setIntelligenceField('garnish', value), 'Visible garnish only')}
                            {renderEditInput('Plate', 'vessel', intelligenceDraft.vessel, value => setIntelligenceField('vessel', value), 'Shells, plate, bowl, tray')}
                            {renderEditInput('Sauces', 'sauces', intelligenceDraft.sauces, value => setIntelligenceField('sauces', value), 'Visible sauces / dips')}
                            {renderEditTextarea('Portion logic', 'portion_logic', intelligenceDraft.portion_logic, value => setIntelligenceField('portion_logic', value), 'How much, how arranged, what must stay true', 3)}
                          </div>
                        )}
                      </details>
                      )}

                      {!selectedIsMenuAsset && !selectedIsPinterestAsset && !selectedIsInteriorAsset && (
                        <>
                          <details className="rounded-2xl border border-gray-100 bg-white p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Visual Intelligence</summary>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {renderEditInput('Angle', 'angle', intelligenceDraft.angle, value => setIntelligenceField('angle', value), 'top-down / 45-degree / macro')}
                              {renderEditInput('Lighting', 'lighting', intelligenceDraft.lighting, value => setIntelligenceField('lighting', value), 'soft daylight / warm luxury')}
                              {renderEditInput('Composition', 'composition', intelligenceDraft.composition, value => setIntelligenceField('composition', value), 'centered / asymmetrical / close crop')}
                              {renderEditInput('Mood', 'mood', intelligenceDraft.mood, value => setIntelligenceField('mood', value), 'luxury / comfort / social')}
                              {renderEditTextarea('Textures', 'textures', intelligenceDraft.textures, value => setIntelligenceField('textures', value), 'Shell, sauce, plate, fabric, marble', 3)}
                              {renderEditTextarea('Surface', 'surface', intelligenceDraft.surface, value => setIntelligenceField('surface', value), 'Table/surface/material context', 3)}
                              {renderEditTextarea('Background', 'background', intelligenceDraft.background, value => setIntelligenceField('background', value), 'Visible background constraints', 3)}
                            </div>
                          </details>

                          <details className="rounded-2xl border border-gray-100 bg-white p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Venue Intelligence</summary>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {renderEditInput('Venue zone', 'venue_zone', intelligenceDraft.venue_zone, value => setIntelligenceField('venue_zone', value), 'Interior Dining Tables')}
                              {renderEditInput('Table family', 'table_family', intelligenceDraft.table_family, value => setIntelligenceField('table_family', value), 'black marble round table')}
                              {renderEditInput('Seating family', 'seating_family', intelligenceDraft.seating_family, value => setIntelligenceField('seating_family', value), 'blue velvet rounded chairs')}
                              {renderEditInput('Lighting family', 'lighting_family', intelligenceDraft.lighting_family, value => setIntelligenceField('lighting_family', value), 'chandelier cluster')}
                              {renderEditTextarea('Spatial role', 'spatial_role', intelligenceDraft.spatial_role, value => setIntelligenceField('spatial_role', value), 'How this asset anchors the venue or surface', 3)}
                            </div>
                          </details>

                          <details className="rounded-2xl border border-gray-100 bg-white p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Prompt Intelligence</summary>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {renderEditTextarea('Generation risks', 'generation_risks', intelligenceDraft.generation_risks, value => setIntelligenceField('generation_risks', value), 'Where models may drift', 3)}
                              {renderEditTextarea('Strict negatives', 'strict_negatives', intelligenceDraft.strict_negatives, value => setIntelligenceField('strict_negatives', value), 'No wrong dish, no fake garnish...', 3)}
                              {renderEditTextarea('Provider notes', 'provider_notes', intelligenceDraft.provider_notes, value => setIntelligenceField('provider_notes', value), 'Provider-specific warnings', 3)}
                            </div>
                          </details>
                        </>
                      )}
                    </>
                  ) : (
                    selectedIsPinterestAsset ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {renderDisplayRow('Reference Name', stringMeta(selected, ['reference_name', 'title', 'name', 'pinTitle']) || assetTitle(selected), 'pinterest-display-name')}
                        {renderDisplayRow('Inspiration only', 'Yes', 'pinterest-display-inspiration-only')}
                        <div className="md:col-span-2">{renderDisplayRow('Inspiration Usage Categories', arrayMeta(selected, ['inspiration_usage_categories', 'usage_categories', 'usage']).join(', ') || '—', 'pinterest-display-usage')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('What to Learn', stringMeta(selected, ['what_to_learn', 'learn_from', 'notes', 'description']) || '—', 'pinterest-display-learn')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Source URL', stringMeta(selected, ['source_url', 'sourceUrl', 'url']) || '—', 'pinterest-display-source')}</div>
                        {renderDisplayRow('Tags', arrayMeta(selected, ['tags']).join(', ') || '—', 'pinterest-display-tags')}
                        {renderDisplayRow('Approved for inspiration', booleanMeta(selected, ['approved_for_inspiration', 'approvedForInspiration']) ? 'Yes' : 'No', 'pinterest-display-approved')}
                      </div>
                    ) : selectedIsMenuAsset ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="md:col-span-2 flex justify-end">{renderFoodSourceBadge(selectedFoodSourceStatus, selectedFoodMenuSourceLabel)}</div>
                        {renderDisplayRow(selectedIsDrinkAsset ? 'Drink name' : 'Dish name', stringMeta(selected, selectedIsDrinkAsset ? ['drink_name', 'drinkName', 'dish_name', 'name'] : ['dish_name', 'foodName', 'name']) || assetTitle(selected), 'menu-display-name')}
                        {renderDisplayRow('Menu source', selectedFoodMenuSourceLabel || '—', 'menu-display-category')}
                        {renderDisplayRow('Price', stringMeta(selected, ['price', 'menu_price']) || '—', 'food-display-price')}
                        <div className="md:col-span-2">{renderDisplayRow('Menu Ingredients', stringMeta(selected, ['menu_ingredients', 'menuIngredients', 'ingredients']) || stringMeta(selected, ['menu_description', 'menuDescription']) || '—', 'food-display-menu-ingredients')}</div>
                        {renderDisplayRow('Allergens', stringMeta(selected, ['allergens', 'allergen_notes']) || '—', 'food-display-allergens')}
                        {selectedIsDrinkAsset && renderDisplayRow('Glass Type', stringMeta(selected, ['glass_shape', 'glass', 'vessel', 'serving_vessel']) || '—', 'drink-display-glass')}
                        {selectedIsDrinkAsset && renderDisplayRow('Garnish', stringMeta(selected, ['garnish']) || '—', 'drink-display-garnish')}
                        {renderDisplayRow('Tags', arrayMeta(selected, ['tags', 'usage']).join(', ') || '—', 'food-display-tags')}
                        {renderDisplayRow('Approved for generation', booleanMeta(selected, ['approved_for_generation']) ? 'Yes' : 'No', 'food-display-approved')}
                      </div>
                    ) : selectedIsInteriorAsset ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {renderDisplayRow('Area / Zone', stringMeta(selected, ['zone', 'area_zone', 'venue_zone', 'name']) || assetTitle(selected), 'interior-display-zone')}
                        {renderDisplayRow('Category', categoryLabel(selected.asset_category), 'interior-display-category')}
                        <div className="md:col-span-2">{renderDisplayRow('Surface / Table Truth', stringMeta(selected, ['surface_table_truth', 'surfaceTableTruth', 'surface', 'table_material']) || '—', 'interior-display-surface')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Seating Truth', stringMeta(selected, ['seating_truth', 'seatingTruth', 'seating', 'seating_family']) || '—', 'interior-display-seating')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Key Materials', stringMeta(selected, ['key_materials', 'keyMaterials', 'materials', 'material']) || '—', 'interior-display-materials')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Lighting', stringMeta(selected, ['lighting']) || '—', 'interior-display-lighting')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Architecture / Spatial Features', stringMeta(selected, ['architecture_spatial_features', 'architectureSpatialFeatures', 'features', 'spatial_features']) || '—', 'interior-display-architecture')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Do Not Invent', stringMeta(selected, ['do_not_invent', 'doNotInvent']) || '—', 'interior-display-do-not-invent')}</div>
                        <div className="md:col-span-2">{renderDisplayRow('Best Use', stringMeta(selected, ['best_use', 'bestUse', 'usage', 'usage_notes']) || '—', 'interior-display-best-use')}</div>
                        {renderDisplayRow('Tags', arrayMeta(selected, ['tags']).join(', ') || '—', 'interior-display-tags')}
                        {renderDisplayRow('Approved for generation', booleanMeta(selected, ['approved_for_generation']) ? 'Yes' : 'No', 'interior-display-approved')}
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {renderDisplayRow('Title', assetTitle(selected))}
                        {renderDisplayRow('Category', selected.asset_category || 'other')}
                        {renderDisplayRow('Tags', arrayMeta(selected, ['tags', 'usage']).join(', ') || '—')}
                        {renderDisplayRow('Description', assetDescription(selected) || '—')}
                        {displayFieldsFor(selected).map(({ field, value }, index) => renderDisplayRow(field.label, formatMetadataValue(value), `metadata-display-${field.key}-${index}`))}
                        {renderDisplayRow('Dish name', stringMeta(selected, ['dish_name', 'foodName', 'name']) || '—')}
                        {renderDisplayRow('Lighting', stringMeta(selected, ['lighting', 'lighting_style']) || '—')}
                        {renderDisplayRow('Composition', stringMeta(selected, ['composition', 'composition_type']) || '—')}
                        {renderDisplayRow('Strict negatives', stringMeta(selected, ['strict_negatives', 'do_not_add', 'do_not_invent']) || '—')}
                      </div>
                    )
                  )}

                  {!selectedNeedsVisualReview && !selectedIsPinterestAsset && (
                  <div className="rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{selectedIsMenuAsset ? 'Search Metadata' : selectedIsInteriorAsset ? 'Regenerate Interior Metadata' : 'AI Metadata Reasoning'}</p>
                        <p className="mt-1 text-xs text-gray-500">{selectedIsMenuAsset ? `Search selected menu sources using the typed ${selectedIsDrinkAsset ? 'drink' : 'dish'} name. Apply a result, then click Save.` : selectedIsInteriorAsset ? 'Create a concise venue-truth proposal from this interior image. Apply a result, then click Save.' : 'Claude Vision proposes metadata from the image, title, existing metadata, and locks. It does not save until you apply and save.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => requestMetadataRegeneration(selected)} disabled={metadataRegenerating} className="h-9 rounded-lg border border-[#171717] bg-[#171717] px-3 text-xs font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-45">
                          {metadataRegenerating ? 'Searching...' : selectedIsMenuAsset ? 'Search Metadata' : selectedIsInteriorAsset ? 'Regenerate Metadata' : 'Regenerate Metadata'}
                        </button>
                        {aiMetadataProposal?.proposed_metadata && (
                          <button
                            type="button"
                            onClick={() => { if (!selectedIsEditing) beginMetadataEdit(selected); applyMetadataProposal(aiMetadataProposal.proposed_metadata!) }}
                            className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-3 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
                          >
                            Apply result
                          </button>
                        )}
                      </div>
                    </div>
                    {metadataRegenerationError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{metadataRegenerationError}</p>}
                    {aiMetadataProposal?.reasoning || aiMetadataProposal?.proposed_metadata ? (
                      selectedIsMenuAsset ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {renderDisplayRow(selectedIsDrinkAsset ? 'Proposed drink' : 'Proposed dish', proposalString(aiMetadataProposal.proposed_metadata ?? {}, selectedIsDrinkAsset ? ['drinkName', 'drink_name', 'dishName', 'dish_name'] : ['dishName', 'dish_name']) || '—', 'food-proposal-dish')}
                          {renderDisplayRow('Menu sources', menuLabelsFromIds(normalizeFoodMenuSourceIds(proposalStringArray(aiMetadataProposal.proposed_metadata ?? {}, ['menuSourceIds', 'menu_source_ids', 'menu_ids', 'menuIds']), proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['menuSourceId', 'menu_source_id', 'menuSourceName', 'menu_source_name', 'menuCategory', 'menu_category']))).join(' + ') || proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['menuSourceName', 'menu_source_name', 'menuCategory', 'menu_category']) || '—', 'food-proposal-category')}
                          {renderDisplayRow('Source', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['sourceStatus', 'source_status', 'metadata_source']) || '—', 'food-proposal-source')}
                          {renderDisplayRow('Price', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['price', 'menu_price']) || '—', 'food-proposal-price')}
                          <div className="md:col-span-2">{renderDisplayRow('Menu Ingredients', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['menuIngredients', 'menu_ingredients', 'ingredients']) || proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['menuDescription', 'menu_description']) || '—', 'food-proposal-menu-ingredients')}</div>
                          {selectedIsDrinkAsset && renderDisplayRow('Glass Type', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['glassType', 'glass_type', 'glass_shape', 'glass', 'vessel']) || '—', 'drink-proposal-glass')}
                          {selectedIsDrinkAsset && renderDisplayRow('Garnish', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['garnish']) || '—', 'drink-proposal-garnish')}
                          {renderDisplayRow('Reasoning', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['reasoning']) || aiMetadataProposal.reasoning?.summary || '—', 'food-proposal-reasoning')}
                          {(proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['warning']) || (aiMetadataProposal.reasoning?.uncertainty_warnings ?? []).join(', ')) && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 md:col-span-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Confirm before saving</p>
                              <p className="mt-2 text-xs text-amber-800">{proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['warning']) || (aiMetadataProposal.reasoning?.uncertainty_warnings ?? []).join(', ')}</p>
                            </div>
                          )}
                          {aiMetadataProposal.menu_debug && (
                            <details className="rounded-xl border border-gray-200 bg-white px-3 py-3 md:col-span-2">
                              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-gray-400">Menu Intelligence Debug</summary>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Searched &quot;{aiMetadataProposal.menu_debug.searchedDishName || '—'}&quot;
                                    {(aiMetadataProposal.menu_debug.selectedMenuSourceNames ?? []).length > 0
                                      ? ` in ${(aiMetadataProposal.menu_debug.selectedMenuSourceNames ?? []).join(' + ')}`
                                      : aiMetadataProposal.menu_debug.selectedMenuSourceName ? ` in ${aiMetadataProposal.menu_debug.selectedMenuSourceName}` : ' across all menus'}
                                    {' · '}{aiMetadataProposal.menu_debug.menuEntriesSearched ?? 0} entries
                                    {' · '}{aiMetadataProposal.menu_debug.structuredMenuAvailable ? 'structured index available' : 'no structured menu data available'}
                                  </p>
                                  {aiMetadataProposal.menu_debug.fallbackToAllMenus && (
                                    <p className="mt-1 text-[11px] text-amber-700">No selected-menu match was strong enough. Showing closest matches from all menus as fallback.</p>
                                  )}
                                </div>
                              </div>
                              {!aiMetadataProposal.menu_debug.structuredMenuAvailable && (
                                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  No structured menu data available. Upload or extract menu first.
                                </p>
                              )}
                              {(aiMetadataProposal.menu_debug.sourceFilesSearched ?? []).length > 0 && (
                                <p className="mt-3 text-[11px] text-gray-500">
                                  Sources searched: {(aiMetadataProposal.menu_debug.sourceFilesSearched ?? []).slice(0, 8).join(' · ')}
                                  {(aiMetadataProposal.menu_debug.sourceFilesSearched ?? []).length > 8 ? ` · +${(aiMetadataProposal.menu_debug.sourceFilesSearched ?? []).length - 8} more` : ''}
                                </p>
                              )}
                              {(aiMetadataProposal.menu_debug.topMatches ?? []).length > 0 && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Closest menu entries</p>
                                  {(aiMetadataProposal.menu_debug.topMatches ?? []).slice(0, 5).map((match, index) => (
                                    <div key={`menu-match-${index}-${match.menuEntryId || 'unknown'}-${match.dishName || match.menuName || 'dish'}-${match.score ?? 'score'}`} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-gray-900">{match.dishName || 'Untitled menu item'} <span className="font-normal text-gray-500">({Math.round(Number(match.score ?? 0) * 100)}%)</span></p>
                                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{match.menuSourceName || match.menuCategory || '—'} · {match.price || 'Not listed on menu'} · {match.sourceFile || match.menuName || 'menu source'}</p>
                                        {match.reason && <p className="mt-0.5 truncate text-[11px] text-gray-400">Reason: {match.reason}</p>}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void linkMenuMatch(match)}
                                        className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50"
                                      >
                                        Link to menu item
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </details>
                          )}
                        </div>
                      ) : selectedIsInteriorAsset ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {renderDisplayRow('Area / Zone', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['areaZone', 'area_zone', 'zone', 'zoneName', 'area']) || '—', 'interior-proposal-zone')}
                          {renderDisplayRow('Category', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['category']) || 'Interior', 'interior-proposal-category')}
                          <div className="md:col-span-2">{renderDisplayRow('Surface / Table Truth', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['surfaceTableTruth', 'surface_table_truth', 'surface', 'table_material']) || '—', 'interior-proposal-surface')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Seating Truth', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['seatingTruth', 'seating_truth', 'seating', 'seating_family']) || '—', 'interior-proposal-seating')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Key Materials', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['keyMaterials', 'key_materials', 'materials', 'material']) || '—', 'interior-proposal-materials')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Lighting', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['lighting']) || '—', 'interior-proposal-lighting')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Architecture / Spatial Features', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['architectureSpatialFeatures', 'architecture_spatial_features', 'architecture', 'features']) || '—', 'interior-proposal-architecture')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Do Not Invent', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['doNotInvent', 'do_not_invent', 'negative_rules']) || '—', 'interior-proposal-do-not-invent')}</div>
                          <div className="md:col-span-2">{renderDisplayRow('Best Use', proposalString(aiMetadataProposal.proposed_metadata ?? {}, ['bestUse', 'best_use', 'usage', 'usage_notes']) || '—', 'interior-proposal-best-use')}</div>
                          {renderDisplayRow('Tags', proposalStringArray(aiMetadataProposal.proposed_metadata ?? {}, ['tags']).join(', ') || '—', 'interior-proposal-tags')}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {renderDisplayRow('Reasoning', aiMetadataProposal.reasoning?.summary || '—')}
                          {renderDisplayRow('Detected food type', aiMetadataProposal.reasoning?.detected_food_type || '—')}
                          {renderDisplayRow('Detected plating', aiMetadataProposal.reasoning?.detected_plating || '—')}
                          {renderDisplayRow('Visual structure', aiMetadataProposal.reasoning?.detected_visual_structure || '—')}
                          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 md:col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Confidence</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {Object.entries(aiMetadataProposal.reasoning?.confidence ?? {}).map(([key, value]) => (
                                <span key={`confidence-${key}`} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-600">{key}: {Math.round(Number(value) * 100)}%</span>
                              ))}
                            </div>
                          </div>
                          {(aiMetadataProposal.reasoning?.uncertainty_warnings ?? []).length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 md:col-span-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Uncertainty warnings</p>
                              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                                {aiMetadataProposal.reasoning?.uncertainty_warnings?.map((item, index) => <li key={`uncertainty-${index}-${item}`}>- {item}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">{selectedIsMenuAsset ? `Click Search Metadata after typing the correct ${selectedIsDrinkAsset ? 'drink' : 'dish'} name and choosing any priority menu sources.` : selectedIsInteriorAsset ? 'Click Regenerate Metadata to create concise interior venue-truth fields.' : 'Click Regenerate Metadata after setting the title. Locked fields are protected from proposal merges.'}</p>
                    )}
                  </div>
                  )}

                  {isVenueLikeSpatialAsset(selected) && !selectedIsPinterestAsset && (
                    <details open={!selectedIsInteriorAsset} className={`rounded-2xl border p-4 text-xs ${selectedStoredSpatialMetadata ? 'border-gray-100 bg-white' : 'border-yellow-300 bg-yellow-50'}`}>
                      <summary className="cursor-pointer text-sm font-semibold text-gray-900">{selectedIsInteriorAsset ? 'Advanced venue spatial metadata' : 'Venue Spatial Metadata'}</summary>
                      <div className="mt-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Venue Spatial Metadata</p>
                          <p className={selectedStoredSpatialMetadata ? 'mt-0.5 text-xs text-gray-500' : 'mt-0.5 text-xs font-medium text-yellow-800'}>
                            {selectedStoredSpatialMetadata ? 'Stored physical venue truth for scene matching and QA.' : 'Metadata missing. Apply deterministic venue metadata before strict scene-plate use.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${metadataStatusClass(selectedMetadataStatus)}`}>{metadataStatusLabel(selectedMetadataStatus)}</span>
                          <button type="button" onClick={() => applyVenueMetadata(selected)} disabled={metadataActionId === selected.id} className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-45">
                            {metadataActionId === selected.id ? 'Applying...' : 'Apply metadata'}
                          </button>
                        </div>
                      </div>
                      {selectedStoredSpatialMetadata ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {spatialMetadataRows(selectedStoredSpatialMetadata).map(([label, value], index) => (
                              <div key={`spatial-${index}-${label}`} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</p>
                                <p className="mt-1 text-xs leading-relaxed text-gray-700">{value || 'Not set'}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">Preservation rules</p>
                            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-gray-700">{selectedStoredSpatialMetadata.preservationRules.map((rule, index) => <li key={`preservation-${index}-${rule}`}>- {rule}</li>)}</ul>
                          </div>
                        </>
                      ) : selectedPreviewSpatialMetadata ? (
                        <div className="rounded-xl border border-yellow-300 bg-white px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-yellow-700">Deterministic match preview</p>
                          <p className="mt-1 text-xs text-gray-700">{selectedPreviewSpatialMetadata.zoneName} · {selectedPreviewSpatialMetadata.cameraAngleType}</p>
                        </div>
                      ) : null}
                      </div>
                    </details>
                  )}
                </main>
              </div>
            </div>

            {!selectedIsMenuAsset && (
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] bg-[#ffffff]/95 px-5 py-4 backdrop-blur">
                <p className="text-xs text-gray-500">{selectedIsEditing ? 'Review AI proposals, preserve locked fields, then save metadata.' : 'Open Edit Metadata to update this asset.'}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedIsEditing && (
                    <>
                      <button type="button" onClick={() => setEditingId(null)} className="h-9 rounded-lg border border-[#d1d5db] bg-[#ffffff] px-4 text-xs font-semibold text-[#4b5563] transition hover:bg-[#f9fafb]">Cancel</button>
                      <button type="button" onClick={() => saveEdit(selected)} disabled={saving} className="h-9 rounded-lg border border-[#171717] bg-[#171717] px-4 text-xs font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-45">{saving ? 'Saving...' : 'Save metadata'}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {imageViewerOpen && modalUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/88 p-4" onClick={() => setImageViewerOpen(false)}>
          <button
            type="button"
            onClick={() => setImageViewerOpen(false)}
            className="absolute right-5 top-5 z-10 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/60"
          >
            Close
          </button>
          <div className="flex h-full w-full items-center justify-center overflow-hidden" onClick={event => event.stopPropagation()}>
            <img
              src={modalUrl}
              alt={selected ? cleanName(selected.file_name) : 'Asset preview'}
              style={{ transform: `scale(${imageViewerZoom})` }}
              className="max-h-[82vh] max-w-[88vw] object-contain transition-transform"
            />
          </div>
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-2 backdrop-blur">
            <button type="button" onClick={event => { event.stopPropagation(); setImageViewerZoom(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2)))) }} className="h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-white transition hover:bg-white/10">Zoom out</button>
            <button type="button" onClick={event => { event.stopPropagation(); setImageViewerZoom(1) }} className="h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-white transition hover:bg-white/10">Reset</button>
            <button type="button" onClick={event => { event.stopPropagation(); setImageViewerZoom(prev => Math.min(3, Number((prev + 0.15).toFixed(2)))) }} className="h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-white transition hover:bg-white/10">Zoom in</button>
          </div>
        </div>
      )}
    </>
  )
}

function InspirationReferencesPanel({
  clientId,
  uploads,
  folderFilter,
  onUploaded,
  onUpdate,
  onRemove,
  onToast,
}: {
  clientId: string
  uploads: AssetUpload[]
  folderFilter: string
  onUploaded: () => void
  onUpdate: (updated: AssetUpload) => void
  onRemove: (id: string) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadMode, setUploadMode] = useState<'upload_only' | 'analyze'>('upload_only')
  const [uploadDraft, setUploadDraft] = useState<{
    title: string
    imageUrl: string
    sourceUrl: string
    notes: string
    folder: string
    source: InspirationSource
    tags: string
    usage: InspirationUsage[]
  }>({
    title: '',
    imageUrl: '',
    sourceUrl: '',
    notes: '',
    folder: INSPIRATION_FOLDERS[0],
    source: 'pinterest' as InspirationSource,
    tags: '',
    usage: ['photography', 'videography', 'graphic_design', 'social', 'content_planning'] as InspirationUsage[],
  })
  const [editDraft, setEditDraft] = useState({
    title: '',
    folder: INSPIRATION_FOLDERS[0] as string,
    source: 'pinterest' as InspirationSource,
    sourceUrl: '',
    notes: '',
    usage: ['photography'] as InspirationUsage[],
    contentPillar: '',
    campaignSystem: '',
    compositionType: '',
    lightingStyle: '',
    emotionalTone: '',
    storyRole: '',
    feedRole: '',
    tags: '',
  })

  const inspirationUploads = uploads.filter(isInspirationAsset)
  const folderCounts = inspirationUploads.reduce<Record<string, number>>((acc, asset) => {
    const folder = inspirationFolder(asset)
    acc[folder] = (acc[folder] ?? 0) + 1
    return acc
  }, {})
  const folders = Array.from(new Set([...INSPIRATION_FOLDERS, ...Object.keys(folderCounts)]))
  const filtered = inspirationUploads.filter(asset => {
    const metadata = inspirationMetadata(asset)
    const haystack = [
      inspirationTitle(asset),
      inspirationFolder(asset),
      stringValue(metadata.notes),
      stringValue(metadata.contentPillar),
      stringValue(metadata.campaignSystem),
      inspirationTags(asset).join(' '),
    ].join(' ').toLowerCase()
    const matchesFolder = folderFilter === 'all' || inspirationFolder(asset) === folderFilter
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase())
    return matchesFolder && matchesSearch
  })
  const selected = inspirationUploads.find(asset => asset.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    const missing = inspirationUploads
      .filter(asset => asset.file_path && !signedUrls[asset.id])
      .map(asset => ({ id: asset.id, path: asset.file_path! }))
    if (missing.length === 0) return
    ;(async () => {
      const response = await fetch('/api/brain/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: missing }),
      })
      if (!response.ok) return
      const { urls } = await response.json() as { urls: Record<string, string> }
      setSignedUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [inspirationUploads, signedUrls])

  useEffect(() => {
    if (!selected) return
    const metadata = inspirationMetadata(selected)
    setEditDraft({
      title: inspirationTitle(selected),
      folder: inspirationFolder(selected),
      source: (stringValue(metadata.source, 'pinterest') as InspirationSource) || 'pinterest',
      sourceUrl: stringValue(metadata.sourceUrl) || stringValue(metadata.source_url),
      notes: stringValue(metadata.notes),
      usage: stringArrayValue(metadata.usage).filter((value): value is InspirationUsage => INSPIRATION_USAGES.includes(value as InspirationUsage)),
      contentPillar: stringValue(metadata.contentPillar) || stringValue(metadata.content_pillar),
      campaignSystem: stringValue(metadata.campaignSystem) || stringValue(metadata.campaign_system),
      compositionType: stringValue(metadata.compositionType) || stringValue(metadata.composition_type),
      lightingStyle: stringValue(metadata.lightingStyle) || stringValue(metadata.lighting_style),
      emotionalTone: stringValue(metadata.emotionalTone) || stringValue(metadata.emotional_tone),
      storyRole: stringValue(metadata.storyRole) || stringValue(metadata.story_role),
      feedRole: stringValue(metadata.feedRole) || stringValue(metadata.feed_role),
      tags: inspirationTags(selected).join(', '),
    })
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function previewUrl(asset: AssetUpload | null) {
    if (!asset) return ''
    return signedUrls[asset.id] || stringValue(inspirationMetadata(asset).imageUrl)
  }

  function toggleUploadUsage(usage: InspirationUsage) {
    setUploadDraft(prev => ({
      ...prev,
      usage: prev.usage.includes(usage) ? prev.usage.filter(item => item !== usage) : [...prev.usage, usage],
    }))
  }

  function toggleEditUsage(usage: InspirationUsage) {
    setEditDraft(prev => ({
      ...prev,
      usage: prev.usage.includes(usage) ? prev.usage.filter(item => item !== usage) : [...prev.usage, usage],
    }))
  }

  async function uploadInspirationReferences() {
    if (selectedFiles.length === 0 && !uploadDraft.imageUrl.trim()) {
      onToast('Add image files or paste an image URL.', false)
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('client_id', clientId)
    fd.append('title', uploadDraft.title)
    fd.append('folder', uploadDraft.folder)
    fd.append('source', uploadDraft.source)
    fd.append('source_url', uploadDraft.sourceUrl)
    fd.append('image_url', uploadDraft.imageUrl)
    fd.append('notes', uploadDraft.notes)
    fd.append('tags', uploadDraft.tags)
    fd.append('usage', uploadDraft.usage.join(','))
    fd.append('upload_mode', uploadMode === 'analyze' ? 'analyze' : 'upload_only')
    selectedFiles.forEach(file => fd.append('files[]', file))

    try {
      const response = await fetch('/api/brain/inspiration-references/upload', { method: 'POST', body: fd })
      const data = await response.json() as { success?: boolean; uploads?: AssetUpload[]; error?: string }
      if (!response.ok || !data.success) throw new Error(data.error || 'Inspiration upload failed')
      onToast(`Saved ${data.uploads?.length ?? 0} inspiration reference${(data.uploads?.length ?? 0) === 1 ? '' : 's'} to Client Brain`, true)
      setSelectedFiles([])
      setUploadDraft(prev => ({ ...prev, title: '', imageUrl: '', sourceUrl: '', notes: '', tags: '' }))
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Inspiration upload failed', false)
    } finally {
      setUploading(false)
    }
  }

  async function saveSelectedMetadata() {
    if (!selected) return
    setSaving(true)
    const metadata = {
      ...inspirationMetadata(selected),
      type: 'Pinterest Reference',
      title: editDraft.title.trim() || inspirationTitle(selected),
      source: editDraft.source,
      folder: editDraft.folder,
      sourceUrl: editDraft.sourceUrl.trim() || undefined,
      notes: editDraft.notes.trim() || undefined,
      usage: editDraft.usage.length > 0 ? editDraft.usage : ['photography'],
      contentPillar: editDraft.contentPillar.trim() || undefined,
      campaignSystem: editDraft.campaignSystem.trim() || undefined,
      compositionType: editDraft.compositionType.trim() || undefined,
      lightingStyle: editDraft.lightingStyle.trim() || undefined,
      emotionalTone: editDraft.emotionalTone.trim() || undefined,
      storyRole: editDraft.storyRole.trim() || undefined,
      feedRole: editDraft.feedRole.trim() || undefined,
      tags: editDraft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      inspirationOnly: true,
      usage_role: 'creative_inspiration_only',
    }

    const { data, error } = await supabase.from('asset_uploads')
      .update({ file_name: editDraft.title.trim() || selected.file_name, metadata })
      .eq('id', selected.id)
      .select()
      .single()
    if (error) onToast(error.message, false)
    else if (data) {
      onUpdate(data as unknown as AssetUpload)
      onToast('Pinterest metadata saved', true)
    }
    setSaving(false)
  }

  async function archiveSelected() {
    if (!selected) return
    if (!confirm('Archive this Pinterest reference?')) return
    const { error } = await supabase.from('asset_uploads').update({ status: 'archived' }).eq('id', selected.id)
    if (error) onToast(error.message, false)
    else {
      onRemove(selected.id)
      setSelectedId(null)
      onToast('Pinterest reference archived', true)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200/65">Pinterest</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Organized creative memory</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/52">
                Pinterest refs, moodboard images, competitor screenshots, Figma/design references, story references, and campaign style cues. These are style-only references, never truth assets.
              </p>
            </div>
            <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">inspirationOnly: true</span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">Upload mode</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ['upload_only', 'Upload only', 'Default. No paid analysis.'],
                  ['analyze', 'Upload + Analyze', 'Local heuristic tags only.'],
                ].map(([mode, title, detail]) => (
                  <button key={mode} type="button" onClick={() => setUploadMode(mode as 'upload_only' | 'analyze')} className={`rounded-xl border p-3 text-left transition ${uploadMode === mode ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}>
                    <p className="text-xs font-semibold text-white">{title}</p>
                    <p className="mt-1 text-[11px] text-white/38">{detail}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">Quick rules</p>
              <div className="mt-3 space-y-1 text-xs leading-relaxed text-white/45">
                <p>Controls mood, lighting, composition, styling, color, story rhythm.</p>
                <p>Never overrides food, drink, venue, model, accessory, or studio-shot truth.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input value={uploadDraft.title} onChange={e => setUploadDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Title optional" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
            <select value={uploadDraft.folder} onChange={e => setUploadDraft(prev => ({ ...prev, folder: e.target.value }))} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
              {INSPIRATION_FOLDERS.map(folder => <option key={folder} value={folder}>{folder}</option>)}
            </select>
            <select value={uploadDraft.source} onChange={e => setUploadDraft(prev => ({ ...prev, source: e.target.value as InspirationSource }))} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
              {INSPIRATION_SOURCES.map(source => <option key={source} value={source}>{source.replace(/_/g, ' ')}</option>)}
            </select>
            <input value={uploadDraft.imageUrl} onChange={e => setUploadDraft(prev => ({ ...prev, imageUrl: e.target.value }))} placeholder="Paste image URL optional" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
            <input value={uploadDraft.sourceUrl} onChange={e => setUploadDraft(prev => ({ ...prev, sourceUrl: e.target.value }))} placeholder="Pinterest/source URL optional" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
            <input value={uploadDraft.tags} onChange={e => setUploadDraft(prev => ({ ...prev, tags: e.target.value }))} placeholder="Tags, comma separated" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {INSPIRATION_USAGES.map(usage => (
              <button key={usage} type="button" onClick={() => toggleUploadUsage(usage)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${uploadDraft.usage.includes(usage) ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/45'}`}>
                {usage.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <textarea value={uploadDraft.notes} onChange={e => setUploadDraft(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes: what should Jarvis learn from this reference? Lighting, pacing, crop, mood, styling..." rows={3} className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => setSelectedFiles(Array.from(e.target.files ?? []))} className="mt-3 block w-full text-xs text-white/45 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black hover:file:bg-emerald-300" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/38">{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected</p>
            <button type="button" disabled={uploading} onClick={uploadInspirationReferences} className="jarvis-button px-5 py-2 text-xs disabled:opacity-40">
              {uploading ? 'Saving...' : 'Save Pinterest References'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Reference grid</p>
              <p className="mt-1 text-xs text-white/40">{filtered.length} visible · {inspirationUploads.length} total</p>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search folder, title, tags, notes..." className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none md:w-80" />
          </div>

          {inspirationUploads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-white">No Pinterest references yet.</p>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-white/42">Upload Pinterest-style moodboard images or paste an image URL. They will live in Client Brain as style-only creative memory.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map(asset => {
                const url = previewUrl(asset)
                const selected = asset.id === selectedId
                return (
                  <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-emerald-300/60 bg-emerald-300/10 shadow-[0_0_30px_rgba(52,211,153,0.14)]' : 'border-white/10 bg-black/25 hover:border-white/25'}`}>
                    <div className="aspect-[4/5] bg-black/40">
                      {url ? <img src={url} alt={inspirationTitle(asset)} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center px-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Image</div>}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-white">{inspirationTitle(asset)}</p>
                      <p className="mt-1 truncate text-xs text-white/40">{inspirationFolder(asset)} · inspiration only</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 xl:sticky xl:top-24 xl:self-start">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/65">Metadata drawer</p>
        {selected ? (
          <div className="mt-4 space-y-4">
            {previewUrl(selected) && <img src={previewUrl(selected)} alt={inspirationTitle(selected)} className="max-h-64 w-full rounded-2xl object-cover" />}
            <div className="grid gap-3">
              <input value={editDraft.title} onChange={e => setEditDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <select value={editDraft.folder} onChange={e => setEditDraft(prev => ({ ...prev, folder: e.target.value }))} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
                {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
              </select>
              <select value={editDraft.source} onChange={e => setEditDraft(prev => ({ ...prev, source: e.target.value as InspirationSource }))} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
                {INSPIRATION_SOURCES.map(source => <option key={source} value={source}>{source.replace(/_/g, ' ')}</option>)}
              </select>
              <input value={editDraft.sourceUrl} onChange={e => setEditDraft(prev => ({ ...prev, sourceUrl: e.target.value }))} placeholder="Source URL" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.tags} onChange={e => setEditDraft(prev => ({ ...prev, tags: e.target.value }))} placeholder="Tags" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <textarea value={editDraft.notes} onChange={e => setEditDraft(prev => ({ ...prev, notes: e.target.value }))} rows={3} placeholder="Notes" className="resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Usage</p>
              <div className="flex flex-wrap gap-2">
                {INSPIRATION_USAGES.map(usage => (
                  <button key={usage} type="button" onClick={() => toggleEditUsage(usage)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${editDraft.usage.includes(usage) ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/45'}`}>
                    {usage.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <input value={editDraft.contentPillar} onChange={e => setEditDraft(prev => ({ ...prev, contentPillar: e.target.value }))} placeholder="Content pillar" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.campaignSystem} onChange={e => setEditDraft(prev => ({ ...prev, campaignSystem: e.target.value }))} placeholder="Campaign system" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.compositionType} onChange={e => setEditDraft(prev => ({ ...prev, compositionType: e.target.value }))} placeholder="Composition type" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.lightingStyle} onChange={e => setEditDraft(prev => ({ ...prev, lightingStyle: e.target.value }))} placeholder="Lighting style" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.emotionalTone} onChange={e => setEditDraft(prev => ({ ...prev, emotionalTone: e.target.value }))} placeholder="Emotional tone" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.storyRole} onChange={e => setEditDraft(prev => ({ ...prev, storyRole: e.target.value }))} placeholder="Story role" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
              <input value={editDraft.feedRole} onChange={e => setEditDraft(prev => ({ ...prev, feedRole: e.target.value }))} placeholder="Feed role" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
            </div>
            <div className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.06] p-3">
              <p className="text-xs font-semibold text-fuchsia-100">Inspiration only</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">This ref can guide mood, lighting, composition, styling, color, story rhythm, and feed pacing. It cannot become product/model/venue truth.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={saveSelectedMetadata} className="jarvis-button flex-1 justify-center px-4 py-2 text-xs disabled:opacity-40">{saving ? 'Saving...' : 'Save metadata'}</button>
              <button type="button" onClick={archiveSelected} className="rounded-xl border border-red-300/20 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10">Archive</button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-white/45">Select an inspiration reference to view and edit metadata.</p>
        )}
      </aside>
    </div>
  )
}

// ─── Merged upload section ────────────────────────────────────────────────────

function UploadFiles({
  clientId, clientName, onUploaded, onToast, fixedCategory, fixedCategoryLabel,
}: {
  clientId: string; clientName: string
  onUploaded: () => void; onToast: (m: string, ok: boolean) => void
  fixedCategory?: string; fixedCategoryLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition text-left">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">↑</span>
          <span className="text-sm font-semibold text-gray-900">Upload Images</span>
          <span className="text-xs text-gray-400">{fixedCategory ? `upload directly to ${fixedCategoryLabel || uploadCategoryLabel(fixedCategory)}` : 'select images · choose category · upload'}</span>
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-6 pb-6 pt-4">
          <BatchUploadPanel
            clientId={clientId}
            clientName={clientName}
            fixedCategory={fixedCategory}
            fixedCategoryLabel={fixedCategoryLabel}
            onUploaded={onUploaded}
            onToast={onToast}
          />
        </div>
      )}
    </div>
  )
}

type GuestModelStatus = 'Draft' | 'Approved'
type ReferenceRatio = 'Portrait' | 'Close-up' | 'Full Body' | 'Seated' | 'Candid'
type RelationshipTag = 'Couple' | 'Friends' | 'Solo' | 'Group Core'
type OutfitSetName = 'Breakfast Outfits' | 'Lunch Outfits' | 'Dinner Outfits'
type ModelReferenceKey = 'front_face' | 'side_face' | 'body_front' | 'body_side'
type GuestModelRelationshipType = 'Couple' | 'Friends' | 'Business Partners' | 'Family' | 'Group Core' | 'Acquaintance' | 'Regular Guest Circle' | 'Other'
type GuestModelRelationshipStrength = 'Primary' | 'Strong' | 'Casual' | 'Occasional'
type AccessoryType = 'Watch' | 'Bag' | 'Sunglasses' | 'Jewelry' | 'Shoes' | 'Folio' | 'Other'

interface VisualReference {
  id: string
  label: string
  ratio: ReferenceRatio
  primary: boolean
  locked: boolean
  key?: ModelReferenceKey
  owner?: string
  accessory_type?: string
  brand?: string
  model?: string
  model_number?: string
  object_name?: string
  description?: string
  color?: string
  material?: string
  shape_silhouette?: string
  key_visible_details?: string
  do_not_change?: string
  tags?: string
  approved_for_generation?: boolean
  dial_color?: string
  dial_shape?: string
  markers?: string
  hands?: string
  bezel?: string
  case_shape?: string
  strap_or_bracelet?: string
  metal_tone?: string
  bag_shape?: string
  strap_handle?: string
  hardware?: string
  quilting_texture?: string
  clasp_logo_placement?: string
  frame_shape?: string
  lens_color?: string
  frame_color?: string
  size_fit?: string
  logo_notes?: string
  placement?: string
  must_appear?: boolean
  notes?: string
  previewUrl?: string
  storagePath?: string
  publicUrl?: string
  filename?: string
  mimeType?: string
  size?: number
  uploadedAt?: string
}

interface GuestModelRelationship {
  id: string
  relatedModelId: string
  relatedModelName: string
  relationshipType: GuestModelRelationshipType
  relationshipStrength: GuestModelRelationshipStrength
  notes: string
}

interface GuestModelProfile {
  id: string
  name: string
  background: string
  ageRange: string
  height: string
  gender: string
  hair: string
  eyes: string
  skinTone: string
  archetype: string
  personality: string
  usageTags: string
  relationshipTags: RelationshipTag[]
  status: GuestModelStatus
  continuityLocks: {
    face: boolean
    outfit: boolean
    accessories: boolean
  }
  references: VisualReference[]
  outfits: Record<OutfitSetName, { notes: string; references: VisualReference[] }>
  accessories: VisualReference[]
  relationships: GuestModelRelationship[]
  notes: string
}

interface GuestModelRow {
  id: string
  client_id: string
  name: string | null
  ethnicity: string | null
  age_range: string | null
  profession: string | null
  personality: string | null
  relationship_type: string | null
  status: string | null
  do_not_modify: boolean | null
  model_references: unknown
  outfit_sets: unknown
  accessories: unknown
  notes: string | null
  created_at: string
  updated_at: string
}

interface GuestModelRelationshipRow {
  id: string
  client_id: string
  model_id: string
  related_model_id: string
  relationship_type: string | null
  relationship_strength: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface GuestModelPersistencePayload {
  id: string
  client_id: string
  name: string | null
  ethnicity: string | null
  age_range: string | null
  profession: string | null
  personality: string | null
  relationship_type: string | null
  status: GuestModelStatus
  do_not_modify: boolean
  model_references: {
    version: 2
    storage: 'supabase-storage'
    continuityLock: boolean
    coreIdentity?: {
      height?: string | null
      gender?: string | null
      hair?: string | null
      eyes?: string | null
      skinTone?: string | null
      usageTags?: string | null
    }
    references: VisualReference[]
  }
  outfit_sets: {
    version: 2
    storage: 'supabase-storage'
    continuityLock: boolean
    sets: GuestModelProfile['outfits']
  }
  accessories: {
    version: 2
    storage: 'supabase-storage'
    continuityLock: boolean
    references: VisualReference[]
  }
  notes: string | null
  updated_at: string
}

const MODEL_REFERENCE_DEFS: Array<{ key: ModelReferenceKey; label: string; group: 'Face' | 'Body'; ratio: ReferenceRatio }> = [
  { key: 'front_face', label: 'Front Face', group: 'Face', ratio: 'Portrait' },
  { key: 'side_face', label: 'Side Face', group: 'Face', ratio: 'Close-up' },
  { key: 'body_front', label: 'Body Front', group: 'Body', ratio: 'Full Body' },
  { key: 'body_side', label: 'Body Side', group: 'Body', ratio: 'Full Body' },
]
const OUTFIT_SETS = ['Breakfast Outfits', 'Lunch Outfits', 'Dinner Outfits'] as const
const OUTFIT_SET_ALIASES: Record<OutfitSetName, string[]> = {
  'Breakfast Outfits': ['Breakfast Outfits', 'Breakfast Looks'],
  'Lunch Outfits': ['Lunch Outfits', 'Business Lunch Looks'],
  'Dinner Outfits': ['Dinner Outfits', 'Dinner Looks'],
}
const ACCESSORY_TYPES = ['Watch', 'Bag', 'Sunglasses', 'Jewelry', 'Shoes', 'Folio', 'Other'] as const
const ACCESSORY_ALIASES: Record<AccessoryType, string[]> = {
  Watch: ['Watch', 'Watches'],
  Bag: ['Bag', 'Bags'],
  Sunglasses: ['Sunglasses', 'Glasses'],
  Jewelry: ['Jewelry', 'Wedding Ring', 'Ring', 'Rings'],
  Shoes: ['Shoes', 'Footwear'],
  Folio: ['Folio', 'Folder', 'Portfolio'],
  Other: ['Other', 'Accessory', 'Accessories'],
}
const ACCESSORY_TYPE_OPTIONS: AccessoryType[] = [...ACCESSORY_TYPES]
const RATIO_PRESETS: ReferenceRatio[] = ['Portrait', 'Close-up', 'Full Body', 'Seated', 'Candid']
const RELATIONSHIP_TAGS: RelationshipTag[] = ['Couple', 'Friends', 'Solo', 'Group Core']
const GUEST_MODEL_BUCKET = 'guest-models'
const RELATIONSHIP_TYPE_OPTIONS: GuestModelRelationshipType[] = ['Couple', 'Friends', 'Business Partners', 'Family', 'Group Core', 'Acquaintance', 'Regular Guest Circle', 'Other']
const RELATIONSHIP_STRENGTH_OPTIONS: GuestModelRelationshipStrength[] = ['Primary', 'Strong', 'Casual', 'Occasional']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReferenceRatio(value: unknown): value is ReferenceRatio {
  return typeof value === 'string' && RATIO_PRESETS.includes(value as ReferenceRatio)
}

function isGuestModelStatus(value: unknown): value is GuestModelStatus {
  return value === 'Draft' || value === 'Approved'
}

function isGuestModelRelationshipType(value: unknown): value is GuestModelRelationshipType {
  return typeof value === 'string' && RELATIONSHIP_TYPE_OPTIONS.includes(value as GuestModelRelationshipType)
}

function isGuestModelRelationshipStrength(value: unknown): value is GuestModelRelationshipStrength {
  return typeof value === 'string' && RELATIONSHIP_STRENGTH_OPTIONS.includes(value as GuestModelRelationshipStrength)
}

function isModelReferenceKey(value: unknown): value is ModelReferenceKey {
  return typeof value === 'string' && MODEL_REFERENCE_DEFS.some(def => def.key === value)
}

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function slugifyPathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image'
}

function isInlineImage(value: string | undefined) {
  return Boolean(value?.startsWith('data:image/'))
}

function dataUrlToFile(dataUrl: string, fallbackName: string) {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = header.match(/^data:(.*?);base64$/)
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  return {
    file: new File([bytes], `${fallbackName}.${extension}`, { type: mimeType }),
    mimeType,
    extension,
  }
}

function createReference(label: string, ratio: ReferenceRatio = 'Portrait', key?: ModelReferenceKey): VisualReference {
  return {
    id: crypto.randomUUID(),
    label,
    ratio,
    primary: false,
    locked: false,
    key,
  }
}

function createModelReferences() {
  return MODEL_REFERENCE_DEFS.map((def, index) => ({
    ...createReference(def.label, def.ratio, def.key),
    primary: index === 0,
  }))
}

function reorderReferences(items: VisualReference[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function createEmptyGuestModel(): GuestModelProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    background: '',
    ageRange: '',
    height: '',
    gender: '',
    hair: '',
    eyes: '',
    skinTone: '',
    archetype: '',
    personality: '',
    usageTags: '',
    relationshipTags: [],
    status: 'Draft',
    continuityLocks: { face: false, outfit: false, accessories: false },
    references: createModelReferences(),
    outfits: Object.fromEntries(OUTFIT_SETS.map(set => [
      set,
      {
        notes: '',
        references: [1, 2, 3].map(slot => createReference(`Outfit ${slot}`, 'Full Body')),
      },
    ])) as GuestModelProfile['outfits'],
    accessories: ACCESSORY_TYPES.map(label => createReference(label, 'Close-up')),
    relationships: [],
    notes: '',
  }
}

function normalizeVisualReference(value: unknown, fallback: VisualReference): VisualReference {
  if (!isRecord(value)) return fallback
  const publicUrl = typeof value.publicUrl === 'string' ? value.publicUrl : fallback.publicUrl
  const previewUrl = typeof value.previewUrl === 'string' ? value.previewUrl : publicUrl ?? fallback.previewUrl
  return {
    id: typeof value.id === 'string' ? value.id : fallback.id,
    label: typeof value.label === 'string' ? value.label : fallback.label,
    ratio: isReferenceRatio(value.ratio) ? value.ratio : fallback.ratio,
    primary: typeof value.primary === 'boolean' ? value.primary : fallback.primary,
    locked: typeof value.locked === 'boolean' ? value.locked : Boolean(previewUrl) || fallback.locked,
    key: isModelReferenceKey(value.key) ? value.key : fallback.key,
    previewUrl,
    storagePath: typeof value.storagePath === 'string' ? value.storagePath : fallback.storagePath,
    publicUrl,
    filename: typeof value.filename === 'string' ? value.filename : fallback.filename,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : fallback.mimeType,
    size: typeof value.size === 'number' ? value.size : fallback.size,
    uploadedAt: typeof value.uploadedAt === 'string' ? value.uploadedAt : fallback.uploadedAt,
    owner: typeof value.owner === 'string' ? value.owner : fallback.owner,
    accessory_type: typeof value.accessory_type === 'string' ? value.accessory_type : fallback.accessory_type,
    brand: typeof value.brand === 'string' ? value.brand : fallback.brand,
    model: typeof value.model === 'string' ? value.model : fallback.model,
    model_number: typeof value.model_number === 'string' ? value.model_number : fallback.model_number,
    object_name: typeof value.object_name === 'string' ? value.object_name : fallback.object_name,
    description: typeof value.description === 'string' ? value.description : fallback.description,
    color: typeof value.color === 'string' ? value.color : fallback.color,
    material: typeof value.material === 'string' ? value.material : fallback.material,
    shape_silhouette: typeof value.shape_silhouette === 'string' ? value.shape_silhouette : fallback.shape_silhouette,
    key_visible_details: typeof value.key_visible_details === 'string' ? value.key_visible_details : fallback.key_visible_details,
    do_not_change: typeof value.do_not_change === 'string' ? value.do_not_change : fallback.do_not_change,
    tags: typeof value.tags === 'string' ? value.tags : fallback.tags,
    approved_for_generation: typeof value.approved_for_generation === 'boolean' ? value.approved_for_generation : fallback.approved_for_generation,
    dial_color: typeof value.dial_color === 'string' ? value.dial_color : fallback.dial_color,
    dial_shape: typeof value.dial_shape === 'string' ? value.dial_shape : fallback.dial_shape,
    markers: typeof value.markers === 'string' ? value.markers : fallback.markers,
    hands: typeof value.hands === 'string' ? value.hands : fallback.hands,
    bezel: typeof value.bezel === 'string' ? value.bezel : fallback.bezel,
    case_shape: typeof value.case_shape === 'string' ? value.case_shape : fallback.case_shape,
    strap_or_bracelet: typeof value.strap_or_bracelet === 'string' ? value.strap_or_bracelet : fallback.strap_or_bracelet,
    metal_tone: typeof value.metal_tone === 'string' ? value.metal_tone : fallback.metal_tone,
    bag_shape: typeof value.bag_shape === 'string' ? value.bag_shape : fallback.bag_shape,
    strap_handle: typeof value.strap_handle === 'string' ? value.strap_handle : fallback.strap_handle,
    hardware: typeof value.hardware === 'string' ? value.hardware : fallback.hardware,
    quilting_texture: typeof value.quilting_texture === 'string' ? value.quilting_texture : fallback.quilting_texture,
    clasp_logo_placement: typeof value.clasp_logo_placement === 'string' ? value.clasp_logo_placement : fallback.clasp_logo_placement,
    frame_shape: typeof value.frame_shape === 'string' ? value.frame_shape : fallback.frame_shape,
    lens_color: typeof value.lens_color === 'string' ? value.lens_color : fallback.lens_color,
    frame_color: typeof value.frame_color === 'string' ? value.frame_color : fallback.frame_color,
    size_fit: typeof value.size_fit === 'string' ? value.size_fit : fallback.size_fit,
    logo_notes: typeof value.logo_notes === 'string' ? value.logo_notes : fallback.logo_notes,
    placement: typeof value.placement === 'string' ? value.placement : fallback.placement,
    must_appear: typeof value.must_appear === 'boolean' ? value.must_appear : fallback.must_appear,
    notes: typeof value.notes === 'string' ? value.notes : fallback.notes,
  }
}

function normalizeReferenceList(payload: unknown, defaults: VisualReference[]) {
  const rawReferences = isRecord(payload) && Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload)
      ? payload
      : []

  return defaults.map((fallback, index) => normalizeVisualReference(rawReferences[index], fallback))
}

function normalizeExpandableReferenceList(payload: unknown, defaults: VisualReference[]) {
  const rawReferences = isRecord(payload) && Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload)
      ? payload
      : []
  const count = Math.max(defaults.length, rawReferences.length)

  return Array.from({ length: count }, (_, index) => {
    const fallback = defaults[index] ?? createReference(`Outfit ${index + 1}`, 'Full Body')
    return normalizeVisualReference(rawReferences[index], fallback)
  })
}

function legacyModelReferenceKey(value: unknown): ModelReferenceKey | null {
  if (!isRecord(value)) return null
  if (isModelReferenceKey(value.key)) return value.key

  const label = typeof value.label === 'string' ? value.label.toLowerCase().trim() : ''
  if (label === 'face' || label === 'front face') return 'front_face'
  if (label === 'hair' || label === 'side face') return 'side_face'
  if (label === 'body' || label === 'body front') return 'body_front'
  if (label === 'body side') return 'body_side'
  return null
}

function normalizeModelReferences(payload: unknown, defaults: VisualReference[]) {
  const rawReferences = isRecord(payload) && Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload)
      ? payload
      : []
  const legacyIndexFallback: Array<ModelReferenceKey | null> = ['front_face', 'side_face', 'body_front', null, null]

  return defaults.map(fallback => {
    const byKey = rawReferences.find(item => legacyModelReferenceKey(item) === fallback.key)
    const byLegacyIndex = rawReferences.find((item, index) => legacyIndexFallback[index] === fallback.key && !legacyModelReferenceKey(item))
    const normalized = normalizeVisualReference(byKey ?? byLegacyIndex, fallback)

    return {
      ...normalized,
      key: fallback.key,
      label: fallback.label,
      ratio: normalized.ratio,
      primary: fallback.key === 'front_face' ? normalized.primary : normalized.primary,
    }
  })
}

function payloadContinuityLock(payload: unknown, fallback: boolean) {
  return isRecord(payload) && typeof payload.continuityLock === 'boolean' ? payload.continuityLock : fallback
}

function normalizeOutfitSets(payload: unknown, defaults: GuestModelProfile['outfits']) {
  const sets = isRecord(payload) && isRecord(payload.sets) ? payload.sets : {}

  return Object.fromEntries(OUTFIT_SETS.map(set => {
    const rawSet = OUTFIT_SET_ALIASES[set].map(alias => sets[alias]).find(isRecord)
    const savedNotes = isRecord(rawSet) && typeof rawSet.notes === 'string' ? rawSet.notes : defaults[set].notes
    const savedReferences = isRecord(rawSet) ? rawSet : {}
    return [set, {
      notes: savedNotes,
      references: normalizeExpandableReferenceList(savedReferences, defaults[set].references),
    }]
  })) as GuestModelProfile['outfits']
}

function normalizeAccessories(payload: unknown, defaults: VisualReference[]) {
  const rawReferences = isRecord(payload) && Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload)
      ? payload
      : []

  return ACCESSORY_TYPES.map((label, index) => {
    const saved = rawReferences.find(item => {
      if (!isRecord(item) || typeof item.label !== 'string') return false
      return ACCESSORY_ALIASES[label].map(alias => alias.toLowerCase()).includes(item.label.toLowerCase())
    })
    return {
      ...normalizeVisualReference(saved ?? rawReferences[index], defaults[index] ?? createReference(label, 'Close-up')),
      label,
    }
  })
}

function parseRelationshipTags(value: string | null): RelationshipTag[] {
  if (!value) return []
  const tags = value.split(/[|,]/).map(tag => tag.trim())
  return RELATIONSHIP_TAGS.filter(tag => tags.includes(tag))
}

function serializeRelationshipTags(tags: RelationshipTag[]) {
  return tags.length > 0 ? tags.join('|') : null
}

function relationshipFromRow(row: GuestModelRelationshipRow, modelsById: Map<string, string>): GuestModelRelationship {
  return {
    id: row.id,
    relatedModelId: row.related_model_id,
    relatedModelName: modelsById.get(row.related_model_id) ?? 'Untitled guest model',
    relationshipType: isGuestModelRelationshipType(row.relationship_type) ? row.relationship_type : 'Friends',
    relationshipStrength: isGuestModelRelationshipStrength(row.relationship_strength) ? row.relationship_strength : 'Casual',
    notes: row.notes ?? '',
  }
}

function relationshipToRow(clientId: string, modelId: string, relationship: GuestModelRelationship) {
  return {
    id: relationship.id,
    client_id: clientId,
    model_id: modelId,
    related_model_id: relationship.relatedModelId,
    relationship_type: relationship.relationshipType,
    relationship_strength: relationship.relationshipStrength,
    notes: cleanText(relationship.notes),
  }
}

function guestModelFromRow(row: GuestModelRow, relationships: GuestModelRelationship[] = []): GuestModelProfile {
  const fallback = createEmptyGuestModel()
  const modelReferences = isRecord(row.model_references) ? row.model_references : {}
  const coreIdentity = isRecord(modelReferences.coreIdentity) ? modelReferences.coreIdentity : {}
  return {
    id: row.id,
    name: row.name ?? '',
    background: row.ethnicity ?? '',
    ageRange: row.age_range ?? '',
    height: typeof coreIdentity.height === 'string' ? coreIdentity.height : '',
    gender: typeof coreIdentity.gender === 'string' ? coreIdentity.gender : '',
    hair: typeof coreIdentity.hair === 'string' ? coreIdentity.hair : '',
    eyes: typeof coreIdentity.eyes === 'string' ? coreIdentity.eyes : '',
    skinTone: typeof coreIdentity.skinTone === 'string' ? coreIdentity.skinTone : '',
    archetype: row.profession ?? '',
    personality: row.personality ?? '',
    usageTags: typeof coreIdentity.usageTags === 'string' ? coreIdentity.usageTags : (row.relationship_type ?? '').replaceAll('|', ', '),
    relationshipTags: parseRelationshipTags(row.relationship_type),
    status: isGuestModelStatus(row.status) ? row.status : 'Draft',
    continuityLocks: {
      face: payloadContinuityLock(row.model_references, row.do_not_modify ?? false),
      outfit: payloadContinuityLock(row.outfit_sets, row.do_not_modify ?? false),
      accessories: payloadContinuityLock(row.accessories, row.do_not_modify ?? false),
    },
    references: normalizeModelReferences(row.model_references, fallback.references),
    outfits: normalizeOutfitSets(row.outfit_sets, fallback.outfits),
    accessories: normalizeAccessories(row.accessories, fallback.accessories),
    relationships,
    notes: row.notes ?? '',
  }
}

function guestModelToPayload(clientId: string, model: GuestModelProfile): GuestModelPersistencePayload {
  const hasReferenceImages = model.references.some(ref => ref.previewUrl)
  const hasOutfitImages = OUTFIT_SETS.some(set => model.outfits[set].references.some(ref => ref.previewUrl))
  const hasAccessoryImages = model.accessories.some(ref => ref.previewUrl)
  const doNotModify = hasReferenceImages || hasOutfitImages || hasAccessoryImages

  return {
    id: model.id,
    client_id: clientId,
    name: cleanText(model.name),
    ethnicity: cleanText(model.background),
    age_range: cleanText(model.ageRange),
    profession: cleanText(model.archetype),
    personality: cleanText(model.personality),
    relationship_type: serializeRelationshipTags(model.relationshipTags),
    status: model.status,
    do_not_modify: doNotModify,
    model_references: {
      version: 2,
      storage: 'supabase-storage',
      continuityLock: hasReferenceImages,
      coreIdentity: {
        height: cleanText(model.height),
        gender: cleanText(model.gender),
        hair: cleanText(model.hair),
        eyes: cleanText(model.eyes),
        skinTone: cleanText(model.skinTone),
        usageTags: cleanText(model.usageTags),
      },
      references: model.references.map(ref => ({ ...ref, locked: Boolean(ref.previewUrl) || ref.locked })),
    },
    outfit_sets: {
      version: 2,
      storage: 'supabase-storage',
      continuityLock: hasOutfitImages,
      sets: Object.fromEntries(OUTFIT_SETS.map(set => [
        set,
        {
          ...model.outfits[set],
          references: model.outfits[set].references.map(ref => ({ ...ref, locked: Boolean(ref.previewUrl) || ref.locked })),
        },
      ])) as GuestModelProfile['outfits'],
    },
    accessories: {
      version: 2,
      storage: 'supabase-storage',
      continuityLock: hasAccessoryImages,
      references: model.accessories.map(ref => ({ ...ref, locked: Boolean(ref.previewUrl) || ref.locked })),
    },
    notes: cleanText(model.notes),
    updated_at: new Date().toISOString(),
  }
}

function modelPrimaryFace(model: GuestModelProfile) {
  return model.references.find(ref => ref.key === 'front_face' && ref.primary && ref.previewUrl)
    ?? model.references.find(ref => ref.key === 'front_face' && ref.previewUrl)
    ?? model.references.find(ref => ref.label === 'Face' && ref.previewUrl)
    ?? model.references.find(ref => ref.previewUrl)
}

function referenceImageCount(references: VisualReference[]) {
  return references.filter(ref => Boolean(ref.previewUrl)).length
}

function outfitImageCount(outfits: GuestModelProfile['outfits']) {
  return OUTFIT_SETS.reduce((total, set) => total + referenceImageCount(outfits[set].references), 0)
}

function modelAccessoryCount(model: GuestModelProfile) {
  return referenceImageCount(model.accessories)
}

function modelNeedsMetadata(model: GuestModelProfile) {
  return !model.name.trim()
    || !model.archetype.trim()
    || !model.ageRange.trim()
    || !model.background.trim()
    || !model.personality.trim()
    || !modelPrimaryFace(model)?.previewUrl
}

function modelUseCases(model: GuestModelProfile) {
  const explicitTags = model.usageTags
    .split(/[,\n|]/)
    .map(tag => tag.trim())
    .filter(Boolean)
  const outfitTags = OUTFIT_SETS
    .filter(set => model.outfits[set].references.some(ref => ref.previewUrl) || model.outfits[set].notes.trim())
    .map(set => set.replace(' Outfits', '').toLowerCase())
  const relationshipTags = model.relationshipTags.map(tag => tag.toLowerCase())
  return Array.from(new Set([...explicitTags, ...outfitTags, ...relationshipTags])).slice(0, 6)
}

function modelIdentityNotes(model: GuestModelProfile) {
  return model.notes.trim()
    || model.personality.trim()
    || [model.background, model.hair, model.eyes, model.skinTone].filter(Boolean).join(' · ')
    || 'Identity notes not set'
}

function accessoryType(item: VisualReference): AccessoryType {
  const explicit = ACCESSORY_TYPE_OPTIONS.find(type => type.toLowerCase() === item.accessory_type?.toLowerCase())
  if (explicit) return explicit
  const labelMatch = ACCESSORY_TYPE_OPTIONS.find(type => ACCESSORY_ALIASES[type].some(alias => alias.toLowerCase() === item.label.toLowerCase()))
  return labelMatch ?? 'Other'
}

function accessoryName(item: VisualReference) {
  return item.object_name?.trim() || item.label || accessoryType(item)
}

function accessoryDetailSummary(item: VisualReference) {
  return item.key_visible_details?.trim()
    || item.description?.trim()
    || [item.color, item.material, item.shape_silhouette].filter(Boolean).join(' · ')
    || item.notes?.trim()
    || 'Details not set'
}

function accessoryNeedsMetadata(item: VisualReference) {
  return Boolean(item.previewUrl) && (!accessoryName(item).trim() || accessoryDetailSummary(item) === 'Details not set')
}

function storagePathForReference(clientId: string, modelId: string, ref: VisualReference) {
  return `clients/${clientId}/models/${modelId}/references/${ref.key ?? slugifyPathPart(ref.label)}`
}

function storagePathForOutfit(clientId: string, modelId: string, set: OutfitSetName, ref: VisualReference, index: number) {
  return `clients/${clientId}/models/${modelId}/outfits/${slugifyPathPart(set.replace(' Outfits', ''))}/outfit-${index + 1}-${ref.id}`
}

function storagePathForAccessory(clientId: string, modelId: string, ref: VisualReference) {
  return `clients/${clientId}/models/${modelId}/accessories/${slugifyPathPart(ref.label)}`
}

async function uploadGuestModelReference(pathBase: string, ref: VisualReference): Promise<VisualReference> {
  if (!isInlineImage(ref.previewUrl)) {
    return ref.publicUrl && ref.previewUrl !== ref.publicUrl ? { ...ref, previewUrl: ref.publicUrl } : ref
  }

  const inlinePreview = ref.previewUrl as string
  const { file, mimeType, extension } = dataUrlToFile(inlinePreview, slugifyPathPart(ref.label))
  const storagePath = `${pathBase}.${extension}`
  const { error } = await supabase.storage.from(GUEST_MODEL_BUCKET).upload(storagePath, file, {
    contentType: mimeType,
    upsert: true,
  })
  if (error) throw error

  const privateUrl = ownerMediaPath(GUEST_MODEL_BUCKET, storagePath)
  return {
    ...ref,
    previewUrl: privateUrl,
    publicUrl: privateUrl,
    storagePath,
    filename: file.name,
    mimeType,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }
}

async function persistGuestModelImages(clientId: string, model: GuestModelProfile, onStatus: (message: string) => void) {
  onStatus('Saving images...')
  const references = await Promise.all(model.references.map(ref => uploadGuestModelReference(storagePathForReference(clientId, model.id, ref), ref)))
  const outfits = Object.fromEntries(await Promise.all(OUTFIT_SETS.map(async set => [
    set,
    {
      ...model.outfits[set],
      references: await Promise.all(model.outfits[set].references.map((ref, index) => uploadGuestModelReference(storagePathForOutfit(clientId, model.id, set, ref, index), ref))),
    },
  ]))) as GuestModelProfile['outfits']
  const accessories = await Promise.all(model.accessories.map(ref => uploadGuestModelReference(storagePathForAccessory(clientId, model.id, ref), ref)))

  return { ...model, references, outfits, accessories }
}

function matchesGuestModelFilter(model: GuestModelProfile, filter: string) {
  if (filter === 'all') return true
  if (filter === 'approved') return model.status === 'Approved'
  if (filter === 'unused') return referenceImageCount(model.references) === 0 && outfitImageCount(model.outfits) === 0 && referenceImageCount(model.accessories) === 0
  if (filter === 'couples') return model.relationshipTags.includes('Couple')
  if (filter === 'groups') return model.relationshipTags.includes('Group Core')

  const haystack = [
    model.name,
    model.archetype,
    model.personality,
    model.notes,
    model.relationshipTags.join(' '),
    ...OUTFIT_SETS.map(set => model.outfits[set].notes),
  ].join(' ').toLowerCase()
  return haystack.includes(filter.toLowerCase())
}

function ModelsPanel({ clientId }: { clientId: string }) {
  const [models, setModels] = useState<GuestModelProfile[]>([])
  const [savedAiModels, setSavedAiModels] = useState<AiPhotographyAvailableModel[]>([])
  const [aiModelSystemCount, setAiModelSystemCount] = useState(0)
  const [draft, setDraft] = useState<GuestModelProfile | null>(null)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [savingModel, setSavingModel] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadGuestModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    const [guestModelsResponse, aiModelsRes, aiAssetsRes, aiOutfitsRes, aiRelationshipsRes] = await Promise.all([
      fetch(`/api/clients/${clientId}/guest-models`, { cache: 'no-store' }).then(async response => ({ response, payload: await response.json() as { models?: GuestModelRow[]; relationships?: GuestModelRelationshipRow[]; error?: string } })),
      supabase
        .from('ai_models')
        .select('*')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('ai_model_assets')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'approved'),
      supabase
        .from('ai_model_outfits')
        .select('*')
        .eq('client_id', clientId),
      supabase
        .from('ai_model_relationships')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'active'),
    ])

    const aiModelRows = (aiModelsRes.data ?? []) as AiModel[]
    setAiModelSystemCount(aiModelRows.length)
    if (aiModelsRes.error || aiAssetsRes.error || aiOutfitsRes.error || aiRelationshipsRes.error) {
      setSavedAiModels([])
      setModelsError(aiModelsRes.error?.message ?? aiAssetsRes.error?.message ?? aiOutfitsRes.error?.message ?? aiRelationshipsRes.error?.message ?? 'Unable to load saved AI models.')
    } else {
      setSavedAiModels(buildAiPhotographyModelSummaries(
        aiModelRows,
        (aiAssetsRes.data ?? []) as AiModelAsset[],
        (aiOutfitsRes.data ?? []) as AiModelOutfit[],
        (aiRelationshipsRes.data ?? []) as AiModelRelationship[],
      ))
    }

    if (!guestModelsResponse.response.ok) {
      setModels([])
      setModelsError(guestModelsResponse.payload.error ?? 'Unable to load guest models.')
    } else {
      const rows = guestModelsResponse.payload.models ?? []
      const modelsById = new Map(rows.map(row => [row.id, row.name ?? 'Untitled guest model']))
      const relationshipsByModel = new Map<string, GuestModelRelationship[]>()
      ;(guestModelsResponse.payload.relationships ?? []).forEach(row => {
        const list = relationshipsByModel.get(row.model_id) ?? []
        list.push(relationshipFromRow(row, modelsById))
        relationshipsByModel.set(row.model_id, list)
      })
      setModels(rows.map(row => guestModelFromRow(row, relationshipsByModel.get(row.id) ?? [])))
    }
    setModelsLoading(false)
  }, [clientId])

  useEffect(() => { loadGuestModels() }, [loadGuestModels])

  function openNewModel() {
    setSaveMessage(null)
    setDraft(createEmptyGuestModel())
  }

  function openExistingModel(model: GuestModelProfile) {
    setSaveMessage(null)
    setDraft({
      ...model,
      relationshipTags: [...model.relationshipTags],
      continuityLocks: { ...model.continuityLocks },
      references: normalizeModelReferences({ references: model.references }, createModelReferences()),
      outfits: Object.fromEntries(
        OUTFIT_SETS.map(set => [set, { notes: model.outfits[set].notes, references: model.outfits[set].references.map(r => ({ ...r })) }])
      ) as GuestModelProfile['outfits'],
      accessories: normalizeAccessories({ references: model.accessories }, createEmptyGuestModel().accessories),
      relationships: model.relationships.map(relationship => ({ ...relationship })),
    })
  }

  async function saveDraft() {
    if (!draft) return
    setSavingModel(true)
    setModelsError(null)
    setSaveMessage({ ok: true, text: 'Saving...' })

    try {
      const modelWithStoredImages = await persistGuestModelImages(clientId, draft, text => setSaveMessage({ ok: true, text }))
      setSaveMessage({ ok: true, text: 'Saving model...' })
      const payload = guestModelToPayload(clientId, modelWithStoredImages)
      const validRelationships = modelWithStoredImages.relationships.filter(relationship => relationship.relatedModelId && relationship.relatedModelId !== modelWithStoredImages.id)
      const response = await fetch(`/api/clients/${clientId}/guest-models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: payload, relationships: validRelationships.map(relationship => relationshipToRow(clientId, modelWithStoredImages.id, relationship)) }) })
      const result = await response.json() as { model?: GuestModelRow; error?: string }
      const data = result.model
      const error = response.ok ? null : new Error(result.error ?? 'Unable to save model.')

      if (error) {
        const lowerMessage = error.message.toLowerCase()
        const friendly = lowerMessage.includes('large') || lowerMessage.includes('payload') || lowerMessage.includes('too big') || lowerMessage.includes('json') || lowerMessage.includes('timeout')
          ? 'Image data is too large to save. Please compress the images and try again.'
          : error.message
        setModelsError(friendly)
        setSaveMessage({ ok: false, text: friendly })
      } else if (data) {
        const rowsById = new Map(models.map(model => [model.id, model.name || 'Untitled guest model']))
        rowsById.set(modelWithStoredImages.id, modelWithStoredImages.name || 'Untitled guest model')
        const savedRelationships = validRelationships.map(relationship => ({
          ...relationship,
          relatedModelName: rowsById.get(relationship.relatedModelId) ?? relationship.relatedModelName,
        }))
        const saved = guestModelFromRow(data as unknown as GuestModelRow, savedRelationships)
        setModels(prev => prev.some(m => m.id === saved.id) ? prev.map(m => m.id === saved.id ? saved : m) : [saved, ...prev])
        setDraft(saved)
        setSaveMessage({ ok: true, text: 'Saved' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save model.'
      const lowerMessage = message.toLowerCase()
      const friendly = lowerMessage.includes('large') || lowerMessage.includes('payload') || lowerMessage.includes('too big') || lowerMessage.includes('json') || lowerMessage.includes('timeout')
        ? 'Image data is too large to save. Please compress the images and try again.'
        : message
      setModelsError(friendly)
      setSaveMessage({ ok: false, text: friendly })
    } finally {
      setSavingModel(false)
    }
  }

  async function deleteDraft() {
    if (!draft) return
    const exists = models.some(model => model.id === draft.id)
    if (!exists) {
      setDraft(null)
      return
    }

    setSavingModel(true)
    setModelsError(null)
    const response = await fetch(`/api/clients/${clientId}/guest-models`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: draft.id }) })
    const result = await response.json() as { error?: string }
    const error = response.ok ? null : new Error(result.error ?? 'Unable to delete model.')

    if (error) {
      setModelsError(error.message)
    } else {
      setModels(prev => prev.filter(model => model.id !== draft.id))
      setDraft(null)
    }
    setSavingModel(false)
  }

  function updateDraft<K extends keyof GuestModelProfile>(key: K, value: GuestModelProfile[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function toggleRelationshipTag(tag: RelationshipTag) {
    setDraft(prev => prev ? {
      ...prev,
      relationshipTags: prev.relationshipTags.includes(tag)
        ? prev.relationshipTags.filter(t => t !== tag)
        : [...prev.relationshipTags, tag],
    } : prev)
  }

  function toggleContinuityLock(key: keyof GuestModelProfile['continuityLocks']) {
    setDraft(prev => prev ? { ...prev, continuityLocks: { ...prev.continuityLocks, [key]: !prev.continuityLocks[key] } } : prev)
  }

	  function updateReference(section: 'references' | 'accessories', id: string, patch: Partial<VisualReference>) {
	    setDraft(prev => prev ? {
	      ...prev,
	      [section]: prev[section].map(item => {
	        if (item.id !== id) return item
	        const ownerPatch = section === 'accessories' && patch.owner === undefined && !item.owner && prev.name
	          ? { owner: prev.name }
	          : {}
	        return { ...item, ...ownerPatch, ...patch }
	      }),
	    } : prev)
	  }

  function updateOutfitReference(set: keyof GuestModelProfile['outfits'], id: string, patch: Partial<VisualReference>) {
    setDraft(prev => prev ? {
      ...prev,
      outfits: {
        ...prev.outfits,
        [set]: {
          ...prev.outfits[set],
          references: prev.outfits[set].references.map(item => item.id === id ? { ...item, ...patch } : item),
        },
      },
    } : prev)
  }

  function setPrimaryReference(section: 'references' | 'accessories', id: string) {
    setDraft(prev => prev ? { ...prev, [section]: prev[section].map(item => ({ ...item, primary: item.id === id })) } : prev)
  }

  function setPrimaryOutfitReference(set: keyof GuestModelProfile['outfits'], id: string) {
    setDraft(prev => prev ? {
      ...prev,
      outfits: {
        ...prev.outfits,
        [set]: {
          ...prev.outfits[set],
          references: prev.outfits[set].references.map(item => ({ ...item, primary: item.id === id })),
        },
      },
    } : prev)
  }

  function reorderReferenceGroup(section: 'references' | 'accessories', from: number, to: number) {
    setDraft(prev => prev ? { ...prev, [section]: reorderReferences(prev[section], from, to) } : prev)
  }

  function reorderOutfitReferenceGroup(set: keyof GuestModelProfile['outfits'], from: number, to: number) {
    setDraft(prev => prev ? {
      ...prev,
      outfits: {
        ...prev.outfits,
        [set]: {
          ...prev.outfits[set],
          references: reorderReferences(prev.outfits[set].references, from, to),
        },
      },
    } : prev)
  }

  function updateOutfitNotes(key: keyof GuestModelProfile['outfits'], notes: string) {
    setDraft(prev => prev ? { ...prev, outfits: { ...prev.outfits, [key]: { ...prev.outfits[key], notes } } } : prev)
  }

  function addOutfitReference(set: keyof GuestModelProfile['outfits']) {
    setDraft(prev => {
      if (!prev) return prev
      const nextIndex = prev.outfits[set].references.length + 1
      return {
        ...prev,
        outfits: {
          ...prev.outfits,
          [set]: {
            ...prev.outfits[set],
            references: [...prev.outfits[set].references, createReference(`Outfit ${nextIndex}`, 'Full Body')],
          },
        },
      }
    })
  }

  function addRelationship() {
    const relatedModel = models.find(model => model.id !== draft?.id)
    setDraft(prev => prev ? {
      ...prev,
      relationships: [
        ...prev.relationships,
        {
          id: crypto.randomUUID(),
          relatedModelId: relatedModel?.id ?? '',
          relatedModelName: relatedModel?.name || 'Select model',
          relationshipType: 'Friends',
          relationshipStrength: 'Casual',
          notes: '',
        },
      ],
    } : prev)
  }

  function updateRelationship(id: string, patch: Partial<GuestModelRelationship>) {
    setDraft(prev => prev ? {
      ...prev,
      relationships: prev.relationships.map(relationship => {
        if (relationship.id !== id) return relationship
        const next = { ...relationship, ...patch }
        if (patch.relatedModelId) {
          const relatedModel = models.find(model => model.id === patch.relatedModelId)
          next.relatedModelName = relatedModel?.name || 'Untitled guest model'
        }
        return next
      }),
    } : prev)
  }

  function removeRelationship(id: string) {
    setDraft(prev => prev ? { ...prev, relationships: prev.relationships.filter(relationship => relationship.id !== id) } : prev)
  }

  function ReferenceCard({
    item,
    onUpdate,
    onPrimary,
    onMove,
    showPrimary = true,
    showAccessoryMetadata = false,
  }: {
    item: VisualReference
    onUpdate: (patch: Partial<VisualReference>) => void
    onPrimary?: () => void
    onMove: (from: number, to: number) => void
    showPrimary?: boolean
    showAccessoryMetadata?: boolean
	  }) {
	    const fileInputRef = useRef<HTMLInputElement>(null)
	    const [metadataOpen, setMetadataOpen] = useState(false)
	    const currentAccessoryType = accessoryType(item)

    function handleImageSelect(file: File | undefined) {
      if (!file || !file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onUpdate({ previewUrl: reader.result, locked: true })
        }
      }
      reader.readAsDataURL(file)
    }

    return (
      <div
        draggable
        onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          const draggedId = e.dataTransfer.getData('text/plain')
          const parent = e.currentTarget.parentElement
          const from = parent ? Array.from(parent.children).findIndex(child => child.getAttribute('data-ref-id') === draggedId) : -1
          const to = parent ? Array.from(parent.children).findIndex(child => child === e.currentTarget) : -1
          onMove(from, to)
        }}
        data-ref-id={item.id}
        className={`group rounded-xl border border-dashed bg-gray-50 p-3 text-center transition hover:border-gray-300 ${item.primary ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'}`}>
        {showPrimary && (
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" onClick={onPrimary}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] transition ${item.primary ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-300 hover:text-amber-600'}`}>
              {item.primary ? 'Primary' : '☆'}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-2 aspect-[4/5] w-full overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:border-gray-400 hover:bg-gray-100"
          aria-label={`Choose image for ${item.label}`}>
          {item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt={item.label} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-light text-gray-300">+</span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            handleImageSelect(e.target.files?.[0])
            e.currentTarget.value = ''
          }}
        />
	        {showAccessoryMetadata ? (
	          <div className="mt-3 space-y-2 text-left">
	            <div className="flex items-start justify-between gap-2">
	              <div className="min-w-0">
	                <p className="truncate text-xs font-semibold text-gray-800">{accessoryName(item)}</p>
	                <p className="mt-0.5 text-[10px] text-gray-400">{currentAccessoryType}{item.owner ? ` · ${item.owner}` : ''}</p>
	              </div>
	              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
	                accessoryNeedsMetadata(item)
	                  ? 'border-amber-200 bg-amber-50 text-amber-700'
	                  : item.approved_for_generation
	                    ? 'border-green-200 bg-green-50 text-green-700'
	                    : 'border-gray-200 bg-gray-50 text-gray-500'
	              }`}>
	                {accessoryNeedsMetadata(item) ? 'Needs metadata' : item.approved_for_generation ? 'Approved' : 'Draft'}
	              </span>
	            </div>
	            <p className="line-clamp-2 text-[11px] leading-4 text-gray-500">{accessoryDetailSummary(item)}</p>
	            <button type="button" onClick={() => setMetadataOpen(open => !open)}
	              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50">
	              {metadataOpen ? 'Close metadata' : 'Edit metadata'}
	            </button>

	            {metadataOpen && (
	              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
	                <div className="grid grid-cols-2 gap-2">
	                  <input value={item.object_name ?? ''} onChange={e => onUpdate({ object_name: e.target.value })} placeholder="Accessory Name" className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                  <select value={currentAccessoryType} onChange={e => onUpdate({ accessory_type: e.target.value as AccessoryType })}
	                    className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none">
	                    {ACCESSORY_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
	                  </select>
	                </div>
	                <input value={item.owner ?? ''} onChange={e => onUpdate({ owner: e.target.value })} placeholder="Assigned Model" className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <textarea value={item.description ?? ''} onChange={e => onUpdate({ description: e.target.value })} placeholder="Description" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <div className="grid grid-cols-2 gap-2">
	                  <input value={item.color ?? ''} onChange={e => onUpdate({ color: e.target.value })} placeholder="Color" className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                  <input value={item.material ?? ''} onChange={e => onUpdate({ material: e.target.value })} placeholder="Material" className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                </div>
	                <input value={item.shape_silhouette ?? ''} onChange={e => onUpdate({ shape_silhouette: e.target.value })} placeholder="Shape / Silhouette" className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <textarea value={item.key_visible_details ?? ''} onChange={e => onUpdate({ key_visible_details: e.target.value })} placeholder="Key Visible Details" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <textarea value={item.logo_notes ?? ''} onChange={e => onUpdate({ logo_notes: e.target.value })} placeholder="Logo / Brand Mark (only if visible)" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <textarea value={item.placement ?? ''} onChange={e => onUpdate({ placement: e.target.value })} placeholder="Placement / How it should appear" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <textarea value={item.do_not_change ?? ''} onChange={e => onUpdate({ do_not_change: e.target.value })} placeholder="Do Not Change" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />

	                {currentAccessoryType === 'Watch' && (
	                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
	                    <input value={item.dial_shape ?? ''} onChange={e => onUpdate({ dial_shape: e.target.value })} placeholder="Dial Shape" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.dial_color ?? ''} onChange={e => onUpdate({ dial_color: e.target.value })} placeholder="Dial Color" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.strap_or_bracelet ?? ''} onChange={e => onUpdate({ strap_or_bracelet: e.target.value })} placeholder="Strap / Bracelet" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.metal_tone ?? ''} onChange={e => onUpdate({ metal_tone: e.target.value })} placeholder="Metal Finish" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.markers ?? ''} onChange={e => onUpdate({ markers: e.target.value })} placeholder="Markers" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.hands ?? ''} onChange={e => onUpdate({ hands: e.target.value })} placeholder="Hands" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.case_shape ?? ''} onChange={e => onUpdate({ case_shape: e.target.value })} placeholder="Case Shape" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                  </div>
	                )}

	                {currentAccessoryType === 'Bag' && (
	                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
	                    <input value={item.bag_shape ?? ''} onChange={e => onUpdate({ bag_shape: e.target.value })} placeholder="Bag Shape" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.strap_handle ?? ''} onChange={e => onUpdate({ strap_handle: e.target.value })} placeholder="Strap / Handle" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.hardware ?? ''} onChange={e => onUpdate({ hardware: e.target.value })} placeholder="Hardware" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.quilting_texture ?? ''} onChange={e => onUpdate({ quilting_texture: e.target.value })} placeholder="Quilting / Texture" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.clasp_logo_placement ?? ''} onChange={e => onUpdate({ clasp_logo_placement: e.target.value })} placeholder="Clasp / Logo Placement" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none sm:col-span-2" />
	                  </div>
	                )}

	                {currentAccessoryType === 'Sunglasses' && (
	                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
	                    <input value={item.frame_shape ?? ''} onChange={e => onUpdate({ frame_shape: e.target.value })} placeholder="Frame Shape" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.lens_color ?? ''} onChange={e => onUpdate({ lens_color: e.target.value })} placeholder="Lens Color" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.frame_color ?? ''} onChange={e => onUpdate({ frame_color: e.target.value })} placeholder="Frame Color" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                    <input value={item.size_fit ?? ''} onChange={e => onUpdate({ size_fit: e.target.value })} placeholder="Size / Fit" className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-800 outline-none" />
	                  </div>
	                )}

	                <textarea value={item.tags ?? ''} onChange={e => onUpdate({ tags: e.target.value })} placeholder="Tags" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none" />
	                <label className="flex items-center gap-2 text-[11px] font-medium text-gray-600">
	                  <input type="checkbox" checked={item.approved_for_generation === true} onChange={e => onUpdate({ approved_for_generation: e.target.checked, must_appear: e.target.checked })} />
	                  Approved for Generation
	                </label>
	              </div>
	            )}
	          </div>
	        ) : (
	          <>
	            <p className="truncate text-xs font-medium text-gray-500">{item.label}</p>
	            <p className="mt-1 text-[10px] text-gray-300">{item.previewUrl ? 'Click to replace' : 'No image yet'}</p>
	          </>
	        )}
      </div>
    )
  }

  const visibleModels = models
  const useAiModelSystem = aiModelSystemCount > 0 || savedAiModels.length > 0

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Models</p>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">Digital Guest Models</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-gray-500">
              Client-specific recurring guest identities used for AI-generated hospitality content.
            </p>
          </div>
          {useAiModelSystem ? (
            <Link href={`/clients/${clientId}/ai-content/models`}
              className="shrink-0 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50">
              Open Character Studio
            </Link>
          ) : (
            <button onClick={openNewModel}
              className="shrink-0 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition">
              + Add Model
            </button>
          )}
        </div>
      </div>

      {modelsError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Guest Models persistence is not available yet: {modelsError}
        </div>
      )}

      {modelsLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-400">Loading guest models...</p>
        </div>
      ) : useAiModelSystem ? (
        savedAiModels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-400">No finalised AI models yet. Finalise completed Character DNA from AI Photography → Models.</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {savedAiModels.map(model => (
              <Link key={model.id} href={`/clients/${clientId}/ai-content/models/${model.id}`}
                className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-sm">
                <div className="flex gap-5">
                  <div className="w-36 shrink-0 overflow-hidden rounded-xl border border-dashed border-gray-200 bg-gray-50 sm:w-40">
                    <div className="aspect-[4/5] w-full">
                      {model.approved_face_thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={model.approved_face_thumbnail} alt={model.name} className="h-full w-full object-cover object-top" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-widest text-gray-300">
                          Face
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-base font-semibold text-gray-900">{model.name || 'Untitled model'}</h3>
                      <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        {model.status === 'approved' ? 'Approved' : model.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-600">{model.role || 'Role not set'}</p>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-4 text-gray-500">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Gender</span>
                        <span className="text-gray-700">{model.gender || 'Not set'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Age</span>
                        <span className="text-gray-700">{model.age ?? 'Not set'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Relationship</span>
                        <span className="line-clamp-1 text-gray-700">
                          {model.relationships.length > 0
                            ? model.relationships.map(relationship => relationship.relationship_label || `${relationship.relationship_type} of ${relationship.related_model_name}`).join(', ')
                            : 'None saved'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${model.character_dna_complete ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        DNA {model.character_dna_complete ? 'complete' : 'incomplete'}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {model.approved_outfit_count} approved outfit{model.approved_outfit_count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-400">No guest models added yet.</p>
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-400">No guest models match this view.</p>
        </div>
      ) : (
	        <div className="grid gap-3 xl:grid-cols-2">
	          {visibleModels.map(model => {
	            const primaryFace = modelPrimaryFace(model)
	            const needsMetadata = modelNeedsMetadata(model)
	            return (
	              <button key={model.id} onClick={() => openExistingModel(model)}
	                className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-sm">
	                <div className="flex gap-5">
	                  <div className="w-40 shrink-0 overflow-hidden rounded-xl border border-dashed border-gray-200 bg-gray-50 sm:w-44">
	                    <div className="aspect-[4/5] w-full">
	                    {primaryFace?.previewUrl ? (
	                      // eslint-disable-next-line @next/next/no-img-element
	                      <img src={primaryFace.previewUrl} alt={model.name || 'Guest model'} className="h-full w-full object-cover object-top" />
	                    ) : (
	                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-widest text-gray-300">
	                        Face
                      </div>
                    )}
                    </div>
	                  </div>
		                  <div className="min-w-0 flex-1">
		                    <div className="flex items-start justify-between gap-2">
		                      <h3 className="truncate text-base font-semibold text-gray-900">{model.name || 'Untitled guest model'}</h3>
		                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
		                        needsMetadata
		                          ? 'border-amber-200 bg-amber-50 text-amber-700'
	                          : model.status === 'Approved' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'
	                      }`}>
		                        {needsMetadata ? 'Needs metadata' : model.status}
		                      </span>
		                    </div>
		                    <p className="mt-1 text-sm font-medium text-gray-600">{model.archetype || 'Role not set'}</p>
		                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-4 text-gray-500">
		                      <div>
		                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Age</span>
		                        <span className="text-gray-700">{model.ageRange || 'Not set'}</span>
		                      </div>
		                      <div>
		                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Height</span>
		                        <span className="text-gray-700">{model.height || 'Not set'}</span>
		                      </div>
		                      <div className="col-span-2">
		                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Nationality / Look</span>
		                        <span className="line-clamp-1 text-gray-700">{model.background || 'Not set'}</span>
		                      </div>
		                    </div>
		                    <p className="mt-4 line-clamp-3 text-xs leading-5 text-gray-500">{modelIdentityNotes(model)}</p>
		                  </div>
		                </div>
	              </button>
            )
          })}
        </div>
      )}

      {!useAiModelSystem && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDraft(null)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Guest Model</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">{draft.name || 'Guest Model Profile'}</h3>
              </div>
              <button onClick={() => setDraft(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition">Close</button>
            </div>

	            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
	              <section className="space-y-2.5">
	                <p className="text-xs font-semibold text-gray-700">Model Identity</p>
	                <div className="grid gap-2 sm:grid-cols-2">
	                  <input value={draft.name} onChange={e => updateDraft('name', e.target.value)} placeholder="Model Name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.archetype} onChange={e => updateDraft('archetype', e.target.value)} placeholder="Archetype / Role" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.gender} onChange={e => updateDraft('gender', e.target.value)} placeholder="Gender" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.ageRange} onChange={e => updateDraft('ageRange', e.target.value)} placeholder="Age Range" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.background} onChange={e => updateDraft('background', e.target.value)} placeholder="Ethnicity / Look" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.hair} onChange={e => updateDraft('hair', e.target.value)} placeholder="Hair" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.eyes} onChange={e => updateDraft('eyes', e.target.value)} placeholder="Eyes" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                  <input value={draft.skinTone} onChange={e => updateDraft('skinTone', e.target.value)} placeholder="Skin Tone" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                </div>
	                <textarea value={draft.notes} onChange={e => updateDraft('notes', e.target.value)}
	                  placeholder="Face / Identity Notes" rows={2}
	                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none" />
	                <textarea value={draft.personality} onChange={e => updateDraft('personality', e.target.value)}
	                  placeholder="Expression / Personality Notes" rows={2}
	                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none" />
	                <input value={draft.usageTags} onChange={e => updateDraft('usageTags', e.target.value)}
	                  placeholder="Usage Tags, e.g. breakfast, lunch, dinner, couple, lifestyle"
	                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none" />
	                <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
	                  <input type="checkbox" checked={draft.status === 'Approved'} onChange={e => updateDraft('status', e.target.checked ? 'Approved' : 'Draft')} />
	                  Approved for Generation
	                </label>
	              </section>

	              <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
	                <summary className="cursor-pointer text-xs font-semibold text-gray-700">Advanced: cast relationships</summary>
	                <div className="mt-3 space-y-2.5">
	                  <div className="flex flex-wrap gap-1.5">
	                    {RELATIONSHIP_TAGS.map(tag => (
	                      <button key={tag} type="button" onClick={() => toggleRelationshipTag(tag)}
	                        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
	                          draft.relationshipTags.includes(tag)
	                            ? 'border-gray-900 bg-gray-900 text-white'
	                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400'
	                        }`}>
	                        {tag}
	                      </button>
	                    ))}
	                  </div>
	                  <button type="button" onClick={addRelationship}
	                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:border-gray-400 transition">
	                    + Add Relationship
	                  </button>
	                  {models.filter(model => model.id !== draft.id).length === 0 ? (
	                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-xs text-gray-400">
	                      Add another guest model to define relationships.
	                    </div>
	                  ) : draft.relationships.length === 0 ? (
	                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-xs text-gray-400">
	                      No model relationships added yet.
	                    </div>
	                  ) : (
	                    <div className="space-y-2">
	                      {draft.relationships.map(relationship => (
	                        <div key={relationship.id} className="rounded-xl border border-gray-200 bg-white p-3">
	                          <div className="grid gap-2 md:grid-cols-3">
	                            <select value={relationship.relatedModelId} onChange={e => updateRelationship(relationship.id, { relatedModelId: e.target.value })}
	                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none">
	                              <option value="">Select model</option>
	                              {models.filter(model => model.id !== draft.id).map(model => (
	                                <option key={model.id} value={model.id}>{model.name || 'Untitled guest model'}</option>
	                              ))}
	                            </select>
	                            <select value={relationship.relationshipType} onChange={e => updateRelationship(relationship.id, { relationshipType: e.target.value as GuestModelRelationshipType })}
	                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none">
	                              {RELATIONSHIP_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
	                            </select>
	                            <select value={relationship.relationshipStrength} onChange={e => updateRelationship(relationship.id, { relationshipStrength: e.target.value as GuestModelRelationshipStrength })}
	                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none">
	                              {RELATIONSHIP_STRENGTH_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
	                            </select>
	                          </div>
	                          <div className="mt-2 flex gap-2">
	                            <input value={relationship.notes} onChange={e => updateRelationship(relationship.id, { notes: e.target.value })}
	                              placeholder="Relationship notes" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 outline-none" />
	                            <button type="button" onClick={() => removeRelationship(relationship.id)}
	                              className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition">
	                              Remove
	                            </button>
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  )}
	                </div>
	              </details>

              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-700">Model References</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {(['Face', 'Body'] as const).map(group => (
                    <div key={group} className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{group}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {MODEL_REFERENCE_DEFS
                          .filter(def => def.group === group)
                          .map(def => {
                            const ref = draft.references.find(item => item.key === def.key)
                            if (!ref) return null
                            return (
                              <ReferenceCard
                                key={ref.id}
                                item={ref}
                                onUpdate={patch => updateReference('references', ref.id, patch)}
                                onPrimary={() => setPrimaryReference('references', ref.id)}
                                onMove={() => undefined}
                              />
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-700">Outfit Sets</p>
                </div>
                <div className="space-y-2.5">
                  {OUTFIT_SETS.map(set => (
                    <div key={set} className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-gray-700">{set}</p>
                        <button type="button" onClick={() => addOutfitReference(set)}
                          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:border-gray-400 transition">
                          + Add Outfit
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {draft.outfits[set].references.map(ref => (
                          <ReferenceCard
                            key={ref.id}
                            item={ref}
                            onUpdate={patch => updateOutfitReference(set, ref.id, patch)}
                            showPrimary={false}
                            onMove={(from, to) => reorderOutfitReferenceGroup(set, from, to)}
                          />
                        ))}
                      </div>
                      <input value={draft.outfits[set].notes} onChange={e => updateOutfitNotes(set, e.target.value)}
                        placeholder="Styling Notes" className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 outline-none" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-700">Accessories</p>
                </div>
	                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {draft.accessories.map(ref => (
                    <ReferenceCard
                      key={ref.id}
                      item={ref}
                      onUpdate={patch => updateReference('accessories', ref.id, patch)}
                      showPrimary={false}
                      showAccessoryMetadata
                      onMove={(from, to) => reorderReferenceGroup('accessories', from, to)}
                    />
                  ))}
                </div>
              </section>

	            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-gray-100 bg-white px-5 py-4">
              <button onClick={deleteDraft} disabled={savingModel}
                className="rounded-lg border border-red-100 bg-white px-4 py-2 text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 transition">
                Delete
              </button>
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <p className={`max-w-xs truncate text-xs ${saveMessage.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {saveMessage.text}
                  </p>
                )}
                <button onClick={saveDraft} disabled={savingModel}
                  className="rounded-lg bg-gray-900 px-5 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 transition">
                  {savingModel ? 'Saving...' : 'Save model'}
                </button>
                <button onClick={() => setDraft(null)} disabled={savingModel}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Client Brain layout shell ────────────────────────────────────────────────

type BrainSectionKey = 'context' | 'content' | 'models' | 'graphic_design' | 'crm'

type BrainSectionDef = {
  key: BrainSectionKey
  icon: string
  label: string
  subtitle: string
  description: string
}

type BrainMiniNavItem = {
  id: string
  label: string
  subtitle?: string
  count?: number
}

const BRAIN_SECTIONS: BrainSectionDef[] = [
  {
    key: 'context',
    icon: 'C',
    label: 'Context',
    subtitle: 'Strategic intelligence',
    description: 'Operational and strategic memory: brand rules, audience, campaigns, offers, operations, and execution standards.',
  },
  {
    key: 'content',
    icon: 'A',
    label: 'Content',
    subtitle: 'Visual operating layer',
    description: 'Unified asset memory: interiors, exteriors, products, lifestyle, reference assets, and background presets.',
  },
  {
    key: 'models',
    icon: 'M',
    label: 'Models',
    subtitle: 'Cast continuity',
    description: 'Reusable guest identities, portraits, side profiles, outfits, accessories, and relationship continuity.',
  },
  {
    key: 'graphic_design',
    icon: 'G',
    label: 'Graphic Design',
    subtitle: 'Design asset library',
    description: 'Brand assets, campaign graphics, flyers, activations, collateral, and reusable design materials stored as client memory.',
  },
  {
    key: 'crm',
    icon: 'R',
    label: 'CRM',
    subtitle: 'Guest intelligence',
    description: 'Client-scoped guest profiles, contact quality, future segments, and hospitality integration readiness.',
  },
]

function brainSectionsForClient(isConstructionClient: boolean, crmEnabled: boolean): BrainSectionDef[] {
  if (!isConstructionClient) return BRAIN_SECTIONS.filter(section => section.key !== 'crm' || crmEnabled)
  return BRAIN_SECTIONS
    .filter(section => section.key === 'context')
    .map(section => ({
      ...section,
      subtitle: 'Project-led intelligence',
      description: 'Construction-specific memory: positioning, buyer psychology, service categories, project metadata, social strategy, paid ads, and revenue guardrails.',
    }))
}

function getBrainSection(key: BrainSectionKey, sections: BrainSectionDef[] = BRAIN_SECTIONS) {
  return sections.find(section => section.key === key) ?? sections[0] ?? BRAIN_SECTIONS[0]
}

function BrainSectionTopBar({
  section,
  search,
  onSearch,
  searchPlaceholder = 'Search this section...',
  actionLabel,
  onAction,
  actionHref,
  filter,
}: {
  section: BrainSectionDef
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
  filter?: ReactNode
}) {
  return (
    <div className="rounded-[1.65rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/60">Client Brain</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{section.label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/48">{section.description}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:items-center">
          {onSearch && (
            <input
              value={search ?? ''}
              onChange={event => onSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35 sm:w-72"
            />
          )}
          {filter}
          {actionHref ? (
            <Link href={actionHref} className="jarvis-button justify-center whitespace-nowrap px-4 py-3 text-xs">
              {actionLabel}
            </Link>
          ) : onAction && actionLabel ? (
            <button type="button" onClick={onAction} className="jarvis-button justify-center whitespace-nowrap px-4 py-3 text-xs">
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function BrainTopNavigation({
  active,
  counts,
  onSelect,
  sections = BRAIN_SECTIONS,
}: {
  active: BrainSectionKey
  counts: Partial<Record<BrainSectionKey, number>>
  onSelect: (key: BrainSectionKey) => void
  sections?: BrainSectionDef[]
}) {
  return (
    <div className="mb-5 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <nav className="flex min-w-max gap-1.5">
        {sections.map(section => {
          const selected = active === section.key
          const count = counts[section.key]
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onSelect(section.key)}
              className={`group flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                selected
                  ? 'border-emerald-300/35 bg-emerald-300/[0.10] text-white shadow-[0_0_26px_rgba(52,211,153,0.10)]'
                  : 'border-transparent bg-transparent text-white/48 hover:border-white/10 hover:bg-white/[0.045] hover:text-white/80'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border text-[11px] font-semibold ${
                selected ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-black/20 text-white/35'
              }`}>
                {section.icon}
              </span>
              <span className="block text-sm font-semibold">{section.label}</span>
              {typeof count === 'number' && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/[0.06] text-white/35'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function BrainContextSidebar({
  section,
  items,
  activeItem,
  onSelect,
}: {
  section: BrainSectionDef
  items: BrainMiniNavItem[]
  activeItem: string
  onSelect: (id: string) => void
}) {
  return (
    <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:sticky lg:top-24 lg:self-start">
      <div className="px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">{section.label}</p>
        <p className="mt-2 text-xs leading-relaxed text-white/36">{section.subtitle}</p>
      </div>
      <nav className="mt-1 grid gap-1">
        {items.map(item => {
          const selected = activeItem === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                selected
                  ? 'border-emerald-300/30 bg-emerald-300/[0.10] text-white'
                  : 'border-transparent bg-transparent text-white/45 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/75'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.label}</span>
                {item.subtitle && <span className="mt-0.5 block truncate text-[11px] text-white/30">{item.subtitle}</span>}
              </span>
              {typeof item.count === 'number' && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/[0.06] text-white/35'}`}>
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function ContextTruthHeader({
  section,
  entries,
}: {
  section: (typeof CONTEXT_SECTIONS)[number]
  entries: KR[]
}) {
  const status = contextReviewStatus(entries, section.id)
  const lastUpdated = contextLastUpdated(entries)
  const statusClass = status === 'Current'
    ? 'border-green-200 bg-green-50 text-green-700'
    : status === 'Missing'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'Outdated'
        ? 'border-red-200 bg-red-50 text-red-600'
        : 'border-amber-200 bg-amber-50 text-amber-700'

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/55">Source of Truth</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{section.label}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/48">{section.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
            {status}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-white/42">
            Last updated: {formatContextDate(lastUpdated)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/36">{section.description}</p>
    </div>
  )
}

function BrainOverviewPanel({
  clientName,
  counts,
  onSelect,
}: {
  clientName: string
  counts: Partial<Record<BrainSectionKey, number>>
  onSelect: (key: BrainSectionKey) => void
}) {
  const overviewCards: Array<{ key: BrainSectionKey; title: string; detail: string; value: string }> = [
    { key: 'context', title: 'Context', detail: 'Approved strategic and operational notes.', value: `${counts.context ?? 0} entries` },
    { key: 'content', title: 'Content', detail: 'Interiors, exteriors, food, drinks, Pinterest, and reusable backgrounds.', value: `${counts.content ?? 0} assets` },
    { key: 'models', title: 'Models', detail: 'Identity, outfit, accessory, and relationship continuity systems.', value: 'Open module' },
  ]

  return (
    <section className="space-y-5">
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
        <p className="jarvis-eyebrow">{clientName} operating system module</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Client Brain is the source of truth layer.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/52">
          Use the left navigation to move between operational memory, creative constraints, spatial context, asset libraries, inspiration-only references, and reusable model continuity.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {overviewCards.map(card => (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-emerald-300/25 hover:bg-emerald-300/[0.055]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">{card.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/42">{card.detail}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/50">{card.value}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function SettingsRulesPanel({
  entries,
  entryMap,
  initing,
  onInit,
}: {
  entries: BrainEntry[]
  entryMap: Record<string, BrainEntry>
  initing: boolean
  onInit: () => void
}) {
  const ruleKeys = ['brand_rules', 'agent_writing_guide', 'jarvis_internal_notes', 'assets_missing']
  const ruleQuestions = QUESTIONS.filter(question => ruleKeys.includes(question.key))

  return (
    <section className="space-y-5">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="jarvis-eyebrow">Context</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Strategic memory and reusable guardrails</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/48">
              Legacy strategic question fields now live inside Context so brand rules, copy guidance, internal notes, and asset gaps stay part of the main brain layer.
            </p>
          </div>
          {entries.length === 0 && (
            <button type="button" onClick={onInit} disabled={initing} className="jarvis-button px-4 py-2 text-xs disabled:opacity-40">
              {initing ? 'Initializing...' : 'Initialize strategic questions'}
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3">
        {ruleQuestions.map(question => {
          const entry = entryMap[question.key]
          return (
            <div key={question.key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-white">{question.text}</p>
              {entry?.answer ? (
                <div className="mt-3 text-sm leading-relaxed text-white/55">{renderAnswer(entry.answer)}</div>
              ) : (
                <p className="mt-3 text-sm text-white/35">No rule stored yet.</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BrandStrategySystemsPanel() {
  const systems = [
    {
      title: 'Brand Core',
      detail: 'Third Culture Hospitality, emotional familiarity, luxury without stiffness, and premium warmth.',
      items: ['Core positioning', 'Emotional identity', 'Brand personality', 'Experience identity', 'Brand promise'],
    },
    {
      title: 'Audience & Psychology',
      detail: 'Audience motivations without narrowing DemoClientD into a corporate-only restaurant.',
      items: ['DIFC professionals', 'International residents', 'Luxury social crowd', 'Food-led guests'],
    },
    {
      title: 'Content Pillars',
      detail: 'Permanent content operating system for visual, copy, and campaign consistency.',
      items: ['Lifestyle Hospitality', 'Food Storytelling', 'Cocktail Rituals', 'Service & BTS', 'Third Culture Stories'],
    },
    {
      title: 'Campaign Systems',
      detail: 'Reusable strategic frameworks that inform planning, production, design, and social execution.',
      items: ['Lunch', 'Traffic Hours', 'Dinner Experience', 'Breakfast', 'Cocktail Nights', 'Making Of'],
    },
    {
      title: 'Storytelling Systems',
      detail: 'Recurring narrative concepts that build recognizable brand memory.',
      items: SIGNATURE_SYSTEMS.map(system => system.title).slice(0, 5),
    },
    {
      title: 'Copywriting Systems',
      detail: 'Reusable caption and story structures for food, cocktails, campaigns, reels, and events.',
      items: ['Emotional hook', 'Cultural identity', 'Craft detail', 'Experience CTA'],
    },
    {
      title: 'Social Strategy',
      detail: 'Operational cadence and feed balance rules used by Social Planning.',
      items: ['20 feed posts / month', '1 reel / week', '1 commercial / month', '2-5 story frames / day'],
    },
    {
      title: 'Performance Learnings',
      detail: 'Read-only strategy memory from live analytics and campaign outcomes.',
      items: ['Top concepts', 'Strongest formats', 'Best hooks', 'Visual themes', 'CTA systems'],
    },
  ]

  return (
    <section className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
        <p className="jarvis-eyebrow">Brand Strategy</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Foundational strategy now lives inside Context.</h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48">
          Brand Strategy is treated as permanent intelligence and strategic memory, not a separate workspace. These systems feed Social Planning, AI Photography, AI Videography, Graphic Design, and production.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {systems.map(system => (
          <article key={system.title} className="rounded-[1.35rem] border border-white/10 bg-black/24 p-4">
            <h4 className="text-sm font-semibold text-white">{system.title}</h4>
            <p className="mt-2 text-xs leading-relaxed text-white/42">{system.detail}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {system.items.map(item => (
                <span key={item} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-white/45">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function VisualIntelligenceSystemsPanel() {
  const systems = [
    {
      title: 'Feed Choreography',
      detail: 'Analyzes adjacency, repetition, light/dark rhythm, macro density, typography breaks, social warmth, and campaign pressure.',
      items: ['Adjacency', 'Contrast', 'Pacing', 'Breathing room'],
    },
    {
      title: 'Visual Rhythm',
      detail: 'Maps the emotional and visual sequence of the feed as a living editorial system.',
      items: WEEKLY_EMOTIONAL_ARCS.map(arc => `${arc.weekday}: ${arc.emotion}`).slice(0, 4),
    },
    {
      title: 'Composition Systems',
      detail: 'Tracks reusable composition archetypes for generation and art direction.',
      items: ['Macro texture', 'Overhead table', 'Chef hands', 'Social table', 'Wide atmosphere'],
    },
    {
      title: 'Lighting Systems',
      detail: 'Keeps lighting choices tied to campaign fit and emotional strategy.',
      items: ['Warm luxury', 'Dark cinematic', 'Soft daylight', 'Golden hour', 'Spotlight editorial'],
    },
    {
      title: 'Emotional Mapping',
      detail: 'Connects visuals to comfort, nostalgia, social energy, aspiration, intimacy, celebration, and cultural warmth.',
      items: ['Comfort', 'Nostalgia', 'Luxury', 'Belonging', 'Curiosity'],
    },
    {
      title: 'Creative Learnings',
      detail: 'Stores strongest visual patterns and underrepresented aesthetics for future feedback loops.',
      items: ['High-performing aesthetics', 'Underused styles', 'Visual evolution', 'Creative memory'],
    },
    {
      title: 'Signature Systems',
      detail: 'Recurring visual and storytelling systems used as brand memory anchors.',
      items: SIGNATURE_SYSTEMS.map(system => system.title).slice(0, 4),
    },
    {
      title: 'Feed Energy Meter',
      detail: 'Monitors darkness, product density, social warmth, typography usage, campaign pressure, emotional energy, and cultural feel.',
      items: ['Darkness', 'Product density', 'Social warmth', 'Typography', 'Cultural feel'],
    },
  ]

  return (
    <section className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
        <p className="jarvis-eyebrow">Visual Intelligence</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Creative direction systems now live inside Content.</h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48">
          Visual Intelligence is folded into the content layer so assets, venue truth, inspiration, visual DNA, and feed choreography stay in one visual operating system.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {systems.map(system => (
          <details key={system.title} className="rounded-[1.35rem] border border-white/10 bg-black/24 p-4" open={system.title === 'Feed Choreography'}>
            <summary className="cursor-pointer text-sm font-semibold text-white">{system.title}</summary>
            <p className="mt-3 text-xs leading-relaxed text-white/42">{system.detail}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {system.items.map(item => (
                <span key={item} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-white/45">
                  {item}
                </span>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientBrainPage() {
  const params   = useParams()
  const clientId = params.id as string

  const [client,       setClient]       = useState<Client | null>(null)
  const [entries,      setEntries]      = useState<BrainEntry[]>([])
  const [proposals,    setProposals]    = useState<BrainProposal[]>([])
  const [ckEntries,    setCkEntries]    = useState<KR[]>([])
  const [assetUploads, setAssetUploads] = useState<AssetUpload[]>([])
  const [loading,      setLoading]      = useState(true)
  const [initing,      setIniting]      = useState(false)
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)

  // UI state
  const [mainTab,       setMainTab]       = useState<BrainSectionKey>('context')
  const [filterCat,     setFilterCat]     = useState<ContextSectionId>('knowledge_gaps')
  const [contentFilter, setContentFilter] = useState('all')
  const [graphicDesignFilter, setGraphicDesignFilter] = useState('design_brand_assets')
  const [crmView, setCrmView] = useState<CrmWorkspaceView>('all_guests')
  const [sectionSearch, setSectionSearch] = useState('')
  const [showAddForm,   setShowAddForm]   = useState(false)

  // Add form state
  const CK_CATS    = CONTEXT_ENTRY_CATEGORIES
  const IMP_LABELS: Record<number,string> = { 1:'Low', 2:'Minor', 3:'Normal', 4:'High', 5:'Critical' }
  const [newTitle,    setNewTitle]    = useState('')
  const [newContent,  setNewContent]  = useState('')
  const [newCategory, setNewCategory] = useState(CK_CATS[0])
  const [newImp,      setNewImp]      = useState(3)
  const [ckSaving,    setCkSaving]    = useState(false)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3200)
  }

  const load = useCallback(async () => {
    const [{ data: c }, { data: brain }, { data: props }, { data: ck }, { data: assets, error: assetsErr }] = await Promise.all([
      supabase.from('clients').select('id, name, industry, notes, brain_architecture_version').eq('id', clientId).single(),
      supabase.from('client_brain').select('*').eq('client_id', clientId).order('question_key'),
      supabase.from('brain_update_proposals').select('*').eq('client_id', clientId).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('client_knowledge').select('*').eq('client_id', clientId).neq('status','deleted').order('created_at', { ascending: false }),
      // Fetch all columns (*) to catch old uploads missing optimized_file_path, ai_preview_path, etc.
      supabase.from('asset_uploads').select('*').eq('client_id', clientId).neq('status','archived').order('uploaded_at', { ascending: false }),
    ])
    setClient(c)
    setEntries((brain ?? []) as BrainEntry[])
    setProposals((props ?? []) as BrainProposal[])
    setCkEntries((ck ?? []) as KR[])
    setAssetUploads((assets ?? []) as unknown as AssetUpload[])
    if (assetsErr) console.warn('[brain/page] asset_uploads query error:', assetsErr)
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  // ── client_knowledge CRUD ────────────────────────────────────────────────
  async function ckAdd() {
    if (!newTitle.trim() || !newContent.trim()) return
    setCkSaving(true)
    const { data, error } = await supabase.from('client_knowledge')
      .insert({ client_id: clientId, category: newCategory, title: newTitle.trim(), content: newContent.trim(), importance: newImp, status: 'active' })
      .select().single()
    if (!error && data) {
      setCkEntries(prev => [data as KR, ...prev])
      setNewTitle(''); setNewContent(''); setNewImp(3); setShowAddForm(false)
      showToast('✓ Entry saved', true)
    }
    setCkSaving(false)
  }

  function ckUpdate(updated: KR) {
    setCkEntries(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  async function ckArchive(id: string) {
    await supabase.from('client_knowledge').update({ status: 'archived' }).eq('id', id)
    setCkEntries(prev => prev.map(r => r.id === id ? { ...r, status: 'archived' } : r))
  }

  async function ckRestore(id: string) {
    await supabase.from('client_knowledge').update({ status: 'active' }).eq('id', id)
    setCkEntries(prev => prev.map(r => r.id === id ? { ...r, status: 'active' } : r))
  }

  // Soft-delete: status='deleted' — hidden from all UI, retained in DB, never shown to agents
  async function ckDelete(id: string) {
    await supabase.from('client_knowledge').update({ status: 'deleted' }).eq('id', id)
    setCkEntries(prev => prev.filter(r => r.id !== id))
  }

  // ── client_brain (legacy) handlers ──────────────────────────────────────
  function updateEntry(updated: BrainEntry) {
    setEntries(prev => prev.some(e => e.id === updated.id) ? prev.map(e => e.id === updated.id ? updated : e) : [...prev, updated])
  }

  function handleProposalApproved(p: BrainProposal) {
    setProposals(prev => prev.filter(x => x.id !== p.id))
    supabase.from('client_brain').select('*').eq('client_id', clientId).order('question_key')
      .then(({ data }) => { if (data) setEntries(data as BrainEntry[]) })
    showToast('✓ Applied to brain', true)
  }

  function handleProposalRejected(p: BrainProposal) {
    setProposals(prev => prev.filter(x => x.id !== p.id))
    showToast('Proposal dismissed', false)
  }

  async function initBrain() {
    setIniting(true)
    const rows = questionsForClient(isDemoClientFProfile(client ?? { name: '' }))
      .map(q => ({ client_id: clientId, question_key: q.key, question_text: q.text }))
    const { error } = await supabase.from('client_brain').insert(rows)
    if (error) showToast(`Failed: ${error.message}`, false)
    else { showToast('✓ Strategic questions ready', true); await load() }
    setIniting(false)
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const isTop1Construction = isDemoClientFProfile(client ?? { name: '' })
  const crmEnabled = isClientModuleEnabled(client ?? { id: clientId, name: '' }, 'crm')
  const visibleBrainSections = brainSectionsForClient(isTop1Construction, crmEnabled)
  const activeMainTab: BrainSectionKey = visibleBrainSections.some(section => section.key === mainTab) ? mainTab : 'context'
  const activeEntries   = ckEntries.filter(r => r.status !== 'archived')
  const archivedEntries = ckEntries.filter(r => r.status === 'archived')
  const contextNeedle = sectionSearch.trim().toLowerCase()
  const selectedContextSection = contextSectionById(filterCat)
  const contextSourceEntries = filterCat === 'knowledge_gaps'
    ? []
    : dedupeContextEntries(activeEntries.filter(r => contextEntryMatches(r, filterCat)))
  const filtered = contextSourceEntries.filter(entry => {
    if (!contextNeedle) return true
    return [entry.title, entry.category, entry.content].join(' ').toLowerCase().includes(contextNeedle)
  })
  const entryMap  = Object.fromEntries(entries.map(e => [e.question_key, e]))
  const section = getBrainSection(activeMainTab, visibleBrainSections)
  const contentFilterOptions = [
    { id: 'all', label: 'All Assets' },
    { id: 'interiors', label: 'Interiors' },
    { id: 'exteriors', label: 'Exteriors' },
    { id: 'venue_items', label: 'Venue Items' },
    { id: 'food', label: 'Food' },
    { id: 'food_studio_shots', label: 'Studio Food Shots' },
    { id: 'drinks', label: 'Drinks' },
    { id: 'drink_studio_shots', label: 'Studio Drink Shots' },
    { id: 'lifestyle', label: 'Lifestyle' },
	    { id: 'bts_service', label: 'BTS / Service' },
	    { id: 'pinterest', label: 'Pinterest' },
	    { id: 'background_presets', label: 'Background Presets' },
	  ]
  const contentFilterCounts = Object.fromEntries(contentFilterOptions.map(option => [
    option.id,
    assetUploads.filter(asset => matchesContentAssetFilter(asset, option.id)).length,
  ])) as Record<string, number>
  const sectionCounts: Partial<Record<BrainSectionKey, number>> = {
    context: activeEntries.length,
    content: assetUploads.length,
    models: undefined,
    graphic_design: assetUploads.filter(isGraphicDesignAsset).length,
    crm: undefined,
  }
  const sectionSearchEnabled = activeMainTab === 'context' && filterCat !== 'knowledge_gaps'
  const sectionActionLabel = activeMainTab === 'context' && filterCat !== 'knowledge_gaps' ? '+ Add truth' : undefined
  const sectionAction = activeMainTab === 'context'
    ? () => {
      setShowAddForm(true)
      setNewCategory(contextSectionById(filterCat).category)
    }
    : undefined
  const miniItemsBySection: Record<BrainSectionKey, BrainMiniNavItem[]> = {
    context: CONTEXT_SECTIONS.map(section => ({
      id: section.id,
      label: section.label,
      count: section.id === 'knowledge_gaps' ? undefined : activeEntries.filter(r => contextEntryMatches(r, section.id)).length,
    })),
    content: contentFilterOptions.map(option => ({ ...option, count: contentFilterCounts[option.id] ?? 0 })),
    models: [],
    graphic_design: GRAPHIC_DESIGN_CATEGORIES.map(category => ({
      id: category.id,
      label: category.label,
      count: assetUploads.filter(asset => asset.asset_category === category.id).length,
    })),
    crm: [
      { id: 'all_guests', label: 'All Guests' },
      { id: 'segments', label: 'Segments' },
      { id: 'data_quality', label: 'Data Quality' },
      { id: 'integrations', label: 'Integrations' },
    ],
  }
  const miniItems = miniItemsBySection[activeMainTab]
  const activeMiniItem = activeMainTab === 'context' ? filterCat
    : activeMainTab === 'content' ? contentFilter
      : activeMainTab === 'graphic_design' ? graphicDesignFilter
        : activeMainTab === 'crm' ? crmView
      : ''

  function handleMiniSelect(id: string) {
    if (activeMainTab === 'context') {
      setFilterCat(id as ContextSectionId)
      setShowAddForm(false)
      setSectionSearch('')
    }
    else if (activeMainTab === 'content') setContentFilter(id)
    else if (activeMainTab === 'graphic_design') setGraphicDesignFilter(id)
    else if (activeMainTab === 'crm') setCrmView(id as CrmWorkspaceView)
  }

  if (loading) return (
    <div className="brain-dark flex min-h-[34vh] items-center justify-center text-sm text-white/45">Loading…</div>
  )

  return (
    <div className="brain-dark text-white">
      <style>{BRAIN_DARK_COMPAT_CSS}</style>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
          toast.ok ? 'bg-white border-green-200 text-green-700' : 'bg-white border-red-200 text-red-600'
        }`}>{toast.msg}</div>
      )}

      <div>
        <div className="jarvis-hero mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href={`/clients/${clientId}`} className="jarvis-muted-button mb-5 px-3 py-2 text-xs">
                Back to client
              </Link>
              <p className="jarvis-eyebrow">Client Brain</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Client Brain</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48">
                {isTop1Construction
                  ? 'Project-led context, strategy, metadata, trust, social, ads, and revenue foundation for Jarvis.'
                  : crmEnabled
                    ? 'Context, content, models, design assets, and client-scoped guest intelligence.'
                    : 'Context, content, and models. One clean source-of-truth layer for Jarvis.'}
              </p>
              <p className="mt-2 text-xs font-semibold text-white/38">{client?.name ?? 'Client'} operating system</p>
            </div>
            <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-xs font-semibold text-emerald-100">
              {activeEntries.length} memory entries · {assetUploads.length} assets
            </span>
          </div>
        </div>

        <BrainTopNavigation
          active={activeMainTab}
          counts={sectionCounts}
          sections={visibleBrainSections}
          onSelect={key => {
            setMainTab(key)
            setSectionSearch('')
          }}
        />

        <div className={`grid gap-5 ${miniItems.length > 0 ? 'lg:grid-cols-[236px_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
          {miniItems.length > 0 && (
            <BrainContextSidebar
              section={section}
              items={miniItems}
              activeItem={activeMiniItem}
              onSelect={handleMiniSelect}
            />
          )}

          <section className="min-w-0 space-y-5">
            <BrainSectionTopBar
              section={section}
              search={sectionSearchEnabled ? sectionSearch : undefined}
              onSearch={sectionSearchEnabled ? setSectionSearch : undefined}
              searchPlaceholder={activeMainTab === 'context' ? 'Search memory entries...' : 'Search this section...'}
              actionLabel={sectionActionLabel}
              onAction={sectionAction}
            />

	            {activeMainTab === 'context' && (
	              <>
	                {filterCat === 'knowledge_gaps' ? (
	                  <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-5 py-5">
	                    <ContextTruthHeader section={selectedContextSection} entries={[]} />
	                    <KnowledgeGaps
	                      clientId={clientId}
	                      ckEntries={ckEntries}
                        gapQuestions={isTop1Construction ? CONSTRUCTION_GAP_QUESTIONS : GAP_QUESTIONS}
	                      onEntryAdded={r => { setCkEntries(prev => [r, ...prev]); showToast('✓ Saved to Brain', true) }}
	                    />
	                  </div>
	                ) : (
	                  <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
	                    <div className="px-5 py-5">
	                      <ContextTruthHeader section={selectedContextSection} entries={contextSourceEntries} />
	                      {showAddForm && (
	                        <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
	                          <div className="flex flex-wrap gap-2">
	                            <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
	                              className="min-w-[180px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none">
	                              {CK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
	                            </select>
	                            <select value={newImp} onChange={e => setNewImp(Number(e.target.value))}
	                              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none">
	                              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} - {IMP_LABELS[n]}</option>)}
	                            </select>
	                          </div>
	                          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
	                            autoFocus placeholder={`Title for ${selectedContextSection.label}`}
	                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-300/35"
	                          />
	                          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
	                            rows={4} placeholder="Write the cleaned current truth. Keep source material in Reference Library."
	                            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-300/35"
	                          />
	                          <div className="flex gap-2">
	                            <button onClick={ckAdd} disabled={ckSaving || !newTitle.trim() || !newContent.trim()}
	                              className="jarvis-button px-5 py-2 text-xs disabled:opacity-40">
	                              {ckSaving ? 'Saving...' : 'Save truth'}
	                            </button>
	                            <button onClick={() => { setShowAddForm(false); setNewTitle(''); setNewContent(''); setNewImp(3); setNewCategory(selectedContextSection.category) }}
	                              className="jarvis-muted-button px-4 py-2 text-xs">
	                              Cancel
	                            </button>
	                          </div>
	                        </div>
	                      )}

	                      {filtered.length === 0 && !showAddForm ? (
	                        <div className="py-10 text-center">
	                          <p className="text-sm text-white/45">{selectedContextSection.emptyState}</p>
	                          <button onClick={() => { setNewCategory(selectedContextSection.category); setShowAddForm(true) }} className="mt-3 text-xs font-semibold text-emerald-200 hover:text-emerald-100">
	                            Add the first truth
	                          </button>
	                        </div>
	                      ) : (
	                        <div className="space-y-2">
	                          {filtered.map(r => (
	                            <BrainEntryCard key={r.id} record={r} onUpdate={ckUpdate} onArchive={() => ckArchive(r.id)} onDelete={() => ckDelete(r.id)} />
	                          ))}
	                        </div>
	                      )}
	                    </div>
	                  </div>
	                )}
	              </>
	            )}

            {activeMainTab === 'content' && (
              <div className="space-y-5">
                {contentFilter === 'pinterest' && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Pinterest</h2>
                        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">
                          Reference images for composition, mood, styling, food, drinks, lifestyle, and campaign inspiration.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                        Inspiration only
                      </span>
                    </div>
                  </div>
                )}

                <UploadFiles
                  clientId={clientId}
                  clientName={client?.name ?? ''}
                  fixedCategory={contentFilter === 'pinterest' ? 'pinterest_inspiration' : undefined}
                  fixedCategoryLabel={contentFilter === 'pinterest' ? 'Pinterest' : undefined}
                  onUploaded={load}
                  onToast={showToast}
                />

                <ContentLibrary
                  uploads={assetUploads}
                  filter={contentFilter}
                  onUpdate={updated => setAssetUploads(prev => prev.map(u => u.id === updated.id ? updated : u))}
                  onRemove={id => setAssetUploads(prev => prev.filter(u => u.id !== id))}
                  onToast={showToast}
                />
              </div>
            )}

            {activeMainTab === 'graphic_design' && (
              <GraphicDesignAssetsPanel
                clientId={clientId}
                clientName={client?.name ?? ''}
                uploads={assetUploads}
                activeCategory={graphicDesignFilter}
                onUploaded={load}
                onUpdate={updated => setAssetUploads(prev => prev.map(u => u.id === updated.id ? updated : u))}
                onRemove={id => setAssetUploads(prev => prev.filter(u => u.id !== id))}
                onToast={showToast}
              />
            )}

            {activeMainTab === 'models' && <ModelsPanel clientId={clientId} />}

            {activeMainTab === 'crm' && (
              <CrmPanel clientId={clientId} clientName={client?.name ?? 'Client'} view={crmView} />
            )}

            <p className="pt-4 text-center text-xs text-white/25">
              {client?.name} · Client Brain · {activeEntries.length} entr{activeEntries.length !== 1 ? 'ies' : 'y'}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

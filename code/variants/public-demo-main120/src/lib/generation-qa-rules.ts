import { buildDemoClientBVenueLockBlock, DEMOCLIENTB_VENUE_MEMORY_LINES, isDemoClientBClient } from "./client-venue-truth"

export type GenerationQaRuleContext = {
  clientId?: string | null
  clientName?: string | null
  location?: string
  venueZone?: string
  guestCount?: number
  hasPortraitReferences?: boolean
  hasAccessoryReferences?: boolean
  hasFoodReferences?: boolean
  hasDrinkReferences?: boolean
  hasSpatialLayout?: boolean
  hasVenueReference?: boolean
}

const DEMOCLIENTD_VENUE_ZONE_RULES = {
  interior_high_table_area: {
    label: 'Interior High Tables',
    table_shape: 'round',
    table_material: 'black marble',
    table_edge: 'gold/bronze rim or edge when visible in the selected venue reference',
    seating: 'high bar-style chairs',
    lighting: 'source-locked warm interior lighting',
    ceiling_reflection: 'dark/subtle mirrored ceiling reflection',
    do_not: [
      'do not stretch round tables into oval, long, rectangular, or elongated tables',
      'do not replace black marble with wood or lighter table surfaces',
      'do not remove or change the gold/bronze table rim or edge when visible',
      'do not change high-table scale or seating height',
      'do not invent new background zones or move the table into an impossible circulation path',
    ],
  },
  interior_dining_tables: {
    label: 'Interior Dining Tables',
    table_shape: 'match selected interior reference',
    table_material: 'match selected interior reference',
    seating: 'interior dining seating from selected reference',
    lighting: 'source-locked warm interior lighting',
    ceiling_reflection: 'dark/subtle mirrored ceiling reflection',
    do_not: [
      'do not change table shape or material away from the selected interior reference',
      'do not invent new dining zones, booths, windows, or wall systems',
    ],
  },
  interior_bar: {
    label: 'Interior Bar',
    table_shape: 'bar/counter geometry from selected reference',
    table_material: 'match selected bar/counter reference',
    seating: 'bar seating only when visible or requested',
    lighting: 'source-locked warm bar/interior lighting',
    ceiling_reflection: 'dark/subtle mirrored ceiling reflection',
    do_not: [
      'do not convert bar/counter context into a dining table scene',
      'do not invent backbar, bottles, counters, or lighting not supported by the reference',
    ],
  },
  blue_booth_lounge: {
    label: 'Blue Booth Lounge',
    table_shape: 'match selected booth/lounge source plate only',
    table_material: 'black marble/dark stone only where visible',
    seating: 'curved blue booth or blue velvet lounge seating from selected reference',
    lighting: 'source-locked warm lounge lighting',
    ceiling_reflection: 'source-visible only',
    do_not: [
      'do not replace curved blue booth seating with freestanding cafe chairs',
      'do not introduce random red seating, terrace chairs, bar stools, or different upholstery',
      'do not invent windows, dining hall chandeliers, or unrelated architectural openings',
    ],
  },
  main_bar: {
    label: 'Main Bar',
    table_shape: 'bar counter/back-bar geometry from selected reference',
    table_material: 'source-visible bar counter material',
    seating: 'bar stools or zebra-pattern bar seating only when visible',
    lighting: 'source-locked warm bar/back-bar lighting',
    ceiling_reflection: 'source-visible only',
    do_not: [
      'do not convert bar/counter context into a dining-table scene',
      'do not invent backbar shelves, bottles, stools, or counter shapes',
      'do not borrow dining table or blue booth furniture into the bar zone',
    ],
  },
  mirror_dining_hall: {
    label: 'Mirror Dining Hall',
    table_shape: 'round dining tables repeated through source perspective',
    table_material: 'black marble/dark polished stone',
    seating: 'blue velvet rounded dining chairs with bronze/gold trim where visible',
    lighting: 'source-locked chandelier and mirror-reflection rhythm',
    ceiling_reflection: 'mirrored ceiling/reflection continuity must remain aligned',
    do_not: [
      'do not remove mirrored ceiling continuity or invent a new chandelier system',
      'do not add terrace edges, windows, bar counters, or unrelated wall openings',
      'do not break repeated table/chair spacing or aisle geometry',
    ],
  },
  entrance_tunnel: {
    label: 'Entrance Tunnel',
    table_shape: 'none unless visible in the source',
    table_material: 'none unless visible in the source',
    seating: 'none unless visible in the source',
    lighting: 'source-locked warm architectural entry lighting',
    ceiling_reflection: 'not applicable unless source-visible',
    do_not: [
      'do not add dining tables, booth seating, bar counters, or chandeliers into the entrance tunnel',
      'do not change the wood/arch corridor system or vanishing point',
      'do not block the circulation path',
    ],
  },
  terrace_edge: {
    label: 'Terrace Edge',
    table_shape: 'source-visible outdoor table family',
    table_material: 'source-visible outdoor table material',
    seating: 'source-visible exterior terrace seating',
    lighting: 'match selected exterior plate lighting',
    ceiling_reflection: 'not applicable',
    do_not: [
      'do not convert terrace into an indoor restaurant',
      'do not introduce interior chandeliers, mirrors, blue booths, or enclosed ceilings',
      'do not invent skyline, railing, pergola, or table families not visible in source',
    ],
  },
  terrace_pergola: {
    label: 'Terrace Pergola',
    table_shape: 'source-visible exterior table family aligned to pergola module',
    table_material: 'source-visible outdoor table material',
    seating: 'source-visible terrace seating only',
    lighting: 'source-locked outdoor/pergola lighting',
    ceiling_reflection: 'pergola overhead geometry, not mirrored ceiling',
    do_not: [
      'do not replace pergola roof geometry or covered terrace depth',
      'do not import interior chandelier, mirror, booth, or dining-hall furniture families',
      'do not create enclosed walls or indoor restaurant architecture',
    ],
  },
  exterior_terrace_tables: {
    label: 'Exterior Terrace Tables',
    table_shape: 'match selected exterior terrace reference',
    table_material: 'match selected exterior terrace reference',
    seating: 'terrace seating from selected reference',
    lighting: 'match selected exterior time and venue reference',
    ceiling_reflection: 'not applicable',
    do_not: [
      'do not mix interior furniture into exterior terrace scenes',
      'do not invent new terrace table families, skyline positions, pergolas, or water features',
    ],
  },
} as const

export type DemoClientDVenueZoneKey = keyof typeof DEMOCLIENTD_VENUE_ZONE_RULES | 'auto'

function normalizeVenueZone(value?: string | null): DemoClientDVenueZoneKey {
  const normalized = (value ?? 'auto').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'interior_high_tables' || normalized === 'interior_high_table_area') return 'interior_high_table_area'
  if (normalized === 'interior_dining_tables') return 'interior_dining_tables'
  if (normalized === 'interior_bar' || normalized === 'main_bar') return 'main_bar'
  if (normalized === 'blue_booth_lounge') return 'blue_booth_lounge'
  if (normalized === 'mirror_dining_hall') return 'mirror_dining_hall'
  if (normalized === 'entrance_tunnel') return 'entrance_tunnel'
  if (normalized === 'terrace_edge' || normalized === 'exterior_terrace_tables') return 'terrace_edge'
  if (normalized === 'terrace_pergola') return 'terrace_pergola'
  return 'auto'
}

export function inferDemoClientDVenueZone(input: {
  location?: string
  selectedZone?: string | null
  environmentSummary?: string | null
}) {
  const selected = normalizeVenueZone(input.selectedZone)
  if (selected !== 'auto') return selected

  const haystack = `${input.location ?? ''} ${input.environmentSummary ?? ''}`.toLowerCase()
  if (haystack.includes('high table') || haystack.includes('high-table') || haystack.includes('bar-style chair') || haystack.includes('black marble')) {
    return 'interior_high_table_area'
  }
  if (haystack.includes('blue booth') || haystack.includes('curved booth') || haystack.includes('banquette')) return 'blue_booth_lounge'
  if (haystack.includes('mirror dining') || haystack.includes('mirrored ceiling')) return 'mirror_dining_hall'
  if (haystack.includes('entrance tunnel') || haystack.includes('wood arch')) return 'entrance_tunnel'
  if (haystack.includes('bar counter') || haystack.includes('interior bar') || haystack.includes('cocktail bar')) return 'main_bar'
  if (haystack.includes('interior') && (haystack.includes('dining table') || haystack.includes('dining room'))) return 'interior_dining_tables'
  if (haystack.includes('pergola')) return 'terrace_pergola'
  if (haystack.includes('exterior') || haystack.includes('terrace')) return 'terrace_edge'

  return 'auto'
}

export function buildDemoClientDVenueZonePrompt(input: {
  clientName?: string | null
  location?: string
  selectedZone?: string | null
  environmentSummary?: string | null
}) {
  if (!isDemoClientDClient(input.clientName)) return ''

  const zoneKey = inferDemoClientDVenueZone(input)
  if (zoneKey === 'auto') return ''

  const zone = DEMOCLIENTD_VENUE_ZONE_RULES[zoneKey]
  return [
    `Venue Zone Rules — ${zone.label}`,
    `- table_shape: ${zone.table_shape}`,
    `- table_material: ${zone.table_material}`,
    'table_edge' in zone ? `- table_edge: ${zone.table_edge}` : '',
    `- seating: ${zone.seating}`,
    `- lighting: ${zone.lighting}`,
    `- ceiling_reflection: ${zone.ceiling_reflection}`,
    ...zone.do_not.map(rule => `- ${rule}`),
  ].filter(Boolean).join('\n')
}

function isDemoClientDClient(clientName?: string | null) {
  return (clientName ?? '').toLowerCase().includes('democlientd')
}

export function buildClientGenerationQaPrompt(context: GenerationQaRuleContext) {
  if (isDemoClientBClient({ clientId: context.clientId, clientName: context.clientName })) {
    const democlientbLockLines = context.hasVenueReference
      ? buildDemoClientBVenueLockBlock({ clientId: context.clientId, clientName: context.clientName, hasVenueReference: true })
        .replace(/^\[DEMOCLIENTB_VENUE_LOCK\]\n?/i, '')
        .split('\n')
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean)
      : []
    const rules = [
      context.hasVenueReference
        ? 'venue image is primary truth; insert people, food, drinks, and styling into the selected DemoClientB image reality'
        : '',
      ...DEMOCLIENTB_VENUE_MEMORY_LINES,
      ...democlientbLockLines,
      context.guestCount === 2
        ? '2 selected guests = exactly 2 visible guests; no extra diners, hands, or implied conversation partner'
        : '',
      context.hasFoodReferences
        ? 'food truth remains exact; venue truth controls furniture/table/curtain/chair reality'
        : '',
      context.hasDrinkReferences
        ? 'drink truth remains exact; preserve glassware/liquid/garnish without changing DemoClientB table styling'
        : '',
    ].filter(Boolean)

    return rules.length > 0
      ? `Generation QA Memory — DemoClientC\n${rules.map(rule => `- ${rule}`).join('\n')}`
      : ''
  }

  if (!isDemoClientDClient(context.clientName)) return ''

  const location = context.location ?? 'Exterior'
  const guestCount = context.guestCount ?? 0
  const venueZoneRules = buildDemoClientDVenueZonePrompt({
    clientName: context.clientName,
    location,
    selectedZone: context.venueZone,
  })
  const focusPriority = [
    'focus: faces > food/drinks > accessories; background/shoes/floor softer',
    'faces and selected products stay crop-sharp; blur only distractions',
  ]
  const democlientdInteriorReflection = location === 'Interior'
    ? [
      'interior ceiling reflections: dark, warm, subtle; never clear daylight mirror',
    ]
    : []
  const environmentAnchor = [
    location === 'Interior'
      ? 'interior lighting source-locked; time changes styling/food, not venue light'
      : '',
    location === 'Interior'
      ? 'preserve chandeliers, warm glow, blue seating/walls, shadows; no invented daylight/windows'
      : '',
    context.hasVenueReference
      ? 'venue photos are background/spatial truth; insert subjects without replacing architecture/tables/light/materials'
      : '',
    location === 'Interior' && context.hasVenueReference
      ? 'no invented interior panels, curtains, windows, booths, arches, bar zones, flooring, chandeliers'
      : '',
  ]
  const placeSettings = [
    guestCount === 2
      ? '2 guests = 2 place settings, 2 main plates, 2 cutlery sets unless sharing is explicit'
      : '',
    guestCount === 2
      ? 'no extra plates/cutlery/glasses/props/empty settings'
      : '',
  ]
  const accessoryExactObjectTruth = [
    context.hasAccessoryReferences
      ? 'accessories exact object truth: preserve watch dial/color/markers/bezel/proportions/metal/strap; preserve ring/bag design'
      : '',
    context.hasAccessoryReferences
      ? 'owner-bound: no swaps, no duplicated accessories unless selected for both'
      : '',
    context.hasAccessoryReferences
      ? 'no random watch-face markings; if too small, keep subtle but same design family'
      : '',
  ]
  const naturalAccessoryPlacement = [
    context.hasAccessoryReferences
      ? 'natural accessory placement: bags beside/on chair/table edge; sunglasses/small items may rest on table'
      : '',
    context.hasAccessoryReferences
      ? 'accessories secondary; not staged, oversized, forced, or focal unless requested'
      : '',
  ]
  const portraitRealism = [
    context.hasPortraitReferences
      ? 'portraits control face/hair/beard detail: beard texture, hairline, strands, brows, pores, eyes'
      : '',
    context.hasPortraitReferences
      ? 'skin: pores, fine lines, texture variation, human imperfections; no denoised AI smoothing'
      : '',
    context.hasPortraitReferences
      ? 'emotion: warm, engaged, lightly smiling; no blank faces or forced smiles'
      : '',
  ]
  const foodOneToOneFidelity = [
    context.hasFoodReferences
      ? 'food one-to-one: preserve plating, item count, garnish, sauce, sides, shape, texture, vessel'
      : '',
    context.hasFoodReferences
      ? 'BBQ seabass: keep fish/plate structure, sauce, sides, garnish, texture, vessel'
      : '',
    context.hasFoodReferences
      ? 'burger/bread/pave: preserve structure, visible count, garnish/sauce, crisp texture'
      : '',
    context.hasFoodReferences
      ? 'do not simplify/genericize food; do not transfer crumbs/debris to unrelated table areas'
      : '',
  ]
  const noDrinkSmokeEffects = [
    context.hasDrinkReferences
      ? 'drinks exact: preserve glass, color, garnish, scale, clarity; no oversized/generic drinks'
      : '',
    context.hasDrinkReferences
      ? 'never add smoke, flames, dry ice, undercovers unless visibly in drink ref or requested'
      : '',
    context.hasDrinkReferences
      ? 'do not copy powder/crumbs/debris under drinks unless intentional serving'
      : '',
  ]
  const spatialContinuity = [
    context.hasSpatialLayout
      ? 'blueprint/layout: preserve table placement, spacing, walkways, circulation; no blocked paths'
      : '',
    'no invented architecture, wall/window/booth arrangements, fake zones, unsupported geometry',
  ]

  const ruleGroups = {
    focus_priority: focusPriority,
    democlientd_interior_reflection: democlientdInteriorReflection,
    venue_zone_rules: venueZoneRules ? [venueZoneRules] : [],
    environment_anchor: environmentAnchor,
    place_settings: placeSettings,
    accessory_exact_object_truth: accessoryExactObjectTruth,
    natural_accessory_placement: naturalAccessoryPlacement,
    portrait_realism: portraitRealism,
    food_one_to_one_fidelity: foodOneToOneFidelity,
    no_drink_smoke_effects: noDrinkSmokeEffects,
    spatial_continuity: spatialContinuity,
  }

  const rules = Object.values(ruleGroups).flat().filter(Boolean)

  return rules.length > 0
    ? `Generation QA Memory — DemoClientD Dubai\n${rules.map(rule => `- ${rule}`).join('\n')}`
    : ''
}

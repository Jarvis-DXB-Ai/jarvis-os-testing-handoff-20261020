export const METADATA_MENUS = ['Breakfast', 'Lunch', 'Dinner', 'Traffic Hours', 'À La Carte', 'Business Lunch', 'Dubai Restaurant Week Lunch', 'Dubai Restaurant Week Dinner'] as const
export const METADATA_ACTIVATIONS = ['None', 'Traffic Hours', 'Business Lunch', 'Dubai Restaurant Week', 'Custom'] as const
export const METADATA_SHISHA = ['Available', 'Not Available', 'Not Applicable'] as const
export const METADATA_ASSET_ORIGIN = ['Original Photo', 'AI Generated', 'AI Assisted'] as const

export type MetadataMenu = typeof METADATA_MENUS[number]
export type MetadataActivation = typeof METADATA_ACTIVATIONS[number]
export type MetadataShisha = typeof METADATA_SHISHA[number]
export type MetadataAssetOrigin = typeof METADATA_ASSET_ORIGIN[number]

export type AssetMetadataCategory =
  | 'food'
  | 'food_studio_shots'
  | 'breakfast'
  | 'drinks'
  | 'drink_studio_shots'
  | 'interiors'
  | 'exteriors'
  | 'venue_items'
  | 'venue_outfits'
  | 'blueprint_layouts'
  | 'menus'
  | 'offers'

export type AssetMetadataFieldKey =
  | 'type'
  | 'name'
  | 'title'
  | 'category'
  | 'source_type'
  | 'normalized_role'
  | 'asset_role'
  | 'client_truth_reference'
  | 'approved_for_generation'
  | 'ingredients'
  | 'allergens'
  | 'price'
  | 'menus'
  | 'activation'
  | 'asset_origin'
  | 'dish_name'
  | 'item_count'
  | 'plate_count'
  | 'serving_vessel'
  | 'sauce'
  | 'side_components'
  | 'garnish'
  | 'texture_notes'
  | 'shape_structure'
  | 'meal_period'
  | 'do_not_add'
  | 'do_not_remove'
  | 'drink_name'
  | 'glass_shape'
  | 'liquid_color'
  | 'foam_or_clarity'
  | 'scale'
  | 'contains_smoke_effect'
  | 'glass'
  | 'presentation'
  | 'effect'
  | 'area'
  | 'level'
  | 'features'
  | 'shisha'
  | 'item_type'
  | 'service_style'
  | 'cutlery'
  | 'tableware'
  | 'material'
  | 'color'
  | 'usage'
  | 'location'
  | 'zone'
  | 'surface_table_truth'
  | 'seating_truth'
  | 'key_materials'
  | 'architecture_spatial_features'
  | 'best_use'
  | 'table_shape'
  | 'table_material'
  | 'table_edge'
  | 'seating'
  | 'lighting'
  | 'mirror_reflection_behavior'
  | 'background_constraints'
  | 'do_not_invent'
  | 'role'
  | 'style'
  | 'color_palette'
  | 'gender_presentation'
  | 'layout_type'
  | 'zones'
  | 'tables'
  | 'walkways'
  | 'seating_clusters'
  | 'spatial_notes'
  | 'relationships'
  | 'content_pillar'
  | 'tags'
  | 'description'
  | 'notes'
  | 'usage_notes'

export type AssetMetadataValue = string | string[] | MetadataMenu[] | MetadataAssetOrigin | MetadataShisha | boolean | undefined
export type AssetMetadataRecord = Partial<Record<AssetMetadataFieldKey, AssetMetadataValue>>

export interface FoodMetadata extends AssetMetadataRecord {
  type?: 'Food'
  name?: string
  dish_name?: string
  category?: string
  ingredients?: string
  item_count?: string
  plate_count?: string
  serving_vessel?: string
  sauce?: string
  side_components?: string
  garnish?: string
  texture_notes?: string
  shape_structure?: string
  meal_period?: string
  do_not_add?: string
  do_not_remove?: string
  allergens?: string
  price?: string
  menus?: MetadataMenu[]
  activation?: MetadataActivation
  asset_origin?: MetadataAssetOrigin
}

export interface BreakfastMetadata extends AssetMetadataRecord {
  type?: 'Breakfast'
  name?: string
  dish_name?: string
  category?: string
  ingredients?: string
  item_count?: string
  plate_count?: string
  serving_vessel?: string
  sauce?: string
  side_components?: string
  garnish?: string
  texture_notes?: string
  shape_structure?: string
  meal_period?: string
  do_not_add?: string
  do_not_remove?: string
  allergens?: string
  price?: string
  menus?: MetadataMenu[]
  activation?: MetadataActivation
  asset_origin?: MetadataAssetOrigin
}

export interface DrinksMetadata extends AssetMetadataRecord {
  type?: 'Cocktail'
  name?: string
  drink_name?: string
  category?: string
  ingredients?: string
  glass_shape?: string
  liquid_color?: string
  garnish?: string
  foam_or_clarity?: string
  scale?: string
  contains_smoke_effect?: string
  do_not_add?: string
  glass?: string
  presentation?: string
  effect?: string
  price?: string
  menus?: MetadataMenu[]
  activation?: MetadataActivation
  asset_origin?: MetadataAssetOrigin
}

export interface InteriorMetadata extends AssetMetadataRecord {
  type?: 'Interior'
  name?: string
  area?: string
  zone?: string
  surface_table_truth?: string
  seating_truth?: string
  key_materials?: string
  architecture_spatial_features?: string
  best_use?: string
  table_shape?: string
  table_material?: string
  table_edge?: string
  seating?: string
  lighting?: string
  mirror_reflection_behavior?: string
  background_constraints?: string
  do_not_invent?: string
  level?: string
  features?: string
  menus?: MetadataMenu[]
  activation?: MetadataActivation
  asset_origin?: MetadataAssetOrigin
}

export interface ExteriorMetadata extends AssetMetadataRecord {
  type?: 'Exterior'
  name?: string
  area?: string
  zone?: string
  table_shape?: string
  table_material?: string
  table_edge?: string
  seating?: string
  lighting?: string
  mirror_reflection_behavior?: string
  background_constraints?: string
  do_not_invent?: string
  level?: string
  features?: string
  shisha?: MetadataShisha
  menus?: MetadataMenu[]
  activation?: MetadataActivation
  asset_origin?: MetadataAssetOrigin
}

export interface VenueItemMetadata extends AssetMetadataRecord {
  type?: 'Venue Item'
  name?: string
  item_type?: string
  service_style?: string
  cutlery?: string
  tableware?: string
  do_not_add?: string
  material?: string
  color?: string
  usage?: string
  location?: string
  asset_origin?: MetadataAssetOrigin
}

export interface VenueOutfitMetadata extends AssetMetadataRecord {
  type?: 'Venue Outfit'
  name?: string
  role?: string
  style?: string
  color_palette?: string
  usage?: string
  gender_presentation?: string
  asset_origin?: MetadataAssetOrigin
}

export interface BlueprintLayoutMetadata extends AssetMetadataRecord {
  type?: 'Blueprint Layout'
  name?: string
  layout_type?: string
  zones?: string
  tables?: string
  walkways?: string
  seating_clusters?: string
  relationships?: string
  spatial_notes?: string
  asset_origin?: MetadataAssetOrigin
}

export interface MenuMetadata extends AssetMetadataRecord {
  type?: 'Menu'
  content_pillar?: string
  tags?: string[]
  notes?: string
  asset_origin?: MetadataAssetOrigin
}

export interface OfferMetadata extends AssetMetadataRecord {
  type?: 'Offer'
  content_pillar?: string
  tags?: string[]
  notes?: string
  asset_origin?: MetadataAssetOrigin
}

export type AssetMetadata =
  | FoodMetadata
  | BreakfastMetadata
  | DrinksMetadata
  | InteriorMetadata
  | ExteriorMetadata
  | VenueItemMetadata
  | VenueOutfitMetadata
  | BlueprintLayoutMetadata
  | MenuMetadata
  | OfferMetadata

export type MetadataInputKind = 'text' | 'textarea' | 'multiSelect' | 'select'

export interface MetadataFieldDefinition {
  key: Exclude<AssetMetadataFieldKey, 'type'>
  label: string
  placeholder: string
  input: MetadataInputKind
  required: boolean
  display: boolean
  options?: readonly string[]
}

export interface MetadataSchemaDefinition {
  category: AssetMetadataCategory
  label: string
  typeValue: NonNullable<AssetMetadata['type']>
  purpose: string
  assetTypes: string
  examples: readonly string[]
  fields: readonly MetadataFieldDefinition[]
  requiredFields: readonly Exclude<AssetMetadataFieldKey, 'type'>[]
  displayOrder: readonly Exclude<AssetMetadataFieldKey, 'type'>[]
}

const assetOriginField: MetadataFieldDefinition = {
  key: 'asset_origin',
  label: 'Origin',
  placeholder: 'Original Photo',
  input: 'select',
  required: false,
  display: true,
  options: METADATA_ASSET_ORIGIN,
}

const menusField: MetadataFieldDefinition = {
  key: 'menus',
  label: 'Menus / Offers',
  placeholder: '',
  input: 'multiSelect',
  required: false,
  display: true,
  options: METADATA_MENUS,
}

const foodFidelityFields = [
  { key: 'dish_name', label: 'Dish Name', placeholder: 'Exact dish name', input: 'text', required: false, display: true },
  { key: 'plate_count', label: 'Plate Count', placeholder: 'e.g. 3 plates', input: 'text', required: false, display: true },
  { key: 'item_count', label: 'Item Count', placeholder: 'e.g. 9 oysters / 7 pieces', input: 'text', required: false, display: true },
  { key: 'serving_vessel', label: 'Serving Vessel', placeholder: 'Plate, bowl, tray, three small plates...', input: 'text', required: false, display: true },
  { key: 'sauce', label: 'Sauce', placeholder: 'Sauce or dip details', input: 'text', required: false, display: true },
  { key: 'side_components', label: 'Sides / Components', placeholder: 'Sides, butter, sliders, fries, garnish elements', input: 'textarea', required: false, display: true },
  { key: 'garnish', label: 'Garnish', placeholder: 'Visible garnish', input: 'text', required: false, display: true },
  { key: 'texture_notes', label: 'Texture Notes', placeholder: 'Glossy shell, crisp bun, seared fish, flaky pastry...', input: 'textarea', required: false, display: true },
  { key: 'shape_structure', label: 'Shape / Structure', placeholder: 'Stack, slices, pieces, shell arrangement...', input: 'textarea', required: false, display: true },
  { key: 'meal_period', label: 'Meal Period', placeholder: 'Breakfast / Business Lunch / Dinner / Traffic Hours', input: 'text', required: false, display: true },
  { key: 'activation', label: 'Activation', placeholder: 'Activation', input: 'select', required: false, display: true, options: METADATA_ACTIVATIONS },
  { key: 'do_not_add', label: 'Do Not Add', placeholder: 'Objects/components Jarvis should not add', input: 'textarea', required: false, display: true },
  { key: 'do_not_remove', label: 'Do Not Remove', placeholder: 'Critical visible components that must remain', input: 'textarea', required: false, display: true },
] as const satisfies readonly MetadataFieldDefinition[]

const drinkFidelityFields = [
  { key: 'drink_name', label: 'Drink Name', placeholder: 'Exact drink name', input: 'text', required: false, display: true },
  { key: 'glass_shape', label: 'Glass Shape', placeholder: 'Coupe, martini, rocks glass...', input: 'text', required: false, display: true },
  { key: 'liquid_color', label: 'Liquid Color', placeholder: 'Amber, red, clear, espresso brown...', input: 'text', required: false, display: true },
  { key: 'garnish', label: 'Garnish', placeholder: 'Visible garnish', input: 'text', required: false, display: true },
  { key: 'foam_or_clarity', label: 'Foam / Clarity', placeholder: 'Foamy top, clear liquid, cloudy, layered...', input: 'text', required: false, display: true },
  { key: 'scale', label: 'Scale', placeholder: 'Realistic size relative to hand/table', input: 'text', required: false, display: true },
  { key: 'contains_smoke_effect', label: 'Smoke / Dry Ice?', placeholder: 'No unless visibly present', input: 'text', required: false, display: true },
  { key: 'do_not_add', label: 'Do Not Add', placeholder: 'Smoke, flames, debris, extra garnish...', input: 'textarea', required: false, display: true },
] as const satisfies readonly MetadataFieldDefinition[]

const interiorTruthFields = [
  { key: 'zone', label: 'Area / Zone', placeholder: 'Main Bar, Lounge, Dining Room, Entrance, Private Dining...', input: 'text', required: false, display: true },
  { key: 'category', label: 'Category', placeholder: 'Interior / Exterior / Venue Item', input: 'text', required: false, display: true },
  { key: 'surface_table_truth', label: 'Surface / Table Truth', placeholder: 'black marble bar top, dark stone counter, dark brown wood table...', input: 'textarea', required: false, display: true },
  { key: 'seating_truth', label: 'Seating Truth', placeholder: 'blue velvet booth, zebra-pattern bar stools, dark upholstered chairs...', input: 'textarea', required: false, display: true },
  { key: 'key_materials', label: 'Key Materials', placeholder: 'walnut wood, brass trim, marble floor, blue curtains...', input: 'textarea', required: false, display: true },
  { key: 'lighting', label: 'Lighting', placeholder: 'warm bar glow, pendant lights, daylight, ambient wall lighting...', input: 'textarea', required: false, display: true },
  { key: 'architecture_spatial_features', label: 'Architecture Features', placeholder: 'visible arches, curtains, bar shelving, mirror ceiling...', input: 'textarea', required: false, display: true },
  { key: 'do_not_invent', label: 'Do Not Invent', placeholder: 'Do not change table material, add unrelated windows, or turn bar counter into dining table...', input: 'textarea', required: false, display: true },
  { key: 'best_use', label: 'Best Use', placeholder: 'business lunch, cocktail scene, lifestyle, product photography background...', input: 'textarea', required: false, display: true },
  { key: 'tags', label: 'Tags', placeholder: 'main bar, interior, black marble, walnut wood, brass...', input: 'textarea', required: false, display: true },
] as const satisfies readonly MetadataFieldDefinition[]

const venueFidelityFields = [
  { key: 'zone', label: 'Zone', placeholder: 'Interior High Tables, Interior Bar, Exterior Terrace...', input: 'text', required: false, display: true },
  { key: 'table_shape', label: 'Table Shape', placeholder: 'Round, rectangular, high table...', input: 'text', required: false, display: true },
  { key: 'table_material', label: 'Table Material', placeholder: 'Black marble, wood, stone...', input: 'text', required: false, display: true },
  { key: 'table_edge', label: 'Table Edge', placeholder: 'Gold/bronze rim, visible edge detail...', input: 'text', required: false, display: true },
  { key: 'seating', label: 'Seating', placeholder: 'High bar-style chairs, banquettes...', input: 'text', required: false, display: true },
  { key: 'lighting', label: 'Lighting', placeholder: 'Warm chandelier lighting, source-locked interior glow...', input: 'textarea', required: false, display: true },
  { key: 'mirror_reflection_behavior', label: 'Mirror / Reflection Behavior', placeholder: 'Dark, subtle, warm mirrored ceiling; no fake reflected rooms', input: 'textarea', required: false, display: true },
  { key: 'background_constraints', label: 'Background Constraints', placeholder: 'What must remain / what cannot appear behind this angle', input: 'textarea', required: false, display: true },
  { key: 'do_not_invent', label: 'Do Not Invent', placeholder: 'No fake windows, booths, spaces, table shapes...', input: 'textarea', required: false, display: true },
] as const satisfies readonly MetadataFieldDefinition[]

export const METADATA_SCHEMAS = {
  // Food: plated dishes, hero dish photography, and menu item assets. Examples: steak plate, dessert hero, pasta close-up.
  food: {
    category: 'food',
    label: 'Food',
    typeValue: 'Food',
    purpose: 'Catalog food dishes and plated menu items for content planning and retrieval.',
    assetTypes: 'Dish photos, food hero shots, plate close-ups, menu item references.',
    examples: ['burger hero shot', 'dessert plate', 'seafood platter'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'category', label: 'Category', placeholder: 'Category (e.g. Salad, Starter)', input: 'text', required: false, display: true },
      { key: 'ingredients', label: 'Ingredients', placeholder: 'Ingredients', input: 'textarea', required: false, display: true },
      ...foodFidelityFields,
      { key: 'allergens', label: 'Allergens', placeholder: 'Allergens', input: 'text', required: false, display: true },
      { key: 'price', label: 'Price', placeholder: 'Price', input: 'text', required: false, display: true },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'dish_name', 'category', 'ingredients', 'plate_count', 'item_count', 'serving_vessel', 'sauce', 'side_components', 'garnish', 'texture_notes', 'shape_structure', 'meal_period', 'activation', 'do_not_add', 'do_not_remove', 'allergens', 'price', 'menus', 'asset_origin'],
  },
  food_studio_shots: {
    category: 'food_studio_shots',
    label: 'Food (Studio Shots)',
    typeValue: 'Food',
    purpose: 'Approved AI truth reference shots generated from food source assets.',
    assetTypes: 'Clean isolated studio references for plated food and dish truth.',
    examples: ['approved clean dish reference', 'full-object food studio shot'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'category', label: 'Category', placeholder: 'Category (e.g. Salad, Starter)', input: 'text', required: false, display: true },
      { key: 'ingredients', label: 'Ingredients', placeholder: 'Ingredients', input: 'textarea', required: false, display: true },
      ...foodFidelityFields,
      { key: 'allergens', label: 'Allergens', placeholder: 'Allergens', input: 'text', required: false, display: true },
      { key: 'price', label: 'Price', placeholder: 'Price', input: 'text', required: false, display: true },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'dish_name', 'category', 'ingredients', 'plate_count', 'item_count', 'serving_vessel', 'sauce', 'side_components', 'garnish', 'texture_notes', 'shape_structure', 'meal_period', 'activation', 'do_not_add', 'do_not_remove', 'allergens', 'price', 'menus', 'asset_origin'],
  },
  // Breakfast: morning dishes and breakfast-specific service items. Examples: eggs, pancakes, acai bowl.
  breakfast: {
    category: 'breakfast',
    label: 'Breakfast',
    typeValue: 'Breakfast',
    purpose: 'Separate breakfast assets from all-day food so morning content can be filtered cleanly.',
    assetTypes: 'Breakfast dish photos, brunch plates, morning service menu items.',
    examples: ['eggs benedict', 'pancake stack', 'breakfast tray'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'category', label: 'Category', placeholder: 'Category (e.g. Eggs, Bakery)', input: 'text', required: false, display: true },
      { key: 'ingredients', label: 'Ingredients', placeholder: 'Ingredients', input: 'textarea', required: false, display: true },
      ...foodFidelityFields,
      { key: 'allergens', label: 'Allergens', placeholder: 'Allergens', input: 'text', required: false, display: true },
      { key: 'price', label: 'Price', placeholder: 'Price', input: 'text', required: false, display: true },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'dish_name', 'category', 'ingredients', 'plate_count', 'item_count', 'serving_vessel', 'sauce', 'side_components', 'garnish', 'texture_notes', 'shape_structure', 'meal_period', 'activation', 'do_not_add', 'do_not_remove', 'allergens', 'price', 'menus', 'asset_origin'],
  },
  // Drinks: cocktails, mocktails, beverages, glassware, and serve rituals. Examples: signature cocktail, spritz, coffee serve.
  drinks: {
    category: 'drinks',
    label: 'Drinks',
    typeValue: 'Cocktail',
    purpose: 'Describe drink assets with service, presentation, and ingredient context.',
    assetTypes: 'Cocktail photos, mocktail photos, beverage serves, glassware shots.',
    examples: ['signature cocktail', 'mocktail pour', 'iced coffee'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'category', label: 'Category', placeholder: 'Category (e.g. Signature Cocktail)', input: 'text', required: false, display: true },
      { key: 'ingredients', label: 'Ingredients', placeholder: 'Ingredients', input: 'textarea', required: false, display: true },
      ...drinkFidelityFields,
      { key: 'glass', label: 'Glass', placeholder: 'Glass', input: 'text', required: false, display: true },
      { key: 'presentation', label: 'Presentation', placeholder: 'Presentation', input: 'text', required: false, display: true },
      { key: 'effect', label: 'Effect', placeholder: 'Effect (e.g. torch ignition)', input: 'textarea', required: false, display: true },
      { key: 'price', label: 'Price', placeholder: 'Price', input: 'text', required: false, display: true },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'drink_name', 'category', 'ingredients', 'glass_shape', 'liquid_color', 'garnish', 'foam_or_clarity', 'scale', 'contains_smoke_effect', 'do_not_add', 'glass', 'presentation', 'effect', 'price', 'menus', 'asset_origin'],
  },
  drink_studio_shots: {
    category: 'drink_studio_shots',
    label: 'Drink (Studio Shots)',
    typeValue: 'Cocktail',
    purpose: 'Approved AI truth reference shots generated from drink source assets.',
    assetTypes: 'Clean isolated studio references for drinks, glassware, and beverage truth.',
    examples: ['approved clean cocktail reference', 'full-object drink studio shot'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'category', label: 'Category', placeholder: 'Category (e.g. Signature Cocktail)', input: 'text', required: false, display: true },
      { key: 'ingredients', label: 'Ingredients', placeholder: 'Ingredients', input: 'textarea', required: false, display: true },
      ...drinkFidelityFields,
      { key: 'glass', label: 'Glass', placeholder: 'Glass', input: 'text', required: false, display: true },
      { key: 'presentation', label: 'Presentation', placeholder: 'Presentation', input: 'text', required: false, display: true },
      { key: 'effect', label: 'Effect', placeholder: 'Effect (e.g. torch ignition)', input: 'textarea', required: false, display: true },
      { key: 'price', label: 'Price', placeholder: 'Price', input: 'text', required: false, display: true },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'drink_name', 'category', 'ingredients', 'glass_shape', 'liquid_color', 'garnish', 'foam_or_clarity', 'scale', 'contains_smoke_effect', 'do_not_add', 'glass', 'presentation', 'effect', 'price', 'menus', 'asset_origin'],
  },
  // Interiors: inside spaces, rooms, seating, bars, and atmosphere. Examples: dining room, lounge seating, bar detail.
  interiors: {
    category: 'interiors',
    label: 'Interiors',
    typeValue: 'Interior',
    purpose: 'Store concise physical venue truth for AI Photography and visual retrieval.',
    assetTypes: 'Indoor venue photos, dining areas, bars, booths, decor and lighting details.',
    examples: ['main dining room', 'bar counter', 'lounge seating'],
    fields: [
      ...interiorTruthFields,
    ],
    requiredFields: [],
    displayOrder: ['zone', 'category', 'surface_table_truth', 'seating_truth', 'key_materials', 'lighting', 'architecture_spatial_features', 'do_not_invent', 'best_use', 'tags'],
  },
  // Exteriors: outside venue spaces, entrances, terraces, views, and facade details. Examples: terrace, entrance, outdoor lounge.
  exteriors: {
    category: 'exteriors',
    label: 'Exteriors',
    typeValue: 'Exterior',
    purpose: 'Capture exterior areas and outdoor facilities for venue navigation and content planning.',
    assetTypes: 'Terraces, entrances, facades, outdoor seating, exterior design details.',
    examples: ['terrace lounge', 'front entrance', 'outdoor seating'],
    fields: [
      { key: 'name', label: 'Area', placeholder: 'Area / Terrace Name', input: 'text', required: false, display: true },
      { key: 'area', label: 'Space Type', placeholder: 'Space Type (e.g. Terrace Lounge)', input: 'text', required: false, display: true },
      ...venueFidelityFields,
      { key: 'level', label: 'Level', placeholder: 'Level (Outdoor)', input: 'text', required: false, display: true },
      { key: 'features', label: 'Features', placeholder: 'Features (trees, seating, views, water features, etc.)', input: 'textarea', required: false, display: true },
      { key: 'shisha', label: 'Shisha', placeholder: 'Shisha', input: 'select', required: false, display: true, options: METADATA_SHISHA },
      menusField,
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'area', 'zone', 'table_shape', 'table_material', 'table_edge', 'seating', 'lighting', 'mirror_reflection_behavior', 'background_constraints', 'do_not_invent', 'level', 'features', 'shisha', 'menus', 'asset_origin'],
  },
  // Venue Items: physical props, tableware, branded objects, and operational items. Examples: menu holder, plate, branded coaster.
  venue_items: {
    category: 'venue_items',
    label: 'Venue Items',
    typeValue: 'Venue Item',
    purpose: 'Track venue objects that appear in content or matter to brand/operations.',
    assetTypes: 'Props, furniture objects, tableware, branded collateral, venue accessories.',
    examples: ['branded coaster', 'menu holder', 'signature plate'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'item_type', label: 'Item Type', placeholder: 'Item Type', input: 'text', required: false, display: true },
      { key: 'service_style', label: 'Service Style', placeholder: 'Minimal premium venue service', input: 'textarea', required: false, display: true },
      { key: 'cutlery', label: 'Cutlery', placeholder: 'White handle, gold-tone fork/knife, restrained flatware...', input: 'textarea', required: false, display: true },
      { key: 'tableware', label: 'Tableware', placeholder: 'Plates, glassware, napkin/service style', input: 'textarea', required: false, display: true },
      { key: 'material', label: 'Material', placeholder: 'Material', input: 'text', required: false, display: true },
      { key: 'color', label: 'Color', placeholder: 'Color', input: 'text', required: false, display: true },
      { key: 'usage', label: 'Usage', placeholder: 'Usage', input: 'textarea', required: false, display: true },
      { key: 'do_not_add', label: 'Do Not Add', placeholder: 'Random decorative cutlery, candles, extra plates, unrelated props', input: 'textarea', required: false, display: true },
      { key: 'location', label: 'Location', placeholder: 'Location', input: 'text', required: false, display: true },
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'item_type', 'service_style', 'cutlery', 'tableware', 'material', 'color', 'usage', 'do_not_add', 'location', 'asset_origin'],
  },
  // Venue Outfits: staff uniforms, host looks, service styling, and wardrobe cues. Examples: waiter uniform, hostess outfit, chef jacket.
  venue_outfits: {
    category: 'venue_outfits',
    label: 'Venue Outfits',
    typeValue: 'Venue Outfit',
    purpose: 'Describe wardrobe and uniform assets for staff styling and brand consistency.',
    assetTypes: 'Staff outfits, host uniforms, chef jackets, branded wardrobe, styling references.',
    examples: ['host uniform', 'server apron', 'chef jacket'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name', input: 'text', required: false, display: true },
      { key: 'role', label: 'Role', placeholder: 'Role', input: 'text', required: false, display: true },
      { key: 'style', label: 'Style', placeholder: 'Style', input: 'text', required: false, display: true },
      { key: 'color_palette', label: 'Color Palette', placeholder: 'Color Palette', input: 'text', required: false, display: true },
      { key: 'usage', label: 'Usage', placeholder: 'Usage', input: 'textarea', required: false, display: true },
      { key: 'gender_presentation', label: 'Gender Presentation', placeholder: 'Gender Presentation', input: 'text', required: false, display: true },
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'role', 'style', 'color_palette', 'usage', 'gender_presentation', 'asset_origin'],
  },
  // Blueprint Layouts: floor plans, terrace maps, seating diagrams, and spatial references. Examples: terrace blueprint, table plan, circulation diagram.
  blueprint_layouts: {
    category: 'blueprint_layouts',
    label: 'Blueprints / Spatial Layouts',
    typeValue: 'Blueprint Layout',
    purpose: 'Capture spatial layout intelligence for AI continuity without treating layouts as visual inspiration.',
    assetTypes: 'Blueprints, floor plans, table maps, seating layouts, circulation diagrams, zone plans.',
    examples: ['terrace floor plan', 'table layout map', 'private dining seating diagram'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Layout / Blueprint Name', input: 'text', required: false, display: true },
      { key: 'layout_type', label: 'Layout Type', placeholder: 'Layout Type (e.g. Terrace Floor Plan)', input: 'text', required: false, display: true },
      { key: 'zones', label: 'Zones', placeholder: 'Zones shown in this layout', input: 'textarea', required: false, display: true },
      { key: 'tables', label: 'Tables', placeholder: 'Table shapes, counts, placement, or notes', input: 'textarea', required: false, display: true },
      { key: 'walkways', label: 'Walkways', placeholder: 'Walkways, circulation paths, entrances, service paths', input: 'textarea', required: false, display: true },
      { key: 'seating_clusters', label: 'Seating Clusters', placeholder: 'Seating clusters / spacing notes', input: 'textarea', required: false, display: true },
      { key: 'relationships', label: 'Relationships', placeholder: 'Zone, table, chandelier, entrance, terrace relationships', input: 'textarea', required: false, display: true },
      { key: 'spatial_notes', label: 'Spatial Notes', placeholder: 'Reliable spatial continuity notes only', input: 'textarea', required: false, display: true },
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['name', 'layout_type', 'zones', 'tables', 'walkways', 'seating_clusters', 'relationships', 'spatial_notes', 'asset_origin'],
  },
  // Menus: PDF menus and menu source documents. Examples: dinner menu PDF, breakfast menu, seasonal drinks menu.
  menus: {
    category: 'menus',
    label: 'Menus',
    typeValue: 'Menu',
    purpose: 'Keep menu document metadata constrained while preserving legacy notes behavior.',
    assetTypes: 'PDF menus, scanned menus, text menu documents, menu references.',
    examples: ['dinner menu PDF', 'breakfast menu', 'seasonal menu'],
    fields: [
      { key: 'content_pillar', label: 'Pillar', placeholder: 'Content pillar', input: 'text', required: false, display: true },
      { key: 'tags', label: 'Tags', placeholder: 'Tags (comma-separated)', input: 'text', required: false, display: true },
      { key: 'notes', label: 'Notes', placeholder: 'Notes', input: 'textarea', required: false, display: true },
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['content_pillar', 'tags', 'notes', 'asset_origin'],
  },
  // Offers: promotion flyers, offer menus, campaign documents, and activation references. Examples: business lunch flyer, happy hour offer.
  offers: {
    category: 'offers',
    label: 'Offers',
    typeValue: 'Offer',
    purpose: 'Keep offer and activation document metadata separate from generic uploads.',
    assetTypes: 'Offer flyers, activation PDFs, promo screenshots, campaign documents.',
    examples: ['business lunch flyer', 'happy hour offer', 'Dubai Restaurant Week menu'],
    fields: [
      { key: 'content_pillar', label: 'Pillar', placeholder: 'Content pillar', input: 'text', required: false, display: true },
      { key: 'tags', label: 'Tags', placeholder: 'Tags (comma-separated)', input: 'text', required: false, display: true },
      { key: 'notes', label: 'Notes', placeholder: 'Notes', input: 'textarea', required: false, display: true },
      assetOriginField,
    ],
    requiredFields: [],
    displayOrder: ['content_pillar', 'tags', 'notes', 'asset_origin'],
  },
} as const satisfies Record<AssetMetadataCategory, MetadataSchemaDefinition>

export function getMetadataSchema(category: string): MetadataSchemaDefinition | null {
  const normalized = category.toLowerCase()
  if (normalized === 'food_studio_shots') return METADATA_SCHEMAS.food_studio_shots
  if (normalized === 'drink_studio_shots') return METADATA_SCHEMAS.drink_studio_shots
  if (normalized === 'pdf_menu' || normalized.includes('menu')) return METADATA_SCHEMAS.menus
  if (normalized === 'offer_flyer' || normalized.includes('offer')) return METADATA_SCHEMAS.offers
  if (normalized.includes('breakfast')) return METADATA_SCHEMAS.breakfast
  if (normalized.includes('food')) return METADATA_SCHEMAS.food
  if (normalized.includes('cocktail') || normalized.includes('drink')) return METADATA_SCHEMAS.drinks
  if (normalized.includes('interior')) return METADATA_SCHEMAS.interiors
  if (normalized.includes('exterior')) return METADATA_SCHEMAS.exteriors
  if (normalized.includes('blueprint') || normalized.includes('layout')) return METADATA_SCHEMAS.blueprint_layouts
  if (normalized.includes('venue_item')) return METADATA_SCHEMAS.venue_items
  if (normalized.includes('venue_outfit')) return METADATA_SCHEMAS.venue_outfits
  return null
}

export function hasMetadataValue(value: AssetMetadataValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value != null && String(value).trim() !== ''
}

export function formatMetadataValue(value: AssetMetadataValue): string {
  if (Array.isArray(value)) return value.join(', ')
  return value == null ? '' : String(value)
}

export function isMetadataFieldKey(key: string): key is AssetMetadataFieldKey {
  return key in METADATA_FIELD_LABELS
}

export const METADATA_FIELD_LABELS: Record<AssetMetadataFieldKey, string> = {
  type: 'Type',
  name: 'Name',
  title: 'Title',
  category: 'Category',
  source_type: 'Source Type',
  normalized_role: 'Normalized Role',
  asset_role: 'Asset Role',
  client_truth_reference: 'Client Truth Reference',
  approved_for_generation: 'Approved for Generation',
  ingredients: 'Ingredients',
  allergens: 'Allergens',
  price: 'Price',
  menus: 'Menus',
  activation: 'Activation',
  asset_origin: 'Origin',
  dish_name: 'Dish Name',
  item_count: 'Item Count',
  plate_count: 'Plate Count',
  serving_vessel: 'Serving Vessel',
  sauce: 'Sauce',
  side_components: 'Sides / Components',
  garnish: 'Garnish',
  texture_notes: 'Texture Notes',
  shape_structure: 'Shape / Structure',
  meal_period: 'Meal Period',
  do_not_add: 'Do Not Add',
  do_not_remove: 'Do Not Remove',
  drink_name: 'Drink Name',
  glass_shape: 'Glass Shape',
  liquid_color: 'Liquid Color',
  foam_or_clarity: 'Foam / Clarity',
  scale: 'Scale',
  contains_smoke_effect: 'Smoke / Dry Ice?',
  glass: 'Glass',
  presentation: 'Presentation',
  effect: 'Effect',
  area: 'Space Type',
  level: 'Level',
  features: 'Features',
  shisha: 'Shisha',
  item_type: 'Item Type',
  service_style: 'Service Style',
  cutlery: 'Cutlery',
  tableware: 'Tableware',
  material: 'Material',
  color: 'Color',
  usage: 'Usage',
  location: 'Location',
  zone: 'Zone',
  surface_table_truth: 'Surface / Table Truth',
  seating_truth: 'Seating Truth',
  key_materials: 'Key Materials',
  architecture_spatial_features: 'Architecture Features',
  best_use: 'Best Use',
  table_shape: 'Table Shape',
  table_material: 'Table Material',
  table_edge: 'Table Edge',
  seating: 'Seating',
  lighting: 'Lighting',
  mirror_reflection_behavior: 'Mirror / Reflection Behavior',
  background_constraints: 'Background Constraints',
  do_not_invent: 'Do Not Invent',
  role: 'Role',
  style: 'Style',
  color_palette: 'Color Palette',
  gender_presentation: 'Gender Presentation',
  layout_type: 'Layout Type',
  zones: 'Zones',
  tables: 'Tables',
  walkways: 'Walkways',
  seating_clusters: 'Seating Clusters',
  spatial_notes: 'Spatial Notes',
  relationships: 'Relationships',
  content_pillar: 'Pillar',
  tags: 'Tags',
  description: 'Description',
  notes: 'Notes',
  usage_notes: 'Usage Notes',
}

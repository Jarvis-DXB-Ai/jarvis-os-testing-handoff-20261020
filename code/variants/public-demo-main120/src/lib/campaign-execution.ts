import {
  SIGNATURE_SYSTEMS,
  buildEditorialChoreographyInsights,
  buildFeedEnergyMeter,
  buildFeedSimulation,
  type EditorialChoreographyInsight,
  type EditorialPlanItem,
  type FeedEnergyMeter,
  type FeedSimulationSlot,
} from "@/lib/editorial-feed-intelligence"

export type CampaignProductionBatch = {
  id: string
  title: string
  system: "AI Photography" | "Product Photography" | "AI Videography" | "Graphic Design"
  mood: string
  lighting: string
  venueSetup: string
  outputs: string[]
  requiredAssets: string[]
  inspirationFolders: string[]
  visualPatterns: string[]
  signatureSystems: string[]
}

export type CampaignGenerationTask = {
  id: string
  system: "AI Photography" | "Product Photography" | "AI Videography" | "Graphic Design"
  title: string
  purpose: string
  promptDirection: string
  requiredTruthAssets: string[]
  inspirationInheritance: string[]
  visualPattern: string
  emotionalGoal: string
  status: "Planned" | "Ready for brief" | "Waiting for truth assets"
}

export type CampaignStoryBeat = {
  window: string
  role: string
  rhythm: string
  examples: string[]
}

export type CampaignReadinessScore = {
  overall: number
  strategyCompleteness: number
  assetReadiness: number
  inspirationDepth: number
  productionFeasibility: number
  feedBalance: number
  emotionalDiversity: number
}

export type CampaignEditorialAudit = {
  label: string
  status: "Strong" | "Watch" | "Needs support"
  detail: string
}

export type CampaignExecution = {
  campaignName: string
  mode: "execution_simulation"
  mood: string
  positioning: string
  signatureSystems: string[]
  feedItems: EditorialPlanItem[]
  feedSimulation: FeedSimulationSlot[]
  feedEnergy: FeedEnergyMeter
  choreographyInsights: EditorialChoreographyInsight[]
  storyStructure: CampaignStoryBeat[]
  productionBatches: CampaignProductionBatch[]
  generationTasks: CampaignGenerationTask[]
  editorialAudit: CampaignEditorialAudit[]
  readiness: CampaignReadinessScore
  inspirationInheritance: string[]
}

const LUNCH_SIGNATURE_SYSTEMS = ["The DIFC Reset", "The DemoClientD Table", "Comfort Without Borders"]

function activeFolders(availableFolders: string[]) {
  const preferred = ["Lunch", "Lifestyle", "BTS / Service", "Flyers / Graphics", "Breakfast"]
  const available = new Set(availableFolders)
  const matched = preferred.filter(folder => available.has(folder))
  return matched.length > 0 ? matched : preferred.slice(0, 3)
}

function lunchFeedItems(): EditorialPlanItem[] {
  return [
    makeLunchItem(1, "Mon W1", "The lunch reset begins", "world-building", "Lifestyle Hospitality", "comfort", "lifestyle post", "warm arrival, soft daylight table, office energy dissolving"),
    makeLunchItem(1, "Tue W1", "Lunch table without stiffness", "booking", "Lifestyle Hospitality", "comfort", "editorial carousel", "polished table, two guests, social decompression"),
    makeLunchItem(1, "Wed W1", "Comfort dish memory", "save/share", "Food Storytelling", "nostalgia", "product photography", "hero lunch dish, familiar texture, warm cultural cue"),
    makeLunchItem(1, "Thu W1", "The DemoClientD Table at midday", "emotional connection", "Lifestyle Hospitality", "social", "lifestyle post", "shared table, relaxed conversation, hospitality warmth"),
    makeLunchItem(1, "Fri W1", "Lunch, edited like a ritual", "reminder", "Campaign Activations", "clarity", "editorial graphic", "collectible minimal lunch typography, soft CTA"),
    makeLunchItem(2, "Mon W2", "Service before the table fills", "world-building", "Service & BTS", "trust", "lifestyle post", "napkin, cutlery, server hand, quiet room"),
    makeLunchItem(2, "Tue W2", "DIFC reset plate proof", "booking", "Food Storytelling", "comfort", "product photography", "lunch dish on venue surface, clear appetite cue"),
    makeLunchItem(2, "Wed W2", "Comfort without borders", "world-building", "Third Culture Stories", "nostalgia", "carousel", "dish detail, memory-led caption, global warmth"),
    makeLunchItem(2, "Thu W2", "Midday social decompression", "awareness", "Lifestyle Hospitality", "social", "lifestyle post", "natural smiles, warm table, no corporate stiffness"),
    makeLunchItem(3, "Mon W3", "Quiet lunch architecture", "world-building", "Atmosphere & Architecture", "aspiration", "atmosphere still", "daylight room, table geometry, calm luxury"),
    makeLunchItem(3, "Tue W3", "Lunch reminder as editorial object", "reminder", "Campaign Activations", "clarity", "editorial graphic", "minimal luxury graphic, not promo flyer"),
    makeLunchItem(3, "Wed W3", "Lunch dish macro sequence", "save/share", "Food Storytelling", "curiosity", "carousel", "texture, sauce, garnish, vessel detail"),
    makeLunchItem(3, "Thu W3", "Arrival to conversation reel", "awareness", "Lifestyle Hospitality", "social", "reel", "arrival, table, first bite, conversation flow"),
    makeLunchItem(4, "Tue W4", "Regular lunch ritual", "booking", "Lifestyle Hospitality", "comfort", "lifestyle post", "repeatable midday habit, premium ease"),
    makeLunchItem(4, "Fri W4", "Lunch world close", "world-building", "Third Culture Stories", "belonging", "lifestyle post", "soft table memory, warmth, emotional close"),
  ]
}

function makeLunchItem(
  week: number,
  day: string,
  title: string,
  objective: string,
  pillar: string,
  emotionalGoal: string,
  format: string,
  captionDirection: string,
): EditorialPlanItem {
  return {
    id: `lunch-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    week,
    day,
    title,
    objective,
    pillar,
    campaign: "Lunch",
    emotionalGoal,
    format,
    productionSystem: format.includes("graphic") ? "Graphic Design" : format === "reel" ? "AI Videography" : "AI Photography",
    captionDirection,
  }
}

function buildLunchProductionBatches(folders: string[]): CampaignProductionBatch[] {
  const batches: CampaignProductionBatch[] = [
    {
      id: "lunch-lifestyle-table",
      title: "Lunch Lifestyle Table",
      system: "AI Photography",
      mood: "comfort, reset, warm hospitality",
      lighting: "soft daylight / warm luxury",
      venueSetup: "daytime DemoClientD table with relaxed social decompression, not stiff corporate dining",
      outputs: ["4 lifestyle feed posts", "6 story frames", "2 social proof crops"],
      requiredAssets: ["venue daylight table", "lunch dishes", "2 warm natural guests", "serviceware"],
      inspirationFolders: folders.filter(folder => ["Lunch", "Lifestyle"].includes(folder)),
      visualPatterns: ["social_table", "soft_daylight", "warm_luxury", "light_reset"],
      signatureSystems: ["The DIFC Reset", "The DemoClientD Table"],
    },
    {
      id: "lunch-product-storytelling",
      title: "Lunch Product Storytelling",
      system: "Product Photography",
      mood: "familiarity, appetite, restrained luxury",
      lighting: "soft daylight with premium texture contrast",
      venueSetup: "clean lunch surface, dish truth first, subtle DemoClientD material continuity",
      outputs: ["3 hero dish stills", "1 macro carousel sequence", "4 menu/story crops"],
      requiredAssets: ["Food Studio Shots", "lunch dish metadata", "venue surface", "serviceware"],
      inspirationFolders: folders.filter(folder => ["Lunch", "Breakfast"].includes(folder)),
      visualPatterns: ["macro", "45_degree", "product_focus", "comfort"],
      signatureSystems: ["Comfort Without Borders"],
    },
    {
      id: "lunch-reset-reel",
      title: "Lunch Reset Cinematic Reel",
      system: "AI Videography",
      mood: "arrival to ease, social warmth, midday emotional reset",
      lighting: "soft daylight into warm hospitality glow",
      venueSetup: "arrival, table, first dish, conversation, quiet emotional close",
      outputs: ["1 five-shot storyboard", "5 keyframe prompts", "1 reel direction pack"],
      requiredAssets: ["venue", "lunch dishes", "models", "table service", "optional outfit anchors"],
      inspirationFolders: folders.filter(folder => ["Lunch", "Lifestyle", "BTS / Service"].includes(folder)),
      visualPatterns: ["wide_atmosphere", "social_table", "hands_in_frame", "soft_daylight"],
      signatureSystems: ["The DIFC Reset", "The DemoClientD Table"],
    },
    {
      id: "lunch-editorial-graphics",
      title: "Editorial Lunch Graphics",
      system: "Graphic Design",
      mood: "minimal, collectible, elegant, useful without flyer energy",
      lighting: "typography break / soft editorial contrast",
      venueSetup: "brand typography, lunch CTA, subtle material mood",
      outputs: ["2 feed graphics", "4 story reminders", "1 carousel overlay system"],
      requiredAssets: ["lunch copy", "brand typography", "approved dish crop", "reservation CTA"],
      inspirationFolders: folders.filter(folder => ["Flyers / Graphics", "Lunch"].includes(folder)),
      visualPatterns: ["negative_space", "typography_break", "spotlight_editorial"],
      signatureSystems: ["The DIFC Reset"],
    },
    {
      id: "lunch-service-bts",
      title: "Lunch Service / BTS Warmth",
      system: "AI Photography",
      mood: "care, trust, quiet hospitality",
      lighting: "warm luxury detail",
      venueSetup: "service hands, napkin, cutlery, plate arrival, table edge",
      outputs: ["3 service detail posts", "5 story frames", "1 BTS carousel support set"],
      requiredAssets: ["serviceware", "host/server hands", "table edge", "lunch plate handoff"],
      inspirationFolders: folders.filter(folder => ["BTS / Service", "Lunch"].includes(folder)),
      visualPatterns: ["hands_in_frame", "chef_detail", "contrast_break"],
      signatureSystems: ["The DemoClientD Table", "Comfort Without Borders"],
    },
  ]

  return batches.map(batch => ({
    ...batch,
    inspirationFolders: batch.inspirationFolders.length > 0 ? batch.inspirationFolders : folders.slice(0, 2),
  }))
}

function buildLunchTasks(batches: CampaignProductionBatch[]): CampaignGenerationTask[] {
  return batches.flatMap(batch => {
    if (batch.system === "AI Photography") {
      return [
        task(batch, "Lunch lifestyle table", "Create warm daylight hospitality stills with social reset energy.", "2 guests, lunch table, soft daylight, comfort, no corporate stiffness", ["venue", "lunch dishes", "model anchors"]),
        task(batch, "Warm hospitality moments", "Create story/support stills around service, table ease, and belonging.", "hands, service warmth, natural social decompression, premium ease", ["venue", "serviceware", "lunch dish"]),
      ]
    }
    if (batch.system === "Product Photography") {
      return [
        task(batch, "Hero lunch dishes", "Create controlled lunch product stills from Studio Shot truth.", "exact dish truth, soft daylight, menu-ready, restrained luxury", ["Food Studio Shots", "venue surface"]),
        task(batch, "Carousel macro sequence", "Create detail frames for sauce, garnish, texture, and vessel storytelling.", "macro, texture, cultural comfort, save-worthy carousel logic", ["Food Studio Shots", "dish metadata"]),
      ]
    }
    if (batch.system === "AI Videography") {
      return [
        task(batch, "Lunch reset cinematic reel", "Storyboard the emotional shift from office energy to DemoClientD table ease.", "arrival -> table -> dish -> conversation -> emotional close", ["venue", "models", "lunch dishes"]),
        task(batch, "Slow hospitality moments", "Prepare keyframe prompts for table energy, service, and quiet social warmth.", "slow push-ins, soft daylight, warm faces, no corporate stiffness", ["venue", "model anchors", "service detail"]),
      ]
    }
    return [
      task(batch, "Editorial lunch reminder", "Design a collectible minimal lunch reminder system.", "typography break, elegant CTA, premium campaign memory", ["brand typography", "approved dish crop"]),
      task(batch, "Carousel typography overlays", "Create overlay language for product/story carousels.", "minimal captions, emotional hooks, lunch utility without promo-flyer tone", ["brand copy", "lunch campaign copy"]),
    ]
  })
}

function task(
  batch: CampaignProductionBatch,
  title: string,
  purpose: string,
  promptDirection: string,
  requiredTruthAssets: string[],
): CampaignGenerationTask {
  return {
    id: `${batch.id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    system: batch.system,
    title,
    purpose,
    promptDirection,
    requiredTruthAssets,
    inspirationInheritance: batch.inspirationFolders,
    visualPattern: batch.visualPatterns.join(" / "),
    emotionalGoal: batch.mood,
    status: requiredTruthAssets.some(asset => asset.toLowerCase().includes("studio") || asset.toLowerCase().includes("venue")) ? "Ready for brief" : "Planned",
  }
}

function buildLunchStoryStructure(): CampaignStoryBeat[] {
  return [
    {
      window: "Morning",
      role: "Soft reminder",
      rhythm: "One quiet table or dish cue; no aggressive selling.",
      examples: ["Lunch starts with a calmer table.", "A midday reset, ready when you are."],
    },
    {
      window: "Pre-lunch",
      role: "Availability and decision support",
      rhythm: "Clear reservation/menu reminder with premium visual restraint.",
      examples: ["Lunch tables open today.", "Bring the meeting somewhere warmer."],
    },
    {
      window: "Lunch service",
      role: "Live warmth and social proof",
      rhythm: "Room, table, dish, service, guest warmth; make it feel current.",
      examples: ["The room at lunch.", "First plates on the table."],
    },
    {
      window: "Afternoon",
      role: "Emotional afterglow",
      rhythm: "Soft recap, cultural comfort cue, save/share prompt.",
      examples: ["Comfort without borders.", "A lunch that feels less like a pause and more like a reset."],
    },
    {
      window: "BTS",
      role: "Trust and craft",
      rhythm: "Service setup, hands, pass, final plate detail.",
      examples: ["Before the table fills.", "The details that make lunch feel looked after."],
    },
  ]
}

function buildAudit(feedEnergy: FeedEnergyMeter, insights: EditorialChoreographyInsight[], tasks: CampaignGenerationTask[], batches: CampaignProductionBatch[]): CampaignEditorialAudit[] {
  return [
    {
      label: "Product balance",
      status: feedEnergy.productDensity > 62 ? "Watch" : "Strong",
      detail: feedEnergy.productDensity > 62 ? "Product work is heavy; keep lifestyle and atmosphere between dish posts." : "Product storytelling is supported without overwhelming hospitality feeling.",
    },
    {
      label: "Social warmth",
      status: feedEnergy.socialWarmth >= 55 ? "Strong" : "Needs support",
      detail: feedEnergy.socialWarmth >= 55 ? "Lunch keeps human warmth and table energy visible." : "Add more guests, service gestures, and relaxed conversation moments.",
    },
    {
      label: "Atmosphere resets",
      status: batches.some(batch => batch.visualPatterns.includes("wide_atmosphere")) ? "Strong" : "Watch",
      detail: "Wide room and daylight table beats prevent the campaign from becoming plate-only.",
    },
    {
      label: "Typography breaks",
      status: feedEnergy.typographyUsage >= 12 ? "Strong" : "Watch",
      detail: "Editorial graphic moments are present as luxury pauses, not promo-flyer clutter.",
    },
    {
      label: "Dark visual pressure",
      status: feedEnergy.darkness > 65 ? "Watch" : "Strong",
      detail: feedEnergy.darkness > 65 ? "Use softer daylight resets around any darker food or room images." : "Lunch stays appropriately soft, warm, and daylight-led.",
    },
    {
      label: "World-building",
      status: insights.some(insight => insight.id === "world-building-gap") ? "Needs support" : "Strong",
      detail: "The execution includes quiet table, service, cultural memory, and atmosphere content beyond hard CTAs.",
    },
    {
      label: "Task readiness",
      status: tasks.length >= 8 ? "Strong" : "Needs support",
      detail: `${tasks.length} executable generation tasks are planned across photography, product, video, and design.`,
    },
  ]
}

function scoreFromAudit(audit: CampaignEditorialAudit[], value: number) {
  const penalties = audit.reduce((sum, item) => sum + (item.status === "Needs support" ? 14 : item.status === "Watch" ? 7 : 0), 0)
  return Math.max(45, Math.min(96, value - penalties))
}

function buildReadiness(
  folders: string[],
  feedEnergy: FeedEnergyMeter,
  audit: CampaignEditorialAudit[],
  batches: CampaignProductionBatch[],
  tasks: CampaignGenerationTask[],
): CampaignReadinessScore {
  const strategyCompleteness = 94
  const assetReadiness = folders.includes("Lunch") ? 82 : 68
  const inspirationDepth = Math.min(96, 64 + folders.length * 6)
  const productionFeasibility = Math.min(94, 68 + batches.length * 4 + tasks.length)
  const feedBalance = scoreFromAudit(audit, 88)
  const emotionalDiversity = Math.min(95, Math.round((feedEnergy.socialWarmth + feedEnergy.culturalFeel + feedEnergy.emotionalEnergy) / 3) + 18)
  const overall = Math.round((strategyCompleteness + assetReadiness + inspirationDepth + productionFeasibility + feedBalance + emotionalDiversity) / 6)

  return {
    overall,
    strategyCompleteness,
    assetReadiness,
    inspirationDepth,
    productionFeasibility,
    feedBalance,
    emotionalDiversity,
  }
}

export function buildLunchCampaignExecution(input: { availableInspirationFolders?: string[] } = {}): CampaignExecution {
  const folders = activeFolders(input.availableInspirationFolders ?? [])
  const feedItems = lunchFeedItems()
  const feedSimulation = buildFeedSimulation(feedItems, 30)
  const feedEnergy = buildFeedEnergyMeter(feedSimulation)
  const choreographyInsights = buildEditorialChoreographyInsights(feedSimulation)
  const productionBatches = buildLunchProductionBatches(folders)
  const generationTasks = buildLunchTasks(productionBatches)
  const editorialAudit = buildAudit(feedEnergy, choreographyInsights, generationTasks, productionBatches)
  const readiness = buildReadiness(folders, feedEnergy, editorialAudit, productionBatches, generationTasks)

  return {
    campaignName: "Lunch",
    mode: "execution_simulation",
    mood: "Warm daylight hospitality with social reset energy. Comfort-focused editorial pacing with restrained luxury and no corporate stiffness.",
    positioning: "Lunch is a midday emotional escape: useful for DIFC professionals, but broad enough to feel like Third Culture Hospitality for anyone seeking comfort, warmth, familiarity, and a better table.",
    signatureSystems: LUNCH_SIGNATURE_SYSTEMS,
    feedItems,
    feedSimulation,
    feedEnergy,
    choreographyInsights,
    storyStructure: buildLunchStoryStructure(),
    productionBatches,
    generationTasks,
    editorialAudit,
    readiness,
    inspirationInheritance: folders,
  }
}

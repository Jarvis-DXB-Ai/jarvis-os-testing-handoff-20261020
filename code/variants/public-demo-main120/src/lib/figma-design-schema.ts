export type FigmaDesignFormat = "9:16 Story" | "4:5 Feed" | "1:1 Feed" | "Carousel" | "Reel Cover"

export type FigmaLayerType =
  | "background"
  | "rectangle"
  | "image_placeholder"
  | "text"
  | "cta_block"
  | "logo_placeholder"
  | "footer"
  | "safe_zone"
  | "texture_overlay"

export type FigmaLayerSpec = {
  id: string
  name: string
  type: FigmaLayerType
  x: number
  y: number
  width: number
  height: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: "regular" | "medium" | "semibold" | "bold"
  lineHeight?: number
  letterSpacing?: number
  textAlign?: "left" | "center" | "right"
  verticalAlign?: "top" | "center" | "bottom"
  locked?: boolean
  visible?: boolean
  notes?: string[]
}

export type FigmaTypographySpec = {
  id: string
  role: "headline" | "subheadline" | "body" | "cta" | "caption" | "footer"
  fontFamily: string
  fontSize: number
  fontWeight: "regular" | "medium" | "semibold" | "bold"
  lineHeight: number
  letterSpacing: number
  color: string
}

export type FigmaAssetSpec = {
  id: string
  name: string
  type: "image" | "logo" | "texture" | "reference"
  role: "hero" | "supporting" | "logo" | "background" | "inspiration"
  source?: string
  placeholderLayerId?: string
  notes: string[]
}

export type FigmaDesignSpec = {
  id: string
  clientId: string
  campaign: string
  objective: string
  feedRole: string
  format: FigmaDesignFormat
  frame: {
    name: string
    width: number
    height: number
    background: string
    safeZone: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }
  mood: {
    emotionalTone: string
    lightingStyle: string
    visualDensity: string
    luxuryLevel: string
  }
  layers: FigmaLayerSpec[]
  typography: FigmaTypographySpec[]
  assets: FigmaAssetSpec[]
  figmaHandoffNotes: string[]
}

export type FigmaDesignSpecInput = {
  clientId: string
  clientName: string
  campaign: string
  objective: string
  feedRole: string
  format: string
  designBrief?: string
  assets?: string
  inspiration?: string
  copyDirection?: string
  emotionalTone?: string
  lightingStyle?: string
}

const FORMAT_PRESETS: Record<FigmaDesignFormat, { width: number; height: number; safeZone: { top: number; right: number; bottom: number; left: number } }> = {
  "9:16 Story": { width: 1080, height: 1920, safeZone: { top: 220, right: 96, bottom: 260, left: 96 } },
  "4:5 Feed": { width: 1080, height: 1350, safeZone: { top: 96, right: 80, bottom: 96, left: 80 } },
  "1:1 Feed": { width: 1080, height: 1080, safeZone: { top: 80, right: 80, bottom: 80, left: 80 } },
  "Carousel": { width: 1080, height: 1350, safeZone: { top: 96, right: 80, bottom: 96, left: 80 } },
  "Reel Cover": { width: 1080, height: 1920, safeZone: { top: 260, right: 96, bottom: 360, left: 96 } },
}

const DEFAULT_PALETTE = {
  black: "#050806",
  deepGreen: "#092016",
  emerald: "#35D18D",
  warmWhite: "#F8F4EA",
  mutedWhite: "#C8C1B2",
  gold: "#B89658",
  darkGlass: "#101915",
}

function normalizeFormat(value: string): FigmaDesignFormat {
  if (value === "4:5 Feed" || value === "1:1 Feed" || value === "Carousel" || value === "Reel Cover") return value
  return "9:16 Story"
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design"
}

function titleFor(input: FigmaDesignSpecInput) {
  if (input.feedRole === "Menu Storytelling") return `${input.campaign}: Made to be remembered`
  if (input.feedRole === "Atmosphere Reset") return "Stay a little longer"
  if (input.feedRole === "Campaign Push") return `${input.campaign}, the DemoClientD way`
  if (input.feedRole === "CTA Card") return `Reserve ${input.campaign}`
  if (input.feedRole === "Luxury Reminder") return "A quieter kind of luxury"
  if (input.campaign === "Lunch") return "Step out of the day"
  if (input.campaign === "Traffic Hours") return "Golden hour, poured"
  if (input.campaign === "Dinner Experience") return "Tonight at DemoClientD"
  return input.campaign
}

function subheadlineFor(input: FigmaDesignSpecInput) {
  if (input.copyDirection?.trim()) return input.copyDirection.trim()
  if (input.campaign === "Lunch") return "Warm lunch, social reset energy, and premium ease."
  if (input.campaign === "Traffic Hours") return "Cocktails, bites, and the first shift into evening."
  if (input.feedRole === "Menu Storytelling") return "Craft, texture, and a little third-culture memory."
  return "Editorial communication designed from brand strategy and visual intelligence."
}

function ctaFor(input: FigmaDesignSpecInput) {
  if (input.feedRole === "Atmosphere Reset") return "DemoClientD Dubai"
  if (input.feedRole === "Typography Break") return "Reserve via SevenRooms"
  if (input.feedRole === "Menu Storytelling") return "Discover the menu"
  if (input.feedRole === "Social Proof") return "Join the table"
  return "Reserve now"
}

function baseTypography(): FigmaTypographySpec[] {
  return [
    { id: "type-headline", role: "headline", fontFamily: "Inter", fontSize: 104, fontWeight: "semibold", lineHeight: 112, letterSpacing: 0, color: DEFAULT_PALETTE.warmWhite },
    { id: "type-subheadline", role: "subheadline", fontFamily: "Inter", fontSize: 34, fontWeight: "regular", lineHeight: 46, letterSpacing: 0, color: DEFAULT_PALETTE.mutedWhite },
    { id: "type-body", role: "body", fontFamily: "Inter", fontSize: 30, fontWeight: "regular", lineHeight: 42, letterSpacing: 0, color: DEFAULT_PALETTE.mutedWhite },
    { id: "type-cta", role: "cta", fontFamily: "Inter", fontSize: 28, fontWeight: "semibold", lineHeight: 34, letterSpacing: 0, color: DEFAULT_PALETTE.black },
    { id: "type-caption", role: "caption", fontFamily: "Inter", fontSize: 22, fontWeight: "medium", lineHeight: 30, letterSpacing: 0, color: DEFAULT_PALETTE.gold },
    { id: "type-footer", role: "footer", fontFamily: "Inter", fontSize: 24, fontWeight: "medium", lineHeight: 32, letterSpacing: 0, color: DEFAULT_PALETTE.mutedWhite },
  ]
}

function layer(
  id: string,
  name: string,
  type: FigmaLayerType,
  geometry: Pick<FigmaLayerSpec, "x" | "y" | "width" | "height">,
  extras: Partial<FigmaLayerSpec> = {},
): FigmaLayerSpec {
  return {
    id,
    name,
    type,
    visible: true,
    ...geometry,
    ...extras,
  }
}

function commonLayers(input: FigmaDesignSpecInput, width: number, height: number, background: string): FigmaLayerSpec[] {
  return [
    layer("background", "01 Background", "background", { x: 0, y: 0, width, height }, { fill: background, locked: true }),
    layer("safe-zone", "99 Safe Zone Guide", "safe_zone", { x: 96, y: height > 1400 ? 220 : 96, width: width - 192, height: height > 1400 ? height - 480 : height - 192 }, {
      fill: "#FFFFFF",
      opacity: 0.04,
      stroke: "#35D18D",
      strokeWidth: 2,
      locked: true,
      visible: true,
      notes: ["Guide only. Hide before export if desired."],
    }),
    layer("logo", "06 Logo Placeholder", "logo_placeholder", { x: 96, y: height - 176, width: 168, height: 56 }, {
      fill: "transparent",
      stroke: DEFAULT_PALETTE.gold,
      strokeWidth: 2,
      cornerRadius: 8,
      text: input.clientName,
      fontFamily: "Inter",
      fontSize: 22,
      fontWeight: "semibold",
      textAlign: "center",
      verticalAlign: "center",
      notes: ["Replace with official logo component in Figma."],
    }),
  ]
}

function typographyBreakLayers(input: FigmaDesignSpecInput, width: number, height: number) {
  return [
    ...commonLayers(input, width, height, DEFAULT_PALETTE.deepGreen),
    layer("texture-overlay", "02 Texture Overlay", "texture_overlay", { x: 0, y: 0, width, height }, { fill: "#FFFFFF", opacity: 0.03, locked: true }),
    layer("hero-image-placeholder", "03 Supporting Image Placeholder", "image_placeholder", { x: width - 390, y: height - 720, width: 294, height: 420 }, {
      fill: "#172A21",
      stroke: DEFAULT_PALETTE.gold,
      strokeWidth: 2,
      cornerRadius: 24,
      notes: ["Optional restrained image crop. Keep mostly negative space."],
    }),
    layer("headline", "04 Headline", "text", { x: 96, y: 390, width: 780, height: 360 }, {
      text: titleFor(input),
      fontFamily: "Inter",
      fontSize: 112,
      fontWeight: "semibold",
      lineHeight: 118,
      fill: DEFAULT_PALETTE.warmWhite,
      textAlign: "left",
    }),
    layer("subheadline", "05 Supporting Copy", "text", { x: 96, y: 810, width: 650, height: 180 }, {
      text: subheadlineFor(input),
      fontFamily: "Inter",
      fontSize: 34,
      fontWeight: "regular",
      lineHeight: 46,
      fill: DEFAULT_PALETTE.mutedWhite,
    }),
    layer("cta", "07 CTA", "cta_block", { x: 96, y: height - 300, width: 360, height: 72 }, {
      text: ctaFor(input),
      fill: DEFAULT_PALETTE.warmWhite,
      cornerRadius: 36,
      fontFamily: "Inter",
      fontSize: 26,
      fontWeight: "semibold",
      textAlign: "center",
      verticalAlign: "center",
    }),
  ]
}

function campaignPushLayers(input: FigmaDesignSpecInput, width: number, height: number) {
  return [
    ...commonLayers(input, width, height, DEFAULT_PALETTE.black),
    layer("hero-image-placeholder", "02 Hero Image Placeholder", "image_placeholder", { x: 80, y: 520, width: width - 160, height: height > 1400 ? 760 : 480 }, {
      fill: "#172A21",
      stroke: DEFAULT_PALETTE.gold,
      strokeWidth: 2,
      cornerRadius: 32,
      notes: ["Use approved product, venue, or campaign image. Do not flatten into background."],
    }),
    layer("campaign-badge", "03 Campaign Badge", "text", { x: 96, y: height > 1400 ? 240 : 100, width: 540, height: 44 }, {
      text: input.campaign,
      fontFamily: "Inter",
      fontSize: 28,
      fontWeight: "semibold",
      lineHeight: 34,
      fill: DEFAULT_PALETTE.gold,
    }),
    layer("headline", "04 Headline", "text", { x: 96, y: height > 1400 ? 306 : 160, width: width - 192, height: 210 }, {
      text: titleFor(input),
      fontFamily: "Inter",
      fontSize: height > 1400 ? 88 : 70,
      fontWeight: "semibold",
      lineHeight: height > 1400 ? 96 : 78,
      fill: DEFAULT_PALETTE.warmWhite,
    }),
    layer("subheadline", "05 Supporting Copy", "text", { x: 96, y: height > 1400 ? 1340 : 930, width: width - 192, height: 160 }, {
      text: subheadlineFor(input),
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: "regular",
      lineHeight: 44,
      fill: DEFAULT_PALETTE.mutedWhite,
    }),
    layer("cta", "07 CTA Block", "cta_block", { x: width - 456, y: height - 300, width: 360, height: 78 }, {
      text: ctaFor(input),
      fill: DEFAULT_PALETTE.emerald,
      cornerRadius: 39,
      fontFamily: "Inter",
      fontSize: 28,
      fontWeight: "semibold",
      textAlign: "center",
      verticalAlign: "center",
    }),
  ]
}

function menuStorytellingLayers(input: FigmaDesignSpecInput, width: number, height: number) {
  return [
    ...commonLayers(input, width, height, DEFAULT_PALETTE.black),
    layer("hero-image-placeholder", "02 Dish Image Placeholder", "image_placeholder", { x: 80, y: height > 1400 ? 220 : 80, width: width - 160, height: height > 1400 ? 820 : 540 }, {
      fill: "#1A201A",
      stroke: DEFAULT_PALETTE.gold,
      strokeWidth: 2,
      cornerRadius: 36,
      notes: ["Use product truth or approved dish asset. Product geometry must remain intact."],
    }),
    layer("headline", "03 Dish Title", "text", { x: 96, y: height > 1400 ? 1110 : 680, width: width - 192, height: 190 }, {
      text: titleFor(input),
      fontFamily: "Inter",
      fontSize: height > 1400 ? 76 : 64,
      fontWeight: "semibold",
      lineHeight: height > 1400 ? 84 : 72,
      fill: DEFAULT_PALETTE.warmWhite,
    }),
    layer("body-copy", "04 Craft Note", "text", { x: 96, y: height > 1400 ? 1320 : 840, width: width - 192, height: 180 }, {
      text: subheadlineFor(input),
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: "regular",
      lineHeight: 44,
      fill: DEFAULT_PALETTE.mutedWhite,
    }),
    layer("cta", "05 Menu CTA", "cta_block", { x: 96, y: height - 300, width: 340, height: 72 }, {
      text: ctaFor(input),
      fill: DEFAULT_PALETTE.warmWhite,
      cornerRadius: 36,
      fontFamily: "Inter",
      fontSize: 26,
      fontWeight: "semibold",
      textAlign: "center",
      verticalAlign: "center",
    }),
  ]
}

function atmosphereResetLayers(input: FigmaDesignSpecInput, width: number, height: number) {
  return [
    ...commonLayers(input, width, height, DEFAULT_PALETTE.black),
    layer("hero-image-placeholder", "02 Full-Bleed Atmosphere Image Placeholder", "image_placeholder", { x: 0, y: 0, width, height }, {
      fill: "#111916",
      notes: ["Use approved venue or atmosphere asset. Keep it editable as a placeholder until replaced."],
    }),
    layer("contrast-scrim", "03 Contrast Scrim", "rectangle", { x: 0, y: 0, width, height }, { fill: "#000000", opacity: 0.35, locked: true }),
    layer("headline", "04 Minimal Mood Line", "text", { x: 96, y: height - 520, width: width - 192, height: 140 }, {
      text: titleFor(input),
      fontFamily: "Inter",
      fontSize: 72,
      fontWeight: "medium",
      lineHeight: 82,
      fill: DEFAULT_PALETTE.warmWhite,
    }),
    layer("footer", "05 Quiet Footer", "footer", { x: 96, y: height - 330, width: 520, height: 48 }, {
      text: subheadlineFor(input).slice(0, 120),
      fontFamily: "Inter",
      fontSize: 28,
      fontWeight: "regular",
      lineHeight: 38,
      fill: DEFAULT_PALETTE.mutedWhite,
    }),
  ]
}

function luxuryReminderLayers(input: FigmaDesignSpecInput, width: number, height: number) {
  return [
    ...commonLayers(input, width, height, DEFAULT_PALETTE.black),
    layer("image-placeholder", "02 Restrained Image Placeholder", "image_placeholder", { x: width / 2 - 250, y: height > 1400 ? 360 : 180, width: 500, height: 620 }, {
      fill: "#121B16",
      stroke: DEFAULT_PALETTE.gold,
      strokeWidth: 2,
      cornerRadius: 260,
      notes: ["Use a subtle product, room, or texture cue."],
    }),
    layer("headline", "03 Headline", "text", { x: 140, y: height > 1400 ? 1060 : 760, width: width - 280, height: 190 }, {
      text: titleFor(input),
      fontFamily: "Inter",
      fontSize: 76,
      fontWeight: "medium",
      lineHeight: 84,
      fill: DEFAULT_PALETTE.warmWhite,
      textAlign: "center",
    }),
    layer("subheadline", "04 Supporting Copy", "text", { x: 170, y: height > 1400 ? 1270 : 950, width: width - 340, height: 150 }, {
      text: subheadlineFor(input),
      fontFamily: "Inter",
      fontSize: 30,
      fontWeight: "regular",
      lineHeight: 42,
      fill: DEFAULT_PALETTE.mutedWhite,
      textAlign: "center",
    }),
  ]
}

function layersForFeedRole(input: FigmaDesignSpecInput, width: number, height: number) {
  if (input.feedRole === "Typography Break") return typographyBreakLayers(input, width, height)
  if (input.feedRole === "Campaign Push" || input.feedRole === "CTA Card" || input.feedRole === "Graphic Contrast") return campaignPushLayers(input, width, height)
  if (input.feedRole === "Menu Storytelling" || input.objective === "Menu Feature") return menuStorytellingLayers(input, width, height)
  if (input.feedRole === "Atmosphere Reset" || input.feedRole === "Editorial Anchor") return atmosphereResetLayers(input, width, height)
  return luxuryReminderLayers(input, width, height)
}

function visualDensityFor(feedRole: string) {
  if (feedRole === "Typography Break" || feedRole === "Atmosphere Reset" || feedRole === "Luxury Reminder") return "low"
  if (feedRole === "Campaign Push" || feedRole === "Menu Storytelling") return "medium"
  return "controlled"
}

export function buildFigmaDesignSpec(input: FigmaDesignSpecInput): FigmaDesignSpec {
  const format = normalizeFormat(input.format)
  const preset = FORMAT_PRESETS[format]
  const background = input.feedRole === "Typography Break" ? DEFAULT_PALETTE.deepGreen : DEFAULT_PALETTE.black
  const layers = layersForFeedRole(input, preset.width, preset.height)
  const id = `jarvis-${slug(input.clientName)}-${slug(input.campaign)}-${slug(input.feedRole)}-${Date.now()}`

  return {
    id,
    clientId: input.clientId,
    campaign: input.campaign,
    objective: input.objective,
    feedRole: input.feedRole,
    format,
    frame: {
      name: `${input.clientName} / ${input.campaign} / ${input.feedRole} / ${format}`,
      width: preset.width,
      height: preset.height,
      background,
      safeZone: preset.safeZone,
    },
    mood: {
      emotionalTone: input.emotionalTone || "warm luxury",
      lightingStyle: input.lightingStyle || "brand-aware editorial",
      visualDensity: visualDensityFor(input.feedRole),
      luxuryLevel: "premium restrained",
    },
    layers,
    typography: baseTypography(),
    assets: [
      {
        id: "asset-hero",
        name: "Hero / campaign image",
        type: "image",
        role: "hero",
        source: input.assets,
        placeholderLayerId: layers.find(item => item.type === "image_placeholder")?.id,
        notes: ["Replace placeholder with approved Jarvis or Client Brain asset.", "Keep layer editable; do not flatten."],
      },
      {
        id: "asset-logo",
        name: "DemoClientD logo",
        type: "logo",
        role: "logo",
        placeholderLayerId: "logo",
        notes: ["Replace logo placeholder with official logo component."],
      },
      {
        id: "asset-inspiration",
        name: "Inspiration references",
        type: "reference",
        role: "inspiration",
        source: input.inspiration,
        notes: ["Inspiration only. Do not copy exact Pinterest/reference layouts."],
      },
    ],
    figmaHandoffNotes: [
      "Generated by Jarvis Graphic Design Studio.",
      "All layers should remain editable in Figma.",
      "Use Inter as safe default font; replace with brand fonts manually if available.",
      "Image placeholders are intentionally rectangles until a designer replaces them.",
      "Safe-zone guide is visible for review and can be hidden before export.",
      "No Figma cloud API write action was used.",
    ],
  }
}

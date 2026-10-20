export type ContentPostStatus =
  | "Draft"
  | "Brief Ready"
  | "Generating"
  | "Generated"
  | "Needs Revision"
  | "Caption Ready"
  | "Approved"
  | "Scheduled"

export type ContentSlideStatus = "Draft" | "Generating" | "Generated" | "Needs Revision" | "Approved"
export type CaptionStatus = "Draft" | "Caption Ready" | "Approved"

export type ContentPostBrief = {
  brandName: string
  monthlyNarrative: string
  supportingEmotionalLayer: string
  campaignName: string
  contentGoal: string
  emotionalGoal: string
  businessObjective: string
  targetAudience: string
  activationType: string
  visualMood: string
  timeOfDay: "Morning" | "Midday" | "Evening"
  location: "Interior" | "Exterior"
  sceneLocation: string
  featuredFood: string
  featuredDrink: string
  featuredDessert: string
  humanPresence: string
  hospitalityFeeling: string
  ctaDirection: string
  avoidList: string
  notes: string
}

export type ContentPostSlide = {
  id: string
  slideNumber: number
  slidePurpose: string
  subjectFocus: string
  visualDirection: string
  compositionNotes: string
  prompt: string
  generatedAssetUrl?: string
  selectedAssetUrl?: string
  status: ContentSlideStatus
  approvedAt?: string
}

export type ContentPostCaption = {
  hook: string
  body: string
  cta: string
  hashtags: string
  locationTagNotes: string
  storyAdaptationIdeas: string
  status: CaptionStatus
  approvedAt?: string
}

export type ContentCalendarPost = {
  id: string
  month: "June"
  year: 2026
  postNumber: number
  scheduledDate: string
  platform: "Instagram" | "Instagram + Facebook"
  format: "Carousel" | "Reel" | "Feed Post" | "Story Pack"
  slideCount: number
  conceptName: string
  briefSummary: string
  monthlyTheme: string
  supportingEmotionalLayer: string
  contentGoal: string
  emotionalGoal: string
  businessObjective: string
  status: ContentPostStatus
  creativeBrief: ContentPostBrief
  slides: ContentPostSlide[]
  captionWorkspace: ContentPostCaption
  approvedAt?: string
}

const BASE_AVOID_LIST = [
  "generic restaurant stock-photo styling",
  "invented venue architecture",
  "fake table geometry",
  "cheap promotional flyer look",
  "overcrowded composition",
  "random garnish or inaccurate dish structure",
].join(", ")

function slidePrompt(input: {
  concept: string
  slide: number
  purpose: string
  subject: string
  visual: string
  composition: string
  mood: string
}) {
  return [
    `[POST_CONTEXT]`,
    `Client: DemoClientD Dubai.`,
    `Concept: ${input.concept}.`,
    `Slide ${input.slide}: ${input.purpose}.`,
    `Mood: ${input.mood}.`,
    ``,
    `[VISUAL_DIRECTION]`,
    `Subject focus: ${input.subject}.`,
    `Visual direction: ${input.visual}.`,
    `Composition notes: ${input.composition}.`,
    ``,
    `[JARVIS_STANDARDS]`,
    `Premium editorial hospitality image for a luxury but warm third-culture restaurant in DIFC.`,
    `Use selected truth references for venue, food, drinks, people, and tableware when provided.`,
    `Pinterest or inspiration references may influence mood, lighting, composition, color, and styling only.`,
    ``,
    `[STRICT_NEGATIVE]`,
    BASE_AVOID_LIST,
  ].join("\n")
}

function captionTemplate(concept: string) {
  return {
    hook: "",
    body: "",
    cta: "",
    hashtags: "",
    locationTagNotes: "Use DemoClientD Dubai location tag once the post is approved.",
    storyAdaptationIdeas: `Adapt ${concept} into a 3-frame story: atmosphere opener, sensory detail, soft reservation CTA.`,
    status: "Draft" as CaptionStatus,
  }
}

const postOneBrief: ContentPostBrief = {
  brandName: "DemoClientD Dubai",
  monthlyNarrative: "Summer Evenings in DIFC",
  supportingEmotionalLayer: "Slow Summer Luxury",
  campaignName: "Escape The Midday Heat",
  contentGoal: "Business lunch awareness",
  emotionalGoal: "Refined indoor summer refuge",
  businessObjective: "Increase weekday business lunch interest",
  targetAudience: "DIFC professionals, international residents, and socially minded lunch guests seeking calm luxury without stiffness.",
  activationType: "Business Lunch",
  visualMood: "Cool indoor daylight, calm luxury, refined DIFC atmosphere",
  timeOfDay: "Midday",
  location: "Interior",
  sceneLocation: "DemoClientD indoor dining room / cool daylight business lunch table",
  featuredFood: "Business lunch dishes, refined mains, bread or texture detail where selected.",
  featuredDrink: "Refreshing iced tea, mocktail, or cold summer drink where selected.",
  featuredDessert: "Optional soft finishing detail only if selected.",
  humanPresence: "Subtle professional-social warmth, natural conversation, no corporate stiffness.",
  hospitalityFeeling: "Indoor refuge from Dubai summer heat; attentive, warm, familiar, and elegant.",
  ctaDirection: "Soft lunch reservation cue, not a hard-sell offer.",
  avoidList: BASE_AVOID_LIST,
  notes: "Treat the month as a cinematic hospitality publication. This first post should open June with a controlled, cooling, lunch-led world.",
}

export const JUNE_CONTENT_CALENDAR_SEED: ContentCalendarPost[] = [
  {
    id: "june-2026-post-01",
    month: "June",
    year: 2026,
    postNumber: 1,
    scheduledDate: "2026-06-01",
    platform: "Instagram + Facebook",
    format: "Carousel",
    slideCount: 6,
    conceptName: "Escape The Midday Heat",
    briefSummary: "Business lunch as refined summer refuge",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Slow Summer Luxury",
    contentGoal: "Business lunch awareness",
    emotionalGoal: "Refined indoor summer refuge",
    businessObjective: "Increase weekday business lunch interest",
    status: "Brief Ready",
    creativeBrief: postOneBrief,
    slides: [
      {
        id: "june-2026-post-01-slide-01",
        slideNumber: 1,
        slidePurpose: "Hero introduction",
        subjectFocus: "Elegant business lunch table",
        visualDirection: "Cool indoor daylight, refined DIFC luxury, relaxed but premium lunch atmosphere.",
        compositionNotes: "Wide enough to feel like a real DemoClientD interior, with table energy as the emotional center.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 1,
          purpose: "Hero introduction",
          subject: "Elegant business lunch table",
          visual: "Cool indoor daylight, refined DIFC luxury, relaxed but premium lunch atmosphere.",
          composition: "Wide enough to feel like a real DemoClientD interior, with table energy as the emotional center.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
      {
        id: "june-2026-post-01-slide-02",
        slideNumber: 2,
        slidePurpose: "Refreshing sensory detail",
        subjectFocus: "Signature iced tea, mocktail, or cold summer drink close-up",
        visualDirection: "Condensation, glass clarity, calm luxury, sensory relief from the heat.",
        compositionNotes: "Close detail with controlled depth; drink truth reference should lead if selected.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 2,
          purpose: "Refreshing sensory detail",
          subject: "Signature iced tea, mocktail, or cold summer drink close-up",
          visual: "Condensation, glass clarity, calm luxury, sensory relief from the heat.",
          composition: "Close detail with controlled depth; drink truth reference should lead if selected.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
      {
        id: "june-2026-post-01-slide-03",
        slideNumber: 3,
        slidePurpose: "Food texture macro",
        subjectFocus: "Business lunch food texture or bread detail",
        visualDirection: "Tactile, close, appetizing, elegant, not over-styled.",
        compositionNotes: "Food truth reference must preserve dish identity, plating logic, and ingredient structure.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 3,
          purpose: "Food texture macro",
          subject: "Business lunch food texture or bread detail",
          visual: "Tactile, close, appetizing, elegant, not over-styled.",
          composition: "Food truth reference must preserve dish identity, plating logic, and ingredient structure.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
      {
        id: "june-2026-post-01-slide-04",
        slideNumber: 4,
        slidePurpose: "Professional dining atmosphere",
        subjectFocus: "Subtle human presence around lunch",
        visualDirection: "DIFC weekday lunch decompression; social but composed; luxury without corporate stiffness.",
        compositionNotes: "Use lifestyle or model references only when selected. Keep faces and outfits faithful to references.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 4,
          purpose: "Professional dining atmosphere",
          subject: "Subtle human presence around lunch",
          visual: "DIFC weekday lunch decompression; social but composed; luxury without corporate stiffness.",
          composition: "Use lifestyle or model references only when selected. Keep faces and outfits faithful to references.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
      {
        id: "june-2026-post-01-slide-05",
        slideNumber: 5,
        slidePurpose: "Editorial table detail",
        subjectFocus: "Serviceware, table surface, napkin, menu, or plate edge detail",
        visualDirection: "Quiet premium table language, tactile details, controlled negative space.",
        compositionNotes: "This should feel like a luxury magazine detail, not a generic table setup.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 5,
          purpose: "Editorial table detail",
          subject: "Serviceware, table surface, napkin, menu, or plate edge detail",
          visual: "Quiet premium table language, tactile details, controlled negative space.",
          composition: "This should feel like a luxury magazine detail, not a generic table setup.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
      {
        id: "june-2026-post-01-slide-06",
        slideNumber: 6,
        slidePurpose: "Soft CTA / brand close",
        subjectFocus: "Brand close with calm lunch atmosphere",
        visualDirection: "Subtle DemoClientD identity, quiet reservation cue, no hard-sell design.",
        compositionNotes: "Leave visual breathing room for caption or future typography overlay if needed.",
        prompt: slidePrompt({
          concept: "Escape The Midday Heat",
          slide: 6,
          purpose: "Soft CTA / brand close",
          subject: "Brand close with calm lunch atmosphere",
          visual: "Subtle DemoClientD identity, quiet reservation cue, no hard-sell design.",
          composition: "Leave visual breathing room for caption or future typography overlay if needed.",
          mood: postOneBrief.visualMood,
        }),
        status: "Draft",
      },
    ],
    captionWorkspace: captionTemplate("Escape The Midday Heat"),
  },
  {
    id: "june-2026-post-02",
    month: "June",
    year: 2026,
    postNumber: 2,
    scheduledDate: "2026-06-03",
    platform: "Instagram + Facebook",
    format: "Reel",
    slideCount: 1,
    conceptName: "Summer Evenings in DIFC",
    briefSummary: "Cinematic evening dining mood",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Warm evening atmosphere",
    contentGoal: "Dinner awareness",
    emotionalGoal: "Aspirational warmth after the workday",
    businessObjective: "Increase dinner consideration",
    status: "Draft",
    creativeBrief: {
      ...postOneBrief,
      campaignName: "Summer Evenings in DIFC",
      contentGoal: "Dinner awareness",
      emotionalGoal: "Aspirational warmth after the workday",
      businessObjective: "Increase dinner consideration",
      activationType: "Dinner",
      visualMood: "Warm amber evening, cinematic table energy, calm social luxury",
      timeOfDay: "Evening",
    },
    slides: [
      {
        id: "june-2026-post-02-slide-01",
        slideNumber: 1,
        slidePurpose: "Reel hero frame",
        subjectFocus: "Evening dining atmosphere",
        visualDirection: "Warm dining room energy, refined motion, social warmth.",
        compositionNotes: "Use as reel cover or opening frame; keep it editorial and believable.",
        prompt: slidePrompt({
          concept: "Summer Evenings in DIFC",
          slide: 1,
          purpose: "Reel hero frame",
          subject: "Evening dining atmosphere",
          visual: "Warm dining room energy, refined motion, social warmth.",
          composition: "Use as reel cover or opening frame; keep it editorial and believable.",
          mood: "Warm amber evening, cinematic table energy, calm social luxury",
        }),
        status: "Draft",
      },
    ],
    captionWorkspace: captionTemplate("Summer Evenings in DIFC"),
  },
  {
    id: "june-2026-post-03",
    month: "June",
    year: 2026,
    postNumber: 3,
    scheduledDate: "2026-06-05",
    platform: "Instagram + Facebook",
    format: "Carousel",
    slideCount: 4,
    conceptName: "Refreshing Summer Drinks",
    briefSummary: "Sensory drink-focused carousel",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Cold relief and social ritual",
    contentGoal: "Traffic Hours and cocktail awareness",
    emotionalGoal: "Sensory refresh and social escape",
    businessObjective: "Increase after-work drink consideration",
    status: "Draft",
    creativeBrief: {
      ...postOneBrief,
      campaignName: "Refreshing Summer Drinks",
      contentGoal: "Traffic Hours and cocktail awareness",
      emotionalGoal: "Sensory refresh and social escape",
      businessObjective: "Increase after-work drink consideration",
      activationType: "Cocktail Hour",
      visualMood: "Cold glass detail, warm hospitality, restrained cocktail ritual",
      timeOfDay: "Evening",
      featuredFood: "Optional bites only when selected.",
      featuredDrink: "Summer cocktails, mocktails, iced tea, or Traffic Hours drinks.",
    },
    slides: [
      {
        id: "june-2026-post-03-slide-01",
        slideNumber: 1,
        slidePurpose: "Drink hero",
        subjectFocus: "Cold signature drink",
        visualDirection: "Premium close-up, glass clarity, restrained summer color.",
        compositionNotes: "Drink truth should lead; keep background secondary.",
        prompt: slidePrompt({
          concept: "Refreshing Summer Drinks",
          slide: 1,
          purpose: "Drink hero",
          subject: "Cold signature drink",
          visual: "Premium close-up, glass clarity, restrained summer color.",
          composition: "Drink truth should lead; keep background secondary.",
          mood: "Cold glass detail, warm hospitality, restrained cocktail ritual",
        }),
        status: "Draft",
      },
    ],
    captionWorkspace: captionTemplate("Refreshing Summer Drinks"),
  },
  {
    id: "june-2026-post-04",
    month: "June",
    year: 2026,
    postNumber: 4,
    scheduledDate: "2026-06-08",
    platform: "Instagram + Facebook",
    format: "Feed Post",
    slideCount: 1,
    conceptName: "The DemoClientD Table",
    briefSummary: "World-building atmosphere post",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Belonging and table warmth",
    contentGoal: "Emotional brand building",
    emotionalGoal: "Belonging through hospitality",
    businessObjective: "Strengthen brand memory",
    status: "Draft",
    creativeBrief: { ...postOneBrief, campaignName: "The DemoClientD Table", contentGoal: "Emotional brand building", emotionalGoal: "Belonging through hospitality", businessObjective: "Strengthen brand memory" },
    slides: [],
    captionWorkspace: captionTemplate("The DemoClientD Table"),
  },
  {
    id: "june-2026-post-05",
    month: "June",
    year: 2026,
    postNumber: 5,
    scheduledDate: "2026-06-10",
    platform: "Instagram + Facebook",
    format: "Story Pack",
    slideCount: 5,
    conceptName: "Lunch Reminder Rhythm",
    briefSummary: "Story sequence for weekday lunch intent",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Soft reminder, not sales pressure",
    contentGoal: "Booking reminder",
    emotionalGoal: "Ease and convenience",
    businessObjective: "Drive weekday lunch action",
    status: "Draft",
    creativeBrief: { ...postOneBrief, campaignName: "Lunch Reminder Rhythm", contentGoal: "Booking reminder", emotionalGoal: "Ease and convenience", businessObjective: "Drive weekday lunch action" },
    slides: [],
    captionWorkspace: captionTemplate("Lunch Reminder Rhythm"),
  },
  {
    id: "june-2026-post-06",
    month: "June",
    year: 2026,
    postNumber: 6,
    scheduledDate: "2026-06-12",
    platform: "Instagram + Facebook",
    format: "Carousel",
    slideCount: 5,
    conceptName: "Comfort Without Borders",
    briefSummary: "Third-culture food storytelling",
    monthlyTheme: "Summer Evenings in DIFC",
    supportingEmotionalLayer: "Nostalgia and global comfort",
    contentGoal: "Save/share content",
    emotionalGoal: "Familiarity, curiosity, and comfort",
    businessObjective: "Strengthen third-culture positioning",
    status: "Draft",
    creativeBrief: { ...postOneBrief, campaignName: "Comfort Without Borders", contentGoal: "Save/share content", emotionalGoal: "Familiarity, curiosity, and comfort", businessObjective: "Strengthen third-culture positioning" },
    slides: [],
    captionWorkspace: captionTemplate("Comfort Without Borders"),
  },
]

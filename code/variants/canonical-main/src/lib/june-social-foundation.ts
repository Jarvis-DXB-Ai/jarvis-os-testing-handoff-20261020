export type JuneInputOption = {
  id: string
  label: string
  description: string
}

export type JuneNarrativeOption = {
  id: string
  title: string
  emotionalSpine: string
  strategicRole: string
}

export type JuneCampaignMoment = {
  id: string
  title: string
  emotionalRole: string
  audiencePsychology: string
  visualDirection: string
  spatialDirection: string
  contentTypes: string[]
  socialBehavior: string
  storyRhythm: string[]
  lifespan: string
}

export type JuneEmotionalArc = {
  week: string
  title: string
  emotionalState: string
  pacing: string
  visualImplication: string
  captionImplication: string
}

export type JuneSkeletonSlot = {
  week: string
  campaignWave: string
  visualRhythm: string[]
  feedChoreography: string
  reelPlacement: string
  typographyBreak: string
  atmosphereReset: string
  socialLifestyleBalance: string
}

export type JuneWorkflowStep = {
  step: number
  title: string
  status: "active" | "locked_next" | "future"
  description: string
}

export const JUNE_BUSINESS_GOALS: JuneInputOption[] = [
  { id: "lunch_bookings", label: "Lunch Bookings", description: "Drive weekday table decisions without making the brand feel corporate." },
  { id: "dinner_awareness", label: "Dinner Awareness", description: "Keep evening atmosphere visible and desirable." },
  { id: "traffic_hours", label: "Traffic Hours", description: "Build after-work social ritual and cocktail energy." },
  { id: "brand_awareness", label: "Brand Awareness", description: "Make DemoClientD feel emotionally recognizable across the month." },
  { id: "social_shareability", label: "Social Shareability", description: "Prioritize repostable, emotionally resonant, conversation-worthy moments." },
  { id: "audience_growth", label: "Audience Growth", description: "Use cultural timing and high-quality visuals to attract new followers." },
  { id: "save_share_content", label: "Save/Share Content", description: "Create useful, beautiful, and memorable posts worth saving." },
  { id: "viral_campaign", label: "Viral Campaign", description: "Add one tasteful internet-aware campaign hook." },
  { id: "hospitality_identity", label: "Hospitality Identity", description: "Show warmth, service, atmosphere, and human feeling." },
  { id: "third_culture_positioning", label: "Third Culture Positioning", description: "Keep global comfort and cultural layering visible." },
]

export const JUNE_ACTIVE_ACTIVATIONS: JuneInputOption[] = [
  { id: "business_lunch", label: "Business Lunch", description: "Lunch as reset, routine, and polished midday escape." },
  { id: "traffic_hours", label: "Traffic Hours", description: "After-work drinks, bites, and social decompression." },
  { id: "dinner_experience", label: "Dinner Experience", description: "Warm evening atmosphere and cinematic hospitality." },
  { id: "summer_cocktails", label: "Summer Cocktails", description: "Cold glass, cool refuge, and warm room energy." },
  { id: "breakfast", label: "Breakfast", description: "Morning ritual and softer daylight hospitality if active." },
  { id: "weekend_dining", label: "Weekend Dining", description: "Belonging, warmth, and social table energy." },
  { id: "events", label: "Events", description: "Any live, private, or cultural event moments that need support." },
]

export const JUNE_SEASONAL_CONTEXTS: JuneInputOption[] = [
  { id: "dubai_summer", label: "Dubai Summer", description: "Heat, relief, chilled drinks, and indoor refuge." },
  { id: "indoor_luxury_refuge", label: "Indoor Luxury Refuge", description: "The restaurant becomes a cool emotional shelter." },
  { id: "difc_work_rhythm", label: "DIFC Work Rhythm", description: "Weekday lunch and after-work behavior shape demand." },
  { id: "summer_travel", label: "Summer Travel", description: "Some audience movement means the brand must stay memorable." },
  { id: "slower_city_energy", label: "Slower City Energy", description: "Use calm, cinematic, human pacing instead of noisy pushes." },
  { id: "late_dinner_season", label: "Late Dinner Season", description: "Warm nights, later plans, and social table momentum." },
]

export const JUNE_CULTURAL_MOMENTS: JuneInputOption[] = [
  { id: "eid", label: "Eid / Post-Eid", description: "Belonging, generous tables, nostalgia, and chosen-family hospitality." },
  { id: "june_public_holidays", label: "June Public Holidays", description: "Long-weekend and return-to-rhythm opportunities if confirmed." },
  { id: "dubai_summer_moments", label: "Dubai Summer Moments", description: "Heat, indoor luxury, cold cocktails, and evening refuge." },
  { id: "seasonal_internet_culture", label: "Seasonal Internet Culture", description: "Summer burnout, work-week rituals, and tasteful POV concepts." },
  { id: "viral_opportunities", label: "Viral Opportunities", description: "One campaign hook with shareability but no gimmick tone." },
  { id: "hospitality_moments", label: "Hospitality Moments", description: "Service, arrival, table warmth, and human rituals." },
]

export const JUNE_MONTHLY_NARRATIVES: JuneNarrativeOption[] = [
  {
    id: "summer-in-difc",
    title: "Summer in DIFC at DemoClientD",
    emotionalSpine: "Step out of the heat and into a cooler, warmer world.",
    strategicRole: "Links Dubai summer, DIFC rhythm, lunch, cocktails, and dinner atmosphere into one month.",
  },
  {
    id: "difc-reset",
    title: "The DIFC Reset",
    emotionalSpine: "A weekday ritual that turns work pressure into table ease.",
    strategicRole: "Makes Lunch and Traffic Hours feel useful, emotional, and repeatable without narrowing the whole brand.",
  },
  {
    id: "slow-summer-evenings",
    title: "Slow Summer Evenings",
    emotionalSpine: "Late dinners, chilled glasses, warm rooms, and social decompression.",
    strategicRole: "Keeps Dinner Experience and cocktails aspirational throughout a slower city month.",
  },
  {
    id: "comfort-without-borders",
    title: "Comfort Without Borders",
    emotionalSpine: "Familiar emotions, globally layered food, and hospitality that feels like belonging.",
    strategicRole: "Protects Third Culture positioning and adds emotional depth beyond offers.",
  },
  {
    id: "escape-into-democlientd",
    title: "Escape Into DemoClientD",
    emotionalSpine: "A cinematic refuge from heat, routine, and city noise.",
    strategicRole: "Frames DemoClientD as both an everyday escape and a premium social home.",
  },
]

export const JUNE_CAMPAIGN_MOMENTS: JuneCampaignMoment[] = [
  {
    id: "summer-reset",
    title: "Summer Reset",
    emotionalRole: "Relief, cool refuge, social reset, and soft aspiration.",
    audiencePsychology: "Guests want to escape heat and work pressure without feeling sold to.",
    visualDirection: "Cool interiors, cold cocktails, daylight lunch, condensation, blue room details, warm evening contrast.",
    spatialDirection: "Blue booth lounge, dining tables, bar counter, cool interior zones, and quiet atmosphere resets.",
    contentTypes: ["lifestyle stills", "cocktail reel", "story pack", "typography break", "atmosphere reset"],
    socialBehavior: "Highly story-friendly because it gives people a recognizable seasonal feeling.",
    storyRhythm: ["heat outside", "arrival inside", "first cold sip", "table settles", "soft booking cue"],
    lifespan: "Full month, strongest in Weeks 2-4.",
  },
  {
    id: "traffic-hours",
    title: "Traffic Hours",
    emotionalRole: "After-work energy, social warmth, and evening decompression.",
    audiencePsychology: "DIFC guests want a tasteful reason to stay out after work.",
    visualDirection: "Golden hour drinks, table energy, hands, garnish, bar rhythm, friends arriving.",
    spatialDirection: "Main bar, dining table edge, terrace transitions, and warm evening interiors.",
    contentTypes: ["cocktail ritual reel", "social table post", "story reminders", "reel cover", "CTA card"],
    socialBehavior: "Works as repostable ritual content and group-decision prompting.",
    storyRhythm: ["workday ends", "first round", "small bites", "room fills", "stay longer"],
    lifespan: "Weekly pulse, especially Thursdays and late-month lift.",
  },
  {
    id: "third-culture-summer",
    title: "Third Culture Summer",
    emotionalRole: "Comfort, nostalgia, cultural warmth, and expat familiarity.",
    audiencePsychology: "International residents respond to food that feels emotionally familiar without being predictable.",
    visualDirection: "Warm dish textures, shared plates, craft detail, soft table memories, no cliché cultural styling.",
    spatialDirection: "Intimate dining tables, warm interiors, plate details, service moments.",
    contentTypes: ["food storytelling carousel", "macro detail", "caption-led post", "service/BTS story"],
    socialBehavior: "Save/share potential through emotional recognition and menu curiosity.",
    storyRhythm: ["familiar cue", "dish detail", "shared table", "memory line", "reservation cue"],
    lifespan: "Weeks 1 and 3, supporting the monthly emotional spine.",
  },
  {
    id: "viral-cultural-moment",
    title: "Viral / Cultural Moment",
    emotionalRole: "Tasteful shareability, internet recognition, and editorial play.",
    audiencePsychology: "Guests enjoy seeing their work-week or seasonal mood reflected back with wit and polish.",
    visualDirection: "POV or character-led concept, cinematic framing, quiet humor, no meme spam.",
    spatialDirection: "Use real DemoClientD spaces as the world; avoid fantasy staging.",
    contentTypes: ["POV reel", "carousel concept", "story poll", "editorial graphic"],
    socialBehavior: "Designed for shares, comments, and DMs while staying brand-safe.",
    storyRhythm: ["recognizable tension", "DemoClientD reinterpretation", "hospitality payoff", "soft punchline", "CTA or save cue"],
    lifespan: "One controlled test in Week 4 after the month has visual grounding.",
  },
]

export const JUNE_EMOTIONAL_ARC: JuneEmotionalArc[] = [
  {
    week: "Week 1",
    title: "Reset",
    emotionalState: "Ease back into the table with warmth, comfort, and belonging.",
    pacing: "Calm, human, generous, softer CTAs.",
    visualImplication: "Shared tables, daylight, familiar dishes, soft service details.",
    captionImplication: "Emotion-first language. Avoid hard sell.",
  },
  {
    week: "Week 2",
    title: "Momentum",
    emotionalState: "Dubai summer begins to shape behavior: cool refuge and weekday routine.",
    pacing: "More useful, more rhythmic, more lunch and cocktail reminders.",
    visualImplication: "Cold drinks, cool interiors, lunch proofs, typography breaks.",
    captionImplication: "Useful invitation language with seasonal intelligence.",
  },
  {
    week: "Week 3",
    title: "Intimacy",
    emotionalState: "Deepen the brand world through food memory and table closeness.",
    pacing: "Textural, save-worthy, emotionally specific.",
    visualImplication: "Macro dish storytelling, service hands, warm table details.",
    captionImplication: "Third Culture notes, craft, nostalgia, and belonging.",
  },
  {
    week: "Week 4",
    title: "Warm Summer Energy",
    emotionalState: "Shift into evening social lift, cocktails, and one tasteful viral hook.",
    pacing: "More kinetic but still premium.",
    visualImplication: "Golden hour, darker anchors, bar rituals, social table motion.",
    captionImplication: "FOMO, social ritual, and shareable recognition.",
  },
]

export const JUNE_CALENDAR_SKELETON: JuneSkeletonSlot[] = [
  {
    week: "Week 1",
    campaignWave: "Reset into June",
    visualRhythm: ["warm table", "food comfort", "service detail", "soft graphic"],
    feedChoreography: "Start emotionally human before adding campaign pressure.",
    reelPlacement: "One gentle lunch reset reel or story-first sequence.",
    typographyBreak: "Minimal monthly narrative card.",
    atmosphereReset: "Daylight interior still after food/product density.",
    socialLifestyleBalance: "More lifestyle than product to establish warmth.",
  },
  {
    week: "Week 2",
    campaignWave: "Summer Reset",
    visualRhythm: ["cool interior", "cold drink", "lunch proof", "blue room atmosphere"],
    feedChoreography: "Alternate cool refuge visuals with practical lunch cues.",
    reelPlacement: "Summer Reset reel midweek.",
    typographyBreak: "Cold glass / warm room editorial line.",
    atmosphereReset: "Blue booth or bar still.",
    socialLifestyleBalance: "Balanced product, drinks, and atmosphere.",
  },
  {
    week: "Week 3",
    campaignWave: "Third Culture Summer",
    visualRhythm: ["macro dish", "shared table", "service/BTS", "comfort caption"],
    feedChoreography: "Slow down the feed with texture and intimacy.",
    reelPlacement: "Food/storytelling process reel if assets allow.",
    typographyBreak: "Comfort Without Borders quote card.",
    atmosphereReset: "Warm table memory after macro sequence.",
    socialLifestyleBalance: "Food storytelling supported by human warmth.",
  },
  {
    week: "Week 4",
    campaignWave: "Traffic Hours and cultural test",
    visualRhythm: ["cocktail ritual", "social table", "dark anchor", "POV concept"],
    feedChoreography: "Lift energy without breaking premium tone.",
    reelPlacement: "Traffic Hours reel plus one tasteful cultural/viral concept.",
    typographyBreak: "Evening ritual card.",
    atmosphereReset: "Slow evening interior after energetic reel.",
    socialLifestyleBalance: "More social and drink-led, still grounded by atmosphere.",
  },
]

export const JUNE_WORKFLOW_STEPS: JuneWorkflowStep[] = [
  { step: 1, title: "Approve June Foundation", status: "active", description: "Confirm goals, activations, assets, cultural context, and seasonal inputs." },
  { step: 2, title: "Approve Monthly Narrative", status: "locked_next", description: "Choose the emotional spine that all campaign moments orbit." },
  { step: 3, title: "Approve Campaign Moments", status: "locked_next", description: "Select 2-4 campaign worlds before post-level planning." },
  { step: 4, title: "Generate Week 1 only", status: "future", description: "Create the first weekly plan after the foundation is approved." },
  { step: 5, title: "Approve + adjust", status: "future", description: "Review pacing, visuals, captions, story rhythm, and production needs." },
  { step: 6, title: "Continue Week 2-4", status: "future", description: "Proceed sequentially to prevent generic or repetitive monthly planning." },
]


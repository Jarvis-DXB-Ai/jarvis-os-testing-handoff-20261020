export type ViralPotential = {
  shareability: number
  memePotential: number
  socialConversation: number
  storyRepostPotential: number
  visualUniqueness: number
  emotionalResonance: number
}

export type CampaignArchetype = {
  id: string
  title: string
  role: string
  toneGuardrail: string
  bestUses: string[]
}

export type CulturalOpportunity = {
  id: string
  title: string
  timeframe: string
  type: "holiday" | "dubai_moment" | "seasonal_shift" | "internet_culture" | "hospitality_moment" | "global_culture"
  relevanceToDemoClientD: string
  emotionalFit: string[]
  activationTypes: string[]
  campaignConcepts: string[]
  viralPotential: ViralPotential
  opportunityScore: number
  brandSafetyNote: string
}

export type CampaignMoment = {
  id: string
  title: string
  mood: string
  emotionalRole: string[]
  assets: string[]
  visualWorld: string
  storyRhythm: string[]
  suggestedFormats: string[]
  archetypes: string[]
}

export type WhatIfIdea = {
  id: string
  prompt: string
  translation: string
  campaignUse: string
  guardrail: string
}

export type JuneCulturalWave = {
  week: string
  culturalMomentum: string
  editorialRole: string
  campaignMoments: string[]
  feedGuidance: string
  storyGuidance: string
}

export function viralPotentialScore(potential: ViralPotential) {
  const weighted =
    potential.shareability * 0.2 +
    potential.memePotential * 0.12 +
    potential.socialConversation * 0.18 +
    potential.storyRepostPotential * 0.16 +
    potential.visualUniqueness * 0.16 +
    potential.emotionalResonance * 0.18
  return Math.round(weighted)
}

export const CAMPAIGN_ARCHETYPES: CampaignArchetype[] = [
  {
    id: "nostalgic-luxury",
    title: "Nostalgic Luxury",
    role: "Turns familiar emotional memories into premium hospitality storytelling.",
    toneGuardrail: "Warm, cinematic, never sentimental in a cheap way.",
    bestUses: ["Eid", "Ramadan", "expat comfort", "family-style dining", "third-culture dishes"],
  },
  {
    id: "internet-culture-reinterpretation",
    title: "Internet Culture Reinterpretation",
    role: "Translates viral formats into refined editorial hospitality moments.",
    toneGuardrail: "No trend-chasing. Keep the joke subtle, visual, and brand-safe.",
    bestUses: ["meme cycles", "character insertions", "POV formats", "week-in-the-life concepts"],
  },
  {
    id: "hospitality-humor",
    title: "Hospitality Humor",
    role: "Uses guest behavior, office rituals, and dining truths as tasteful social comedy.",
    toneGuardrail: "Elegant wink, not loud parody.",
    bestUses: ["DIFC lunch", "Traffic Hours", "consultant week", "reservation behavior"],
  },
  {
    id: "third-culture-identity",
    title: "Third Culture Identity",
    role: "Builds cultural recognition, comfort, and curiosity around global food memory.",
    toneGuardrail: "Specific and respectful. Never costume-like.",
    bestUses: ["food storytelling", "Eid", "expat moments", "comfort dishes"],
  },
  {
    id: "difc-reset",
    title: "DIFC Reset",
    role: "Frames DemoClientD as the emotional decompression ritual from workday intensity.",
    toneGuardrail: "Useful and aspirational without becoming corporate.",
    bestUses: ["Lunch", "after-work cocktails", "summer burnout", "back to work"],
  },
  {
    id: "cinematic-character-insertion",
    title: "Cinematic Character Insertion",
    role: "Places a recognizable cultural character or archetype into DemoClientD's world.",
    toneGuardrail: "Editorial cameo energy. Avoid costume-party chaos.",
    bestUses: ["Christmas", "Halloween-adjacent moments", "internet characters", "luxury seasonal rituals"],
  },
  {
    id: "luxury-seasonal-ritual",
    title: "Luxury Seasonal Ritual",
    role: "Turns weather, holidays, and seasonal shifts into repeatable hospitality rituals.",
    toneGuardrail: "Atmospheric and desirable, not discount-led.",
    bestUses: ["summer", "winter terrace", "Ramadan", "long weekends"],
  },
  {
    id: "expat-comfort-moment",
    title: "Expat Comfort Moment",
    role: "Connects international residents through belonging, familiarity, and chosen-family dining.",
    toneGuardrail: "Emotionally grounded and globally welcoming.",
    bestUses: ["Eid", "Christmas", "long weekends", "homesick moments"],
  },
  {
    id: "social-ritual-campaign",
    title: "Social Ritual Campaign",
    role: "Makes repeated guest behaviors feel like signature DemoClientD rituals.",
    toneGuardrail: "Make the ritual look lived-in, not staged.",
    bestUses: ["cocktail rounds", "lunch reset", "sharing dishes", "story repost prompts"],
  },
]

export const UPCOMING_OPPORTUNITIES: CulturalOpportunity[] = [
  {
    id: "post-eid-table",
    title: "Eid / Post-Eid Table",
    timeframe: "Late May to early June",
    type: "holiday",
    relevanceToDemoClientD: "A natural moment for belonging, generous tables, nostalgia, and Third Culture Hospitality.",
    emotionalFit: ["comfort", "family warmth", "nostalgia", "chosen-family hospitality"],
    activationTypes: ["story sequence", "lifestyle campaign", "dinner editorial", "sharing-table carousel"],
    campaignConcepts: ["The Table After Eid", "Comfort Without Borders", "A Dinner That Feels Familiar"],
    viralPotential: { shareability: 78, memePotential: 22, socialConversation: 68, storyRepostPotential: 74, visualUniqueness: 64, emotionalResonance: 88 },
    opportunityScore: 84,
    brandSafetyNote: "Keep it warm and culturally respectful. Avoid generic holiday clichés.",
  },
  {
    id: "summer-reset",
    title: "Summer Reset at DemoClientD",
    timeframe: "June to August",
    type: "seasonal_shift",
    relevanceToDemoClientD: "Dubai heat creates a strong emotional need for indoor luxury, cold drinks, and calm social refuge.",
    emotionalFit: ["relief", "cool refuge", "aspiration", "social reset"],
    activationTypes: ["cocktail reel", "lunch push", "atmosphere stills", "story reminders"],
    campaignConcepts: ["Summer Reset at DemoClientD", "Cold Glass, Warm Room", "Step Out of the Heat"],
    viralPotential: { shareability: 72, memePotential: 44, socialConversation: 70, storyRepostPotential: 76, visualUniqueness: 70, emotionalResonance: 78 },
    opportunityScore: 86,
    brandSafetyNote: "Use the heat as emotional context, not as a loud joke.",
  },
  {
    id: "back-to-work",
    title: "Back to Work Reset",
    timeframe: "Early June and post-long-weekend periods",
    type: "dubai_moment",
    relevanceToDemoClientD: "Turns office return, meeting fatigue, and DIFC rhythm into a refined lunch ritual.",
    emotionalFit: ["decompression", "utility", "comfort", "polished routine"],
    activationTypes: ["Lunch campaign wave", "POV reel", "editorial graphic", "weekday stories"],
    campaignConcepts: ["The DIFC Reset", "The Meeting Ends Here", "Your Week, Told Through Lunch"],
    viralPotential: { shareability: 76, memePotential: 58, socialConversation: 74, storyRepostPotential: 70, visualUniqueness: 66, emotionalResonance: 72 },
    opportunityScore: 82,
    brandSafetyNote: "Do not narrow DemoClientD into a corporate lunch brand; make DIFC one audience lens.",
  },
  {
    id: "dubai-restaurant-week",
    title: "Dubai Restaurant Week",
    timeframe: "Seasonal Dubai dining window",
    type: "dubai_moment",
    relevanceToDemoClientD: "A citywide dining conversation where DemoClientD can behave like an editorial hospitality publication.",
    emotionalFit: ["discovery", "status", "culinary curiosity", "social proof"],
    activationTypes: ["menu storytelling", "carousel", "reel cover system", "story countdown"],
    campaignConcepts: ["A Week at the DemoClientD Table", "Third Culture Plate Week", "What Dubai Is Tasting"],
    viralPotential: { shareability: 80, memePotential: 32, socialConversation: 78, storyRepostPotential: 82, visualUniqueness: 72, emotionalResonance: 70 },
    opportunityScore: 80,
    brandSafetyNote: "Avoid generic event posters. Lead with editorial food-world storytelling.",
  },
  {
    id: "formula-one-weekend",
    title: "Formula 1 / Abu Dhabi Weekend Energy",
    timeframe: "Late year regional momentum",
    type: "global_culture",
    relevanceToDemoClientD: "A high-energy UAE social moment that can become dinner, cocktails, arrivals, and after-dark atmosphere.",
    emotionalFit: ["speed", "glamour", "after-dark social energy", "aspiration"],
    activationTypes: ["dinner atmosphere reel", "cocktail ritual", "character insertion", "story energy"],
    campaignConcepts: ["Dinner Before the Night Moves", "The First Round Has a Rhythm", "Pit Stop, But Make It DemoClientD"],
    viralPotential: { shareability: 74, memePotential: 46, socialConversation: 76, storyRepostPotential: 78, visualUniqueness: 82, emotionalResonance: 62 },
    opportunityScore: 78,
    brandSafetyNote: "Keep it cinematic and regional. Avoid unauthorized event marks or explicit brand borrowing.",
  },
  {
    id: "uae-national-day",
    title: "UAE National Day",
    timeframe: "December",
    type: "holiday",
    relevanceToDemoClientD: "A patriotic citywide moment that can be interpreted through warm hospitality and global belonging.",
    emotionalFit: ["belonging", "celebration", "gratitude", "city pride"],
    activationTypes: ["story set", "editorial graphic", "group table", "hospitality note"],
    campaignConcepts: ["A Table in the City We Share", "Dubai, Around One Table", "Chosen Home"],
    viralPotential: { shareability: 82, memePotential: 20, socialConversation: 78, storyRepostPotential: 84, visualUniqueness: 66, emotionalResonance: 86 },
    opportunityScore: 83,
    brandSafetyNote: "Elegant and respectful. Avoid over-designed patriotic clichés.",
  },
  {
    id: "christmas-character-world",
    title: "Christmas Character World",
    timeframe: "December",
    type: "internet_culture",
    relevanceToDemoClientD: "A tasteful character-insertion campaign can make holiday dining feel culturally shareable.",
    emotionalFit: ["playfulness", "comfort", "warmth", "nostalgia"],
    activationTypes: ["cinematic character reel", "story set", "holiday table", "editorial graphic"],
    campaignConcepts: ["What If the Grinch Came to DemoClientD?", "A Very DemoClientD Christmas Table", "Comfort Without Borders: Holiday Edition"],
    viralPotential: { shareability: 86, memePotential: 76, socialConversation: 82, storyRepostPotential: 84, visualUniqueness: 88, emotionalResonance: 70 },
    opportunityScore: 87,
    brandSafetyNote: "Editorial cameo only. Avoid looking like a gimmick or cheap costume content.",
  },
  {
    id: "viral-office-week",
    title: "The Week Told Through Cocktails",
    timeframe: "Always-on internet format",
    type: "internet_culture",
    relevanceToDemoClientD: "Transforms work-week emotions into elegant cocktail and lunch rituals.",
    emotionalFit: ["recognition", "humor", "decompression", "social energy"],
    activationTypes: ["POV reel", "carousel", "story poll", "cocktail ritual"],
    campaignConcepts: ["A Consultant's Week Told Through Cocktails", "Monday Needs a Table", "Thursday Has a Glass"],
    viralPotential: { shareability: 88, memePotential: 82, socialConversation: 84, storyRepostPotential: 78, visualUniqueness: 72, emotionalResonance: 74 },
    opportunityScore: 86,
    brandSafetyNote: "Keep the humor polished and observational. No cringe office jokes.",
  },
]

export const CAMPAIGN_MOMENTS: CampaignMoment[] = [
  {
    id: "summer-reset-at-democlientd",
    title: "Summer Reset at DemoClientD",
    mood: "Hot DIFC summer outside, cool cinematic hospitality inside.",
    emotionalRole: ["relief", "aspiration", "social reset", "comfort"],
    assets: ["cold cocktails", "daylight lunch table", "warm evening interior", "lifestyle photography", "minimal editorial graphics"],
    visualWorld: "Soft daylight lunch, condensation, blue interiors, chilled glass, warm evening glow, and restrained luxury typography.",
    storyRhythm: ["heat outside", "arrival inside", "first cold sip", "shared lunch", "quiet evening invitation"],
    suggestedFormats: ["reel", "story pack", "lifestyle post", "cocktail macro", "typography break"],
    archetypes: ["Luxury Seasonal Ritual", "DIFC Reset", "Social Ritual Campaign"],
  },
  {
    id: "table-after-eid",
    title: "The Table After Eid",
    mood: "Belonging, generous tables, chosen-family warmth, and familiar luxury.",
    emotionalRole: ["nostalgia", "comfort", "hospitality", "belonging"],
    assets: ["shared dishes", "warm dining table", "hands in frame", "family-style moments", "soft service details"],
    visualWorld: "Warm interiors, gentle table movement, close food textures, intimate guest energy, no cliché holiday graphics.",
    storyRhythm: ["familiar cue", "table opens", "dish memory", "shared reaction", "booking invitation"],
    suggestedFormats: ["carousel", "dinner reel", "story sequence", "feed atmosphere still"],
    archetypes: ["Nostalgic Luxury", "Third Culture Identity", "Expat Comfort Moment"],
  },
  {
    id: "difc-week-through-lunch",
    title: "The DIFC Week Told Through Lunch",
    mood: "A polished weekday story where lunch becomes the emotional reset button.",
    emotionalRole: ["recognition", "relief", "routine", "social decompression"],
    assets: ["lunch dishes", "business-social table", "soft daylight", "editorial typography", "arrival shots"],
    visualWorld: "Daylight table, relaxed posture, elegant pacing, quiet humor, useful booking cues.",
    storyRhythm: ["Monday reset", "Tuesday proof", "Wednesday comfort", "Thursday social lift", "Friday ritual"],
    suggestedFormats: ["POV reel", "weekly carousel", "story reminders", "lunch graphics"],
    archetypes: ["DIFC Reset", "Hospitality Humor", "Social Ritual Campaign"],
  },
  {
    id: "cold-glass-warm-room",
    title: "Cold Glass, Warm Room",
    mood: "Cocktail relief without losing DemoClientD's warmth.",
    emotionalRole: ["anticipation", "coolness", "FOMO", "evening energy"],
    assets: ["cocktail macro", "bar counter", "ice/garnish details", "golden-hour social table", "dark luxury lighting"],
    visualWorld: "Cold glass detail against warm room glow, restrained motion, polished bar rhythm.",
    storyRhythm: ["glass setup", "ice", "pour", "garnish", "first round social cue"],
    suggestedFormats: ["cocktail reel", "story pack", "macro still", "reel cover"],
    archetypes: ["Luxury Seasonal Ritual", "Social Ritual Campaign", "Internet Culture Reinterpretation"],
  },
]

export const WHAT_IF_IDEAS: WhatIfIdea[] = [
  {
    id: "grinch-democlientd",
    prompt: "What if the Grinch came to DemoClientD?",
    translation: "A cinematic holiday character cameo where a cold-hearted guest softens at a warm DemoClientD table.",
    campaignUse: "Christmas story/reel world-building with playful shareability.",
    guardrail: "No cheap costume gag. Make it editorial, warm, and visually luxurious.",
  },
  {
    id: "summer-burnout",
    prompt: "What if summer burnout had a DIFC lunch ritual?",
    translation: "The workday heat and fatigue resolve into a chilled, polished lunch reset.",
    campaignUse: "June to August Lunch and cocktails campaign.",
    guardrail: "Avoid complaining content. Make the relief aspirational.",
  },
  {
    id: "consultant-week-cocktails",
    prompt: "What if a consultant's whole week was told through cocktails?",
    translation: "A polished work-week emotional arc mapped to drinks, table energy, and after-work rituals.",
    campaignUse: "Traffic Hours / cocktail ritual reel and carousel series.",
    guardrail: "Tasteful observational humor only. No mocking guests.",
  },
  {
    id: "eid-nostalgia",
    prompt: "What if Eid nostalgia became a luxury dinner campaign?",
    translation: "A chosen-family dinner world built around familiarity, generosity, and soft cultural memory.",
    campaignUse: "Eid/post-Eid dinner editorial and story sequence.",
    guardrail: "Respectful, specific, and hospitality-led.",
  },
  {
    id: "dish-passport",
    prompt: "What if every dish carried more than one passport?",
    translation: "A Third Culture storytelling system that makes menu items feel emotionally layered.",
    campaignUse: "Food storytelling carousel and save-worthy captions.",
    guardrail: "Do not over-explain or turn culture into costume.",
  },
]

export const JUNE_CULTURAL_PLAN: JuneCulturalWave[] = [
  {
    week: "June W1",
    culturalMomentum: "Post-Eid / return-to-rhythm hospitality",
    editorialRole: "Reopen the emotional table with warmth, comfort, and belonging.",
    campaignMoments: ["The Table After Eid", "Comfort Without Borders", "Lunch Reset"],
    feedGuidance: "Start warm and human: shared tables, soft daylight, familiar dishes, minimal holiday language.",
    storyGuidance: "Use gentle reminders, guest warmth, reposts, and dinner invitation frames.",
  },
  {
    week: "June W2",
    culturalMomentum: "Summer begins to shape behavior",
    editorialRole: "Position DemoClientD as a cool indoor refuge and social reset.",
    campaignMoments: ["Summer Reset at DemoClientD", "Cold Glass, Warm Room"],
    feedGuidance: "Increase cool-toned cocktail relief, blue interiors, chilled details, and atmosphere resets.",
    storyGuidance: "Build heat-to-table sequences: outside energy, arrival, first cold sip, lunch or dinner CTA.",
  },
  {
    week: "June W3",
    culturalMomentum: "DIFC work rhythm and weekday decompression",
    editorialRole: "Make lunch feel useful, emotional, and repeatable without becoming corporate.",
    campaignMoments: ["The DIFC Week Told Through Lunch", "The DemoClientD Table"],
    feedGuidance: "Balance lunch utility with social warmth: lifestyle, product proof, typography break, and table world-building.",
    storyGuidance: "Use weekday arcs: Monday reset, Tuesday proof, Wednesday comfort, Thursday social lift.",
  },
  {
    week: "June W4",
    culturalMomentum: "Late-month social lift",
    editorialRole: "Move from lunch comfort into evening atmosphere and cocktail ritual.",
    campaignMoments: ["Cold Glass, Warm Room", "Tonight at DemoClientD"],
    feedGuidance: "Add darker anchor posts, cocktail rituals, evening atmosphere, and one playful internet-culture reinterpretation.",
    storyGuidance: "Use golden hour, first round, table filling, and reservation nudges with restrained FOMO.",
  },
]


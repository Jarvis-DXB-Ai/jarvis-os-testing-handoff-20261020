"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { SIGNATURE_SYSTEMS, WEEKLY_EMOTIONAL_ARCS } from "@/lib/editorial-feed-intelligence"
import { supabase } from "@/lib/supabase"

type Client = {
  id: string
  name: string
  industry: string | null
  status: string
}

type BrandTab =
  | "core"
  | "audience"
  | "pillars"
  | "campaigns"
  | "storytelling"
  | "copywriting"
  | "visual"
  | "social"
  | "performance"
  | "memory"

type StrategyCard = {
  title: string
  subtitle?: string
  body?: string
  items: string[]
  tags?: string[]
}

type TabContent = {
  eyebrow: string
  title: string
  intro: string
  cards: StrategyCard[]
}

const TABS: Array<{ id: BrandTab; label: string }> = [
  { id: "core", label: "Brand Core" },
  { id: "audience", label: "Audience & Psychology" },
  { id: "pillars", label: "Content Pillars" },
  { id: "campaigns", label: "Campaign Systems" },
  { id: "storytelling", label: "Storytelling Systems" },
  { id: "copywriting", label: "Copywriting Systems" },
  { id: "visual", label: "Visual Identity" },
  { id: "social", label: "Social Strategy" },
  { id: "performance", label: "Performance Learnings" },
  { id: "memory", label: "Strategic Memory" },
]

const STRATEGY_CONTENT: Record<BrandTab, TabContent> = {
  core: {
    eyebrow: "Permanent Brand Truth",
    title: "Third Culture Hospitality, not a narrow corporate restaurant.",
    intro: "DemoClientD should feel globally welcoming, emotionally warm, culturally layered, luxurious but comfortable, and socially alive for internationally minded guests.",
    cards: [
      {
        title: "Core Positioning",
        subtitle: "What DemoClientD owns",
        body: "A Third Culture hospitality world where global references feel emotionally familiar rather than performative.",
        items: [
          "Third Culture Cuisine as the central strategic territory.",
          "Luxury hospitality without stiffness or distance.",
          "Emotional comfort through globally inspired food, service, and setting.",
          "DIFC relevance without reducing the brand to a corporate lunch venue.",
        ],
        tags: ["Third Culture", "global warmth", "premium comfort"],
      },
      {
        title: "Emotional Identity",
        subtitle: "What people should feel",
        items: [
          "Comfort, familiarity, nostalgia, warmth, sophistication, belonging, and curiosity.",
          "A sense of social home for internationally minded people.",
          "Discovery that still feels approachable and emotionally grounded.",
          "Refined hospitality that invites people in rather than asking them to perform status.",
        ],
        tags: ["belonging", "nostalgia", "warmth"],
      },
      {
        title: "Brand Personality",
        subtitle: "How the brand behaves",
        items: [
          "Cinematic, social, elevated, warm, modern, intelligent, worldly.",
          "Confident but not cold.",
          "Luxurious but never sterile.",
          "Cultured without becoming academic or inaccessible.",
        ],
        tags: ["cinematic", "worldly", "social"],
      },
      {
        title: "Experience Identity",
        subtitle: "How the venue should be remembered",
        items: [
          "Premium but welcoming.",
          "Luxurious but emotionally grounded.",
          "Social but refined.",
          "A place for business lunches, dinners, date nights, friends, travellers, and regulars to coexist naturally.",
        ],
        tags: ["hospitality", "comfort", "refinement"],
      },
      {
        title: "Brand Promise",
        subtitle: "Strategic line",
        body: "A globally inspired hospitality experience that feels emotionally familiar.",
        items: [
          "Every campaign, image, caption, reel, menu story, and design system should ladder back to this promise.",
          "If an idea feels cold, generic luxury, or purely corporate, it is off-position.",
        ],
        tags: ["promise", "consistency"],
      },
    ],
  },
  audience: {
    eyebrow: "Audience System",
    title: "Multiple communities, one warm global center.",
    intro: "DIFC professionals matter, but they are one major audience inside a wider hospitality world built around identity, social energy, culture, and comfort.",
    cards: [
      {
        title: "DIFC Professionals",
        subtitle: "Major target audience",
        items: [
          "Motivations: business lunch, after-work decompression, convenience, polish, reliable service.",
          "Emotional triggers: reset, reward, efficiency, recognition, social ease.",
          "Content types: lunch reels, quick menu explainers, polished table moments, after-work cocktail rituals.",
          "Ideal activations: Business Lunch, Traffic Hours, client dinners, private dining.",
          "Timing: weekdays, lunch decision windows, late afternoon, early evening.",
        ],
        tags: ["business lunch", "after-work", "DIFC"],
      },
      {
        title: "Expats / International Residents",
        subtitle: "Cultural belonging audience",
        items: [
          "Motivations: nostalgia, discovery, familiarity, cultural identity, places that feel like home.",
          "Emotional triggers: flavours with memory, cross-cultural references, comfort without borders.",
          "Content types: Third Culture food stories, service moments, table scenes, menu heritage notes.",
          "Ideal activations: dinner experience, breakfast, family-style menus, cultural specials.",
          "Conversion opportunities: regular dinner bookings, group meals, celebrations, repeat visits.",
        ],
        tags: ["nostalgia", "identity", "discovery"],
      },
      {
        title: "Luxury Social Crowd",
        subtitle: "Atmosphere and aesthetic audience",
        items: [
          "Motivations: atmosphere, cocktails, visual identity, status, social currency.",
          "Emotional triggers: cinematic lighting, premium interiors, elegant crowd energy, polished rituals.",
          "Content types: cocktail rituals, evening reels, date night scenes, grid-worthy table compositions.",
          "Ideal activations: cocktail nights, dinner, events, Traffic Hours, launches.",
          "Conversion opportunities: evening reservations, group tables, celebratory occasions.",
        ],
        tags: ["cocktails", "atmosphere", "status"],
      },
      {
        title: "Food-Led Guests",
        subtitle: "Culinary exploration audience",
        items: [
          "Motivations: craftsmanship, Michelin aspiration, plating, ingredient stories, culinary surprise.",
          "Emotional triggers: technique, texture, origin, chef intent, dish architecture.",
          "Content types: making-of reels, dish close-ups, menu story carousels, plating sequences.",
          "Ideal activations: new menu, chef story, restaurant week, tasting formats.",
          "Conversion opportunities: hero dish campaigns, product photography, reservation CTAs.",
        ],
        tags: ["craft", "food story", "menu"],
      },
    ],
  },
  pillars: {
    eyebrow: "Content Operating System",
    title: "Permanent pillars for every content decision.",
    intro: "Each pillar has a job: emotion, format, conversion, and memory. This keeps AI Photography, AI Videography, design, and social operations moving from the same strategic base.",
    cards: [
      {
        title: "Lifestyle Hospitality",
        items: [
          "Purpose: show DemoClientD as a lived social world, not just plates on a table.",
          "Emotional goal: belonging, ease, warmth, social aspiration.",
          "Visual style: guests engaged naturally, warm interiors, table energy, premium but relaxed.",
          "Formats: reels, story sequences, carousel moments, campaign stills.",
          "CTA: book the experience, join the table, make it your regular place.",
        ],
        tags: ["people", "warmth", "social"],
      },
      {
        title: "Food Storytelling",
        items: [
          "Purpose: make dishes memorable through culture, texture, craft, and comfort.",
          "Emotional goal: appetite, curiosity, recognition, trust.",
          "Visual style: product truth, sauce, garnish, plating, vessel, texture detail.",
          "Formats: dish reels, product photography, menu carousels, making-of stories.",
          "CTA: reserve for the dish, discover the menu, try the current special.",
        ],
        tags: ["food", "craft", "comfort"],
      },
      {
        title: "Cocktail Rituals",
        items: [
          "Purpose: turn drinks into social rituals and visual signatures.",
          "Emotional goal: anticipation, sophistication, play, evening energy.",
          "Visual style: glass truth, garnish detail, reflections, pour/shake/serve sequence.",
          "Formats: reels, stories, product stills, Traffic Hours content.",
          "CTA: come after work, start the night here, share a ritual.",
        ],
        tags: ["drinks", "ritual", "evening"],
      },
      {
        title: "Service & BTS",
        items: [
          "Purpose: prove hospitality standards and human craft.",
          "Emotional goal: trust, intimacy, care, premium restraint.",
          "Visual style: hands, pass, plating, napkins, cutlery, host details, chef details.",
          "Formats: stories, reels, making-of sequences, carousel details.",
          "CTA: see the care behind the experience.",
        ],
        tags: ["service", "craft", "BTS"],
      },
      {
        title: "Campaign Activations",
        items: [
          "Purpose: turn offers into recurring brand worlds instead of one-off announcements.",
          "Emotional goal: urgency, clarity, desire, habit formation.",
          "Visual style: consistent campaign palette, hero food/drink, setting, CTA hierarchy.",
          "Formats: reels, posts, stories, flyers, paid variants, highlight covers.",
          "CTA: book now, discover the offer, save/share the activation.",
        ],
        tags: ["offers", "activation", "CTA"],
      },
      {
        title: "Third Culture Stories",
        items: [
          "Purpose: make the brand idea tangible through dishes, people, references, and rituals.",
          "Emotional goal: identity, recognition, layered curiosity.",
          "Visual style: cultural cues through food and atmosphere, not costume or cliche.",
          "Formats: captions, chef notes, carousels, short reels, menu explainers.",
          "CTA: taste the story, come for familiar flavours in a new language.",
        ],
        tags: ["culture", "story", "identity"],
      },
      {
        title: "Atmosphere & Architecture",
        items: [
          "Purpose: make the venue itself a reason to visit.",
          "Emotional goal: atmosphere, arrival, luxury, social desire.",
          "Visual style: chandeliers, mirrors, tables, seating, architectural rhythm, warm reflections.",
          "Formats: venue reels, mood pieces, opening/closing shots, grid anchors.",
          "CTA: step into the room, reserve the setting, make it your evening backdrop.",
        ],
        tags: ["venue", "mood", "architecture"],
      },
    ],
  },
  campaigns: {
    eyebrow: "Reusable Campaign Intelligence",
    title: "Campaigns as systems, not one-time posts.",
    intro: "Every campaign framework stores objective, audience, visual DNA, story strategy, copy direction, cadence, CTA, and ideal links to photography, videography, Pinterest, and design.",
    cards: [
      {
        title: "Business Lunch",
        items: [
          "Objective: weekday consideration and repeat booking habit.",
          "Emotional positioning: premium reset for internationally minded professionals.",
          "Audience: DIFC professionals, client lunches, expat residents nearby.",
          "Visual DNA: bright refined interiors, efficient table composition, clean dishes, polished service.",
          "Content types: reels, carousels, menu posts, stories, booking reminders.",
          "Cadence: Mon-Thu emphasis, morning and pre-lunch decision windows.",
          "CTA: reserve lunch, bring a client, make the workday feel better.",
        ],
        tags: ["lunch", "weekday", "DIFC"],
      },
      {
        title: "Traffic Hours",
        items: [
          "Objective: after-work conversion and social frequency.",
          "Emotional positioning: the DIFC reset after the day, without losing brand warmth.",
          "Audience: professionals, cocktail crowd, social groups.",
          "Visual DNA: cocktails, three bites, evening light, table energy, bar ritual.",
          "Content types: reels, stories, offer posts, highlight updates.",
          "CTA: come after work, meet here, start the evening with DemoClientD.",
        ],
        tags: ["after-work", "cocktails", "bites"],
      },
      {
        title: "Dinner Experience",
        items: [
          "Objective: evening reservations and emotional brand depth.",
          "Emotional positioning: warm luxury, cultural layers, social belonging.",
          "Audience: expats, luxury social crowd, date night, food-led guests.",
          "Visual DNA: warmer interiors, polished guests, cocktails, mains, shared table moments.",
          "Content types: lifestyle reels, dinner carousels, atmosphere stories, hero dishes.",
          "CTA: book dinner, make it a night, bring your people.",
        ],
        tags: ["dinner", "social", "warm luxury"],
      },
      {
        title: "Breakfast",
        items: [
          "Objective: broaden daypart association and morning frequency.",
          "Emotional positioning: calm global comfort at the start of the day.",
          "Audience: residents, professionals, hotel-adjacent guests, food-led guests.",
          "Visual DNA: softer light, table details, coffee, breakfast studio shots, quiet premium service.",
          "Content types: morning reels, product photography, story menus, carousels.",
          "CTA: start the day here, meet before work, discover breakfast.",
        ],
        tags: ["breakfast", "morning", "comfort"],
      },
      {
        title: "Cocktail Nights",
        items: [
          "Objective: own evening ritual and social energy.",
          "Emotional positioning: refined but not stiff nightlife.",
          "Audience: luxury social crowd, after-work groups, date night.",
          "Visual DNA: glass truth, garnish, reflection, low light, hand movement, bar detail.",
          "Content types: drink reels, ritual stories, product stills, carousel pairings.",
          "CTA: start with a cocktail, stay for dinner, make it a ritual.",
        ],
        tags: ["cocktails", "night", "ritual"],
      },
      {
        title: "Events / Eid / Restaurant Week / New Menu / Making Of",
        items: [
          "Objective: create seasonal urgency while keeping permanent brand identity intact.",
          "Emotional positioning: celebration, cultural warmth, craft, discovery.",
          "Visual DNA: event-specific assets anchored by DemoClientD venue, food, and service truth.",
          "Content types: announcements, reels, stories, carousels, design templates, paid variants later.",
          "CTA: reserve, save the date, discover the special menu, follow the process.",
        ],
        tags: ["seasonal", "events", "making-of"],
      },
    ],
  },
  storytelling: {
    eyebrow: "Recurring Creative Concepts",
    title: "Story systems that can repeat without feeling repetitive.",
    intro: "These concepts become reusable content engines for reels, stories, captions, product photography briefs, and future video sequences.",
    cards: [
      {
        title: "Signature Systems Layer",
        subtitle: "Iconic recurring brand anchors",
        items: SIGNATURE_SYSTEMS.map(system => `${system.title}: ${system.emotionalTerritory}. Recurring motifs: ${system.motifs.slice(0, 3).join(", ")}.`),
        tags: ["signature systems", "brand memory", "editorial"],
      },
      {
        title: "The DIFC Reset",
        items: [
          "Purpose: turn lunch and after-work into emotional relief, not just convenience.",
          "Hooks: step out of the day, reset the table, after the meeting comes the ritual.",
          "Reel structure: workday pressure, arrival, table, first sip, shared dish, booking CTA.",
          "Audience response goal: make DemoClientD feel like the obvious next move.",
        ],
        tags: ["DIFC", "reset", "habit"],
      },
      {
        title: "Third Culture Plate",
        items: [
          "Purpose: explain global layers without over-explaining.",
          "Hooks: familiar, but not from one place; a dish with more than one passport.",
          "Flow: dish beauty, ingredient/cultural note, texture, guest reaction, CTA.",
          "Audience response goal: appetite plus identity recognition.",
        ],
        tags: ["food", "culture", "identity"],
      },
      {
        title: "What's on the pass",
        items: [
          "Purpose: show craft and pace behind the dining room.",
          "Hooks: tonight on the pass, before it reaches the table, the final detail.",
          "Flow: prep, plating, garnish, service handoff, hero reveal.",
          "Audience response goal: trust, appetite, premium craft.",
        ],
        tags: ["BTS", "chef", "service"],
      },
      {
        title: "Tonight at DemoClientD",
        items: [
          "Purpose: own the evening mood.",
          "Hooks: where tonight begins, a table for the people you choose, dinner with a pulse.",
          "Flow: arrival, room, cocktails, dish, shared smile, soft CTA.",
          "Audience response goal: make the venue feel socially magnetic.",
        ],
        tags: ["dinner", "atmosphere", "social"],
      },
      {
        title: "Made in-house / Cocktail Rituals / Comfort without borders / The DemoClientD Table",
        items: [
          "Purpose: create repeatable series around craft, drinks, hospitality, and belonging.",
          "Structure: strong visual hook, short craft detail, emotional payoff, simple CTA.",
          "Pacing: calm confidence, tactile details, warm ending, no over-produced corporate tone.",
          "Music direction later: warm cinematic, modern global, elegant but human.",
        ],
        tags: ["series", "ritual", "table"],
      },
    ],
  },
  copywriting: {
    eyebrow: "Voice and Caption Systems",
    title: "Copy frameworks that preserve warmth, culture, and commercial clarity.",
    intro: "Copy should feel intelligent and emotionally grounded. It should sell without sounding like generic luxury marketing.",
    cards: [
      {
        title: "Food Post Framework",
        subtitle: "Hook, culture, craft, CTA",
        items: [
          "1. Emotional hook: familiar, unexpected, comforting, or craving-led.",
          "2. Cultural identity: what world or memory the dish touches.",
          "3. Craft detail: sauce, texture, vessel, garnish, ingredient, technique.",
          "4. Experience CTA: reserve, discover, come for lunch, share the table.",
        ],
        tags: ["food", "caption", "CTA"],
      },
      {
        title: "Cocktail Framework",
        subtitle: "Ritual, sensory detail, social invitation",
        items: [
          "Open on the ritual: shake, pour, garnish, first sip.",
          "Name the sensory note: color, clarity, citrus, foam, spice, cold glass.",
          "Connect to moment: after work, before dinner, date night, Traffic Hours.",
          "Close with a simple invitation.",
        ],
        tags: ["drinks", "ritual", "social"],
      },
      {
        title: "Business Lunch Framework",
        subtitle: "Useful but not corporate",
        items: [
          "Lead with relief: a better pause, a sharper lunch, a table that works.",
          "Show practical value: timing, menu, setting, ease.",
          "Keep the tone polished and warm, not office jargon.",
          "CTA: reserve your lunch table or bring the meeting here.",
        ],
        tags: ["lunch", "professional", "warmth"],
      },
      {
        title: "Traffic Hours Framework",
        subtitle: "After-work social conversion",
        items: [
          "Open with the shift from day to evening.",
          "Show cocktail plus bite as a small ritual.",
          "Use language around reset, meeting, first round, and golden hour energy.",
          "CTA: join Traffic Hours, meet at DemoClientD, start here.",
        ],
        tags: ["after-work", "offer", "cocktail"],
      },
      {
        title: "Stories / Reels / Events / Luxury Captions",
        items: [
          "Stories: short, direct, sequence-led, one idea per frame.",
          "Reels: hook in first line, sensory middle, CTA or emotional payoff at end.",
          "Events: clear date, reason to care, atmosphere, booking path.",
          "Luxury captions: restrained, specific, sensory, never inflated with generic adjectives.",
        ],
        tags: ["stories", "reels", "events"],
      },
    ],
  },
  visual: {
    eyebrow: "Visual Strategy",
    title: "A visual identity that connects AI output, design, and real brand memory.",
    intro: "The visual system should feel cinematic, warm, premium, and culturally layered. Pinterest can inspire mood, but never override DemoClientD truth assets.",
    cards: [
      {
        title: "Visual DNA",
        items: [
          "Warm interior light, dark premium surfaces, brass/gold accents, blue/dark seating, mirrored atmosphere.",
          "Food and drinks should remain truthful, sharp, appetizing, and specific.",
          "People should feel emotionally present, warm, social, and natural.",
          "Luxury comes from detail, restraint, and composition, not cold polish.",
        ],
        tags: ["visual DNA", "warmth", "truth"],
      },
      {
        title: "Lighting and Composition",
        items: [
          "Lifestyle: cinematic, social, shallow focus allowed when faces and food stay clear.",
          "Product Photography: controlled editorial food/drink imagery, product truth first.",
          "Studio Shoots: technical object truth, full-object visibility, deep focus.",
          "Videography: ordered shots, start/end frame logic, continuity, warm atmosphere.",
        ],
        tags: ["photography", "videography", "composition"],
      },
      {
        title: "Color, Type, and Design Philosophy",
        items: [
          "Color: dark luxury base, warm metallics, deep blues, food-led natural color.",
          "Typography: editorial restraint, premium clarity, no noisy SaaS visual language.",
          "Design: clear hierarchy, negative space, campaign consistency, hospitality warmth.",
          "Recurring layouts: highlight covers, campaign announcement systems, menu/product cards.",
        ],
        tags: ["design", "palette", "layout"],
      },
      {
        title: "Pinterest and Future Design Memory",
        items: [
          "Pinterest moodboards control lighting, composition, mood, color, camera, and styling only.",
          "Pinterest never becomes venue, food, drink, model, or product truth.",
          "Future Figma design memory should connect approved layouts to campaign systems.",
          "Visual learnings should feed back into AI Photography, AI Videography, and Graphic Design.",
        ],
        tags: ["Pinterest", "Figma", "memory"],
      },
      {
        title: "Feed Choreography and Visual Memory",
        items: [
          "Treat the grid as a living editorial system with contrast, pacing, social warmth, product density, and atmosphere rhythm.",
          "Track recurring visual anchors: overhead table moments, warm lighting, chef hands, typography pauses, cocktail staging, social table framing.",
          `Weekly emotional arc: ${WEEKLY_EMOTIONAL_ARCS.map(arc => `${arc.weekday} ${arc.emotion}`).join(" / ")}.`,
          "Use world-building posts to deepen the emotional universe even when no direct CTA is required.",
        ],
        tags: ["feed rhythm", "memory anchors", "world-building"],
      },
    ],
  },
  social: {
    eyebrow: "Operational Social Plan",
    title: "Social strategy as a repeatable hospitality operating rhythm.",
    intro: "The plan keeps Instagram premium and alive while mirroring to Facebook where useful. Social Operations executes, but Brand Strategy decides why.",
    cards: [
      {
        title: "Core Cadence",
        items: [
          "20 feed posts per month.",
          "1 reel per week.",
          "1 commercial per month.",
          "2-5 story frames per day.",
          "Facebook mirrors Instagram unless a platform-specific reason exists.",
        ],
        tags: ["cadence", "Instagram", "Facebook"],
      },
      {
        title: "Instagram Role",
        items: [
          "Primary public brand stage.",
          "Grid proves premium quality and cultural identity.",
          "Reels build reach, emotion, and storytelling.",
          "Stories build daily rhythm, urgency, and conversion.",
          "Highlights organize offers, food, drinks, business lunch, Traffic Hours, events, location, and menu.",
        ],
        tags: ["Instagram", "grid", "stories"],
      },
      {
        title: "Monthly Content Mix",
        items: [
          "Lifestyle hospitality: people, table, atmosphere, social warmth.",
          "Food storytelling: dish truth, making-of, product photography, menu stories.",
          "Cocktail rituals: Traffic Hours, evening, pour/shake/garnish, glass truth.",
          "Campaign activations: business lunch, dinner, restaurant week, seasonal, events.",
          "Architecture/atmosphere: venue anchors that make the brand world recognizable.",
        ],
        tags: ["content mix", "feed", "reels"],
      },
      {
        title: "Commercial Rhythm",
        items: [
          "Commercial cadence should feel integrated into hospitality, not bolted on.",
          "Offer posts need clear CTA, visual hierarchy, and emotional reason to care.",
          "Campaigns should reuse systems so the audience learns the rhythm.",
          "Story cadence should support bookings without turning the account into a flyer board.",
        ],
        tags: ["commercial", "CTA", "bookings"],
      },
    ],
  },
  performance: {
    eyebrow: "Strategy Optimization Memory",
    title: "Live performance should teach Jarvis what to repeat, sharpen, and retire.",
    intro: "This tab prepares the bridge from Social Intelligence into content and campaign decisions. It should only store learnings supported by real analytics or Calvin-approved strategy notes.",
    cards: [
      {
        title: "Top Performing Concepts",
        items: [
          "Track concepts by reach, saves, shares, comments, profile actions, and booking intent where available.",
          "Compare cocktail rituals, food storytelling, lifestyle hospitality, and campaign activations.",
          "Do not invent winners when analytics history is too shallow.",
        ],
        tags: ["analytics", "concepts"],
      },
      {
        title: "Strongest Hooks and Formats",
        items: [
          "Store hooks that repeatedly earn attention.",
          "Identify reel pacing, carousel structures, story CTA formats, and product photo styles that perform.",
          "Feed proven structures back into AI Photography, AI Videography, Copywriting Systems, and Social Operations.",
        ],
        tags: ["hooks", "formats", "feedback loop"],
      },
      {
        title: "Campaign and Visual Learnings",
        items: [
          "Track which campaigns build awareness, which drive saves, and which generate conversion signals.",
          "Store winning visual themes: lighting, product type, people presence, venue zones, and color mood.",
          "Flag weak concepts so they are not repeated by default.",
        ],
        tags: ["campaigns", "visuals", "learning"],
      },
      {
        title: "Readiness State",
        items: [
          "Connect to Social Operations Performance Intelligence for live analytics.",
          "Show 'more analytics history required' when confidence is low.",
          "Future: connect generated asset metadata to post performance by food, drink, model, venue, format, and campaign.",
        ],
        tags: ["future", "Social Intelligence"],
      },
    ],
  },
  memory: {
    eyebrow: "Long-Term Strategic Memory",
    title: "The place where Jarvis remembers what the brand is learning.",
    intro: "Strategic Memory is future infrastructure for campaign learnings, audience observations, visual evolution, competitor signals, and hospitality trends.",
    cards: [
      {
        title: "Recurring Insights",
        items: [
          "Audience observations and emotional triggers that repeat across campaigns.",
          "Menu, drink, venue, and service ideas that keep resonating.",
          "Social patterns that should influence planning before content is generated.",
        ],
        tags: ["insights", "audience"],
      },
      {
        title: "Successful and Failed Concepts",
        items: [
          "Store recurring successful concepts with reason, proof, and examples.",
          "Store failed concepts so Jarvis avoids repeating weak ideas.",
          "Separate taste notes from analytics-backed learnings.",
        ],
        tags: ["success", "failure", "proof"],
      },
      {
        title: "Visual Evolution",
        items: [
          "Track how the brand's visual language matures over time.",
          "Store approved campaign looks, Pinterest references, AI outputs, and design patterns.",
          "Note when a visual direction starts feeling too generic, too cold, or too corporate.",
        ],
        tags: ["visuals", "evolution"],
      },
      {
        title: "Competitors and Hospitality Trends",
        items: [
          "Capture competitor observations without copying their tone or identity.",
          "Track hospitality trends that matter for Dubai, DIFC, expats, and luxury social audiences.",
          "Turn observations into strategic prompts for future campaigns and content systems.",
        ],
        tags: ["competitors", "trends"],
      },
    ],
  },
}

const INTEGRATION_CARDS = [
  ["AI Photography", "Turns positioning, pillars, and campaign systems into still image prompts and truth-aware references."],
  ["AI Videography", "Turns storytelling systems into 5-shot plans, keyframes, and future animation direction."],
  ["Social Operations", "Executes calendar, queue, engagement, analytics, and read-only intelligence loops."],
  ["Pinterest", "Supplies mood, lighting, composition, color, camera, and styling inspiration only."],
  ["Graphic Design", "Future workspace for campaign templates, layouts, highlight systems, and design memory."],
]

export default function BrandStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<BrandTab>("core")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: clientError } = await supabase.from("clients").select("id,name,industry,status").eq("id", id).single()
    if (clientError) setError(clientError.message)
    else setClient(data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const activeContent = useMemo(() => STRATEGY_CONTENT[activeTab], [activeTab])

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <div className="animate-pulse space-y-4">
              <div className="h-3 w-28 rounded bg-white/10" />
              <div className="h-10 w-72 rounded bg-white/10" />
              <div className="h-40 rounded-[2rem] bg-white/[0.04]" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !client) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <p className="text-red-300">{error || "Client not found."}</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-[#020403] text-white">
      <Sidebar />
      <section className="jarvis-dark-shell">
        <div className="jarvis-page">
          <Link href={`/clients/${id}`} className="text-sm text-white/45 transition hover:text-white">&lt;- Back to client</Link>

          <section className="jarvis-hero mt-5 overflow-hidden">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <p className="jarvis-eyebrow">Brand Strategy Infrastructure</p>
                <h1 className="jarvis-title mt-3">{client.name} Brand Strategy</h1>
                <p className="jarvis-copy mt-5 max-w-3xl">
                  The strategic brain for positioning, emotional identity, campaign systems, audience psychology,
                  creative direction, storytelling, design, photography, videography, and social operations.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5 xl:w-[340px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Strategic guardrail</p>
                <p className="mt-3 text-lg font-semibold text-white">Third Culture Hospitality</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  DIFC professionals are a major audience, not the whole identity. DemoClientD stays globally welcoming,
                  warm, culturally layered, luxurious, and comfortable.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-black/25 p-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "bg-emerald-400 text-[#07110c] shadow-[0_0_24px_rgba(52,211,153,0.25)]" : "text-white/45 hover:bg-white/[0.045] hover:text-white/80"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-6">
              <div className="jarvis-panel">
                <p className="jarvis-eyebrow">{activeContent.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">{activeContent.title}</h2>
                <p className="mt-4 max-w-4xl text-sm leading-relaxed text-white/52">{activeContent.intro}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {activeContent.cards.map(card => <StrategyCardView key={card.title} card={card} />)}
              </div>
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Workspace Role</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Strategic consistency layer</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  This page stores the why. Execution workspaces use it to keep outputs emotionally consistent,
                  culturally grounded, and campaign-aware.
                </p>
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Future Integrations</p>
                <div className="mt-4 space-y-3">
                  {INTEGRATION_CARDS.map(([title, detail]) => (
                    <div key={title} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/42">{detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Current state</p>
                <p className="mt-3 text-sm leading-relaxed text-white/52">
                  Structured strategy workspace only. No posting, scheduling, paid media, or destructive actions.
                </p>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function StrategyCardView({ card }: { card: StrategyCard }) {
  return (
    <article className="jarvis-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-white">{card.title}</h3>
          {card.subtitle && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/55">{card.subtitle}</p>}
        </div>
        {card.tags && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {card.tags.slice(0, 3).map(tag => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold text-white/42">{tag}</span>
            ))}
          </div>
        )}
      </div>
      {card.body && <p className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] px-4 py-3 text-sm leading-relaxed text-emerald-50/78">{card.body}</p>}
      <ul className="mt-5 space-y-3">
        {card.items.map(item => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/55">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300/75" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

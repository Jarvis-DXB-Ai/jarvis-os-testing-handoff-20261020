export const GENERATION_MISTAKE_OPTIONS = [
  "venue wrong",
  "venue invention",
  "invented architecture",
  "invented bar",
  "invented window",
  "venue camera drift",
  "venue perspective drift",
  "invented room depth",
  "match locked venue drift",
  "match locked perspective drift",
  "match locked invented background",
  "match locked room restructure",
  "invented second guest",
  "action ignored",
  "gaze direction ignored",
  "object interaction ignored",
  "facial realism issue",
  "unrealistic teeth",
  "distorted smile geometry",
  "model wrong",
  "food wrong",
  "venue table material wrong",
  "food truth reinterpreted",
  "too much cutlery",
  "venue table invented",
  "architecture changed",
  "furniture changed",
  "chair wrong",
  "lighting wrong",
  "food identity inaccurate",
  "bread inaccurate",
  "model outfit drift",
  "accessory drift",
  "unwanted new props",
  "angle wrong",
  "wrong camera angle",
] as const

export type GenerationMistakeKey = typeof GENERATION_MISTAKE_OPTIONS[number]

const MISTAKE_CORRECTIONS: Record<GenerationMistakeKey, string> = {
  "venue wrong": "Previous generation created a different restaurant. This is forbidden. Venue image is primary truth; do not recreate the venue from text.",
  "venue invention": "Previous generation invented venue elements not visible in the selected reference. Use only visible venue image reality.",
  "invented architecture": "Previous generation invented or changed architecture. Prefer the venue image; text only clarifies visible details.",
  "invented bar": "Previous generation invented a bar/background bar structure. Do not add bars or shelving unless visible in the venue image.",
  "invented window": "Previous generation invented windows or exterior openings. Do not add windows or openings unless visible in the venue image.",
  "venue camera drift": "Previous generation drifted from the selected venue camera reality. Preserve the source image camera family and visible view; minor crop only.",
  "venue perspective drift": "Previous generation changed the venue perspective. Keep the selected venue image as the visual authority; no unsupported new angle.",
  "invented room depth": "Previous generation invented additional room depth or room sections. Do not reveal areas not visible in the selected venue image.",
  "match locked venue drift": "Previous Match Locked generation drifted from the selected venue. Venue image preservation is the #1 priority; foreground additions only.",
  "match locked perspective drift": "Previous Match Locked generation changed perspective. Preserve the source image camera family and visible view; no unsupported new angle.",
  "match locked invented background": "Previous Match Locked generation invented background zones. Do not invent unseen venue areas; image wins over text.",
  "match locked room restructure": "Previous Match Locked generation restructured the room. Do not redesign from text; add selected subjects/items inside the image reality.",
  "invented second guest": "Previous generation added an unselected conversation partner or extra person. Subject count is locked: show only the selected model(s), no extra diners, extra hands, or implied guest across the table.",
  "action ignored": "Previous generation ignored the requested action/pose. Director action notes are binding: preserve specified gaze, smile, hand/object interaction, body orientation, and primary subject hierarchy.",
  "gaze direction ignored": "Previous generation ignored gaze direction. If the director note requests direct eye contact, the selected model must look directly into camera.",
  "object interaction ignored": "Previous generation ignored object interaction. If the director note says the model holds or interacts with a selected drink/object, show that selected object visibly in the correct interaction.",
  "facial realism issue": "Previous generation had facial realism problems. Preserve natural facial anatomy, realistic smile, realistic gumline, believable mouth geometry, and human skin detail without plastic beauty retouching.",
  "unrealistic teeth": "Previous generation produced unrealistic teeth. Use natural dental anatomy: no duplicated teeth, synthetic teeth, excessive AI whitening, warped gumline, or distorted tooth spacing.",
  "distorted smile geometry": "Previous generation distorted the smile or mouth geometry. Keep lips, teeth, gumline, jaw, and cheek tension anatomically believable and natural.",
  "model wrong": "Previous generation did not preserve the selected model identity. Preserve portrait identity references and do not substitute faces.",
  "food wrong": "Previous generation made selected food or drinks inaccurate. Preserve selected food/drink truth references exactly.",
  "venue table material wrong": "Previous generation replaced the real venue table material with a generic tabletop. Preserve the exact table material, finish, color, texture, reflection behavior, and trim visible in venue truth. Use black marble only when black marble is visible in the selected venue image; for DemoClientB, preserve mirrored/reflective glass tabletop quality and red/burgundy tones as reflections from curtains/surroundings, not red lacquer table material.",
  "food truth reinterpreted": "Previous generation reinterpreted a selected food truth asset. Recreate the exact selected Studio Food Shot as the actual dish: preserve ingredients, bread type, vessel, garnish, arrangement, portion, and presentation. Do not make inspired-by, similar-to, or improvised versions.",
  "too much cutlery": "Previous generation created too much cutlery. For seated guests, use exactly 1 fork and 1 knife per guest unless explicitly requested otherwise. Do not create duplicate forks, duplicate knives, extra place settings, or unnecessary cutlery.",
  "venue table invented": "Previous generation invented a new table. This is forbidden. Preserve selected table placement and all venue furniture from the scene plate.",
  "architecture changed": "Previous generation altered the architecture/interior. This is forbidden. Preserve the selected venue architecture exactly.",
  "furniture changed": "Previous generation changed furniture. Preserve chairs, tables, booths, fixtures, and material finishes from the selected scene plate.",
  "chair wrong": "Previous generation changed chair design or placement. Preserve the selected venue chair family, material, color, placement, and scale.",
  "lighting wrong": "Previous generation changed venue lighting. Preserve visible source lighting, fixtures, reflections, and lighting direction.",
  "food identity inaccurate": "Previous generation made selected food inaccurate. Preserve dish identity, plating, portion logic, garnish, sauce, and structure exactly.",
  "bread inaccurate": "Previous generation made bread inaccurate. If a bread reference is selected, preserve the exact bread type, shape, scoring, crust, color, and arrangement.",
  "model outfit drift": "Previous generation drifted from selected outfits. Preserve selected clothing silhouette, color, fabric, and fit.",
  "accessory drift": "Previous generation drifted from selected accessories. Preserve owner-bound accessories 1:1 and do not swap them.",
  "unwanted new props": "Previous generation added unrequested props. Do not add extra objects, decor, props, plates, cutlery, or styling unless requested.",
  "angle wrong": "Previous generation used a wrong camera angle. Preserve the same source camera angle and lens perspective.",
  "wrong camera angle": "Previous generation changed camera angle. Preserve the source image camera angle and lens perspective.",
}

const LEGACY_LABEL_MAP: Record<string, GenerationMistakeKey[]> = {
  "table invented": ["venue table invented", "furniture changed"],
  "generic black table": ["venue table material wrong"],
  "black marble wrong": ["venue table material wrong"],
  "food reinterpreted": ["food truth reinterpreted", "food identity inaccurate"],
  "too much cutlery": ["too much cutlery"],
  "duplicate cutlery": ["too much cutlery"],
  "venue drift": ["architecture changed", "furniture changed"],
  "venue invention": ["venue invention"],
  "invented architecture": ["invented architecture"],
  "invented bar": ["invented bar"],
  "invented window": ["invented window"],
  "venue camera drift": ["venue camera drift"],
  "camera reality drift": ["venue camera drift"],
  "venue perspective drift": ["venue perspective drift"],
  "perspective drift": ["venue perspective drift"],
  "invented room depth": ["invented room depth"],
  "room depth": ["invented room depth"],
  "match locked venue drift": ["match locked venue drift"],
  "match locked perspective drift": ["match locked perspective drift"],
  "match locked invented background": ["match locked invented background"],
  "match locked room restructure": ["match locked room restructure"],
  "invented second guest": ["invented second guest"],
  "action ignored": ["action ignored"],
  "gaze direction ignored": ["gaze direction ignored"],
  "object interaction ignored": ["object interaction ignored"],
  "facial realism issue": ["facial realism issue"],
  "unrealistic teeth": ["unrealistic teeth"],
  "distorted smile geometry": ["distorted smile geometry"],
  "venue wrong": ["venue wrong"],
  "model wrong": ["model wrong"],
  "food wrong": ["food wrong"],
  "chair wrong": ["chair wrong"],
  "lighting wrong": ["lighting wrong"],
  "angle wrong": ["wrong camera angle"],
  "food misplaced": ["food identity inaccurate"],
  "food soft": ["food identity inaccurate"],
  "watch wrong": ["accessory drift"],
  "seating mismatch": ["furniture changed"],
}

export function normalizeGenerationMistakeLabels(labels: string[]) {
  const normalized = new Set<GenerationMistakeKey>()
  labels.forEach(label => {
    if ((GENERATION_MISTAKE_OPTIONS as readonly string[]).includes(label)) {
      normalized.add(label as GenerationMistakeKey)
      return
    }
    LEGACY_LABEL_MAP[label]?.forEach(mapped => normalized.add(mapped))
  })
  return Array.from(normalized)
}

export function inferMistakesFromNotes(notes: string) {
  const text = notes.toLowerCase()
  const inferred = new Set<GenerationMistakeKey>()
  if (/invent(ed)? (a )?(new )?table|wrong table|original table|table geometry/.test(text)) inferred.add("venue table invented")
  if (/generic (black|dark) table|matte black table|black marble|table material|tabletop material|wrong tabletop|dark tabletop/.test(text)) inferred.add("venue table material wrong")
  if (/wrong venue|different restaurant|venue became|venue changed/.test(text)) inferred.add("venue wrong")
  if (/invent(ed)? .*venue|invent(ed)? .*background|not visible in (the )?(venue|reference)|unseen/.test(text)) inferred.add("venue invention")
  if (/invent(ed)? .*architecture|fake architecture|new architecture|unsupported architecture/.test(text)) inferred.add("invented architecture")
  if (/invent(ed)? .*bar|fake bar|new bar|background bar|back[- ]?bar|shelving/.test(text)) inferred.add("invented bar")
  if (/invent(ed)? .*window|fake window|new window|unrelated window/.test(text)) inferred.add("invented window")
  if (/camera reality|camera drift|venue camera|room proportions|ceiling proportions|furniture spacing|table placement/.test(text)) inferred.add("venue camera drift")
  if (/perspective drift|wrong perspective|changed perspective|rotate(d)? (the )?room|room rotation|camera angle drift/.test(text)) inferred.add("venue perspective drift")
  if (/invent(ed)? .*room depth|new room depth|extra room|room sections?|additional venue zones?|revealed .*not visible/.test(text)) inferred.add("invented room depth")
  if (/match locked.*venue drift|match locked.*different|match locked.*not close/.test(text)) inferred.add("match locked venue drift")
  if (/match locked.*perspective|match locked.*camera|match locked.*angle/.test(text)) inferred.add("match locked perspective drift")
  if (/match locked.*invent(ed)? .*background|match locked.*unseen|match locked.*new background/.test(text)) inferred.add("match locked invented background")
  if (/match locked.*restructure|match locked.*redesign|match locked.*room/.test(text)) inferred.add("match locked room restructure")
  if (/second guest|extra guest|conversation partner|extra diner|extra person|extra hands|implied guest/.test(text)) inferred.add("invented second guest")
  if (/action ignored|ignored action|pose ignored|did not hold|not holding|hand interaction/.test(text)) inferred.add("action ignored")
  if (/gaze|eye contact|look(ed)? (at|into) camera|not looking/.test(text)) inferred.add("gaze direction ignored")
  if (/object interaction|holding|hold the|picked up|picking up|cocktail holding|drink holding/.test(text)) inferred.add("object interaction ignored")
  if (/facial realism|fake face|plastic face|mouth|smile/.test(text)) inferred.add("facial realism issue")
  if (/teeth|tooth|dental|gumline|ai whitening|synthetic teeth|duplicated teeth/.test(text)) inferred.add("unrealistic teeth")
  if (/distorted smile|warped smile|mouth geometry|warped lips|distorted mouth/.test(text)) inferred.add("distorted smile geometry")
  if (/model wrong|wrong model|face wrong|identity/.test(text)) inferred.add("model wrong")
  if (/food wrong|drink wrong/.test(text)) inferred.add("food wrong")
  if (/reinterpret|reinterpreted|similar dish|similar bread|improvised|inspired by|not the actual dish|not recreated|did not recreate/.test(text)) inferred.add("food truth reinterpreted")
  if (/too much cutlery|duplicate (fork|knife|cutlery)|extra (fork|knife|cutlery|place setting)|unnecessary cutlery/.test(text)) inferred.add("too much cutlery")
  if (/architecture|interior|venue drift|different restaurant|walls?|ceiling|floor|chandelier/.test(text)) inferred.add("architecture changed")
  if (/furniture|chairs?|booths?|fixtures?/.test(text)) inferred.add("furniture changed")
  if (/chair/.test(text)) inferred.add("chair wrong")
  if (/lighting|light source|fixtures?|chandelier/.test(text)) inferred.add("lighting wrong")
  if (/food|dish|plate|plating|garnish|sauce/.test(text)) inferred.add("food identity inaccurate")
  if (/bread|bun|toast|loaf|pita|flatbread/.test(text)) inferred.add("bread inaccurate")
  if (/outfit|wardrobe|clothing|dress|suit/.test(text)) inferred.add("model outfit drift")
  if (/watch|ring|accessor/.test(text)) inferred.add("accessory drift")
  if (/prop|extra object|random object|unrequested/.test(text)) inferred.add("unwanted new props")
  if (/camera angle|angle|perspective|framing/.test(text)) inferred.add("wrong camera angle")
  return Array.from(inferred)
}

export const PROMPT_V2_PERMANENT_FAILURE_LINES = [
  "Venue truth compliance: Preserve the exact table material visible in venue truth. Use black marble only when black marble is visible in the selected venue image; otherwise preserve the actual visible table material, finish, color, texture, trim, and tablecloth layer.",
  "DemoClientB venue truth: when DemoClientB venue references are selected, preserve deep red curtains, cream/beige seating, mirrored/reflective glass tabletops, brass detailing, Italian ceramic/oil bottle table styling, and warm hospitality lighting. Red/burgundy table tones are reflections from curtains/surroundings, not red lacquer table material. Do not replace DemoClientB tables with black marble, red lacquer, or chairs with blue seating unless the selected image visibly shows them.",
  "Food truth compliance: Selected Studio Food Shots are Food Truth Assets. Recreate the exact selected food truth asset, preserving ingredients, bread type, vessel, garnish, arrangement, portion, and presentation. Do not create inspired-by, similar-to, or reinterpreted versions.",
  "Hospitality table setup: For seated guests, each guest receives exactly 1 fork and 1 knife unless explicitly requested otherwise. Do not generate duplicate forks, duplicate knives, extra place settings, or unnecessary cutlery.",
  "Visual truth priority: selected venue image is primary truth. Do not recreate or redesign the venue from text; text only clarifies visible details and the image wins conflicts.",
  "Guided venue reality: In Guided mode, use only venue elements visible in the selected image. Do not invent unseen venue areas or rebuild the venue from text.",
  "Camera reality lock: Preserve the selected venue image camera family and visible view. Minor crop only; no unsupported angle or new room sections.",
  "Match Locked venue fidelity: In Match Locked mode, venue image preservation is the #1 priority. Foreground additions only.",
  "Subject/action continuity: The selected subject count, gaze direction, smile/expression, and object interactions from Creative Director Notes are binding. Do not add unselected guests or ignore specified holding/looking actions.",
  "Facial realism: Smiles must use natural dental anatomy, realistic gumline, believable teeth spacing, and natural mouth geometry. Do not create duplicated teeth, synthetic teeth, AI whitening, or distorted smiles.",
  "Food/drink visibility: Selected food and drink truth assets must remain visible, recognizable, assigned as requested, and not reinterpreted or hidden.",
]

export function buildPermanentPromptV2LearningBlock() {
  return `[PROMPT_V2_PERMANENT_LEARNINGS]\n${PROMPT_V2_PERMANENT_FAILURE_LINES.map(line => `- ${line}`).join("\n")}`
}

export function buildPastFailureCorrectionBlock({
  labels,
  notes,
}: {
  labels: string[]
  notes: string
}) {
  const mistakes = Array.from(new Set([
    ...normalizeGenerationMistakeLabels(labels),
    ...inferMistakesFromNotes(notes),
  ]))
  if (mistakes.length === 0) return ""
  return `[PAST_FAILURE_CORRECTIONS]\n${mistakes.map(mistake => MISTAKE_CORRECTIONS[mistake]).join("\n")}\nDo not repeat these mistakes.`
}

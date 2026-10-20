export const DEMOCLIENTB_CLIENT_ID = "344da257-e4ec-548c-b3b8-959b3af8d001"

export function isDemoClientBClient(input: { clientId?: string | null; clientName?: string | null } | string | null | undefined) {
  if (!input) return false
  if (typeof input === "string") {
    const normalized = input.toLowerCase()
    return input === DEMOCLIENTB_CLIENT_ID || normalized.includes("democlientb") || normalized.includes("luna rossa")
  }
  const normalizedName = (input.clientName ?? "").toLowerCase()
  return input.clientId === DEMOCLIENTB_CLIENT_ID || normalizedName.includes("democlientb") || normalizedName.includes("luna rossa")
}

export const DEMOCLIENTB_VENUE_MEMORY_LINES = [
  "DemoClientB venue image truth is the highest visual priority whenever a venue reference is selected.",
  "Deep red dramatic curtains are a primary DemoClientB visual identifier; preserve visible color, scale, drape, and fabric texture.",
  "Visible DemoClientB table truth is a mirrored / reflective glass tabletop; the reflective surface can catch red or burgundy tones from curtains and surroundings, but the table itself is not red lacquer.",
  "Do not force red table material, red lacquer, black marble, generic dark tables, or matte black tables for DemoClientB when the selected venue image shows reflective glass/mirror table quality.",
  "Visible DemoClientB chair truth uses cream / beige rounded upholstery with black metal legs; do not invent blue chairs unless they are visible in the selected image.",
  "Preserve visible table styling: white napkins, Italian ceramic/oil bottle style, glassware, table spacing, and seating density.",
  "Preserve warm hospitality lighting, visible artwork, brass detailing, and Southern Italian dining atmosphere from the selected venue image.",
]

export function buildDemoClientBVenueLockBlock(input: {
  clientId?: string | null
  clientName?: string | null
  hasVenueReference: boolean
}) {
  if (!input.hasVenueReference || !isDemoClientBClient(input)) return ""
  return `[DEMOCLIENTB_VENUE_LOCK]
- Venue Image Truth is priority #1 for DemoClientB.
- Hierarchy: 1 Venue Image Truth, 2 Food Truth, 3 Character DNA, 4 Outfit DNA, 5 Creative Direction Text.
- Preserve all visible venue design elements exactly as shown in the selected venue image.
- Curtains: if visible, preserve deep red dramatic curtain color, scale, draping, and texture. Do not replace with generic curtains.
- Tables: if visible, preserve mirrored / reflective glass tabletop quality, reflective highlights, and red/burgundy tones only as reflections from curtains/surroundings. Do not describe or render the table itself as red lacquer.
- Table material negative: do not force red table material, burgundy lacquer, black marble, generic dark table, matte black table, or painted black table when the venue image shows reflective mirror/glass table quality.
- Table trim/layering: preserve visible brass/gold trim and white tablecloth layer when present.
- Chairs: if visible, preserve cream/beige rounded upholstery, rounded silhouette, and black metal legs. Do not invent blue chairs unless the selected venue image visibly has blue chairs.
- Table styling: preserve white napkins, Italian ceramic/oil bottle style, glassware, spacing, and seating density from the selected image.
- Lighting/artwork: preserve visible lighting fixtures, warm hospitality lighting, brass detailing, and visible artwork.
- Do not reinterpret these elements. If text and image conflict, the selected venue image wins.`
}

export function buildDemoClientBVenueMemoryBlock(input: {
  clientId?: string | null
  clientName?: string | null
  hasVenueReference: boolean
}) {
  if (!input.hasVenueReference || !isDemoClientBClient(input)) return ""
  return `[DEMOCLIENTB_VENUE_MEMORY]
${DEMOCLIENTB_VENUE_MEMORY_LINES.map(line => `- ${line}`).join("\n")}`
}

export function buildDemoClientBVenueScaleLockBlock(input: {
  clientId?: string | null
  clientName?: string | null
  hasVenueReference: boolean
}) {
  if (!input.hasVenueReference || !isDemoClientBClient(input)) return ""
  return `[VENUE_SCALE_LOCK]
- table => no resize/shrink/replace
- preserve => exact visible DemoClientB table material, reflective mirror/glass finish, reflected curtain tones, trim, tablecloth layer, guest distance, and chair scale
- if venue truth shows red/burgundy tones on the table => treat them as reflections on mirrored/glass tabletop, not red lacquer material
- do not force red table material, burgundy lacquer, black marble, generic dark tabletop, or matte black tabletop
- if venue truth shows brass/gold trim => preserve trim/edge detail
- chairs => preserve cream/beige rounded upholstery and black metal legs when visible; no blue-chair substitution`
}

export type SubjectPlacement = {
  subject: string
  position: "left" | "right" | "front" | "back"
}

const SUBJECT_PLACEMENT_POSITIONS = ["left", "right", "front", "back"] as const
const SUBJECT_ALIAS_STOPWORDS = new Set(["image", "table", "scene", "side", "front", "back", "left", "right", "of", "the"])

function normalizeSubjectName(value: string) {
  return value
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function subjectAliasCandidates(value: string) {
  const normalized = normalizeSubjectName(value)
  if (!normalized) return []
  const candidates = [normalized]
  const firstToken = normalized.split(" ")[0]
  if (firstToken && firstToken.length > 1 && !SUBJECT_ALIAS_STOPWORDS.has(firstToken.toLowerCase())) {
    candidates.push(firstToken)
  }
  return Array.from(new Set(candidates))
}

function addPlacement(
  placements: Map<string, SubjectPlacement>,
  subject: string,
  position: SubjectPlacement["position"],
) {
  const normalizedSubject = normalizeSubjectName(subject)
  if (!normalizedSubject) return
  const key = normalizedSubject.toLowerCase()
  if (!placements.has(key)) placements.set(key, { subject: normalizedSubject, position })
}

export function extractSubjectPlacementsFromText(text: string, selectedSubjectNames: string[] = []) {
  const placements = new Map<string, SubjectPlacement>()
  const segments = text
    .replace(/\[[A-Z_]+\]/g, " ")
    .split(/[.;\n]+/)
    .map(segment => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (segments.length === 0) return []

  const selectedSubjects = selectedSubjectNames
    .map(name => {
      const aliases = subjectAliasCandidates(name)
      return { label: aliases[1] ?? aliases[0] ?? "", aliases }
    })
    .filter(subject => subject.label && subject.aliases.length > 0)
  const selectedAliasKeys = new Set(selectedSubjects.flatMap(subject => subject.aliases.map(alias => alias.toLowerCase())))
  const subjectIsAllowed = (subject: string) => selectedAliasKeys.size === 0 || selectedAliasKeys.has(normalizeSubjectName(subject).toLowerCase())

  for (const subject of selectedSubjects) {
    for (const position of SUBJECT_PLACEMENT_POSITIONS) {
      const aliasPattern = subject.aliases
        .map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")
      const patterns = [
        new RegExp(`\\b(?:${aliasPattern})\\b[^.]{0,80}\\b(?:on|at|to|toward)?\\s*(?:the\\s*)?${position}\\b`, "i"),
        new RegExp(`\\b${position}\\b[^.]{0,80}\\b(?:${aliasPattern})\\b`, "i"),
      ]
      if (segments.some(segment => patterns.some(pattern => pattern.test(segment)))) {
        addPlacement(placements, subject.label, position)
      }
    }
  }

  const nameFirstPattern = /\b([A-Z][A-Za-z'-]{1,32})\b[^.;\n]{0,80}\b(?:sits?|seated|stands?|positioned|placed|is|on|at|to|toward)\b[^.;\n]{0,40}\b(left|right|front|back)\b/gi
  for (const segment of segments) {
    let nameFirstMatch: RegExpExecArray | null
    nameFirstPattern.lastIndex = 0
    while ((nameFirstMatch = nameFirstPattern.exec(segment))) {
      if (subjectIsAllowed(nameFirstMatch[1])) {
        addPlacement(placements, nameFirstMatch[1], nameFirstMatch[2].toLowerCase() as SubjectPlacement["position"])
      }
    }
  }

  const positionFirstPattern = /\b(left|right|front|back)\b(?:\s+side)?(?:\s+of\s+(?:the\s+)?(?:image|frame|table|scene))?\s*(?:[:=,-]|is|should be|with)?\s*\b([A-Z][A-Za-z'-]{1,32})\b/gi
  for (const segment of segments) {
    let positionFirstMatch: RegExpExecArray | null
    positionFirstPattern.lastIndex = 0
    while ((positionFirstMatch = positionFirstPattern.exec(segment))) {
      if (subjectIsAllowed(positionFirstMatch[2])) {
        addPlacement(placements, positionFirstMatch[2], positionFirstMatch[1].toLowerCase() as SubjectPlacement["position"])
      }
    }
  }

  return Array.from(placements.values())
}

export function buildSubjectPlacementLockBlock(input: {
  notes?: string | null
  selectedSubjectNames?: string[]
  hasSubjects: boolean
}) {
  if (!input.hasSubjects) return ""
  const placements = extractSubjectPlacementsFromText(input.notes ?? "", input.selectedSubjectNames ?? [])
  const explicitPlacementLines = placements.map(placement => {
    const sideLabel = placement.position === "left" || placement.position === "right"
      ? `${placement.position} side of the image/table`
      : `${placement.position} side of the table/scene`
    return `- ${placement.subject} => ${sideLabel}.`
  })
  return `[SUBJECT_PLACEMENT_LOCK]
${explicitPlacementLines.length > 0 ? explicitPlacementLines.join("\n") : "- No explicit left/right/front/back placement was specified; preserve subject placement from the selected references and Creative Direction."}
- Do not swap requested left/right/front/back positions.
- If Creative Direction says a named subject sits on a side of the table/image, that placement is binding.
- Keep selected guests in stable, readable positions around the table.`
}

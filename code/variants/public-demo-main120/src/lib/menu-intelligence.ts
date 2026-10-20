import { execFile } from "child_process"
import { randomUUID } from "crypto"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { promisify } from "util"
import { menuSourceLabel, resolveMenuSource, type MenuSourceId } from "@/lib/menu-sources"

const execFileAsync = promisify(execFile)

export type MenuEntry = {
  id: string
  clientId: string
  menuName: string
  menuSourceId: MenuSourceId | null
  menuSourceName: string
  category: string
  dishName: string
  aliases: string[]
  description: string
  ingredients: string[]
  allergens: string[]
  price: string | null
  source: "structured_text_doc" | "menu_pdf" | "client_brain" | "manual"
  sourceFile?: string
  confidence: number
}

export type MenuSource = {
  clientId: string
  menuName: string
  menuSourceId?: MenuSourceId | null
  menuSourceName?: string
  category?: string
  source: MenuEntry["source"]
  sourceFile?: string
  sourcePath?: string
  text: string
}

export type MenuMatchCandidate = {
  entry: MenuEntry
  score: number
  reason: string
}

export type MenuMatchResult = {
  status: "menu_matched" | "no_menu_match"
  entry: MenuEntry | null
  searchedDishName: string
  selectedCategory?: string
  selectedMenuSourceId?: MenuSourceId | null
  selectedMenuSourceName?: string
  selectedMenuSourceIds?: MenuSourceId[]
  selectedMenuSourceNames?: string[]
  fallbackToAllMenus?: boolean
  entriesSearched: number
  topMatches: MenuMatchCandidate[]
  sourceFilesSearched: string[]
  structuredMenuAvailable: boolean
}

const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/breakfast|viennoiseries|light & simple|light and simple|classics|indulgent|add ons/i, "Breakfast"],
  [/business lunch|lunch|mains|main course/i, "Lunch"],
  [/dinner|a la carte|à la carte|starters|raw bar/i, "Dinner"],
  [/dessert|desserts/i, "Dessert"],
  [/drink|drinks|cocktail|mocktail|beverage|coffee|tea/i, "Drinks"],
  [/traffic hours|happy hour/i, "Traffic Hours"],
]

const NON_DISH_LINES = [
  /^breakfast$/i,
  /^viennoiseries$/i,
  /^light (&|and) simple$/i,
  /^classics$/i,
  /^indulgent$/i,
  /^add ons$/i,
  /^all our prices/i,
  /^optional add/i,
  /^add on/i,
  /^menu$/i,
]

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 96) || randomUUID()
}

export function normalizeMenuText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeCategory(value?: string | null) {
  if (!value?.trim()) return ""
  const normalized = normalizeMenuText(value)
  if (normalized === "a la carte") return "A La Carte Menu"
  return CATEGORY_ALIASES.find(([pattern]) => pattern.test(value))?.[1] || value.trim()
}

function categoryFromLine(line: string, fallback = "A La Carte Menu") {
  const trimmed = line.trim()
  if (!trimmed) return fallback
  const alias = CATEGORY_ALIASES.find(([pattern]) => pattern.test(trimmed))?.[1]
  if (alias) return alias
  if (/^[A-Z0-9 &/À-Ÿ-]{3,38}$/.test(trimmed) && !isPriceLine(trimmed)) return trimmed.replace(/\s+/g, " ")
  return fallback
}

function isCategoryLine(line: string) {
  const trimmed = line.trim()
  return Boolean(trimmed && /^[A-Z0-9 &/À-Ÿ-]{3,38}$/.test(trimmed) && !isPriceLine(trimmed) && !trimmed.includes(","))
}

function isPriceLine(line: string) {
  return /^(?:AED\s*)?\+?\d{1,4}(?:\s*\/\s*\+?\d{1,4})*(?:\.\d{1,2})?$/i.test(line.trim())
}

function isInlinePriceFragment(value: string) {
  return /^(?:AED\s*)?\+?\d{1,5}(?:\.\d{1,2})?(?:\s*(?:\/|\+|\(|GL|BTL|glass|bottle|ml|oz|AED|[0-9]))?.*$/i.test(value.trim())
}

function normalizePrice(value: string | null) {
  if (!value) return null
  return value.replace(/\s+/g, " ").trim().replace(/^AED\s*/i, "AED ")
}

function parseInlineMenuItemLine(line: string) {
  const parts = line.split(/\s+[—–-]\s+/).map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const price = parts[parts.length - 1]
  if (!isInlinePriceFragment(price)) return null
  const dishName = parts[0]?.replace(/\s+/g, " ").trim()
  if (!dishName || NON_DISH_LINES.some(pattern => pattern.test(dishName))) return null
  const description = parts.slice(1, -1).join(" — ").replace(/\s+/g, " ").trim()
  return { dishName, description, price: normalizePrice(price) }
}

function isLikelyDishLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 90) return false
  if (isPriceLine(trimmed)) return false
  if (NON_DISH_LINES.some(pattern => pattern.test(trimmed))) return false
  if (/[,.;:]$/.test(trimmed)) return false
  if (/^(optional|served|all prices|inclusive)/i.test(trimmed)) return false
  return /[a-zA-ZÀ-Ÿ]/.test(trimmed)
}

function nextNonEmpty(lines: string[], start: number) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index]?.trim()) return { index, line: lines[index].trim() }
  }
  return null
}

function hasAllergenLineAhead(lines: string[], start: number, lookahead = 4) {
  for (let index = start; index < Math.min(lines.length, start + lookahead); index += 1) {
    const line = lines[index]?.trim()
    if (!line) continue
    if (/^allergens?\s*:/i.test(line)) return true
    if (isCategoryLine(line)) return false
  }
  return false
}

function splitDescriptionChunks(lines: string[], count: number) {
  if (count <= 1) return [lines.join(" ").trim()]
  if (lines.length <= count) return Array.from({ length: count }, (_, index) => lines[index] ?? "")
  const chunkSize = Math.ceil(lines.length / count)
  return Array.from({ length: count }, (_, index) => lines.slice(index * chunkSize, (index + 1) * chunkSize).join(" ").trim())
}

function ingredientsFromDescription(description: string) {
  return description
    .split(/,|\s\/\s| with /i)
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(item => item.length > 1)
    .slice(0, 12)
}

function inferAllergens(text: string) {
  const lower = text.toLowerCase()
  const allergens = new Set<string>()
  if (/\b(oyster|oysters|shellfish|lobster|crab|king crab|shrimp|prawn|salmon|seafood)\b/.test(lower)) allergens.add("Seafood / shellfish")
  if (/\bmilk|cream|cheese|yogurt|butter|parmesan|chantilly|bearnaise|condensed milk\b/.test(lower)) allergens.add("Dairy")
  if (/\begg|eggs|benedict|french toast|pancake\b/.test(lower)) allergens.add("Eggs")
  if (/\bbread|sourdough|croissant|pain au chocolat|toast|pancake|granola\b/.test(lower)) allergens.add("Gluten")
  if (/\bnut|nuts|pistachio|cashew|dukkah\b/.test(lower)) allergens.add("Nuts")
  return Array.from(allergens)
}

function aliasList(dishName: string) {
  const aliases = new Set<string>()
  const normalized = dishName.trim().replace(/\s+/g, " ")
  if (!normalized) return []
  aliases.add(normalized)
  if (/^democlientd\s+/i.test(normalized)) aliases.add(normalized.replace(/^democlientd\s+/i, ""))
  else aliases.add(`DemoClientD ${normalized}`)
  aliases.add(normalized.replace(/&/g, "and"))
  aliases.add(normalized.replace(/\band\b/gi, "&"))
  const normalizedKey = normalizeMenuText(normalized)
  if (normalizedKey === "democlientd wagyu burger") {
    aliases.add("DemoClientD Wagyu Burger Truffle")
    aliases.add("DemoClientD Wagyu Burger Truffle & Beef Bacon Jam")
    aliases.add("DemoClientD Wagyu Burger Flavors of Pho")
    aliases.add("DemoClientD Wagyu Burger Blue Cheese & Chili")
    aliases.add("DemoClientD Burger Truffle")
    aliases.add("DemoClientD Burger Flavors of Pho")
    aliases.add("DemoClientD Burger Blue Cheese & Chili")
  }
  if (normalizedKey === "braised duck leg") {
    aliases.add("Couscous Duck Leg")
    aliases.add("Duck Leg Couscous")
  }
  return Array.from(aliases).filter(alias => alias && alias !== normalized)
}

export type DeterministicFoodAssetRuleKind = "breakfast_default" | "promotional_food_asset" | "vision_queue"

export type DeterministicFoodAssetRule = {
  kind: DeterministicFoodAssetRuleKind
  confidence: "Manual Review" | "Non-Menu Breakfast Asset" | "Promotional Food Asset"
  dishName: string
  menuSourceId: MenuSourceId | null
  menuSourceName: string
  menuSources: string[]
  price: string
  menuIngredients: string
  allergens: string[]
  tags: string[]
  sourceStatus: "manual" | "no_menu_match"
  warning: string
  reason: string
}

export function deterministicFoodAssetRule(input: string): DeterministicFoodAssetRule | null {
  const normalized = normalizeMenuText(input)
  if (!normalized) return null

  const breakfastDefaults: Array<[RegExp, string]> = [
    [/\b(mixed fruit platter|fruit platter)\b/, "Mixed Fruit Platter"],
    [/\b(croissants? with chocolate filling|chocolate croissants?)\b/, "Croissants with Chocolate Filling"],
    [/\b(two eggs smoked salmon|two eggs with smoked salmon|two eggs smoked salmon)\b/, "Two Eggs Smoked Salmon"],
  ]
  const breakfastMatch = breakfastDefaults.find(([pattern]) => pattern.test(normalized))
  if (breakfastMatch) {
    return {
      kind: "breakfast_default",
      confidence: "Non-Menu Breakfast Asset",
      dishName: breakfastMatch[1],
      menuSourceId: "breakfast_menu",
      menuSourceName: "Breakfast Menu",
      menuSources: ["Breakfast Menu"],
      price: "Not listed in structured menu source",
      menuIngredients: "Not listed in structured menu source",
      allergens: ["Not listed in structured menu source"],
      tags: ["breakfast", "non-menu breakfast asset", "studio food"],
      sourceStatus: "manual",
      warning: "Non-menu breakfast asset. Use Breakfast Menu as category context only; do not infer price, ingredients, or allergens.",
      reason: "Known breakfast asset rule matched before generic vision.",
    }
  }

  const promotionalDefaults: Array<[RegExp, string, string[]]> = [
    [/\bsmall bites?\b/, "Small Bites", ["promotional food asset", "small bites", "traffic hours"]],
    [/\btraffic hours three bites plate\b|\bthree bites plate\b/, "Traffic Hours Three Bites Plate", ["promotional food asset", "traffic hours", "small bites"]],
  ]
  const promotionalMatch = promotionalDefaults.find(([pattern]) => pattern.test(normalized))
  if (promotionalMatch) {
    return {
      kind: "promotional_food_asset",
      confidence: "Promotional Food Asset",
      dishName: promotionalMatch[1],
      menuSourceId: null,
      menuSourceName: "Promotional Food Asset",
      menuSources: ["Promotional Food Asset"],
      price: "Not listed in structured menu source",
      menuIngredients: "Not listed in structured menu source",
      allergens: ["Not listed in structured menu source"],
      tags: promotionalMatch[2],
      sourceStatus: "manual",
      warning: "Promotional food asset. Do not force menu matching.",
      reason: "Known promotional asset rule matched before generic vision.",
    }
  }

  const visionQueueDefaults: Array<[RegExp, string]> = [
    [/\btajarin\b.*\b(sea ?urchin|caviar|supplement)\b/, "Tajarin with Sea Urchin / Caviar supplement"],
    [/\bsunchoke risotto\b.*\b(black truffle|supplement)\b/, "Sunchoke Risotto with Black Truffle supplement"],
    [/\baustralian black angus steak\b/, "Australian Black Angus Steak"],
  ]
  const visionMatch = visionQueueDefaults.find(([pattern]) => pattern.test(normalized))
  if (visionMatch) {
    return {
      kind: "vision_queue",
      confidence: "Manual Review",
      dishName: visionMatch[1],
      menuSourceId: null,
      menuSourceName: "Vision / Manual Review Queue",
      menuSources: [],
      price: "Not listed in structured menu source",
      menuIngredients: "Not listed in structured menu source",
      allergens: ["Not listed in structured menu source"],
      tags: ["manual review", "vision queue", "studio food"],
      sourceStatus: "no_menu_match",
      warning: "Structured menu candidate needs visual/manual review. Image analysis may only fill plating, garnish, vessel, or serving count.",
      reason: "Known ambiguous supplement/steak asset rule matched before generic vision.",
    }
  }

  return null
}

function flushPending(
  entries: MenuEntry[],
  clientId: string,
  menuName: string,
  source: MenuEntry["source"],
  sourceFile: string | undefined,
  menuSourceId: MenuSourceId | null | undefined,
  menuSourceName: string | undefined,
  pending: Array<{ dishName: string; price: string | null; category: string; allergens?: string[] }>,
  descriptionLines: string[]
) {
  if (pending.length === 0) return
  const descriptions = splitDescriptionChunks(descriptionLines, pending.length)
  pending.forEach((item, index) => {
    const description = (descriptions[index] || "").replace(/\s+/g, " ").trim()
    const resolvedSource = menuSourceId ? resolveMenuSource(menuSourceId) : resolveMenuSource(`${menuName} ${sourceFile ?? ""} ${item.category}`)
    const category = normalizeCategory(item.category) || normalizeCategory(menuName) || "A La Carte Menu"
    entries.push({
      id: stableId(`${clientId}-${sourceFile ?? menuName}-${item.dishName}-${item.price ?? ""}`),
      clientId,
      menuName,
      menuSourceId: resolvedSource?.id ?? null,
      menuSourceName: resolvedSource?.label ?? menuSourceName ?? menuSourceLabel(menuName) ?? menuName,
      category,
      dishName: item.dishName,
      aliases: aliasList(item.dishName),
      description,
      ingredients: ingredientsFromDescription(description),
      allergens: item.allergens ?? [],
      price: item.price,
      source,
      sourceFile,
      confidence: source === "structured_text_doc" ? 0.96 : description ? 0.86 : 0.72,
    })
  })
}

export function parseMenuEntriesFromText(source: MenuSource): MenuEntry[] {
  const lines = source.text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)

  const entries: MenuEntry[] = []
  let pending: { dishName: string; price: string | null; category: string; allergens: string[]; descriptionLines: string[] } | null = null
  let category = normalizeCategory(source.category) || normalizeCategory(source.menuName) || "A La Carte Menu"

  const flush = () => {
    if (!pending) return
    flushPending(
      entries,
      source.clientId,
      source.menuName,
      source.source,
      source.sourceFile,
      source.menuSourceId,
      source.menuSourceName,
      [{
        dishName: pending.dishName,
        price: pending.price,
        category: pending.category,
        allergens: pending.allergens,
      }],
      pending.descriptionLines.splice(0)
    )
    pending = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const next = nextNonEmpty(lines, index + 1)

    if (isCategoryLine(line) && (!next || !isPriceLine(next.line))) {
      flush()
      category = categoryFromLine(line, category)
      continue
    }

    const inlineItem = parseInlineMenuItemLine(line)
    if (inlineItem) {
      flush()
      pending = {
        dishName: inlineItem.dishName,
        price: inlineItem.price,
        category,
        allergens: [],
        descriptionLines: inlineItem.description ? [inlineItem.description] : [],
      }
      continue
    }

    if (isLikelyDishLine(line) && next && isPriceLine(next.line)) {
      flush()
      pending = { dishName: line.replace(/\s+/g, " "), price: normalizePrice(next.line), category, allergens: [], descriptionLines: [] }
      index = next.index
      continue
    }

    if (pending) {
      const allergenMatch = line.match(/^allergens?\s*:\s*(.+)$/i)
      if (allergenMatch) {
        pending.allergens = allergenMatch[1]
          .split(/,|\||;/)
          .map(item => item.trim())
          .filter(Boolean)
        continue
      }
      if (pending.allergens.length > 0 && isLikelyDishLine(line) && next && !isPriceLine(next.line) && hasAllergenLineAhead(lines, index + 1)) {
        flush()
        pending = { dishName: line.replace(/\s+/g, " "), price: null, category, allergens: [], descriptionLines: [] }
        continue
      }
      pending.descriptionLines.push(line)
      continue
    }

    if (isLikelyDishLine(line) && next && !isPriceLine(next.line) && hasAllergenLineAhead(lines, index + 1)) {
      flush()
      pending = { dishName: line.replace(/\s+/g, " "), price: null, category, allergens: [], descriptionLines: [] }
      continue
    }
  }

  flush()
  return entries
}

export function buildMenuIntelligenceIndex(sources: MenuSource[]) {
  const byKey = new Map<string, MenuEntry>()
  for (const source of sources) {
    for (const entry of parseMenuEntriesFromText(source)) {
      const key = `${entry.menuSourceId ?? normalizeMenuText(entry.menuName)}-${normalizeMenuText(entry.category)}-${normalizeMenuText(entry.dishName)}-${entry.price ?? ""}`
      const existing = byKey.get(key)
      if (!existing || entry.confidence > existing.confidence) byKey.set(key, entry)
    }
  }
  return Array.from(byKey.values()).sort((left, right) => left.menuName.localeCompare(right.menuName) || left.category.localeCompare(right.category) || left.dishName.localeCompare(right.dishName))
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1]
    for (let j = 0; j < right.length; j += 1) {
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (left[i] === right[j] ? 0 : 1)
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

function tokenScore(query: string, candidate: string) {
  const queryTokens = new Set(query.split(" ").filter(token => token.length > 1))
  const candidateTokens = new Set(candidate.split(" ").filter(token => token.length > 1))
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0
  let overlap = 0
  queryTokens.forEach(token => {
    if (candidateTokens.has(token)) overlap += 1
  })
  return overlap / Math.max(queryTokens.size, candidateTokens.size)
}

function scoreEntry(entry: MenuEntry, dishName: string, category?: string) {
  const query = normalizeMenuText(dishName)
  const normalizedNames = [entry.dishName, ...entry.aliases].map(normalizeMenuText)
  const normalizedCategory = normalizeMenuText(category ?? "")
  const entryCategory = normalizeMenuText(entry.category)

  let score = 0
  let reason = "fuzzy"
  if (normalizedNames.includes(query)) {
    score = 1
    reason = "exact or alias match"
  } else {
    const containsQuery = normalizedNames.some(name => name.includes(query))
    const queryContainsCandidate = normalizedNames.some(name => query.includes(name))
    const directPartial = containsQuery || queryContainsCandidate
    const bestToken = Math.max(...normalizedNames.map(name => tokenScore(query, name)))
    const bestDistance = Math.min(...normalizedNames.map(name => levenshtein(query, name) / Math.max(query.length, name.length, 1)))
    score = Math.max(directPartial ? containsQuery ? 0.88 : 0.58 : 0, bestToken * 0.82, 1 - bestDistance)
    reason = directPartial ? "partial match" : bestToken >= 0.5 ? "token fuzzy match" : "edit-distance fuzzy match"
  }

  if (normalizedCategory && entryCategory === normalizedCategory) {
    score += 0.08
    reason = `${reason}; category match`
  } else if (normalizedCategory && entryCategory !== normalizedCategory) {
    score -= 0.05
  }

  return { score: Math.max(0, Math.min(1, score)), reason }
}

function scoreMenuEntries(entries: MenuEntry[], dishName: string, category?: string) {
  return entries
    .map(entry => ({ entry, ...scoreEntry(entry, dishName, category) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
}

function candidateMatched(candidate: MenuMatchCandidate | undefined, dishName: string) {
  return Boolean(candidate && (candidate.score >= 0.78 || normalizeMenuText(candidate.entry.dishName) === normalizeMenuText(dishName) || candidate.entry.aliases.map(normalizeMenuText).includes(normalizeMenuText(dishName))))
}

export function findMenuEntryForDish(entries: MenuEntry[], dishName: string, categoryOrOptions?: string | { category?: string; menuSourceId?: string | null; menuSourceIds?: string[] | null }): MenuMatchResult {
  const category = typeof categoryOrOptions === "string" ? categoryOrOptions : categoryOrOptions?.category
  const selectedMenuSourceIds = typeof categoryOrOptions === "string"
    ? []
    : Array.from(new Set((categoryOrOptions?.menuSourceIds ?? []).map(value => resolveMenuSource(value)?.id).filter((value): value is MenuSourceId => Boolean(value))))
  const selectedMenuSource = resolveMenuSource(typeof categoryOrOptions === "string" ? categoryOrOptions : categoryOrOptions?.menuSourceId || category)
  const effectiveMenuSourceIds = selectedMenuSourceIds.length > 0
    ? selectedMenuSourceIds
    : selectedMenuSource
      ? [selectedMenuSource.id]
      : []
  const selectedMenuSources = effectiveMenuSourceIds.map(id => resolveMenuSource(id)).filter(Boolean)
  const scopedEntries = effectiveMenuSourceIds.length > 0 ? entries.filter(entry => entry.menuSourceId && effectiveMenuSourceIds.includes(entry.menuSourceId)) : entries
  const scopedEntriesToScore = scopedEntries.length > 0 ? scopedEntries : entries
  const scopedCandidates = scoreMenuEntries(scopedEntriesToScore, dishName, category)
  const scopedWinner = scopedCandidates[0]
  const scopedMatched = candidateMatched(scopedWinner, dishName)
  const shouldFallbackToAllMenus = effectiveMenuSourceIds.length > 0 && !scopedMatched
  const entriesToScore = shouldFallbackToAllMenus ? entries : scopedEntriesToScore
  const sourceFiles = Array.from(new Set(entriesToScore.map(entry => entry.sourceFile || entry.menuName).filter(Boolean)))
  const candidates = shouldFallbackToAllMenus ? scoreMenuEntries(entriesToScore, dishName, category) : scopedCandidates
  const winner = candidates[0]
  const matched = !shouldFallbackToAllMenus && candidateMatched(winner, dishName)

  return {
    status: matched ? "menu_matched" : "no_menu_match",
    entry: matched ? winner.entry : null,
    searchedDishName: dishName,
    selectedCategory: category,
    selectedMenuSourceId: effectiveMenuSourceIds[0] ?? null,
    selectedMenuSourceName: selectedMenuSources.map(source => source?.label).filter(Boolean).join(" + "),
    selectedMenuSourceIds: effectiveMenuSourceIds,
    selectedMenuSourceNames: selectedMenuSources.map(source => source?.label).filter(Boolean) as string[],
    fallbackToAllMenus: shouldFallbackToAllMenus,
    entriesSearched: entriesToScore.length,
    topMatches: candidates,
    sourceFilesSearched: sourceFiles,
    structuredMenuAvailable: entriesToScore.length > 0,
  }
}

export function menuEntryToMetadata(entry: MenuEntry) {
  const menuIngredients = entry.description || entry.ingredients.join(", ")
  const shortPlateDescription = menuIngredients
    ? `${entry.dishName} brings together ${menuIngredients.replace(/\.$/, "")} in a polished DemoClientD presentation.`
    : `${entry.dishName} from the ${entry.category} menu.`
  return {
    dishName: entry.dishName,
    menuCategory: entry.menuSourceName || entry.category,
    menuSourceId: entry.menuSourceId,
    menu_source_id: entry.menuSourceId,
    menuSourceName: entry.menuSourceName,
    menu_source_name: entry.menuSourceName,
    menuIngredients,
    menu_ingredients: menuIngredients,
    menuDescription: menuIngredients,
    shortPlateDescription,
    shortDescription: shortPlateDescription,
    ingredients: entry.ingredients,
    allergens: entry.allergens.length > 0 ? entry.allergens : ["Not listed on menu"],
    price: entry.price ? (entry.price.toUpperCase().startsWith("AED") ? entry.price : `AED ${entry.price}`) : "Not listed on menu",
    tags: Array.from(new Set([entry.category.toLowerCase(), ...normalizeMenuText(entry.dishName).split(" ").filter(token => token.length > 2)])),
    sourceStatus: "menu_matched",
    reasoning: `Matched structured menu entry from ${entry.menuSourceName || entry.sourceFile || entry.menuName}.`,
    warning: "",
    menuEntryId: entry.id,
    menuSourceFile: entry.sourceFile,
  }
}

export async function extractPdfTextWithPdftotext(buffer: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-menu-"))
  const pdfPath = join(dir, "menu.pdf")
  const txtPath = join(dir, "menu.txt")
  try {
    await writeFile(pdfPath, buffer)
    await execFileAsync("pdftotext", [pdfPath, txtPath], { timeout: 15_000 })
    return await readFile(txtPath, "utf8")
  } catch {
    return ""
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

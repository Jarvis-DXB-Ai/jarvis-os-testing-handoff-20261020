// outputConfig.ts — Output token optimization layer
//
// Controls how agents format their responses.
// Core principle: think internally, output minimally.
// The model's reasoning stays internal — only the deliverable reaches output.

export type OutputMode = "concise" | "standard" | "verbose"
export type ReasoningVisibility = "hidden" | "summary" | "full"

// ─── Per-deliverable output token caps ───────────────────────────────────────
// These are injected into the prompt as a hard ceiling signal.
// Also used to warn in the UI when estimated completion exceeds target.

export const OUTPUT_TOKEN_CAPS: Record<string, number> = {
  caption:           120,   // single IG/FB/TT caption
  caption_set:       250,   // 2-4 caption options
  headline:           80,   // single headline
  headline_set:      150,   // 3-5 headline options
  ad_copy:           300,   // paid ad copy (primary + body)
  ad_copy_set:       400,
  email:             500,   // full email
  email_subject:      60,
  script:            800,   // video/reel script
  reel_script:       400,
  story:             200,   // story copy / sticker text
  strategy_doc:     1200,
  brief:             400,
  report:           1000,
  post:              200,   // generic social post
  bio:               150,
  tagline:            60,
  default:           350,
}

/** Resolve the best output token cap for a given deliverable type.
 *  Tries exact match, then partial match (e.g. "instagram_caption" → "caption"). */
export function resolveOutputCap(deliverableType: string | null): number {
  if (!deliverableType) return OUTPUT_TOKEN_CAPS.default
  const type = deliverableType.toLowerCase().trim()

  // Exact match
  if (OUTPUT_TOKEN_CAPS[type]) return OUTPUT_TOKEN_CAPS[type]

  // Partial match (e.g. "ig_caption" → "caption", "reel_caption_set" → "caption_set")
  for (const [key, val] of Object.entries(OUTPUT_TOKEN_CAPS)) {
    if (key === "default") continue
    if (type.includes(key)) return val
  }

  return OUTPUT_TOKEN_CAPS.default
}

// ─── Output instructions per mode ────────────────────────────────────────────

/** Build the output instructions section injected at the end of every prompt.
 *  This section is last so it has maximum recency weight on the model. */
export function buildOutputInstructions(
  mode:              OutputMode,
  deliverableType:   string | null,
  maxOutputTokens?:  number,
): string {
  const cap = maxOutputTokens ?? resolveOutputCap(deliverableType)
  const lines: string[] = [`OUTPUT MODE: ${mode.toUpperCase()}`]

  if (mode === "concise") {
    lines.push(
      "",
      "Deliver the requested copy only. No explanations, preambles, or commentary.",
      "",
      "NEVER include in output:",
      "- Compliance tables or pre-flight checks",
      "- 'Here are X options tailored to...' intros",
      "- Strategy notes, usage guidance, or rationale",
      "- 'Best for:' labels or deployment advice",
      "- Closing signatures or agent attribution lines",
      "- Descriptions of what the copy does or why it works",
      "- References to brand rules or playbook sections",
      "",
      "ALWAYS:",
      "- Open directly with the copy",
      "- Separate options with a blank line",
      "- Label options A / B / C only if multiple variants",
      "- Keep hashtags on a separate line after each option",
      "",
      `Target: under ${cap} tokens`,
    )
  } else if (mode === "standard") {
    lines.push(
      "",
      "Deliver the requested copy with minimal framing.",
      "One short intro line is acceptable. No compliance summaries.",
      "No closing notes, rationale, or usage guidance.",
      "",
      `Target: under ${cap} tokens`,
    )
  } else {
    // verbose
    lines.push(
      "",
      "Deliver the requested copy with full reasoning and context.",
      "Include rationale, usage guidance, and strategic notes as needed.",
      "",
      `Max: ${Math.round(cap * 2)} tokens`,
    )
  }

  return lines.join("\n")
}

// ─── Verbosity scoring ────────────────────────────────────────────────────────

export type CompletionEfficiencyMetrics = {
  actualOutputTokens:  number
  targetOutputTokens:  number
  verbosityScore:      number    // actual / target (1.0 = on-target, >1.5 = too verbose)
  tokensSaved:         number    // vs verbose baseline (target × 2)
  efficiencyGrade:     "A" | "B" | "C" | "D"  // A = ≤1.1×, B = ≤1.5×, C = ≤2×, D = >2×
}

export function scoreCompletion(
  actualTokens:      number,
  deliverableType:   string | null,
  targetOverride?:   number,
): CompletionEfficiencyMetrics {
  const target       = targetOverride ?? resolveOutputCap(deliverableType)
  const verbosity    = actualTokens / target
  const verboseBase  = target * 2
  const tokensSaved  = Math.max(0, verboseBase - actualTokens)

  const grade: CompletionEfficiencyMetrics["efficiencyGrade"] =
    verbosity <= 1.1 ? "A"
    : verbosity <= 1.5 ? "B"
    : verbosity <= 2.0 ? "C"
    : "D"

  return {
    actualOutputTokens:  actualTokens,
    targetOutputTokens:  target,
    verbosityScore:      Math.round(verbosity * 10) / 10,
    tokensSaved,
    efficiencyGrade:     grade,
  }
}

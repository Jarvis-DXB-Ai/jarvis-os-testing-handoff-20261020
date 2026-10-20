import type { CreativeDirectorReasoning } from "@/lib/creative-director"

export type PromptCompilerWorkflow =
  | "reference_rebuild"
  | "product_photography"
  | "lifestyle_photography"
  | "videography"

export type CompiledPromptInput = {
  deterministicPrompt: string
  reasoning?: CreativeDirectorReasoning | null
  workflow: PromptCompilerWorkflow
  pastFailures?: string[]
}

function bulletList(items: string[]) {
  return items.map(item => `- ${item}`).join("\n")
}

function section(title: string, body: string | string[] | undefined) {
  if (!body) return ""
  const content = Array.isArray(body) ? bulletList(body.filter(Boolean)) : body.trim()
  return content ? `[${title}]\n${content}` : ""
}

export function compileCreativeDirectorPrompt({
  deterministicPrompt,
  reasoning,
  workflow,
  pastFailures = [],
}: CompiledPromptInput) {
  const basePrompt = deterministicPrompt.trim()
  if (!reasoning) return basePrompt

  const reasoningBlock = [
    section("CREATIVE_DIRECTOR_REASONING", [
      `workflow: ${workflow}`,
      `composition priority: ${reasoning.compositionPriority}`,
      `food priority: ${reasoning.foodPriority}`,
      `background mode: ${reasoning.backgroundMode}`,
      `camera angle: ${reasoning.cameraAngle}`,
      `hand interaction: ${reasoning.handInteraction}`,
    ]),
    reasoning.hierarchy.length ? section("TRUTH_HIERARCHY", reasoning.hierarchy) : "",
    reasoning.mustPreserve.length ? section("MUST_PRESERVE", reasoning.mustPreserve) : "",
    reasoning.allowedFlex.length ? section("ALLOWED_FLEX", reasoning.allowedFlex) : "",
    reasoning.contradictions.length ? section("CONTRADICTION_RESOLUTION", reasoning.contradictions) : "",
    reasoning.riskWarnings.length ? section("CREATIVE_DIRECTOR_RISK_WARNINGS", reasoning.riskWarnings) : "",
    pastFailures.length ? section("PAST_FAILURE_CORRECTIONS", pastFailures.map(failure => `Previous failure to avoid: ${failure}`)) : "",
    section("PROMPT_STRATEGY", reasoning.promptStrategy),
    section("FINAL_CREATIVE_DIRECTION", reasoning.finalCreativeDirection),
    section("PROVIDER_NOTES", reasoning.providerNotes),
    section("COMPILER_GUARDRAIL", "The deterministic prompt blocks below remain authoritative. Creative Director reasoning may clarify hierarchy and resolve contradictions, but it cannot weaken truth asset, strict negative, locked scene, food truth, or provider safety rules."),
  ].filter(Boolean).join("\n\n")

  return [reasoningBlock, basePrompt].filter(Boolean).join("\n\n")
}


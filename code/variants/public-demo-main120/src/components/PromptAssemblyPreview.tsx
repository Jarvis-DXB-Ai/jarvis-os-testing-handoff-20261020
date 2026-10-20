"use client"

import { useState } from "react"
import { estimateTokens, tokenWeight, type CtxData } from "@/lib/agentContext"
import {
  buildSystemRole,
  buildTaskObjective,
  buildClientContext,
  buildResearchContext,
  buildExecutionRules,
  buildPlatformRulesSection,
  buildBrandPlaybookSection,
  buildSuccessfulExamplesSection,
  buildAvoidPatternsSection,
  OUTPUT_EXPECTATION,
  type EfficiencyMode,
} from "@/lib/promptAssembly"
import {
  buildRelevanceContext,
  SECTION_CAPS,
} from "@/lib/relevanceEngine"
import {
  type OutputMode,
  buildOutputInstructions,
  resolveOutputCap,
  OUTPUT_TOKEN_CAPS,
} from "@/lib/outputConfig"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function badge(tokens: number) {
  const w = tokenWeight(tokens)
  return (
    <span className={`ml-auto shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-mono ${w.color}`}>
      ~{tokens} tk
    </span>
  )
}

function PromptSection({
  label,
  tokens,
  children,
  defaultOpen = false,
  dimmed = false,
}: {
  label: string
  tokens: number
  children: React.ReactNode
  defaultOpen?: boolean
  dimmed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`rounded-2xl border transition-colors ${dimmed ? "border-gray-200" : "border-gray-200"} bg-gray-50`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left"
      >
        <span className={`text-xs font-semibold ${dimmed ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
        {badge(tokens)}
        <span className="ml-1 text-xs text-gray-700">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

function PromptBlock({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <pre className={`whitespace-pre-wrap rounded-xl border border-gray-200 bg-black px-5 py-4 font-mono text-xs leading-relaxed ${muted ? "text-gray-600" : "text-gray-300"}`}>
      {text}
    </pre>
  )
}

const MODE_LABELS: Record<EfficiencyMode, { label: string; desc: string; color: string }> = {
  lean:     { label: "Lean",     desc: "Minimum viable context",    color: "border-green-800 text-green-400" },
  balanced: { label: "Balanced", desc: "Smart default",             color: "border-yellow-800 text-yellow-400" },
  rich:     { label: "Rich",     desc: "Full context dump",         color: "border-red-800 text-red-400" },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PromptAssemblyPreview({
  ctx,
  taskTitle,
  taskDescription,
}: {
  ctx: CtxData
  taskTitle: string
  taskDescription: string | null
}) {
  const [showRaw, setShowRaw] = useState(false)
  const [showEfficiency, setShowEfficiency] = useState(false)
  const [mode, setMode] = useState<EfficiencyMode>(ctx.efficiencyMode ?? "balanced")
  const [outputMode, setOutputMode] = useState<OutputMode>(ctx.outputMode ?? "concise")

  // Build relevance context
  const relCtx = buildRelevanceContext({
    platform:        ctx.deliverable?.platform ?? null,
    deliverableType: ctx.deliverable?.type ?? null,
    skillIds:        ctx.skills.map(s => s.id),
    agentId:         ctx.agent?.id ?? null,
  })

  // Get mode caps
  const caps = SECTION_CAPS[mode]

  // Build sections using mode caps
  const systemRole      = buildSystemRole(ctx)
  const platformRules   = buildPlatformRulesSection(ctx.platformRules, caps.platform_rules ?? 100, relCtx)
  const { text: brandPlaybook, scored: playbookScored } =
    buildBrandPlaybookSection(ctx.brandPlaybook, caps.brand_voice ?? 160, relCtx)
  const taskObjective   = buildTaskObjective(taskTitle, taskDescription, ctx)
  const clientContext   = buildClientContext(ctx)
  const researchCtx     = buildResearchContext(ctx)
  const execRules       = buildExecutionRules(ctx)
  const avoidPatterns   = buildAvoidPatternsSection(ctx.rejectionPatterns, caps.avoid_patterns ?? 120)
  const successExamples = buildSuccessfulExamplesSection(ctx.successfulOutputs, caps.successful_examples ?? 150)
  const outputExpect       = OUTPUT_EXPECTATION
  const outputInstructions = buildOutputInstructions(outputMode, ctx.deliverable?.type ?? null)
  const targetOutputTk     = resolveOutputCap(ctx.deliverable?.type ?? null)
  const maxOutputTk        = Math.min(Math.round(targetOutputTk * 1.2), 2048)

  // Token estimates
  const tkSystem    = estimateTokens(systemRole)
  const tkPlatform  = estimateTokens(platformRules)
  const tkPlaybook  = estimateTokens(brandPlaybook)
  const tkTask      = estimateTokens(taskObjective)
  const tkClient    = estimateTokens(clientContext)
  const tkRules     = estimateTokens(execRules)
  const tkAvoid     = estimateTokens(avoidPatterns)
  const tkExamples  = estimateTokens(successExamples)
  const tkResearch  = estimateTokens(researchCtx)
  const tkOutput        = estimateTokens(outputExpect)
  const tkOutputFormat  = estimateTokens(outputInstructions)
  const tkTotal         = tkSystem + tkPlatform + tkPlaybook + tkTask + tkClient + tkRules + tkAvoid + tkExamples + tkResearch + tkOutputFormat + tkOutput

  const totalWeight = tokenWeight(tkTotal)
  const budgetPct   = Math.round((tkTotal / ctx.tokenBudget.total_budget) * 100)

  // Efficiency metrics
  const injected = playbookScored.filter(e => e.injected)
  const skipped  = playbookScored.filter(e => !e.injected)
  const richBaseline = (SECTION_CAPS["rich"].brand_voice ?? 480) + (SECTION_CAPS["rich"].platform_rules ?? 200) +
                       (SECTION_CAPS["rich"].successful_examples ?? 400) + (SECTION_CAPS["rich"].avoid_patterns ?? 250)
  const actualVariable = tkPlaybook + tkPlatform + tkExamples + tkAvoid
  const tokensSaved = Math.max(0, richBaseline - actualVariable)

  // Full raw prompt
  const rawSections = [
    `# SYSTEM ROLE\n${systemRole}`,
    platformRules   ? `# PLATFORM RULES\n${platformRules}`        : null,
    brandPlaybook   ? `# BRAND PLAYBOOK\n${brandPlaybook}`        : null,
    `# TASK OBJECTIVE\n${taskObjective}`,
    `# CLIENT CONTEXT\n${clientContext}`,
    avoidPatterns   ? `# AVOID THESE PATTERNS\n${avoidPatterns}`  : null,
    successExamples ? `# SUCCESSFUL EXAMPLES\n${successExamples}` : null,
    `# RESEARCH CONTEXT\n${researchCtx}`,
    `# EXECUTION RULES\n${execRules}`,
    `# OUTPUT FORMAT\n${outputInstructions}`,
    `# OUTPUT EXPECTATION\n${outputExpect}`,
  ].filter(Boolean)
  const rawPrompt = rawSections.join("\n\n---\n\n")

  return (
    <div className="mt-10 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Prompt Assembly Preview</p>
          <p className="mt-0.5 text-xs text-gray-700">Structured prompt package — visualization only, no AI calls</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Context mode selector */}
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(["lean", "balanced", "rich"] as EfficiencyMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  mode === m
                    ? `${MODE_LABELS[m].color} bg-white font-semibold`
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {MODE_LABELS[m].label}
              </button>
            ))}
          </div>

          {/* Output mode selector */}
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(["concise", "standard", "verbose"] as OutputMode[]).map(m => (
              <button
                key={m}
                onClick={() => setOutputMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  outputMode === m
                    ? m === "concise"
                      ? "bg-white text-green-400 font-semibold border-green-900"
                      : m === "verbose"
                        ? "bg-white text-red-400 font-semibold"
                        : "bg-white text-yellow-400 font-semibold"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="rounded-xl border border-gray-300 px-4 py-2 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900"
          >
            {showRaw ? "↙ Structured" : "↗ Raw view"}
          </button>
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${totalWeight.color}`}>
            <span className="text-xs font-bold">{totalWeight.label}</span>
            <span className="font-mono text-xs opacity-70">~{tkTotal} / {ctx.tokenBudget.total_budget} tk</span>
            <span className={`text-xs opacity-60 ${budgetPct > 90 ? "text-red-400" : ""}`}>({budgetPct}%)</span>
          </div>
        </div>
      </div>

      {/* Raw view */}
      {showRaw ? (
        <div className="rounded-2xl border border-gray-300 bg-gray-50">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Raw Prompt Package</p>
            <button
              onClick={() => navigator.clipboard?.writeText(rawPrompt)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900"
            >
              Copy
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-5 font-mono text-xs leading-relaxed text-gray-400 max-h-[600px] overflow-y-auto">
            {rawPrompt}
          </pre>
        </div>
      ) : (
        <>
          {/* Section 1: System Role */}
          <PromptSection label="1 · System Role" tokens={tkSystem} defaultOpen>
            <PromptBlock text={systemRole} />
          </PromptSection>

          {/* Section 2: Platform Rules (L0) */}
          <PromptSection
            label="2 · Platform Rules (L0)"
            tokens={tkPlatform}
            defaultOpen={ctx.platformRules.length > 0}
            dimmed={ctx.platformRules.length === 0}
          >
            {ctx.platformRules.length === 0 ? (
              <p className="text-xs text-gray-600">No platform rules — set platform on the deliverable.</p>
            ) : (
              <PromptBlock text={platformRules} />
            )}
          </PromptSection>

          {/* Section 3: Brand Playbook (L1/L2) */}
          <PromptSection
            label="3 · Brand Playbook (L1/L2)"
            tokens={tkPlaybook}
            defaultOpen={ctx.brandPlaybook.length > 0}
            dimmed={ctx.brandPlaybook.length === 0}
          >
            {ctx.brandPlaybook.length === 0 ? (
              <p className="text-xs text-gray-600">No brand playbook entries yet.</p>
            ) : (
              <>
                <PromptBlock text={brandPlaybook} />
                {/* Injected/skipped entries */}
                {playbookScored.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {injected.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {injected.map(e => (
                          <span key={e.id} className="flex items-center gap-1.5 rounded-lg border border-green-900/40 bg-green-950/10 px-2 py-0.5 text-xs text-green-500">
                            <span className="text-green-700">✓</span>
                            {e.title.length > 30 ? e.title.slice(0, 28) + "…" : e.title}
                            <span className="text-green-800 font-mono">{e.relevanceScore}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {skipped.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {skipped.map(e => (
                          <span key={e.id} title={e.skipReason} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/50 px-2 py-0.5 text-xs text-gray-600">
                            <span>↷</span>
                            {e.title.length > 30 ? e.title.slice(0, 28) + "…" : e.title}
                            <span className="font-mono text-gray-700">{e.relevanceScore}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </PromptSection>

          {/* Section 4: Task Objective */}
          <PromptSection label="4 · Task Objective" tokens={tkTask} defaultOpen>
            <PromptBlock text={taskObjective} />
          </PromptSection>

          {/* Section 5: Client Context */}
          <PromptSection
            label="5 · Client Context"
            tokens={tkClient}
            defaultOpen={ctx.knowledge.length > 0 || !!ctx.deliverable}
            dimmed={!ctx.clientId}
          >
            <PromptBlock text={clientContext} muted={!ctx.clientId} />
          </PromptSection>

          {/* Section 6: Research Context */}
          <PromptSection
            label="6 · Research Context"
            tokens={tkResearch}
            defaultOpen={ctx.research.length > 0}
            dimmed={ctx.research.length === 0}
          >
            <PromptBlock text={researchCtx} muted={ctx.research.length === 0} />
          </PromptSection>

          {/* Section 7: Execution Rules */}
          <PromptSection label="7 · Execution Rules" tokens={tkRules} defaultOpen>
            <PromptBlock text={execRules} />
          </PromptSection>

          {/* Section 8: Avoid These Patterns */}
          <PromptSection
            label="8 · Avoid These Patterns"
            tokens={tkAvoid}
            defaultOpen={ctx.rejectionPatterns.length > 0}
            dimmed={ctx.rejectionPatterns.length === 0}
          >
            {ctx.rejectionPatterns.length === 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-gray-600">No rejection patterns found for this context.</p>
                <p className="text-xs text-gray-800">Save a rejection in /reviews → it will appear here for matched tasks.</p>
              </div>
            ) : (
              <>
                <PromptBlock text={avoidPatterns} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {ctx.rejectionPatterns.map((p) => (
                    <span key={p.id} className="rounded-lg border border-red-900/40 bg-red-950/10 px-2 py-0.5 text-xs text-red-400">
                      {p.issue_type?.replace(/_/g, " ") ?? "issue"} · sev {p.severity} · matched: {p.match_reason}
                    </span>
                  ))}
                </div>
              </>
            )}
          </PromptSection>

          {/* Section 9: Successful Examples */}
          <PromptSection
            label="9 · Successful Examples"
            tokens={tkExamples}
            defaultOpen={ctx.successfulOutputs.length > 0}
            dimmed={ctx.successfulOutputs.length === 0}
          >
            {ctx.successfulOutputs.length === 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-gray-600">No successful outputs found for this context.</p>
                <p className="text-xs text-gray-800">Approve an execution in /reviews → it will appear here for matched tasks.</p>
              </div>
            ) : (
              <>
                <PromptBlock text={successExamples} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {ctx.successfulOutputs.map((o) => (
                    <span key={o.id} className="rounded-lg border border-green-900/40 bg-green-950/10 px-2 py-0.5 text-xs text-green-400">
                      {o.output_type ?? "output"} · matched: {o.match_reason}
                    </span>
                  ))}
                </div>
              </>
            )}
          </PromptSection>

          {/* Section 10: Output Format */}
          <PromptSection label="10 · Output Format" tokens={tkOutputFormat} defaultOpen>
            <PromptBlock text={outputInstructions} />
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-gray-600">Target output:</span>
              <span className="rounded-full border border-green-900/40 bg-green-950/10 px-2.5 py-0.5 font-mono text-xs text-green-500">
                ≤{targetOutputTk}tk
              </span>
              <span className="text-xs text-gray-700">API max_tokens recommendation:</span>
              <span className="rounded-full border border-gray-200 px-2.5 py-0.5 font-mono text-xs text-gray-500">
                {maxOutputTk}
              </span>
            </div>
          </PromptSection>

          {/* Section 11: Output Expectation */}
          <PromptSection label="11 · Output Expectation" tokens={tkOutput} defaultOpen dimmed>
            <PromptBlock text={outputExpect} muted />
            <p className="mt-3 text-xs text-gray-700">Populated by the execution engine at runtime.</p>
          </PromptSection>

          {/* Token breakdown */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Token Breakdown</p>
              <p className="text-xs text-gray-700">
                Budget: {ctx.tokenBudget.total_budget.toLocaleString()} tokens
                <span className={`ml-2 ${budgetPct > 90 ? "text-red-400" : "text-gray-600"}`}>
                  ({budgetPct}% used)
                </span>
              </p>
            </div>
            <div className="mb-4 h-1.5 w-full rounded-full bg-white">
              <div
                className={`h-1.5 rounded-full transition-all ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-yellow-500" : "bg-neutral-500"}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <div className="space-y-2">
              {[
                { label: "System Role",         tokens: tkSystem   },
                { label: "Platform Rules",      tokens: tkPlatform },
                { label: "Brand Playbook",      tokens: tkPlaybook },
                { label: "Task Objective",      tokens: tkTask     },
                { label: "Client Context",      tokens: tkClient   },
                { label: "Execution Rules",     tokens: tkRules    },
                { label: "Avoid Patterns",      tokens: tkAvoid    },
                { label: "Successful Examples", tokens: tkExamples      },
                { label: "Research",            tokens: tkResearch     },
                { label: "Output Format",       tokens: tkOutputFormat },
                { label: "Output",              tokens: tkOutput       },
              ].map(({ label, tokens }) => {
                const pct = tkTotal > 0 ? Math.round((tokens / tkTotal) * 100) : 0
                const w = tokenWeight(tokens)
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-xs text-gray-600">{label}</span>
                    <div className="flex-1 rounded-full bg-white h-1.5">
                      <div className="h-1.5 rounded-full bg-neutral-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`w-16 text-right font-mono text-xs ${w.color.split(" ")[0]}`}>~{tokens}</span>
                    <span className="w-8 text-right text-xs text-gray-700">{pct}%</span>
                  </div>
                )
              })}
              <div className="mt-2 flex items-center gap-3 border-t border-gray-200 pt-2">
                <span className="w-36 shrink-0 text-xs font-semibold text-gray-400">Total</span>
                <div className="flex-1" />
                <span className={`w-16 text-right font-mono text-xs font-bold ${totalWeight.color.split(" ")[0]}`}>~{tkTotal}</span>
                <span className={`w-16 text-right text-xs font-semibold ${totalWeight.color.split(" ")[0]}`}>{totalWeight.label}</span>
              </div>
            </div>
          </div>

          {/* Efficiency Metrics */}
          {playbookScored.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <button
                className="flex w-full items-center justify-between"
                onClick={() => setShowEfficiency(!showEfficiency)}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Context Efficiency</p>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-green-900/40 bg-green-950/10 px-2.5 py-0.5 text-xs text-green-500 font-mono">
                    ~{tokensSaved}tk saved vs rich
                  </span>
                  <span className="text-xs text-gray-700">{showEfficiency ? "▲" : "▼"}</span>
                </div>
              </button>
              {showEfficiency && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-gray-200 bg-black p-3">
                      <p className="text-xs text-gray-600">Mode</p>
                      <p className={`mt-1 text-sm font-semibold ${MODE_LABELS[mode].color.split(" ").find(c => c.startsWith("text-")) ?? "text-gray-900"}`}>
                        {MODE_LABELS[mode].label}
                      </p>
                      <p className="text-xs text-gray-700">{MODE_LABELS[mode].desc}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-black p-3">
                      <p className="text-xs text-gray-600">Playbook Entries</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {injected.length} / {playbookScored.length}
                      </p>
                      <p className="text-xs text-gray-700">{skipped.length} filtered out</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-black p-3">
                      <p className="text-xs text-gray-600">Tokens Saved</p>
                      <p className="mt-1 text-sm font-semibold text-green-400 font-mono">~{tokensSaved}tk</p>
                      <p className="text-xs text-gray-700">vs rich mode baseline</p>
                    </div>
                  </div>

                  {/* Relevance score table */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="grid grid-cols-4 gap-0 border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      <span>Entry</span>
                      <span>Section</span>
                      <span className="text-right">Score</span>
                      <span className="text-right">Status</span>
                    </div>
                    {playbookScored
                      .sort((a, b) => b.relevanceScore - a.relevanceScore)
                      .map(e => (
                        <div key={e.id} className="grid grid-cols-4 gap-0 border-b border-gray-200 px-4 py-2 last:border-0">
                          <span className="text-xs text-gray-400 truncate pr-2">
                            {e.title.length > 28 ? e.title.slice(0, 26) + "…" : e.title}
                          </span>
                          <span className="text-xs text-gray-600">[{e.section}]</span>
                          <span className="text-right font-mono text-xs text-gray-400">{e.relevanceScore}</span>
                          <span className="text-right">
                            {e.injected ? (
                              <span className="text-xs text-green-500">injected</span>
                            ) : (
                              <span className="text-xs text-gray-600" title={e.skipReason}>skipped</span>
                            )}
                          </span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Relevance context debug */}
                  <div className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                    <p className="mb-2 text-xs font-semibold text-gray-700">Relevance Context</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                        platform: {relCtx.platform ?? "none"}
                      </span>
                      <span className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                        type: {relCtx.deliverableType ?? "none"}
                      </span>
                      {relCtx.tags?.map(t => (
                        <span key={t} className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                          tag:{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

'use client'
/* eslint-disable @next/next/no-img-element -- selected assets use short-lived signed storage URLs */

import { useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '@/components/layout/sidebar'

type ClientOption = {
  id: string
  name: string
  industry: string | null
  status: string | null
  compatible: boolean
}

type SelectorRecord = {
  id: string
  stable_key: string
  title: string
  subsection: 'menus' | 'activations'
  status: string
}

type PromptSection = { id: string; label: string; priority: string; items: string[] }
type PromptConstraint = { id: string; level: 'hard_rule' | 'strong_preference' | 'preference'; instruction: string; origin: string }
type PromptWarning = { code: string; message: string; disposition: 'hard_constraint' | 'missing_information' | 'review_warning' | 'executor_instruction'; executor_instruction: string }
type PromptAsset = {
  id: string
  semantic_name: string
  category: string
  role: string
  approved_for_generation: boolean
  url: string | null
  description: string | null
  ingredients: string[]
  allergens: string[]
  dietary: string[]
  visual_presentation: string | null
  tags: string[]
  menu_ids: string[]
  activation_ids: string[]
  source_ids: string[]
  ranking_reason: string
}
type RetrievalTrace = {
  profile: string
  filters: Record<string, unknown>
  records_considered: Record<string, number>
  records_excluded: Array<{ area: string; record_id: string; reason: string }>
  asset_ranking: Array<{ asset_id: string; rank: number; reason: string }>
  warnings_produced: string[]
}
type PromptDebug = {
  retrieval_profile: string
  assembly_profile: string
  sections_included: string[]
  sections_omitted: string[]
  hard_constraints_created: string[]
  warnings_propagated: string[]
  context_trimmed: boolean
  trimmed_sections: string[]
  asset_order: Array<{ asset_id: string; position: number; ranking_reason: string }>
  retrieval_trace: RetrievalTrace
  rendered_prompt_preview: string
}
type PromptPackage = {
  task: string
  task_type: string
  execution_target: string
  system_context: PromptSection
  client_context: PromptSection
  task_context: PromptSection
  creative_context: PromptSection
  factual_context: PromptSection
  operational_context: PromptSection
  asset_references: PromptAsset[]
  constraints: PromptConstraint[]
  warnings: PromptWarning[]
  missing_information: string[]
  source_notes: string[]
  learnings: string[]
  output_instructions: string[]
  rendered_prompt: string
  estimated_context_size: {
    max_context_chars: number
    structured_payload_chars: number
    rendered_prompt_chars: number
    estimated_tokens: number
    response_payload_bytes: number
    context_trimmed: boolean
    trimmed_sections: string[]
    exceeded_budget_by_chars: number
  }
  timings: { retrieval_ms: number; assembly_ms: number; total_ms: number }
  debug?: PromptDebug
}

const TASK_TYPES = [
  ['campaign_planning', 'Campaign Planning'],
  ['caption_writing', 'Caption Writing'],
  ['image_generation', 'Image Generation'],
  ['video_generation', 'Video Generation'],
  ['general_marketing', 'General Marketing'],
  ['client_response', 'Client Response'],
  ['strategy_support', 'Strategy Support'],
] as const

const EXECUTION_TARGETS = [
  ['generic_llm', 'Generic LLM'],
  ['image_generation', 'Image Generation'],
  ['video_generation', 'Video Generation'],
  ['social_caption', 'Social Caption'],
  ['campaign_strategy', 'Campaign Strategy'],
  ['client_response', 'Client Response'],
] as const

const ASSET_CATEGORIES = [
  ['food', 'Food'],
  ['drinks', 'Drinks'],
  ['interiors', 'Interiors'],
  ['exteriors', 'Exteriors'],
  ['venue_items', 'Venue Items'],
] as const

type FormState = {
  task: string
  taskType: string
  executionTarget: string
  activation: string
  menu: string
  assetCategories: string[]
  maxAssets: number
  includeSources: boolean
  includeLearnings: boolean
  debug: boolean
  maxContextChars: number
  freshnessMode: 'current' | 'include_scheduled' | 'include_review'
}

const INITIAL_FORM: FormState = {
  task: '',
  taskType: 'campaign_planning',
  executionTarget: 'campaign_strategy',
  activation: '',
  menu: '',
  assetCategories: [],
  maxAssets: 6,
  includeSources: false,
  includeLearnings: false,
  debug: true,
  maxContextChars: 16_000,
  freshnessMode: 'current',
}

const PRESETS: Array<{ label: string; values: Partial<FormState> }> = [
  { label: 'Business Lunch Campaign', values: { task: 'Create a campaign concept for DemoClientB Business Lunch.', taskType: 'campaign_planning', executionTarget: 'campaign_strategy', activation: 'Business Lunch', menu: '' } },
  { label: 'Breakfast Image', values: { task: 'Create a cinematic breakfast campaign image.', taskType: 'image_generation', executionTarget: 'image_generation', activation: 'Italian Breakfast', menu: 'Breakfast Menu', assetCategories: ['food', 'drinks'] } },
  { label: 'Karaoke Caption', values: { task: 'Write an Instagram caption for Karaoke Night.', taskType: 'caption_writing', executionTarget: 'social_caption', activation: 'Karaoke Night', menu: '', assetCategories: [] } },
  { label: 'Interior Image', values: { task: 'Create a cinematic image of the DemoClientB interior.', taskType: 'image_generation', executionTarget: 'image_generation', activation: '', menu: '', assetCategories: ['interiors'] } },
  { label: 'Closing Time Reply', values: { task: 'Reply to a customer asking what time DemoClientB closes tonight.', taskType: 'client_response', executionTarget: 'client_response', activation: '', menu: '', assetCategories: [] } },
]

const INPUT_CLASS = 'mt-1.5 min-h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-white/22 focus:border-emerald-300/55 focus:ring-2 focus:ring-emerald-300/10'

function labelFor(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) {
  const styles = {
    neutral: 'border-white/10 bg-white/[0.04] text-white/55',
    green: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    amber: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    red: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
    blue: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  }
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${styles[tone]}`}>{children}</span>
}

function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <section className={`border-t border-white/10 py-6 first:border-t-0 first:pt-0 ${className}`}>
    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-white/42">{description}</p> : null}
      </div>
    </div>
    {children}
  </section>
}

function ContextGroup({ label, section }: { label: string; section: PromptSection }) {
  if (!section.items.length) return null
  return <div className="border-l border-emerald-300/25 pl-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">{label}</p>
    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/62">
      {section.items.map((item, index) => <li key={`${section.id}-${index}`}>{item}</li>)}
    </ul>
  </div>
}

function WarningGroup({ title, warnings, tone }: { title: string; warnings: PromptWarning[]; tone: 'red' | 'amber' | 'blue' }) {
  if (!warnings.length) return null
  const border = tone === 'red' ? 'border-rose-300/25' : tone === 'amber' ? 'border-amber-300/25' : 'border-sky-300/25'
  return <div className={`border-l ${border} pl-3`}>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/52">{title}</p>
    <div className="mt-2 space-y-2">
      {warnings.map(warning => <div key={warning.code}>
        <p className="text-xs font-medium text-white/80">{warning.message}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/46">{warning.executor_instruction}</p>
      </div>)}
    </div>
  </div>
}

export default function PromptInspectorPage() {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectorOptions, setSelectorOptions] = useState<{ menus: SelectorRecord[]; activations: SelectorRecord[] }>({ menus: [], activations: [] })
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [loadingClients, setLoadingClients] = useState(true)
  const [selectorLoading, setSelectorLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PromptPackage | null>(null)
  const [copied, setCopied] = useState(false)
  const selectorRequest = useRef(0)

  const selectedClient = useMemo(() => clients.find(client => client.id === selectedClientId) ?? null, [clients, selectedClientId])
  const canRun = Boolean(selectedClient?.compatible && form.task.trim() && !running)

  async function loadSelectorOptions(client: ClientOption) {
    if (!client.compatible) return
    const requestId = ++selectorRequest.current
    setSelectorLoading(true)
    try {
      const response = await fetch(`/api/clients/${client.id}/brain-v2/selector-options`, { cache: 'no-store' })
      const payload = await response.json() as { success: boolean; menus?: SelectorRecord[]; activations?: SelectorRecord[]; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load Client Brain selectors.')
      if (requestId !== selectorRequest.current) return
      setSelectorOptions({ menus: payload.menus ?? [], activations: payload.activations ?? [] })
    } catch (loadError) {
      if (requestId === selectorRequest.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load Client Brain selectors.')
    } finally {
      if (requestId === selectorRequest.current) setSelectorLoading(false)
    }
  }

  function selectClient(clientId: string) {
    const client = clients.find(item => item.id === clientId)
    selectorRequest.current += 1
    setSelectorOptions({ menus: [], activations: [] })
    setSelectedClientId(clientId)
    setResult(null)
    setError('')
    setForm(current => ({ ...current, menu: '', activation: '' }))
    if (client?.compatible) void loadSelectorOptions(client)
  }

  useEffect(() => {
    let active = true
    async function loadClients() {
      try {
        const response = await fetch('/api/clients/brain-v2/options', { cache: 'no-store' })
        const payload = await response.json() as { success: boolean; clients?: ClientOption[]; error?: string }
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load clients.')
        if (!active) return
        const nextClients = payload.clients ?? []
        setClients(nextClients)
        const initialClient = nextClients.find(client => client.compatible) ?? nextClients[0] ?? null
        if (initialClient) {
          setSelectedClientId(initialClient.id)
          if (initialClient.compatible) void loadSelectorOptions(initialClient)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load clients.')
      } finally {
        if (active) setLoadingClients(false)
      }
    }
    void loadClients()
    return () => { active = false }
  }, [])

  function updateForm(patch: Partial<FormState>) {
    setForm(current => ({ ...current, ...patch }))
  }

  function toggleAssetCategory(category: string) {
    setForm(current => ({
      ...current,
      assetCategories: current.assetCategories.includes(category)
        ? current.assetCategories.filter(item => item !== category)
        : [...current.assetCategories, category],
    }))
  }

  function applyPreset(values: Partial<FormState>) {
    setForm(current => ({ ...current, ...values }))
    setResult(null)
    setError('')
  }

  async function runDryTest() {
    if (!selectedClient?.compatible || !form.task.trim()) return
    setRunning(true)
    setError('')
    setCopied(false)
    try {
      const response = await fetch(`/api/clients/${selectedClient.id}/brain-v2/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: form.task,
          task_type: form.taskType,
          execution_target: form.executionTarget,
          activation: form.activation || undefined,
          menu: form.menu || undefined,
          asset_categories: form.assetCategories.length ? form.assetCategories : undefined,
          max_assets: form.maxAssets,
          include_sources: form.includeSources,
          include_learnings: form.includeLearnings,
          freshness_mode: form.freshnessMode,
          max_context_chars: form.maxContextChars,
          debug: form.debug,
        }),
      })
      const payload = await response.json() as (PromptPackage & { success?: boolean; error?: string })
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Prompt assembly failed.')
      setResult(payload)
    } catch (runError) {
      setResult(null)
      setError(runError instanceof Error ? runError.message : 'Prompt assembly failed.')
    } finally {
      setRunning(false)
    }
  }

  async function copyPrompt() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.rendered_prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Unable to copy the prompt. Select the text manually instead.')
    }
  }

  const hardWarnings = result?.warnings.filter(warning => warning.disposition === 'hard_constraint') ?? []
  const reviewWarnings = result?.warnings.filter(warning => warning.disposition === 'review_warning' || warning.disposition === 'executor_instruction') ?? []
  const missingWarnings = result?.warnings.filter(warning => warning.disposition === 'missing_information') ?? []
  const hardConstraints = result?.constraints.filter(constraint => constraint.level === 'hard_rule') ?? []

  return <main className="jarvis-dark-shell min-h-screen bg-[#020403] text-white">
    <Sidebar />
    <div className="jarvis-page">
      <header className="jarvis-hero mb-7">
        <p className="jarvis-eyebrow">Internal workspace</p>
        <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Prompt Inspector</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48">Inspect deterministic Client Brain context before any future execution layer. This workspace only retrieves and assembles a prompt package.</p>
      </header>

      <section className="jarvis-panel p-5 md:p-6">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Dry Run Setup</h2>
            <p className="mt-1 text-xs text-white/42">No provider, generation, publish, or database write is available here.</p>
          </div>
          <Pill tone="blue">Read only</Pill>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="Test scenario presets">
          {PRESETS.map(preset => <button key={preset.label} type="button" onClick={() => applyPreset(preset.values)} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/62 transition hover:border-emerald-300/35 hover:text-emerald-100">{preset.label}</button>)}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Client
            <select value={selectedClientId} onChange={event => selectClient(event.target.value)} disabled={loadingClients} className={INPUT_CLASS}>
              {!clients.length ? <option value="">{loadingClients ? 'Loading clients…' : 'No clients available'}</option> : null}
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}{client.compatible ? ' · V2 ready' : ' · V2 unavailable'}</option>)}
            </select>
          </label>
          <div className="rounded-md border border-white/10 bg-black/20 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Compatibility</p>
            {selectedClient ? <div className="mt-2 flex items-center gap-2"><Pill tone={selectedClient.compatible ? 'green' : 'amber'}>{selectedClient.compatible ? 'V2 retrieval ready' : 'Unsupported client'}</Pill><span className="text-xs text-white/45">{selectedClient.industry || 'No industry recorded'}</span></div> : <p className="mt-2 text-xs text-white/42">Select a client to continue.</p>}
          </div>
        </div>

        {selectedClient && !selectedClient.compatible ? <div className="mt-5 border-l border-amber-300/40 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100">This client does not use Hospitality Client Brain V2, so Prompt Assembly cannot run for it yet.</div> : null}

        <label className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">What should Jarvis do?
          <textarea value={form.task} onChange={event => updateForm({ task: event.target.value })} rows={5} className={`${INPUT_CLASS} resize-y py-3 leading-relaxed`} placeholder="Create a campaign concept for Business Lunch.\nCreate a cinematic breakfast image.\nWrite an Instagram caption for Karaoke Night." />
        </label>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Task Type
            <select value={form.taskType} onChange={event => updateForm({ taskType: event.target.value })} className={INPUT_CLASS}>{TASK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Execution Target
            <select value={form.executionTarget} onChange={event => updateForm({ executionTarget: event.target.value })} className={INPUT_CLASS}>{EXECUTION_TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Activation <span className="text-white/25">optional</span>
            <select value={form.activation} onChange={event => updateForm({ activation: event.target.value })} disabled={!selectedClient?.compatible || selectorLoading} className={INPUT_CLASS}>
              <option value="">No activation selected</option>{selectorOptions.activations.map(item => <option key={item.id} value={item.title}>{item.title} · {labelFor(item.status)}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Menu <span className="text-white/25">optional</span>
            <select value={form.menu} onChange={event => updateForm({ menu: event.target.value })} disabled={!selectedClient?.compatible || selectorLoading} className={INPUT_CLASS}>
              <option value="">No menu selected</option>{selectorOptions.menus.map(item => <option key={item.id} value={item.title}>{item.title} · {labelFor(item.status)}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Max Assets
            <input type="number" min={1} max={12} value={form.maxAssets} onChange={event => updateForm({ maxAssets: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} className={INPUT_CLASS} />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Asset Categories <span className="normal-case tracking-normal text-white/25">optional</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">{ASSET_CATEGORIES.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-md border px-3 py-2 text-xs transition ${form.assetCategories.includes(value) ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.02] text-white/52 hover:text-white/75'}`}><input type="checkbox" className="sr-only" checked={form.assetCategories.includes(value)} onChange={() => toggleAssetCategory(value)} />{label}</label>)}</div>
        </fieldset>

        <div className="mt-5 border-t border-white/10 pt-4">
          <button type="button" onClick={() => setAdvancedOpen(current => !current)} className="text-xs font-semibold text-white/58 transition hover:text-white">{advancedOpen ? 'Hide' : 'Show'} advanced controls</button>
          {advancedOpen ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-xs text-white/62"><input type="checkbox" checked={form.includeSources} onChange={event => updateForm({ includeSources: event.target.checked })} /> Include Sources</label>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-xs text-white/62"><input type="checkbox" checked={form.includeLearnings} onChange={event => updateForm({ includeLearnings: event.target.checked })} /> Include Learnings</label>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-xs text-white/62"><input type="checkbox" checked={form.debug} onChange={event => updateForm({ debug: event.target.checked })} /> Debug <span className="text-white/30">dev only</span></label>
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Freshness Mode<select value={form.freshnessMode} onChange={event => updateForm({ freshnessMode: event.target.value as FormState['freshnessMode'] })} className={INPUT_CLASS}><option value="current">Current only</option><option value="include_scheduled">Include scheduled</option><option value="include_review">Include review</option></select></label>
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Max Context Characters<input type="number" min={1000} max={50000} step={1000} value={form.maxContextChars} onChange={event => updateForm({ maxContextChars: Math.min(50000, Math.max(1000, Number(event.target.value) || 1000)) })} className={INPUT_CLASS} /></label>
          </div> : null}
        </div>

        {error ? <div className="mt-5 border-l border-rose-300/40 bg-rose-300/[0.05] px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
          <p className="text-xs text-white/36">Calls Prompt Assembly V1 only. Nothing is sent downstream.</p>
          <button type="button" onClick={() => void runDryTest()} disabled={!canRun} className="jarvis-button min-h-11 disabled:cursor-not-allowed disabled:opacity-40">{running ? 'Running dry test…' : 'Run Dry Test'}</button>
        </div>
      </section>

      {result ? <section className="jarvis-panel mt-6 p-5 md:p-6">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="jarvis-eyebrow">Inspection result</p><h2 className="mt-2 text-xl font-semibold text-white">Final Prompt Package</h2></div>
          <div className="flex flex-wrap gap-2"><Pill tone="green">Dry run complete</Pill><Pill>{result.execution_target.replace(/_/g, ' ')}</Pill></div>
        </div>

        <Panel title="Task Understanding" description="The exact request supplied to Prompt Assembly V1.">
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Client</p><p className="mt-1 text-white/75">{selectedClient?.name}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Task Type</p><p className="mt-1 text-white/75">{labelFor(result.task_type)}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Execution Target</p><p className="mt-1 text-white/75">{labelFor(result.execution_target)}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Optional Context</p><p className="mt-1 text-white/75">{[form.activation, form.menu, form.assetCategories.map(labelFor).join(', ')].filter(Boolean).join(' · ') || 'None selected'}</p></div>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-white/62">{result.task}</p>
        </Panel>

        <Panel title="Retrieved Context" description="Semantic context returned through selective retrieval and Prompt Assembly. Raw JSON is not required to interpret this result.">
          <div className="grid gap-5 lg:grid-cols-2">
            <ContextGroup label="Brand Identity" section={result.client_context} />
            <ContextGroup label="Menus & Activations" section={result.task_context} />
            <ContextGroup label="Visual DNA / Creative Guidance" section={result.creative_context} />
            <ContextGroup label="Audience / Commercial / Market" section={result.factual_context} />
            <ContextGroup label="Verified Operations" section={result.operational_context} />
            {result.learnings.length ? <div className="border-l border-emerald-300/25 pl-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Learnings</p><ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/62">{result.learnings.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
            {result.source_notes.length ? <div className="border-l border-emerald-300/25 pl-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Sources</p><ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/62">{result.source_notes.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
          </div>
        </Panel>

        <Panel title="Included / Excluded" description="Why Prompt Assembly used or left out the available context.">
          {result.debug ? <div className="grid gap-5 lg:grid-cols-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Included</p><div className="mt-2 flex flex-wrap gap-2">{result.debug.sections_included.map(item => <Pill key={item} tone="green">{labelFor(item)}</Pill>)}{result.debug.asset_order.map(asset => <Pill key={asset.asset_id} tone="green">Asset {asset.position}</Pill>)}</div></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/80">Excluded</p>{result.debug.retrieval_trace.records_excluded.length || result.debug.sections_omitted.length ? <ul className="mt-2 space-y-2 text-xs text-white/58">{result.debug.retrieval_trace.records_excluded.map(item => <li key={`${item.area}-${item.record_id}`}><span className="font-medium text-white/76">{labelFor(item.area)}</span>: {item.reason}</li>)}{result.debug.sections_omitted.map(item => <li key={item}><span className="font-medium text-white/76">{labelFor(item)}</span>: removed by context budget.</li>)}</ul> : <p className="mt-2 text-xs text-white/42">No records were excluded by the active retrieval trace.</p>}</div>
          </div> : <p className="text-sm text-white/44">Debug trace is available only in development when Debug is enabled.</p>}
        </Panel>

        <Panel title="Selected Assets" description="Only approved references selected by the existing retrieval layer appear here.">
          {result.asset_references.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{result.asset_references.map(asset => <article key={asset.id} className="border border-white/10 bg-black/20 p-3">
            <div className="aspect-[4/3] overflow-hidden bg-white/[0.04]">{asset.url ? <img src={asset.url} alt={asset.semantic_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-white/32">No preview available</div>}</div>
            <div className="mt-3 flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-white">{asset.semantic_name}</h3><Pill tone="green">Approved</Pill></div>
            <p className="mt-1 text-xs text-white/48">{labelFor(asset.category)} · {labelFor(asset.role)}</p>
            {asset.visual_presentation ? <p className="mt-3 text-xs leading-relaxed text-white/58">Visual presentation: {asset.visual_presentation}</p> : null}
            <p className="mt-3 text-xs leading-relaxed text-emerald-100/76">Selected: {asset.ranking_reason}</p>
            <div className="mt-3 space-y-1 text-[11px] text-white/40"><p>Menu links: {asset.menu_ids.length || 'none'}</p><p>Activation links: {asset.activation_ids.length || 'none'}</p>{asset.tags.length ? <p>Tags: {asset.tags.join(', ')}</p> : null}</div>
          </article>)}</div> : <div className="border-l border-amber-300/40 bg-amber-300/[0.05] px-4 py-4"><p className="text-sm font-medium text-amber-100">No eligible visual assets selected.</p><p className="mt-1 text-xs leading-relaxed text-amber-100/70">{hardWarnings.map(item => item.message).join(' ') || 'No matching approved references were returned for this request.'}</p></div>}
        </Panel>

        <Panel title="Warnings" description="Warnings remain visible instead of being buried in the prompt or debug output.">
          <div className="grid gap-5 lg:grid-cols-3"><WarningGroup title="Hard Blockers" warnings={hardWarnings} tone="red" /><WarningGroup title="Review Warnings" warnings={reviewWarnings} tone="amber" /><WarningGroup title="Missing Context" warnings={missingWarnings} tone="blue" /></div>
          {!result.warnings.length ? <p className="text-sm text-white/44">No warnings were returned.</p> : null}
        </Panel>

        <Panel title="Hard Constraints" description="Rules the future executor must obey.">
          <ul className="space-y-2">{hardConstraints.map(item => <li key={item.id} className="border-l border-rose-300/35 pl-3"><p className="text-sm text-white/76">{item.instruction}</p><p className="mt-0.5 text-xs text-white/38">{item.origin}</p></li>)}</ul>
        </Panel>

        <Panel title="Final Rendered Prompt" description="The exact deterministic prompt returned by Prompt Assembly. Copying does not send it anywhere.">
          <div className="mb-3 flex justify-end"><button type="button" onClick={() => void copyPrompt()} className="jarvis-muted-button px-3 py-2 text-xs">{copied ? 'Copied' : 'Copy Prompt'}</button></div>
          <pre className="max-h-[680px] overflow-auto whitespace-pre-wrap border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-emerald-50/85">{result.rendered_prompt}</pre>
        </Panel>

        <Panel title="Structured Package" description="Readable package sections, with raw JSON kept optional.">
          <div className="grid gap-3 md:grid-cols-2"><ContextGroup label="System Context" section={result.system_context} /><ContextGroup label="Output Requirements" section={{ id: 'output', label: 'Output Requirements', priority: 'must_obey', items: result.output_instructions }} /></div>
          <details className="mt-4 border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-xs font-semibold text-white/62">View raw JSON</summary><pre className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/56">{compactJson(result)}</pre></details>
        </Panel>

        <Panel title="Debug Trace" description="Development-only observability from the real selective retrieval and assembly path.">
          {result.debug ? <details className="border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-xs font-semibold text-white/62">View debug trace</summary><pre className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/56">{compactJson(result.debug)}</pre></details> : <p className="text-sm text-white/44">No debug trace was returned. Enable Debug in development to inspect retrieval filters and exclusions.</p>}
        </Panel>

        <Panel title="Metrics" description="Assembly cost and context-budget observability.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{[
            ['Retrieval', `${result.timings.retrieval_ms} ms`], ['Assembly', `${result.timings.assembly_ms} ms`], ['Total', `${result.timings.total_ms} ms`], ['Payload', `${result.estimated_context_size.response_payload_bytes.toLocaleString()} B`], ['Prompt', `${result.estimated_context_size.rendered_prompt_chars.toLocaleString()} chars`], ['Estimate', `${result.estimated_context_size.estimated_tokens.toLocaleString()} tokens`], ['Budget', `${result.estimated_context_size.max_context_chars.toLocaleString()} chars`], ['Trimmed', result.estimated_context_size.context_trimmed ? `Yes · ${result.estimated_context_size.trimmed_sections.join(', ')}` : 'No'],
          ].map(([label, value]) => <div key={label} className="border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">{label}</p><p className="mt-1 text-sm text-white/75">{value}</p></div>)}</div>
        </Panel>
      </section> : null}
    </div>
  </main>
}

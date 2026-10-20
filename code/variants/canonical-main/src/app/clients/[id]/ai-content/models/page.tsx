"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import {
  AI_MODEL_REFERENCE_SLOTS,
  type AiModel,
  type AiModelAsset,
  type AiModelOutfit,
  type ParsedCharacterBrief,
  aiModelStatusLabel,
  parseCharacterBrief,
} from "@/lib/ai-model-library"
import { AiPhotographyNav } from "../components/ai-photography-nav"

type Client = {
  id: string
  name: string
  industry: string | null
  status: string
}

type CreationStep = "choice" | "import" | "review"

const CONTROL_CLASS = "mt-1.5 w-full rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60"
const TEXTAREA_CLASS = "mt-1.5 w-full rounded-2xl border border-white/10 bg-black/30 px-3.5 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60"
const SECONDARY_BUTTON_CLASS = "rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
const PRIMARY_BUTTON_CLASS = "rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"

function latestApprovedPortrait(model: AiModel, assets: AiModelAsset[]) {
  return assets
    .filter(asset => asset.model_id === model.id && asset.asset_type === "front_face" && asset.status === "approved" && asset.image_url)
    .sort((left, right) => right.version_number - left.version_number)[0]?.image_url ?? null
}

function assetCount(model: AiModel, assets: AiModelAsset[]) {
  return assets.filter(asset => asset.model_id === model.id).length
}

function outfitCount(model: AiModel, outfits: AiModelOutfit[]) {
  return outfits.filter(outfit => outfit.model_id === model.id && outfit.status !== "archived").length
}

function requiredSlotCount(model: AiModel, assets: AiModelAsset[]) {
  return AI_MODEL_REFERENCE_SLOTS.filter(slot =>
    assets.some(asset => asset.model_id === model.id && asset.asset_type === slot.key && asset.status === "approved" && asset.image_url)
  ).length
}

function needsMetadata(model: AiModel) {
  return !model.model_name || !model.model_role || !model.age || !model.gender || !model.nationality || !model.base_prompt
}

function creationWarnings(draft: ParsedCharacterBrief | null) {
  if (!draft) return []
  return [
    !draft.model_name ? "Missing name" : "",
    !draft.age ? "Missing age" : "",
    !draft.height ? "Height recommended for body consistency" : "",
    !draft.gender ? "Missing gender" : "",
    !draft.nationality ? "Missing nationality" : "",
    !draft.ethnicity_appearance_notes ? "Missing appearance notes" : "",
    !draft.approved_usage ? "Missing usage rules" : "",
    !draft.negative_prompt ? "Missing negative prompt" : "",
  ].filter(Boolean)
}

function canCreateCharacter(draft: ParsedCharacterBrief | null) {
  return Boolean(draft?.model_name?.trim() && draft.model_role?.trim() && draft.age && draft.gender?.trim())
}

export default function AiModelLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [models, setModels] = useState<AiModel[]>([])
  const [assets, setAssets] = useState<AiModelAsset[]>([])
  const [outfits, setOutfits] = useState<AiModelOutfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creationStep, setCreationStep] = useState<CreationStep>("choice")
  const [characterBrief, setCharacterBrief] = useState("")
  const [modelNameOverride, setModelNameOverride] = useState("")
  const [parsedModel, setParsedModel] = useState<ParsedCharacterBrief | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [clientRes, modelsRes, assetsRes, outfitsRes] = await Promise.all([
      supabase.from("clients").select("id, name, industry, status").eq("id", id).single(),
      supabase.from("ai_models").select("*").eq("client_id", id).neq("status", "archived").order("updated_at", { ascending: false }),
      supabase.from("ai_model_assets").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("ai_model_outfits").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    ])

    if (clientRes.error) setError(clientRes.error.message)
    else setClient(clientRes.data as Client)
    if (modelsRes.error) setError(modelsRes.error.message)
    else setModels((modelsRes.data ?? []) as AiModel[])
    if (assetsRes.error) setError(assetsRes.error.message)
    else setAssets((assetsRes.data ?? []) as AiModelAsset[])
    if (outfitsRes.error) setError(outfitsRes.error.message)
    else setOutfits((outfitsRes.data ?? []) as AiModelOutfit[])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  function resetCreateFlow() {
    setCreationStep("choice")
    setCharacterBrief("")
    setModelNameOverride("")
    setParsedModel(null)
    setError("")
  }

  function openCreateFlow() {
    resetCreateFlow()
    setCreateOpen(true)
  }

  function closeCreateFlow() {
    setCreateOpen(false)
    resetCreateFlow()
  }

  function parseBrief() {
    if (!characterBrief.trim()) {
      setError("Paste a character brief before parsing.")
      return
    }
    setError("")
    setParsedModel(parseCharacterBrief(characterBrief, {
      clientName: client?.name,
      modelNameOverride,
    }))
    setCreationStep("review")
  }

  function patchParsedModel(patch: Partial<ParsedCharacterBrief>) {
    setParsedModel(previous => previous ? { ...previous, ...patch } : previous)
  }

  async function createImportedModel() {
    if (!canCreateCharacter(parsedModel)) {
      setError("Model name, role, age, and gender are required before creating the character.")
      return
    }
    setCreating(true)
    setError("")
    const { data, error: createError } = await supabase
      .from("ai_models")
      .insert({
        client_id: id,
        model_name: parsedModel!.model_name,
        model_role: parsedModel!.model_role,
        age: parsedModel!.age,
        height: parsedModel!.height,
        gender: parsedModel!.gender,
        nationality: parsedModel!.nationality,
        ethnicity_appearance_notes: parsedModel!.ethnicity_appearance_notes,
        hair_description: parsedModel!.hair_description,
        eye_description: parsedModel!.eye_description,
        skin_tone: parsedModel!.skin_tone,
        body_type: parsedModel!.body_type,
        personality: parsedModel!.personality,
        brand_role: parsedModel!.brand_role,
        approved_usage: parsedModel!.approved_usage,
        restricted_usage: parsedModel!.restricted_usage,
        base_prompt: parsedModel!.base_prompt,
        negative_prompt: parsedModel!.negative_prompt,
        realism_prompt: parsedModel!.realism_prompt,
        quality_prompt: parsedModel!.quality_prompt,
        status: parsedModel!.status,
      })
      .select("id")
      .single()
    setCreating(false)
    if (createError) {
      setError(createError.message)
      return
    }
    closeCreateFlow()
    if (data?.id) router.push(`/clients/${id}/ai-content/models/${data.id}`)
  }

  async function createManualModel() {
    setCreating(true)
    setError("")
    const { data, error: createError } = await supabase
      .from("ai_models")
      .insert({
        client_id: id,
        model_name: "Untitled Model",
        model_role: "Brand Character",
        status: "draft",
      })
      .select("id")
      .single()
    setCreating(false)
    if (createError) {
      setError(createError.message)
      return
    }
    closeCreateFlow()
    if (data?.id) router.push(`/clients/${id}/ai-content/models/${data.id}`)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#050705] text-zinc-100">
        <Sidebar />
        <section className="flex-1 p-10 text-sm text-zinc-500">Loading model library...</section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-[#050705] text-zinc-100">
      <Sidebar />
      <section className="relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_75%_10%,rgba(34,197,94,0.22),transparent_34%),linear-gradient(180deg,#070a08_0%,#030403_100%)]" />
        <div className="relative z-10 w-full space-y-6">
          <div className="sticky top-0 z-30 rounded-[1.75rem] border border-white/10 bg-[#070a08]/90 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <Link href={`/clients/${id}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-emerald-300/40 hover:text-emerald-100">← Back to client</Link>
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-500">{client?.name ?? "Client"}</p>
                  <h1 className="truncate text-sm font-semibold text-zinc-100">AI Photography</h1>
                </div>
                <AiPhotographyNav clientId={id} active="models" />
              </div>
              <button
                type="button"
                onClick={openCreateFlow}
                disabled={creating}
                className="rounded-2xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-40"
              >
                {creating ? "Creating..." : "Create Model"}
              </button>
            </div>
          </div>

          <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] px-7 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:px-9">
            <div className="absolute right-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="relative">
              <p className="text-sm text-zinc-500">{client?.name ?? "Client"}</p>
              <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-tight text-zinc-50 md:text-6xl">AI Model Library</h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Reusable brand characters with identity profiles, reference slots, outfit systems, prompt generation, and version history.
              </p>
            </div>
          </header>

          {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map(model => {
              const portrait = latestApprovedPortrait(model, assets)
              const metadataMissing = needsMetadata(model)
              return (
                <Link
                  key={model.id}
                  href={`/clients/${id}/ai-content/models/${model.id}`}
                  className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl transition hover:border-emerald-300/35 hover:bg-white/[0.065]"
                >
                  <div className="aspect-[4/5] bg-black/35">
                    {portrait ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portrait} alt={model.model_name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-600">Reference portrait pending</div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight text-zinc-50">{model.model_name}</h2>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/60">{model.model_role ?? "Brand Character"}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        metadataMissing ? "border-amber-300/25 bg-amber-400/10 text-amber-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      }`}>
                        {metadataMissing ? "Needs metadata" : aiModelStatusLabel(model.status)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      {model.age && <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">{model.age}</span>}
                      {model.height && <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">{model.height}</span>}
                      {model.nationality && <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">{model.nationality}</span>}
                      {model.gender && <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">{model.gender}</span>}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-400">{model.ethnicity_appearance_notes || model.personality || "Identity profile pending."}</p>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                        <p className="font-semibold text-zinc-100">{requiredSlotCount(model, assets)}/4</p>
                        <p className="mt-1 text-zinc-500">Refs</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                        <p className="font-semibold text-zinc-100">{outfitCount(model, outfits)}</p>
                        <p className="mt-1 text-zinc-500">Outfits</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                        <p className="font-semibold text-zinc-100">{assetCount(model, assets)}</p>
                        <p className="mt-1 text-zinc-500">Versions</p>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
            {models.length === 0 && (
              <div className="rounded-[2rem] border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center text-sm text-zinc-500 md:col-span-2 xl:col-span-3">
                No models yet. Create the first reusable AI model for this client.
              </div>
            )}
          </section>
        </div>
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={closeCreateFlow}>
          <section className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#070a08] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/60">Create Character</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">
                  {creationStep === "choice" ? "Choose creation method" : creationStep === "import" ? "Import Character Brief" : "Review Parsed Model"}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">Client locked to {client?.name ?? "current client"}</p>
              </div>
              <button type="button" onClick={closeCreateFlow} className={SECONDARY_BUTTON_CLASS}>Close</button>
            </div>

            <div className="max-h-[calc(92vh-84px)] overflow-y-auto p-5">
              {creationStep === "choice" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCreationStep("import")}
                    className="rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 p-6 text-left transition hover:border-emerald-300/50"
                  >
                    <span className="rounded-full border border-emerald-300/25 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Recommended</span>
                    <h3 className="mt-5 text-2xl font-semibold text-zinc-50">Import Character Brief</h3>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">Paste a ChatGPT character description and Jarvis will structure the model profile, prompts, usage rules, and missing-field warnings.</p>
                  </button>
                  <button
                    type="button"
                    onClick={createManualModel}
                    disabled={creating}
                    className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 text-left transition hover:border-emerald-300/35 disabled:opacity-40"
                  >
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Blank draft</span>
                    <h3 className="mt-5 text-2xl font-semibold text-zinc-50">Manual Model</h3>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">Create an empty draft and fill the character profile later inside Character Studio.</p>
                  </button>
                </div>
              )}

              {creationStep === "import" && (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                  <aside className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                    <h3 className="text-sm font-semibold text-zinc-100">Import flow</h3>
                    <ol className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-500">
                      <li>1. Paste a paragraph or structured brief.</li>
                      <li>2. Parse into model fields.</li>
                      <li>3. Review and edit before saving.</li>
                      <li>4. Open directly in Character Studio.</li>
                    </ol>
                  </aside>
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-semibold text-zinc-400">Client</span>
                      <input value={client?.name ?? "Current client"} readOnly className={`${CONTROL_CLASS} cursor-not-allowed text-zinc-400`} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-zinc-400">Optional model name override</span>
                      <input value={modelNameOverride} onChange={event => setModelNameOverride(event.target.value)} placeholder="Sofia" className={CONTROL_CLASS} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-zinc-400">Character Brief</span>
                      <textarea
                        value={characterBrief}
                        onChange={event => setCharacterBrief(event.target.value)}
                        rows={13}
                        placeholder="27-year-old Italian woman named Sofia with natural black wavy hair, warm brown eyes..."
                        className={TEXTAREA_CLASS}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCreationStep("choice")} className={SECONDARY_BUTTON_CLASS}>Back</button>
                      <button type="button" onClick={parseBrief} className={PRIMARY_BUTTON_CLASS}>Parse Brief</button>
                    </div>
                  </div>
                </div>
              )}

              {creationStep === "review" && parsedModel && (
                <div className="space-y-5">
                  {creationWarnings(parsedModel).length > 0 && (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                      <p className="font-semibold">Review warnings</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {creationWarnings(parsedModel).map(warning => (
                          <span key={warning} className="rounded-full border border-amber-300/20 bg-black/20 px-2.5 py-1 text-[11px]">{warning}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    <label><span className="text-xs font-semibold text-zinc-400">Model Name *</span><input value={parsedModel.model_name} onChange={event => patchParsedModel({ model_name: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Role *</span><input value={parsedModel.model_role} onChange={event => patchParsedModel({ model_role: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Age *</span><input type="number" value={parsedModel.age ?? ""} onChange={event => patchParsedModel({ age: event.target.value ? Number(event.target.value) : null })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Height <span className="font-normal text-zinc-600">(recommended)</span></span><input value={parsedModel.height} onChange={event => patchParsedModel({ height: event.target.value })} placeholder="170 cm or 5'7&quot;" className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Gender *</span><input value={parsedModel.gender} onChange={event => patchParsedModel({ gender: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Nationality</span><input value={parsedModel.nationality} onChange={event => patchParsedModel({ nationality: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Skin Tone</span><input value={parsedModel.skin_tone} onChange={event => patchParsedModel({ skin_tone: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Hair</span><input value={parsedModel.hair_description} onChange={event => patchParsedModel({ hair_description: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Eyes</span><input value={parsedModel.eye_description} onChange={event => patchParsedModel({ eye_description: event.target.value })} className={CONTROL_CLASS} /></label>
                    <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Appearance Notes</span><textarea value={parsedModel.ethnicity_appearance_notes} onChange={event => patchParsedModel({ ethnicity_appearance_notes: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Body Type</span><textarea value={parsedModel.body_type} onChange={event => patchParsedModel({ body_type: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
                    <label><span className="text-xs font-semibold text-zinc-400">Personality</span><textarea value={parsedModel.personality} onChange={event => patchParsedModel({ personality: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
                    <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Approved Usage</span><textarea value={parsedModel.approved_usage} onChange={event => patchParsedModel({ approved_usage: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                    <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Restricted Usage</span><textarea value={parsedModel.restricted_usage} onChange={event => patchParsedModel({ restricted_usage: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                    <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Base Prompt</span><textarea value={parsedModel.base_prompt} onChange={event => patchParsedModel({ base_prompt: event.target.value })} rows={5} className={TEXTAREA_CLASS} /></label>
                    <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Negative Prompt</span><textarea value={parsedModel.negative_prompt} onChange={event => patchParsedModel({ negative_prompt: event.target.value })} rows={4} className={TEXTAREA_CLASS} /></label>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCreationStep("import")} className={SECONDARY_BUTTON_CLASS}>Back to Brief</button>
                      <button type="button" onClick={parseBrief} className={SECONDARY_BUTTON_CLASS}>Re-parse</button>
                    </div>
                    <button
                      type="button"
                      onClick={createImportedModel}
                      disabled={creating || !canCreateCharacter(parsedModel)}
                      className={PRIMARY_BUTTON_CLASS}
                    >
                      {creating ? "Creating..." : "Create Character"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

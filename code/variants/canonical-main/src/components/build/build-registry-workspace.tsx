"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { BuildModel, BuildRegistrySnapshot, BuildSkill } from "@/lib/build-registry-server"
import { toolConnectionLabel, toolHealthLabel, toolOsLabel, toolUsageLabel, type ToolWithRelations } from "@/lib/tools"
import styles from "./build-registry-workspace.module.css"

type Tab = "tools" | "skills" | "models"
type Tone = "good" | "warn" | "bad" | "muted" | "plain"
type Cell = { label: string; value: string; tone?: Tone }
type Row = { id: string; mark: string; name: string; meta: string; description: string; cells: Cell[]; blocks: Array<{ title: string; text?: string; list?: string[]; chips?: string[] }>; footnote: string; links?: Array<{ label: string; href: string }> }

const TAB_VALUES: Tab[] = ["tools", "skills", "models"]
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())
const modelLabel = (skill: BuildSkill, models: BuildModel[]) => models.find(model => model.modelName === skill.modelRecommendation)?.displayName ?? skill.modelRecommendation ?? "No recommendation"

function toneForStatus(status: string): Tone {
  if (["active", "healthy", "connected", "available"].includes(status)) return "good"
  if (["partial", "configured", "experimental", "planned", "draft", "hybrid"].includes(status)) return "warn"
  if (["deprecated", "error", "rejected"].includes(status)) return "bad"
  return "muted"
}

function toolRows(tools: ToolWithRelations[]): Row[] {
  return tools.map(tool => ({
    id: tool.id,
    mark: tool.name.slice(0, 1),
    name: tool.name,
    meta: [tool.provider, tool.category.replaceAll("_", " "), tool.tool_type.replaceAll("_", " ")].filter((value): value is string => Boolean(value)).map(label).join(" · "),
    description: tool.description,
    cells: [
      { label: "Usage", value: toolUsageLabel(tool.usage_status), tone: toneForStatus(tool.usage_status) },
      { label: "Connection", value: toolConnectionLabel(tool.connection_status), tone: toneForStatus(tool.connection_status) },
      { label: "Health", value: toolHealthLabel(tool.health_status), tone: toneForStatus(tool.health_status) },
    ],
    blocks: [
      { title: "How Jarvis uses it", text: tool.jarvis_usage || "Not recorded." },
      { title: "Why this one", text: tool.why_we_use || "Not recorded." },
      { title: "Configuration", text: tool.configuration_summary || "Not recorded." },
      { title: "Capabilities it serves", list: tool.capabilityLinks.length ? tool.capabilityLinks.map(link => `${link.capability?.title ?? "Unresolved capability"}${link.capability ? ` · ${toolOsLabel(link.capability.os_slug)}` : ""}`) : ["No capability links recorded."] },
      ...(tool.alternatives.length ? [{ title: "Alternatives considered", chips: tool.alternatives }] : []),
    ],
    footnote: tool.last_verified_at ? `Last verified ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(tool.last_verified_at))}` : "Never verified",
    links: [
      ...(tool.official_website ? [{ label: "Official site", href: tool.official_website }] : []),
      ...(tool.documentation_url ? [{ label: "Documentation", href: tool.documentation_url }] : []),
    ],
  }))
}

function skillRows(skills: BuildSkill[], models: BuildModel[]): Row[] {
  return skills.map(skill => {
    const promoted = skill.lessons.filter(lesson => lesson.promoted).length
    const hasModel = Boolean(models.find(model => model.modelName === skill.modelRecommendation))
    return {
      id: skill.id,
      mark: skill.name.slice(0, 1),
      name: skill.name,
      meta: [skill.category, skill.agentName || "No agent assigned"].filter(Boolean).join(" · "),
      description: skill.description || "No description recorded.",
      cells: [
        { label: "Status", value: label(skill.status), tone: toneForStatus(skill.status) },
        { label: "Model", value: modelLabel(skill, models), tone: hasModel ? "plain" : "muted" },
        { label: "Lessons", value: skill.lessons.length ? `${promoted} of ${skill.lessons.length} promoted` : "None recorded", tone: skill.lessons.length ? "plain" : "muted" },
      ],
      blocks: [
        { title: "Instructions", text: skill.instructions || "No instructions recorded." },
        { title: "Lessons learned", list: skill.lessons.length ? skill.lessons.map(lesson => `${lesson.lesson}${lesson.promoted ? " · Promoted" : " · Recorded"}`) : ["No lessons recorded yet."] },
        { title: "Runtime linkage", list: skill.runtimeDefinitionIds.length ? [`Linked to ${skill.runtimeDefinitionIds.length} runtime definition${skill.runtimeDefinitionIds.length === 1 ? "" : "s"}.`] : ["No runtime definition links recorded."] },
      ],
      footnote: hasModel ? "Model recommendation is advisory; a runtime policy may override it." : skill.modelRecommendation ? "No pricing row exists for this model, so its spend cannot be estimated." : "No model recommendation recorded.",
      links: skill.agentName ? [{ label: "Open agent", href: "/agents" }] : undefined,
    }
  })
}

function modelRows(models: BuildModel[]): Row[] {
  return models.map(model => ({
    id: model.id,
    mark: model.provider.slice(0, 1),
    name: model.displayName || model.modelName,
    meta: `${model.provider} · ${model.modelName}`,
    description: model.referencedSkillNames.length ? `${model.referencedSkillNames.length} skill${model.referencedSkillNames.length === 1 ? "" : "s"} currently point${model.referencedSkillNames.length === 1 ? "s" : ""} at this recommendation.` : "Registered model with no skill recommendations.",
    cells: [
      { label: "Status", value: label(model.status), tone: toneForStatus(model.status) },
      { label: "Input / M", value: model.inputPricePerMillion === null ? "Not recorded" : `$${model.inputPricePerMillion.toFixed(2)}`, tone: model.inputPricePerMillion === null ? "muted" : "plain" },
      { label: "Output / M", value: model.outputPricePerMillion === null ? "Not recorded" : `$${model.outputPricePerMillion.toFixed(2)}`, tone: model.outputPricePerMillion === null ? "muted" : "plain" },
    ],
    blocks: [
      { title: "Skills pointing at this model", list: model.referencedSkillNames.length ? model.referencedSkillNames : ["No skill points at this model."] },
      { title: "Pricing", text: model.inputPricePerMillion === null || model.outputPricePerMillion === null ? "Pricing is not recorded. Spend against this model cannot be estimated until both prices are entered." : `Input $${model.inputPricePerMillion.toFixed(2)} and output $${model.outputPricePerMillion.toFixed(2)} per million tokens. Prices are entered manually and do not sync from providers.` },
    ],
    footnote: model.inputPricePerMillion === null || model.outputPricePerMillion === null ? "Enter pricing to enable estimates." : "Prices are entered by hand, not fetched from providers.",
  }))
}

export function BuildRegistryWorkspace({ initialSnapshot }: { initialSnapshot: BuildRegistrySnapshot }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const requestedTab = params.get("tab")
  const tab: Tab = TAB_VALUES.includes(requestedTab as Tab) ? requestedTab as Tab : "tools"
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = useMemo(() => tab === "tools" ? toolRows(initialSnapshot.tools) : tab === "skills" ? skillRows(initialSnapshot.skills, initialSnapshot.models) : modelRows(initialSnapshot.models), [initialSnapshot, tab])
  const configuration = useMemo(() => {
    if (tab === "tools") return {
      title: "Tools", subtitle: `${initialSnapshot.tools.length} registered`,
      filters: ["all", "active", "attention", "evaluation"],
      stats: [
        ["Connected", String(initialSnapshot.tools.filter(tool => tool.connection_status === "connected").length), "of registered tools", "good" as Tone],
        ["Needs attention", String(initialSnapshot.tools.filter(tool => tool.health_status === "needs_attention" || ["error", "partial"].includes(tool.connection_status)).length), "Health or connection needs review", "warn" as Tone],
        ["Under evaluation", String(initialSnapshot.tools.filter(tool => ["experimental", "planned", "explore"].includes(tool.usage_status)).length), "Experimental, planned, or explore", "plain" as Tone],
        ["Never verified", String(initialSnapshot.tools.filter(tool => !tool.last_verified_at).length), "No verification date on record", "muted" as Tone],
      ],
      include: (row: Row) => filter === "all" || filter === "active" && row.cells[0].value === "Active" || filter === "attention" && ["Needs Attention", "Error", "Partial"].some(value => row.cells.some(cell => cell.value === value)) || filter === "evaluation" && ["Experimental", "Planned", "Explore"].includes(row.cells[0].value),
    }
    if (tab === "skills") return {
      title: "Skills", subtitle: `${initialSnapshot.skills.length} defined`, filters: ["all", "active", "draft", "deprecated"],
      stats: [
        ["Active", String(initialSnapshot.skills.filter(skill => skill.status === "active").length), "of defined skills", "good" as Tone],
        ["Lessons promoted", `${initialSnapshot.skills.reduce((total, skill) => total + skill.lessons.filter(lesson => lesson.promoted).length, 0)} / ${initialSnapshot.skills.reduce((total, skill) => total + skill.lessons.length, 0)}`, "Promoted lessons enter their canonical memory flow", "plain" as Tone],
        ["No agent assigned", String(initialSnapshot.skills.filter(skill => !skill.agentName).length), "These skills cannot be called by an agent", "warn" as Tone],
        ["With a runtime", String(initialSnapshot.skills.filter(skill => skill.runtimeDefinitionIds.length > 0).length), "Explicit runtime-definition skill links", "muted" as Tone],
      ],
      include: (row: Row) => filter === "all" || row.cells[0].value.toLowerCase() === filter,
    }
    return {
      title: "AI models", subtitle: `${initialSnapshot.models.length} registered`, filters: ["all", "active", "unpriced"],
      stats: [
        ["Active", String(initialSnapshot.models.filter(model => model.status === "active").length), "of registered models", "good" as Tone],
        ["Priced", String(initialSnapshot.models.filter(model => model.inputPricePerMillion !== null && model.outputPricePerMillion !== null).length), "Prices are entered manually", "plain" as Tone],
        ["No pricing", String(initialSnapshot.models.filter(model => model.inputPricePerMillion === null || model.outputPricePerMillion === null).length), "Spend cannot be estimated for these", "muted" as Tone],
        ["In use by skills", String(initialSnapshot.models.filter(model => model.referencedSkillNames.length > 0).length), "Model recommendations only", "plain" as Tone],
      ],
      include: (row: Row) => filter === "all" || filter === "active" && row.cells[0].value === "Active" || filter === "unpriced" && row.cells.slice(1).some(cell => cell.value === "Not recorded"),
    }
  }, [filter, initialSnapshot, tab])
  const filtered = rows.filter(row => configuration.include(row) && `${row.name} ${row.meta} ${row.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const goTab = (next: Tab) => { setFilter("all"); setQuery(""); setOpenId(null); router.push(`${pathname}?tab=${next}`) }
  return <main className={styles.shell}><div className={styles.canvas}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Build</p><h1 className={styles.heading}>{configuration.title}</h1><p className={styles.subheading}>A source-resolved registry. Status is descriptive; this workspace does not run tools, agents, or providers.</p></div></header>
    <div className={styles.tabs} role="tablist" aria-label="Build registries">{TAB_VALUES.map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`${styles.tab} ${tab === value ? styles.tabActive : ""}`} onClick={() => goTab(value)}>{value === "tools" ? "Tools" : value === "skills" ? "Skills" : "Models"}<small>{value === "tools" ? initialSnapshot.tools.length : value === "skills" ? initialSnapshot.skills.length : initialSnapshot.models.length}</small></button>)}</div>
    <section className={styles.stats}>{configuration.stats.map(([title, value, detail, tone]) => <div key={title} className={styles.stat}><span className={styles.statLabel}>{title}</span><strong className={`${styles.statValue} ${tone === "good" ? styles.good : tone === "warn" ? styles.warn : tone === "muted" ? styles.muted : ""}`}>{value}</strong><span className={styles.statDetail}>{detail}</span></div>)}</section>
    <div className={styles.controls}><label className="sr-only" htmlFor="build-search">Search {configuration.title}</label><input id="build-search" className={styles.search} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${configuration.title.toLowerCase()}`} />{configuration.filters.map(value => <button key={value} type="button" className={`${styles.chip} ${filter === value ? styles.chipActive : ""}`} onClick={() => { setFilter(value); setOpenId(null) }}>{value === "all" ? "All" : value === "attention" ? "Needs attention" : value === "evaluation" ? "Under evaluation" : value === "unpriced" ? "No pricing" : label(value)}</button>)}<span className={styles.resultLine}>{filtered.length} of {rows.length} shown</span></div>
    <section className={styles.rows}>{filtered.map(row => <RegistryRow key={row.id} row={row} open={openId === row.id} onToggle={() => setOpenId(current => current === row.id ? null : row.id)} />)}</section>
    {!filtered.length ? <div className={styles.empty}>Nothing matches this filter.</div> : null}
  </div></main>
}

function RegistryRow({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const toneClass = (tone?: Tone) => tone === "good" ? styles.good : tone === "warn" ? styles.warn : tone === "bad" ? styles.bad : tone === "muted" ? styles.muted : ""
  return <article className={`${styles.row} ${open ? styles.rowOpen : ""}`}><button type="button" className={styles.rowButton} onClick={onToggle} aria-expanded={open}><span className={styles.mark}>{row.mark}</span><span className={styles.identity}><strong className={styles.name}>{row.name}</strong><span className={styles.meta}>{row.meta}</span></span><span className={styles.cells}>{row.cells.map(cell => <span key={cell.label} className={styles.cell}><span className={styles.cellLabel}>{cell.label}</span><strong className={`${styles.cellValue} ${toneClass(cell.tone)}`}>{cell.value}</strong></span>)}</span><span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>⌄</span></button>{open ? <div className={styles.detail}><p className={styles.description}>{row.description}</p><div className={styles.detailGrid}>{row.blocks.map(block => <section key={block.title} className={styles.detailBlock}><h3>{block.title}</h3>{block.text ? <p>{block.text}</p> : null}{block.list ? <div className={styles.list}>{block.list.map(item => <div key={item} className={styles.listItem}><i className={styles.dot} />{item}</div>)}</div> : null}{block.chips ? <div className={styles.chips}>{block.chips.map(chip => <span key={chip}>{chip}</span>)}</div> : null}</section>)}</div><div className={styles.links}>{row.links?.map(link => <a key={link.href} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel={link.href.startsWith("http") ? "noreferrer" : undefined}>{link.label} →</a>)}<span className={styles.footnote}>{row.footnote}</span></div></div> : null}</article>
}

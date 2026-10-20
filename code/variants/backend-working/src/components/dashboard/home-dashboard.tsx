"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"

import type { HomeClient, HomeDashboardData, HomeSuggestion, HomeTask, HomeTaskAction, HomeTaskPriority } from "@/lib/home-dashboard"
import { type TaskBoardStatus } from "@/lib/tasks-board"
import HomeDashboardV5 from "@/components/dashboard/home-dashboard-production"

type Props = { initialData: HomeDashboardData; view?: "home" | "tasks" }
type NewTask = { title: string; description: string; priority: HomeTaskPriority; dueAt: string; clientId: string }

const initialTask: NewTask = { title: "", description: "", priority: "p3", dueAt: "", clientId: "" }
const aed = (value: number | null | undefined) => value === null || value === undefined ? "Not available" : new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(value)
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "J"
const sourceLabel = (suggestion: HomeSuggestion) => ({ finance: "Finance", client_brain: "Client Brain", agent_runtime: "Agent Runtime", social_intelligence: "Social", roadmap: "Roadmap" } as Record<string, string>)[typeof suggestion.source.system === "string" ? suggestion.source.system : ""] ?? "Jarvis"
const priorityLabel = (priority: HomeSuggestion["priority"]) => priority === "p1" ? "Critical" : priority === "p2" ? "Needs review" : "For consideration"
const taskState = (task: HomeTask) => ({ not_started: "Not started", in_progress: "In progress", completed: "Completed", reviewed: "Reviewed", archived: "Archived" })[task.status]

export default function HomeDashboard({ initialData, view = "home" }: Props) {
  const [data, setData] = useState(initialData)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<NewTask>(initialTask)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<NewTask>(initialTask)
  const selected = data.tasks.find(task => task.id === selectedId) ?? null
  const decisions = data.suggestions.slice(0, 4)
  const topDecision = data.suggestions[0] ?? null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true) }
      if (event.key === "Escape") { setPaletteOpen(false); setSelectedId(null); setAdding(false) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function refresh() {
    const response = await fetch("/api/home", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Home could not be refreshed.")
    setData(body)
  }
  async function request(key: string, url: string, method: string, body?: Record<string, unknown>) {
    setBusy(key); setError(null)
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Request failed.")
      await refresh()
      return result
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Request failed."); return null }
    finally { setBusy(null) }
  }
  /** Status and destination order are saved in one database transaction. */
  async function moveTask(move: { taskId: string; from: TaskBoardStatus; to: TaskBoardStatus; orderedTaskIds: string[] }) {
    setBusy(`task:${move.taskId}:move`); setError(null)
    try {
      const current = data.tasks.find(task => task.id === move.taskId)
      if (!current) throw new Error("Task is no longer available. Refresh and try again.")
      const expectedDestinationIds = data.tasks.filter(task => task.status === move.to)
        .sort((a, b) => a.manual_order - b.manual_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(task => task.id)
      const response = await fetch("/api/tasks/move", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...move, from: current.status, expectedUpdatedAt: current.updated_at, expectedDestinationIds }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Task could not be moved.")
      await refresh()
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Task could not be moved.")
      await refresh().catch(() => {})
    } finally { setBusy(null) }
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault()
    const result = await request("new-task", "/api/home/tasks", "POST", draft)
    if (result) { setDraft(initialTask); setAdding(false) }
  }
  async function saveDetail(event: FormEvent) {
    event.preventDefault()
    if (selected) await request(`task:${selected.id}:update`, `/api/home/tasks/${selected.id}`, "PATCH", { action: "update", ...editDraft, expectedUpdatedAt: selected.updated_at })
  }
  async function taskAction(task: HomeTask, action: HomeTaskAction) {
    const result = await request(`task:${task.id}:${action}`, `/api/home/tasks/${task.id}`, "PATCH", { action, expectedUpdatedAt: task.updated_at })
    if (result && action === "archive") setSelectedId(null)
  }
  function openTask(task: HomeTask) {
    setEditDraft({ title: task.title, description: task.description || "", priority: task.priority, dueAt: task.due_at ? task.due_at.slice(0, 10) : "", clientId: task.client_id || "" })
    setSelectedId(task.id)
  }
  const filteredClients = data.clients.filter(client => client.name.toLowerCase().includes(paletteQuery.toLowerCase())).slice(0, 5)

  if (view === "tasks") return <>
    <TaskWorkspace data={data} onOpen={openTask} onAdd={() => setAdding(true)} />
    {adding ? <NewTaskModal data={data} draft={draft} setDraft={setDraft} busy={busy} onClose={() => { setAdding(false); setDraft(initialTask) }} onSubmit={submitTask} /> : null}
    {selected ? <TaskDetail task={selected} clients={data.clients} draft={editDraft} setDraft={setEditDraft} busy={busy} onClose={() => setSelectedId(null)} onSave={saveDetail} onAction={action => taskAction(selected, action)} /> : null}
  </>
  if (view === "home") return <HomeDashboardV5
    data={data}
    busy={busy}
    error={error}
    onAccept={suggestion => request(`suggestion:${suggestion.id}:accept`, "/api/home/suggestions", "POST", { action: "accept", dedupeIdentity: suggestion.dedupeIdentity, evidenceHash: suggestion.evidenceHash })}
    onDismiss={suggestion => request(`suggestion:${suggestion.id}:dismiss`, "/api/home/suggestions", "POST", { action: "dismiss", dedupeIdentity: suggestion.dedupeIdentity, evidenceHash: suggestion.evidenceHash })}
    onClearError={() => setError(null)}
    onTaskMove={moveTask}
    onTaskCreate={(lane, title) => request(`task:new:${lane}`, "/api/tasks/create", "POST", { targetStatus: lane, title })}
  />
  return <main className="home-handoff-canvas">
    <div className="home-handoff-shell">
      <header className="home-handoff-header">
        <div><p>{data.dateLabel} · Dubai</p><h1><span>{data.greeting},</span> Calvin</h1></div>
        <div className="home-handoff-header-actions"><button onClick={() => setPaletteOpen(true)} className="home-handoff-period">Search · ⌘K</button><Link href="/clients/new" className="home-handoff-new-client">New client</Link></div>
      </header>
      {error ? <div role="alert" className="home-handoff-error"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
      <HandoffVerdict decision={topDecision} busy={busy} onDismiss={suggestion => request(`suggestion:${suggestion.id}:dismiss`, "/api/home/suggestions", "POST", { action: "dismiss", dedupeIdentity: suggestion.dedupeIdentity, evidenceHash: suggestion.evidenceHash })} />
      <HandoffStrip data={data} decisionCount={data.suggestions.length} />
      <div className="home-handoff-primary-grid">
        <DecisionQueue suggestions={decisions} totalCount={data.suggestions.length} busy={busy} onAccept={suggestion => request(`suggestion:${suggestion.id}:accept`, "/api/home/suggestions", "POST", { action: "accept", dedupeIdentity: suggestion.dedupeIdentity, evidenceHash: suggestion.evidenceHash })} onDismiss={suggestion => request(`suggestion:${suggestion.id}:dismiss`, "/api/home/suggestions", "POST", { action: "dismiss", dedupeIdentity: suggestion.dedupeIdentity, evidenceHash: suggestion.evidenceHash })} />
        <aside className="home-handoff-finance-column"><CashAtRisk data={data} /><NextDeductions data={data} /></aside>
      </div>
      <HandoffClients clients={data.clients} expectedAed={data.money.expectedAed} />
      <div className="home-handoff-secondary-grid"><RoadmapPanel data={data} /><RecentWork data={data} /></div>
      <NotTracked />
      <footer className="home-handoff-footer"><span className={data.system.failedRuns ? "is-alert" : ""} />{data.system.failedRuns ? `${data.system.failedRuns} system issue${data.system.failedRuns === 1 ? "" : "s"}` : "System healthy"}<i>·</i><span>{data.system.agentsThisWeek} agent runs this week</span><Link href="/agent-runs">Agent runs →</Link></footer>
    </div>
    {adding ? <NewTaskModal data={data} draft={draft} setDraft={setDraft} busy={busy} onClose={() => { setAdding(false); setDraft(initialTask) }} onSubmit={submitTask} /> : null}
    {selected ? <TaskDetail task={selected} clients={data.clients} draft={editDraft} setDraft={setEditDraft} busy={busy} onClose={() => setSelectedId(null)} onSave={saveDetail} onAction={action => taskAction(selected, action)} /> : null}
    {paletteOpen ? <CommandPalette query={paletteQuery} setQuery={setPaletteQuery} clients={filteredClients} onClose={() => { setPaletteOpen(false); setPaletteQuery("") }} onNewTask={() => { setPaletteOpen(false); setAdding(true) }} /> : null}
  </main>
}

function HandoffVerdict({ decision, busy, onDismiss }: { decision: HomeSuggestion | null; busy: string | null; onDismiss: (suggestion: HomeSuggestion) => void }) {
  if (!decision) return <section className="home-handoff-verdict"><div className="home-handoff-grain" /><div className="home-handoff-verdict-inner"><div><div className="home-handoff-verdict-label"><b>J</b> What matters today</div><p><span>Nothing currently requires a decision.</span> Jarvis will surface a new item when its evidence changes.</p></div><strong>Clear</strong></div></section>
  const key = `suggestion:${decision.id}`
  return <section className="home-handoff-verdict"><div className="home-handoff-grain" /><div className="home-handoff-verdict-inner"><div><div className="home-handoff-verdict-label"><b>J</b> What matters today</div><p><span>{decision.title}.</span> {decision.detail}</p><div className="home-handoff-verdict-actions"><Link href={decision.href}>Open {sourceLabel(decision)}</Link><button disabled={busy?.startsWith(key)} onClick={() => onDismiss(decision)}>{busy === `${key}:dismiss` ? "Dismissing…" : "Dismiss"}</button></div></div><div className="home-handoff-verdict-status"><small>{priorityLabel(decision.priority)}</small><strong>{sourceLabel(decision)}</strong><span>decision route</span></div></div></section>
}

function HandoffStrip({ data, decisionCount }: { data: HomeDashboardData; decisionCount: number }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
  const dueToday = data.tasks.filter(task => !["completed", "reviewed", "archived"].includes(task.status) && task.due_at?.startsWith(today)).length
  return <section className="home-handoff-strip"><Metric label="Awaiting you" value={String(decisionCount)} detail={decisionCount ? "Evidence-backed decisions" : "Nothing waiting"} tone={decisionCount ? "amber" : undefined} /><Metric label="Due today" value={String(dueToday)} detail={dueToday ? "Open task decisions" : "Nothing scheduled"} muted={!dueToday} /><Metric label="AI spend · month" value={`$${data.system.aiSpendUsd.toFixed(2)}`} detail={`${data.system.aiCalls} recorded call${data.system.aiCalls === 1 ? "" : "s"}`} /><Metric label="Active clients" value={String(data.clients.length)} detail={`${aed(data.money.expectedAed)} expected / mo`} /></section>
}
function Metric({ label, value, detail, tone, muted = false }: { label: string; value: string; detail: string; tone?: "amber"; muted?: boolean }) { return <div className={`home-handoff-metric ${tone ?? ""} ${muted ? "is-muted" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }

function DecisionQueue({ suggestions, totalCount, busy, onAccept, onDismiss }: { suggestions: HomeSuggestion[]; totalCount: number; busy: string | null; onAccept: (suggestion: HomeSuggestion) => void; onDismiss: (suggestion: HomeSuggestion) => void }) {
  return <section className="home-handoff-panel home-handoff-queue"><header><h2>Awaiting your decision</h2><span>{totalCount} item{totalCount === 1 ? "" : "s"}</span></header>{suggestions.length ? suggestions.map(suggestion => <DecisionRow key={suggestion.id} suggestion={suggestion} busy={busy} onAccept={() => onAccept(suggestion)} onDismiss={() => onDismiss(suggestion)} />) : <p className="home-handoff-empty">Nothing is waiting for your decision.</p>}<footer><span>Suggestions stay evidence-backed and become tasks only when you add them.</span><Link href="/tasks">Open tasks</Link></footer></section>
}
function DecisionRow({ suggestion, busy, onAccept, onDismiss }: { suggestion: HomeSuggestion; busy: string | null; onAccept: () => void; onDismiss: () => void }) {
  const key = `suggestion:${suggestion.id}`
  return <div className={`home-handoff-decision ${suggestion.priority}`}><span className="home-handoff-decision-dot" /><div><strong>{suggestion.title}</strong><p>{suggestion.detail}</p></div><span className="home-handoff-decision-source">{suggestion.clientName || sourceLabel(suggestion)}</span><div className="home-handoff-decision-actions"><Link href={suggestion.href}>Open</Link><button disabled={busy?.startsWith(key)} onClick={onAccept}>{busy === `${key}:accept` ? "Adding…" : "Add task"}</button><button disabled={busy?.startsWith(key)} onClick={onDismiss} aria-label={`Dismiss ${suggestion.title}`}>×</button></div></div>
}

function CashAtRisk({ data }: { data: HomeDashboardData }) { return <section className="home-handoff-panel home-handoff-cash"><div className="home-handoff-cash-label"><i /> Cash at risk</div><strong>{aed(data.money.expectedAed)}</strong><p><span>Expected revenue this month.</span> <b>{aed(data.money.collectedAed)} confirmed collected.</b></p><dl><div><dt>Committed costs</dt><dd>{aed(data.money.committedAed)}</dd></div><div><dt>Safe owner draw</dt><dd className="is-muted">{aed(data.money.availableOwnerDrawAed)}</dd></div></dl></section> }
function NextDeductions({ data }: { data: HomeDashboardData }) { const charge = data.money.nextCharge; return <section className="home-handoff-panel home-handoff-deductions"><header><h2>Next deductions</h2><span>{charge ? "Upcoming" : "None recorded"}</span></header>{charge ? <div><div><strong>{charge.label}</strong><small>{charge.date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(new Date(`${charge.date}T00:00:00Z`)) : "Date needs confirmation"}</small></div><b>{aed(charge.amountAed)}</b></div> : <p>No upcoming deduction is recorded.</p>}<Link href="/finance">Open Finance →</Link></section> }

function HandoffClients({ clients, expectedAed }: { clients: HomeClient[]; expectedAed: number }) { return <section className="home-handoff-clients"><header><div><h2>Clients</h2><p>{clients.length} active clients · {aed(expectedAed)} expected monthly</p></div><Link href="/clients">All clients →</Link></header><div>{clients.map(client => <HandoffClientCard key={client.id} client={client} />)}</div></section> }
function HandoffClientCard({ client }: { client: HomeClient }) { return <Link href={client.href} className={`home-handoff-client ${client.attentionCount ? "has-attention" : ""}`}><div className="home-handoff-client-top"><ClientLogo client={client} />{client.attentionCount ? <span>{client.attentionCount}</span> : <i />}</div><div><strong>{client.name}</strong><p>{client.industry || "Client"}</p></div><footer><b>{aed(client.revenueAed)}</b><span>{client.revenueAed === null ? "No exact AED allocation" : "expected / mo"}</span></footer></Link> }
function ClientLogo({ client }: { client: HomeClient }) {
  if (!client.logoUrl) return <span className="home-handoff-client-logo">{initials(client.name)}</span>
  // Signed Client Brain storage URLs are intentionally rendered as runtime image identities.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="home-handoff-client-logo"><img src={client.logoUrl} alt={`${client.name} logo`} /></span>
}

function RoadmapPanel({ data }: { data: HomeDashboardData }) { const primary = data.roadmap.primary; return <section className="home-handoff-panel home-handoff-roadmap"><header><div><span>Marketing OS</span><h2>{primary?.title || "Roadmap"}</h2></div><strong>{Math.round(data.roadmap.totalProgress)}%</strong></header><div className="home-handoff-progress"><i style={{ width: `${Math.max(0, Math.min(100, data.roadmap.totalProgress))}%` }} /></div><div className="home-handoff-roadmap-detail"><span>In progress</span><b>{primary?.title || "No active roadmap item"}</b>{primary?.blockerReason ? <p>{primary.blockerReason}</p> : null}{data.roadmap.next ? <small>Next · {data.roadmap.next.title}</small> : null}</div><Link href="/roadmap">Open roadmap →</Link></section> }
function RecentWork({ data }: { data: HomeDashboardData }) { const latest = data.system.latestEvent; const date = latest ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(new Date(latest.at)) : null; return <section className="home-handoff-panel home-handoff-recent"><header><h2>Recent work</h2><Link href="/agent-runs">History →</Link></header>{latest ? <div className="home-handoff-recent-row"><i /><div><strong>{latest.label}</strong><small>Agent Runtime · {date}</small></div></div> : <p>No recent agent activity is recorded.</p>}<footer>{data.system.agentsThisWeek ? `${data.system.agentsThisWeek} run${data.system.agentsThisWeek === 1 ? "" : "s"} recorded this week.` : "No agent runs recorded this week."}</footer></section> }
function NotTracked() { return <section className="home-handoff-not-tracked"><header><span>Not tracked on Home</span><i /></header><div><p><strong>Post performance</strong><span>Review channel metrics in Social rather than mixing them into an operating decision.</span></p><p><strong>Content calendar</strong><span>Planner remains the source of truth for schedule state.</span></p><p><strong>Bank balance</strong><span>Finance does not currently include a reconciled bank-balance feed.</span></p></div></section> }

function NewTaskModal({ data, draft, setDraft, busy, onClose, onSubmit }: { data: HomeDashboardData; draft: NewTask; setDraft: React.Dispatch<React.SetStateAction<NewTask>>; busy: string | null; onClose: () => void; onSubmit: (event: FormEvent) => void }) { return <div className="home-handoff-modal"><form onSubmit={onSubmit}><header><h2>New task</h2><button type="button" onClick={onClose}>Close</button></header><input autoFocus required value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} placeholder="What needs to happen?" /><div className="home-handoff-modal-fields"><select value={draft.clientId} onChange={event => setDraft(value => ({ ...value, clientId: event.target.value }))}><option value="">Jarvis / no client</option>{data.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select value={draft.priority} onChange={event => setDraft(value => ({ ...value, priority: event.target.value as HomeTaskPriority }))}><option value="p3">Normal</option><option value="p2">Important</option><option value="p1">Urgent</option></select><input type="date" value={draft.dueAt} onChange={event => setDraft(value => ({ ...value, dueAt: event.target.value }))} /></div><footer><button type="button" onClick={onClose}>Cancel</button><button disabled={busy === "new-task"}>{busy === "new-task" ? "Adding…" : "Add task"}</button></footer></form></div> }
function TaskWorkspace({ data, onOpen, onAdd }: { data: HomeDashboardData; onOpen: (task: HomeTask) => void; onAdd: () => void }) { return <main className="home-handoff-canvas"><div className="home-handoff-shell home-handoff-tasks"><header className="home-handoff-header"><div><p>Operate · Tasks</p><h1><span>Task</span> workspace</h1></div><button className="home-handoff-new-client" onClick={onAdd}>New task</button></header><section className="home-handoff-panel home-handoff-task-list">{data.tasks.map(task => <button key={task.id} onClick={() => onOpen(task)}><span className={`task-priority ${task.priority}`} /><div><strong>{task.title}</strong><small>{task.client_name || "Jarvis"} · {taskState(task)}</small></div><span>{task.due_at ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(task.due_at)) : "No date"}</span></button>)}</section></div></main> }
function TaskDetail({ task, clients, draft, setDraft, busy, onClose, onSave, onAction }: { task: HomeTask; clients: HomeClient[]; draft: NewTask; setDraft: React.Dispatch<React.SetStateAction<NewTask>>; busy: string | null; onClose: () => void; onSave: (event: FormEvent) => void; onAction: (action: HomeTaskAction) => void }) { const taskBusy = busy?.startsWith(`task:${task.id}`); return <div className="home-handoff-modal"><aside><header><div><p>Task detail</p><h2>{taskState(task)}</h2></div><button onClick={onClose}>Close</button></header><form onSubmit={onSave}><input value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /><textarea value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} placeholder="Add useful context…" rows={5} /><div className="home-handoff-modal-fields"><select value={draft.clientId} onChange={event => setDraft(value => ({ ...value, clientId: event.target.value }))}><option value="">Jarvis / no client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select value={draft.priority} onChange={event => setDraft(value => ({ ...value, priority: event.target.value as HomeTaskPriority }))}><option value="p3">Normal</option><option value="p2">Important</option><option value="p1">Urgent</option></select><input type="date" value={draft.dueAt} onChange={event => setDraft(value => ({ ...value, dueAt: event.target.value }))} /></div><footer><button disabled={Boolean(taskBusy)}>{busy === `task:${task.id}:update` ? "Saving…" : "Save changes"}</button>{["not_started", "in_progress"].includes(task.status) ? <button type="button" disabled={Boolean(taskBusy)} onClick={() => onAction("complete")}>Complete</button> : null}{task.status === "completed" ? <button type="button" disabled={Boolean(taskBusy)} onClick={() => onAction("review")}>Mark reviewed</button> : null}</footer></form></aside></div> }
function CommandPalette({ query, setQuery, clients, onClose, onNewTask }: { query: string; setQuery: (value: string) => void; clients: HomeClient[]; onClose: () => void; onNewTask: () => void }) { const commands = [{ label: "Home", href: "/" }, { label: "Clients", href: "/clients" }, { label: "Social", href: "/workspaces/social-media" }, { label: "Finance", href: "/finance" }, { label: "Tasks", href: "/tasks" }, { label: "Agents", href: "/agents" }].filter(item => item.label.toLowerCase().includes(query.toLowerCase())); return <div className="home-handoff-modal"><div className="home-handoff-palette"><header><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Jump to a workspace or client…" /><button onClick={onClose}>Close</button></header><button onClick={onNewTask}>＋ New task</button>{commands.map(command => <Link key={command.href} href={command.href} onClick={onClose}>{command.label}</Link>)}{clients.map(client => <Link key={client.id} href={client.href} onClick={onClose}>{client.name}</Link>)}</div></div> }

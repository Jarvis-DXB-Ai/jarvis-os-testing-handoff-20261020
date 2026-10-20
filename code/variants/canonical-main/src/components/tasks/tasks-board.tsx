"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { HomeTask, HomeTaskPriority } from "@/lib/home-dashboard"
import { TASK_BOARD_STATUSES, TASK_STATUS_LABEL, reorderIds, transitionAction, type TaskBoardStatus, type TaskBoardTask, type TasksBoardData } from "@/lib/tasks-board"
import styles from "./tasks-board.module.css"

type Draft = { title: string; description: string; clientId: string; priority: HomeTaskPriority; dueAt: string }
type DropTarget = { status: TaskBoardStatus; beforeId: string | null } | null

const columnTone: Record<TaskBoardStatus, string> = { not_started: styles.notStarted, in_progress: styles.inProgress, completed: styles.completed, reviewed: styles.reviewed, archived: styles.archived }

const api = async <T,>(url: string, options?: RequestInit) => {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Task request failed.")
  return data as T
}

function blankDraft(): Draft { return { title: "", description: "", clientId: "", priority: "p3", dueAt: "" } }
function draftFor(task: HomeTask): Draft { return { title: task.title, description: task.description ?? "", clientId: task.client_id ?? "", priority: task.priority, dueAt: task.due_at ? task.due_at.slice(0, 10) : "" } }
function trimWords(value: string | null, length = 96) {
  const source = (value ?? "").trim()
  if (source.length <= length) return source
  return `${source.slice(0, length + 1).replace(/\s+\S*$/, "").trim()}…`
}
function dateLabel(value: string | null) {
  if (!value) return { label: "No date", tone: "muted" }
  const target = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(value))
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
  const days = Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days < 0) return { label: `Overdue · ${Math.abs(days)}d`, tone: "overdue" }
  if (days === 0) return { label: "Today", tone: "today" }
  if (days === 1) return { label: "Tomorrow", tone: "normal" }
  const date = new Date(`${target}T00:00:00Z`)
  return { label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(date), tone: "normal" }
}
function labelForPriority(priority: HomeTaskPriority) { return priority === "p1" ? "Urgent" : priority === "p2" ? "Important" : null }
function isInput(element: EventTarget | null) { return element instanceof HTMLElement && Boolean(element.closest("input, textarea, select, button, [contenteditable='true']")) }

export default function TasksBoard({ initialData }: { initialData: TasksBoardData }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [clientFilter, setClientFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | HomeTaskPriority>("all")
  const [query, setQuery] = useState("")
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerTarget, setComposerTarget] = useState<TaskBoardStatus>("not_started")
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visibleTasks = useMemo(() => data.tasks.filter((task) => {
    const matchesClient = clientFilter === "all" || (clientFilter === "" ? !task.client_id : task.client_id === clientFilter)
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter
    const haystack = `${task.title} ${task.description ?? ""} ${task.client_name ?? ""}`.toLowerCase()
    return matchesClient && matchesPriority && (!query.trim() || haystack.includes(query.trim().toLowerCase()))
  }), [clientFilter, data.tasks, priorityFilter, query])
  const byStatus = useMemo(() => Object.fromEntries(TASK_BOARD_STATUSES.map((status) => [status, visibleTasks.filter((task) => task.status === status)])) as Record<TaskBoardStatus, TaskBoardTask[]>, [visibleTasks])
  const selectedTask = data.tasks.find((task) => task.id === drawerId) ?? null
  const filteredIds = visibleTasks.map((task) => task.id)
  const hasFilter = clientFilter !== "all" || priorityFilter !== "all" || Boolean(query)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInput(event.target)) return
      if (event.key === "Escape") { setDrawerId(null); setComposerOpen(false); setEditing(false); return }
      if (!filteredIds.length) return
      const current = focusedId ? filteredIds.indexOf(focusedId) : -1
      if (event.key === "j" || event.key === "k") {
        event.preventDefault()
        const next = event.key === "j" ? Math.min(filteredIds.length - 1, current + 1) : Math.max(0, current - 1)
        setFocusedId(filteredIds[next])
      }
      if (event.key === "Enter" && focusedId) { event.preventDefault(); setDrawerId(focusedId); setEditing(false) }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [data.tasks, filteredIds, focusedId])

  function replaceTask(remote: HomeTask) {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === remote.id ? { ...task, ...remote } : task) }))
  }
  async function persistReorder(status: TaskBoardStatus, expectedTaskIds: string[], orderedTaskIds: string[], nextTasks?: TaskBoardTask[]) {
    if (expectedTaskIds.join("|") === orderedTaskIds.join("|")) return
    setBusy(`reorder:${status}`)
    try {
      const response = await api<{ reordered: Array<{ id: string; manual_order: number; updated_at: string }> }>("/api/tasks/reorder", { method: "POST", body: JSON.stringify({ status, expectedTaskIds, orderedTaskIds }) })
      const orderById = new Map(response.reordered.map((row) => [row.id, row]))
      setData((current) => ({ ...current, tasks: (nextTasks ?? current.tasks).map((task) => {
        const update = orderById.get(task.id)
        return update ? { ...task, manual_order: Number(update.manual_order), updated_at: update.updated_at } : task
      }) }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Task order could not be saved.")
      router.refresh()
    } finally { setBusy(null) }
  }
  async function moveTask(task: TaskBoardTask, target: TaskBoardStatus, beforeId: string | null) {
    const action = transitionAction(task.status, target)
    if (!action) { setNotice(`${TASK_STATUS_LABEL[task.status]} tasks cannot move directly to ${TASK_STATUS_LABEL[target]}.`); return }
    setBusy(`move:${task.id}`)
    try {
      const response = await api<{ task: HomeTask }>(`/api/home/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ action }) })
      const moved: TaskBoardTask = { ...task, ...response.task }
      const nextTasks = data.tasks.map((entry) => entry.id === task.id ? moved : entry)
      const expected = nextTasks.filter((entry) => entry.status === target).sort((left, right) => left.manual_order - right.manual_order || left.created_at.localeCompare(right.created_at)).map((entry) => entry.id)
      const ordered = reorderIds(expected, task.id, beforeId)
      setData((current) => ({ ...current, tasks: nextTasks }))
      await persistReorder(target, expected, ordered, nextTasks)
      setDrawerId(task.id)
      setEditing(false)
    } catch (error) { setNotice(error instanceof Error ? error.message : "Task transition could not be saved."); router.refresh() }
    finally { setBusy(null) }
  }
  async function reorderWithin(status: TaskBoardStatus, beforeId: string | null) {
    const task = data.tasks.find((entry) => entry.id === dragId)
    if (!task || task.status !== status) return
    const expected = data.tasks.filter((entry) => entry.status === status).sort((left, right) => left.manual_order - right.manual_order || left.created_at.localeCompare(right.created_at)).map((entry) => entry.id)
    await persistReorder(status, expected, reorderIds(expected, task.id, beforeId))
  }
  async function acceptSuggestion(dedupeIdentity: string, evidenceHash: string) {
    setBusy(`suggestion:${dedupeIdentity}`)
    try { await api("/api/home/suggestions", { method: "POST", body: JSON.stringify({ action: "accept", dedupeIdentity, evidenceHash }) }); router.refresh() }
    catch (error) { setNotice(error instanceof Error ? error.message : "Suggestion could not be added.") }
    finally { setBusy(null) }
  }
  async function dismissSuggestion(dedupeIdentity: string, evidenceHash: string) {
    setBusy(`suggestion:${dedupeIdentity}`)
    try { await api("/api/home/suggestions", { method: "POST", body: JSON.stringify({ action: "dismiss", dedupeIdentity, evidenceHash }) }); router.refresh() }
    catch (error) { setNotice(error instanceof Error ? error.message : "Suggestion could not be dismissed.") }
    finally { setBusy(null) }
  }
  async function saveTask(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) return
    setBusy(editing && selectedTask ? `save:${selectedTask.id}` : "new")
    try {
      if (editing && selectedTask) {
        const response = await api<{ task: HomeTask }>(`/api/home/tasks/${selectedTask.id}`, { method: "PATCH", body: JSON.stringify({ action: "update", ...draft }) })
        replaceTask(response.task)
      } else await api("/api/tasks/create", { method: "POST", body: JSON.stringify({ ...draft, targetStatus: composerTarget }) })
      setComposerOpen(false); setEditing(false); setDraft(blankDraft()); router.refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : "Task could not be saved.") }
    finally { setBusy(null) }
  }

  return <main className={styles.page}>
    <div className={styles.canvas}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Operate · Tasks</p><h1>Tasks</h1><p className={styles.subtitle}>A clear view of what is waiting, moving and ready to close.</p></div>
        <button type="button" className={styles.newTask} onClick={() => { setDraft(blankDraft()); setComposerTarget("not_started"); setComposerOpen(true); setEditing(false) }}>New task</button>
      </header>

      {notice ? <div role="alert" className={styles.notice}><span>{notice}</span><button onClick={() => setNotice(null)}>Dismiss</button></div> : null}
      {data.suggestions.length ? <section className={styles.suggestions}><div className={styles.suggestionHeader}><div><p>Suggestions</p><span>Evidence-backed · becomes a task only when you add it</span></div></div><div className={styles.suggestionRows}>{data.suggestions.map((suggestion) => <article key={suggestion.id} className={styles.suggestion}><i className={suggestion.priority === "p1" ? styles.urgentDot : suggestion.priority === "p2" ? styles.importantDot : ""} /><div><strong>{suggestion.title}</strong><p>{suggestion.detail}</p><small>{suggestion.clientName ?? (typeof suggestion.source.system === "string" ? suggestion.source.system : "Jarvis")}</small></div><div className={styles.suggestionActions}><button disabled={Boolean(busy)} onClick={() => void acceptSuggestion(suggestion.dedupeIdentity, suggestion.evidenceHash)}>Add task</button><button disabled={Boolean(busy)} onClick={() => void dismissSuggestion(suggestion.dedupeIdentity, suggestion.evidenceHash)}>Dismiss</button></div></article>)}</div></section> : null}

      <section className={styles.filters} aria-label="Task filters"><div className={styles.filterControls}><label><span>Client</span><select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="all">All clients</option><option value="">Jarvis / no client</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><div className={styles.priorityFilters} aria-label="Priority"><button className={priorityFilter === "all" ? styles.selectedFilter : ""} onClick={() => setPriorityFilter("all")}>All</button><button className={priorityFilter === "p1" ? styles.selectedFilter : ""} onClick={() => setPriorityFilter("p1")}>Urgent</button><button className={priorityFilter === "p2" ? styles.selectedFilter : ""} onClick={() => setPriorityFilter("p2")}>Important</button></div><label className={styles.search}><span className="sr-only">Search tasks</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label>{hasFilter ? <button className={styles.clearFilters} onClick={() => { setClientFilter("all"); setPriorityFilter("all"); setQuery("") }}>Clear</button> : null}</div><p>{visibleTasks.length} of {data.tasks.length} shown</p></section>

      <section className={styles.boardScroll} aria-label="Task board"><div className={styles.board}>{TASK_BOARD_STATUSES.map((status) => <TaskColumn key={status} status={status} tasks={byStatus[status]} dragId={dragId} dropTarget={dropTarget} focusedId={focusedId} busy={busy} onAdd={() => { setDraft(blankDraft()); setComposerTarget(status); setComposerOpen(true); setEditing(false) }} onDragOver={(beforeId) => setDropTarget({ status, beforeId })} onDrop={async (beforeId) => { const task = data.tasks.find((entry) => entry.id === dragId); if (!task) return; if (task.status === status) await reorderWithin(status, beforeId); else await moveTask(task, status, beforeId); setDragId(null); setDropTarget(null) }} onDragStart={(id) => { setDragId(id); setDropTarget(null) }} onDragEnd={() => { setDragId(null); setDropTarget(null) }} onOpen={(id) => { setDrawerId(id); setFocusedId(id); setEditing(false) }} />)}</div></section>
      <p className={styles.keyboardHint}>Keyboard: J/K to move focus · Enter to open · Esc to close</p>
    </div>

    {selectedTask ? <TaskDrawer task={selectedTask} clients={data.clients} draft={draft} setDraft={setDraft} editing={editing} busy={busy} onEdit={() => { setDraft(draftFor(selectedTask)); setEditing(true) }} onClose={() => { setDrawerId(null); setEditing(false) }} onSave={saveTask} onMove={(status) => void moveTask(selectedTask, status, null)} /> : null}
    {composerOpen ? <TaskModal title={`Add task to ${TASK_STATUS_LABEL[composerTarget]}`} clients={data.clients} draft={draft} setDraft={setDraft} busy={busy} onClose={() => setComposerOpen(false)} onSubmit={saveTask} /> : null}
  </main>
}

function TaskColumn({ status, tasks, dragId, dropTarget, focusedId, busy, onAdd, onDragOver, onDrop, onDragStart, onDragEnd, onOpen }: { status: TaskBoardStatus; tasks: TaskBoardTask[]; dragId: string | null; dropTarget: DropTarget; focusedId: string | null; busy: string | null; onAdd: () => void; onDragOver: (beforeId: string | null) => void; onDrop: (beforeId: string | null) => Promise<void>; onDragStart: (id: string) => void; onDragEnd: () => void; onOpen: (id: string) => void }) {
  const isTarget = dropTarget?.status === status
  return <section className={styles.column} onDragOver={(event) => { event.preventDefault(); if (!dropTarget || dropTarget.status !== status || dropTarget.beforeId !== null) onDragOver(null) }} onDrop={(event) => { event.preventDefault(); void onDrop(null) }}><header><span className={`${styles.statusDot} ${columnTone[status]}`} /><h2>{TASK_STATUS_LABEL[status]}</h2><b>{tasks.length}</b></header><div className={`${styles.columnBody} ${isTarget && dropTarget?.beforeId === null ? styles.columnDrop : ""}`}>{tasks.map((task) => <TaskCard key={task.id} task={task} dragging={dragId === task.id} focused={focusedId === task.id} dropBefore={isTarget && dropTarget?.beforeId === task.id} busy={Boolean(busy)} onDragOver={() => onDragOver(task.id)} onDrop={() => void onDrop(task.id)} onDragStart={() => onDragStart(task.id)} onDragEnd={onDragEnd} onOpen={() => onOpen(task.id)} />)}{!tasks.length ? <p className={styles.empty}>{status === "not_started" ? "Nothing waiting to start" : status === "in_progress" ? "Nothing in flight" : status === "completed" ? "Nothing ready to review" : status === "reviewed" ? "Nothing reviewed yet" : "No recent archived tasks"}</p> : null}{isTarget && dropTarget?.beforeId === null && dragId ? <div className={styles.dropHint}>Drop to place at the end</div> : null}<button type="button" className={styles.addTask} onClick={onAdd}>+ Add task</button></div></section>
}

function TaskCard({ task, dragging, focused, dropBefore, busy, onDragOver, onDrop, onDragStart, onDragEnd, onOpen }: { task: TaskBoardTask; dragging: boolean; focused: boolean; dropBefore: boolean; busy: boolean; onDragOver: () => void; onDrop: () => void; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void }) {
  const due = dateLabel(task.due_at); const priority = labelForPriority(task.priority)
  return <article draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart() }} onDragEnd={onDragEnd} onDragOver={(event) => { event.preventDefault(); onDragOver() }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop() }} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen() } }} tabIndex={0} className={`${styles.card} ${dragging ? styles.dragging : ""} ${focused ? styles.focused : ""} ${dropBefore ? styles.dropBefore : ""}`}><div className={styles.cardTop}><h3>{task.title}</h3>{priority ? <span className={task.priority === "p1" ? styles.urgentPill : styles.importantPill}>{priority}</span> : null}</div>{task.description ? <p className={styles.description}>{trimWords(task.description)}</p> : null}<footer><span className={styles.clientChip}>{task.client_name ?? "Jarvis"}</span><span className={`${styles.due} ${due.tone === "overdue" ? styles.overdue : due.tone === "today" ? styles.today : ""}`}>{due.label}</span>{task.origin === "suggested" ? <span className={styles.jarvisDot} title="Evidence-backed suggestion" aria-label="Evidence-backed suggestion" /> : null}</footer></article>
}

function TaskDrawer({ task, clients, draft, setDraft, editing, busy, onEdit, onClose, onSave, onMove }: { task: TaskBoardTask; clients: TasksBoardData["clients"]; draft: Draft; setDraft: (draft: Draft) => void; editing: boolean; busy: string | null; onEdit: () => void; onClose: () => void; onSave: (event: FormEvent) => Promise<void>; onMove: (status: TaskBoardStatus) => void }) {
  const due = dateLabel(task.due_at)
  return <div className={styles.overlay} role="presentation" onMouseDown={onClose}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Task detail" onMouseDown={(event) => event.stopPropagation()}><header><div><span className={`${styles.statusDot} ${columnTone[task.status]}`} />{TASK_STATUS_LABEL[task.status]}</div><button onClick={onClose} aria-label="Close task detail">×</button></header>{editing ? <TaskForm clients={clients} draft={draft} setDraft={setDraft} busy={busy} submitLabel="Save changes" onSubmit={onSave} /> : <><div className={styles.drawerContent}><div className={styles.drawerTitle}><h2>{task.title}</h2><button onClick={onEdit}>Edit details</button></div>{task.description ? <p>{task.description}</p> : <p className={styles.muted}>No additional description.</p>}<dl><div><dt>Priority</dt><dd>{labelForPriority(task.priority) ?? "Normal"}</dd></div><div><dt>Client</dt><dd>{task.client_name ?? "Jarvis / no client"}</dd></div><div><dt>Due</dt><dd className={due.tone === "overdue" ? styles.overdue : ""}>{due.label}</dd></div><div><dt>Origin</dt><dd>{task.origin === "suggested" ? "Evidence-backed suggestion" : "Manual task"}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(task.created_at))}</dd></div></dl>{task.linkedObject ? <section className={styles.why}><header><div><span>Why this exists</span><strong>{task.linkedObject.label}</strong><small>{task.linkedObject.type}</small></div>{task.linkedObject.href ? <a href={task.linkedObject.href}>Open →</a> : null}</header>{task.linkedObject.evidence ? <p>{task.linkedObject.evidence}</p> : <p className={styles.muted}>Evidence is retained with this task.</p>}</section> : null}</div><footer className={styles.drawerActions}>{task.status === "not_started" ? <button disabled={Boolean(busy)} onClick={() => onMove("in_progress")}>Start</button> : null}{["not_started", "in_progress"].includes(task.status) ? <button disabled={Boolean(busy)} className={styles.completeButton} onClick={() => onMove("completed")}>Complete</button> : null}{task.status === "completed" ? <button disabled={Boolean(busy)} onClick={() => onMove("reviewed")}>Mark reviewed</button> : null}{task.status !== "archived" ? <button disabled={Boolean(busy)} onClick={() => onMove("archived")}>Archive</button> : null}</footer></>}</aside></div>
}

function TaskModal({ title, clients, draft, setDraft, busy, onClose, onSubmit }: { title: string; clients: TasksBoardData["clients"]; draft: Draft; setDraft: (draft: Draft) => void; busy: string | null; onClose: () => void; onSubmit: (event: FormEvent) => Promise<void> }) { return <div className={styles.overlay} role="presentation" onMouseDown={onClose}><div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose}>×</button></header><TaskForm clients={clients} draft={draft} setDraft={setDraft} busy={busy} submitLabel="Add task" onSubmit={onSubmit} /></div></div> }
function TaskForm({ clients, draft, setDraft, busy, submitLabel, onSubmit }: { clients: TasksBoardData["clients"]; draft: Draft; setDraft: (draft: Draft) => void; busy: string | null; submitLabel: string; onSubmit: (event: FormEvent) => Promise<void> }) { return <form className={styles.taskForm} onSubmit={(event) => void onSubmit(event)}><label>Task<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs to happen?" /></label><label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add useful context…" rows={5} /></label><div className={styles.formGrid}><label>Client<select value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}><option value="">Jarvis / no client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as HomeTaskPriority })}><option value="p3">Normal</option><option value="p2">Important</option><option value="p1">Urgent</option></select></label><label>Due date<input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label></div><footer><button type="submit" disabled={Boolean(busy)}>{busy ? "Saving…" : submitLabel}</button></footer></form> }

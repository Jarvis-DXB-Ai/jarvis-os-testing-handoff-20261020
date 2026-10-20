import "server-only"

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core"
import { loadRoadmapSnapshot } from "@/lib/roadmap-server"

type ClientRow = { id: string; name: string; status: string | null; industry: string | null; brain_architecture_version: string | null }
const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
function confidencePercent(value: unknown) {
  const confidence = Number(value ?? 0)
  if (confidence <= 1) return Math.round(confidence * 100)
  if (confidence <= 5) return Math.round(confidence * 20)
  return Math.min(100, Math.round(confidence))
}

export async function getCommandCenterData() {
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const [clientsRes, gapsRes, proposalsRes, auditsRes, executionsRes, deliverablesRes, aiRes, learningsRes, roadmap] = await Promise.all([
    db.from("clients").select("id, name, status, industry, brain_architecture_version").order("name"),
    db.from("client_brain_v2_records").select("id, client_id, title, summary, status, metadata, updated_at").eq("subsection", "knowledge_gaps").in("status", ["active", "needs_review", "restricted"]).limit(250),
    db.from("brain_update_proposals").select("id, client_id, question_key, confidence, created_at, status").eq("status", "pending").order("created_at", { ascending: false }).limit(80),
    db.from("audit_findings").select("id, client_id, title, summary, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(80),
    db.from("execution_runs").select("id, status, created_at, completed_at, error, execution_queue_id").order("created_at", { ascending: false }).limit(20),
    db.from("deliverables").select("id, client_id, title, status, approval_status, content_type, due_date").gte("due_date", now.toISOString().slice(0, 10)).lte("due_date", weekEnd.toISOString().slice(0, 10)).order("due_date").limit(80),
    db.from("ai_usage_logs").select("id, client_id, feature, model, cost_usd_actual, created_at, completed_at").gte("created_at", monthStart).order("created_at", { ascending: false }).limit(500),
    db.from("learning_events").select("id, client_id, event_type, created_at, summary").order("created_at", { ascending: false }).limit(12),
    loadRoadmapSnapshot(),
  ])
  const clients = (clientsRes.data ?? []) as ClientRow[]
  const clientName = new Map(clients.map(client => [client.id, client.name]))
  const gaps = gapsRes.data ?? []
  const proposals = proposalsRes.data ?? []
  const audits = auditsRes.data ?? []
  const attention = [
    ...gaps.map(gap => ({ id: `gap:${gap.id}`, source: "Knowledge gap", title: gap.title, detail: gap.summary || "Needs a verified source or owner response.", clientId: gap.client_id, priority: String((gap.metadata as Record<string, unknown> | null)?.priority ?? "medium"), createdAt: gap.updated_at, href: `/clients/${gap.client_id}/brain` })),
    ...proposals.map(proposal => ({ id: `proposal:${proposal.id}`, source: "Review", title: proposal.question_key.replaceAll("_", " "), detail: `Confidence ${confidencePercent(proposal.confidence)}%`, clientId: proposal.client_id, priority: "high", createdAt: proposal.created_at, href: "/clients" })),
    ...audits.map(audit => ({ id: `audit:${audit.id}`, source: "Audit", title: audit.title || "Pending audit finding", detail: audit.summary || "Needs review.", clientId: audit.client_id, priority: "high", createdAt: audit.created_at, href: "/audit-reviews" })),
    ...roadmap.items.filter(item => item.status === "blocked").map(item => ({ id: `roadmap:${item.id}`, source: "Roadmap", title: item.title, detail: item.blocker_reason || "Blocked", clientId: null, priority: item.priority, createdAt: item.updated_at, href: "/roadmap" })),
    ...(executionsRes.data ?? []).filter(run => run.status === "failed").map(run => ({ id: `execution:${run.id}`, source: "Execution", title: "Failed execution", detail: run.error || "Execution needs inspection.", clientId: null, priority: "critical", createdAt: run.completed_at || run.created_at, href: "/executions" })),
  ].sort((a, b) => (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const aiRows = aiRes.data ?? []
  const monthSpend = aiRows.reduce((sum, row) => sum + Number(row.cost_usd_actual ?? 0), 0)
  const completedRuns = (executionsRes.data ?? []).filter(run => run.status === "completed").length
  const failedRuns = (executionsRes.data ?? []).filter(run => run.status === "failed").length
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" })
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", hour: "numeric", hourCycle: "h23" }).format(now))
  return {
    clients, clientName, attention: attention.slice(0, 12), roadmap,
    week: (deliverablesRes.data ?? []).map(deliverable => ({ ...deliverable, clientName: clientName.get(deliverable.client_id) ?? "Unassigned" })),
    activity: [
      ...roadmap.activity.map(event => ({ id: `roadmap:${event.id}`, label: event.description, at: event.created_at, kind: "Roadmap" })),
      ...aiRows.slice(0, 8).map(row => ({ id: `ai:${row.id}`, label: `${row.feature || "AI workflow"} completed`, at: row.completed_at || row.created_at, kind: "AI" })),
      ...(learningsRes.data ?? []).map(row => ({ id: `learning:${row.id}`, label: row.summary || row.event_type, at: row.created_at, kind: "Learning" })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10),
    metrics: { activeClients: clients.filter(client => client.status !== "archived").length, attention: attention.length, monthSpend, completedRuns, failedRuns, aiCalls: aiRows.length, today: (deliverablesRes.data ?? []).filter(item => item.due_date === today).length, nextSevenDays: (deliverablesRes.data ?? []).length },
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    dateLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
    contentPipeline: { available: false, detail: "Persisted social content is not available yet. Planner drafts remain client-local until durable content objects are introduced." },
  }
}

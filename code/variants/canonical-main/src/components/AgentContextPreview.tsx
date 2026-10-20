"use client"

import { useState } from "react"
import type { CtxData } from "@/lib/agentContext"

// ─── Score ────────────────────────────────────────────────────────────────────

function scoreContext(ctx: CtxData): { label: string; color: string; score: number; max: number } {
  let score = 0
  if (ctx.command) score++
  if (ctx.plan) score++
  if (ctx.agent) score++
  if (ctx.skills.length > 0) score++
  if (ctx.skills.some((s) => s.promotedLessons.length > 0)) score++
  if (ctx.knowledge.length > 0) score++
  if (ctx.research.length > 0) score++
  if (ctx.deliverable) score++
  const max = 8
  const label = score <= 2 ? "Weak" : score <= 5 ? "Moderate" : "Strong"
  const color = score <= 2 ? "text-red-400 border-red-900 bg-red-950/20"
    : score <= 5 ? "text-yellow-400 border-yellow-900 bg-yellow-950/20"
    : "text-green-400 border-green-900 bg-green-950/20"
  return { label, color, score, max }
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({ title, badge, children, defaultOpen = true }: {
  title: string; badge?: string | number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
          {badge !== undefined && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{badge}</span>}
        </div>
        <span className="text-gray-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t border-gray-200 px-5 pb-5 pt-4">{children}</div>}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 text-gray-600">{label}</span>
      <span className={mono ? "font-mono text-xs text-gray-400" : "text-gray-300"}>{value}</span>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-xs italic text-gray-700">{msg}</p>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentContextPreview({
  ctx,
  taskTitle,
  taskDescription,
  taskAgent,
  taskStatus,
}: {
  ctx: CtxData
  taskTitle: string
  taskDescription: string | null
  taskAgent: string | null
  taskStatus: string
}) {
  const { label, color, score, max } = scoreContext(ctx)

  const stepsArr = Array.isArray(ctx.plan?.steps)
    ? (ctx.plan!.steps as Array<{ step?: number; title?: string; description?: string; agent?: string }>)
    : []

  return (
    <div className="mt-8 space-y-3">
      {/* Header + score */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Agent Context Preview</p>
          <p className="mt-0.5 text-xs text-gray-700">Retrieval inspector — not a live prompt</p>
        </div>
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${color}`}>
          <span className="text-xs font-bold">{label}</span>
          <span className="text-xs opacity-60">{score}/{max}</span>
        </div>
      </div>

      {/* 1 — Task */}
      <Section title="Task" defaultOpen>
        <div className="space-y-2">
          <Row label="Title" value={taskTitle} />
          <Row label="Description" value={taskDescription} />
          <Row label="Assigned Agent" value={taskAgent} />
          <Row label="Status" value={taskStatus.replace(/_/g, " ")} />
        </div>
      </Section>

      {/* 2 — Command */}
      <Section title="Command" badge={ctx.command ? "linked" : "none"} defaultOpen={!!ctx.command}>
        {!ctx.command ? <Empty msg="No command linked to this task." /> : (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-gray-600">Raw Message</p>
              <div className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                <p className="text-sm text-gray-300">{ctx.command.raw_message}</p>
              </div>
            </div>
            {ctx.command.interpreted_intent && (
              <div>
                <p className="mb-1 text-xs text-gray-600">Interpreted Intent</p>
                <p className="text-sm text-gray-400 leading-relaxed">{ctx.command.interpreted_intent}</p>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 3 — Plan */}
      <Section title="Execution Plan" badge={ctx.plan ? "linked" : "none"} defaultOpen={!!ctx.plan}>
        {!ctx.plan ? <Empty msg="No execution plan linked." /> : (
          <div className="space-y-3">
            <Row label="Plan Title" value={ctx.plan.plan_title} />
            <Row label="Summary" value={ctx.plan.plan_summary} />
            {stepsArr.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-gray-600">Steps</p>
                <div className="space-y-1.5">
                  {stepsArr.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-black px-3 py-2">
                      <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{s.step ?? i + 1}</span>
                      <div>
                        <p className="text-xs font-medium text-gray-300">{s.title}</p>
                        {s.description && <p className="mt-0.5 text-xs text-gray-600">{s.description}</p>}
                        {s.agent && <p className="mt-0.5 text-xs text-gray-700">→ {s.agent}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 4 — Agent */}
      <Section title="Agent Profile" badge={ctx.agent?.agent_name} defaultOpen={!!ctx.agent}>
        {!ctx.agent ? <Empty msg="No agent record found for this assignment." /> : (
          <div className="space-y-2">
            <Row label="Name" value={ctx.agent.agent_name} />
            <Row label="Role" value={ctx.agent.agent_type} />
            <Row label="Model" value={ctx.agent.default_model} mono />
            {ctx.agent.capabilities && ctx.agent.capabilities.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="w-36 shrink-0 text-sm text-gray-600">Capabilities</span>
                <div className="flex flex-wrap gap-1.5">
                  {ctx.agent.capabilities.map((c) => (
                    <span key={c} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 5 — Skills */}
      <Section title="Agent Skills" badge={ctx.skills.length} defaultOpen={ctx.skills.length > 0}>
        {ctx.skills.length === 0 ? <Empty msg="No active skills found for this agent." /> : (
          <div className="space-y-3">
            {ctx.skills.map((skill) => (
              <div key={skill.id} className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-300">{skill.name}</p>
                  {skill.category && <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{skill.category}</span>}
                </div>
                {skill.description && <p className="mt-1 text-xs text-gray-600">{skill.description}</p>}
                {skill.promotedLessons.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {skill.promotedLessons.map((l, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-amber-500 text-xs">★</span>
                        <p className="text-xs text-amber-400/80 leading-relaxed">{l}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 6 — Client Knowledge */}
      <Section title="Client Knowledge" badge={ctx.knowledge.length} defaultOpen={ctx.knowledge.length > 0}>
        {!ctx.clientId ? (
          <Empty msg="No client resolved. Link a command or deliverable to a client." />
        ) : ctx.knowledge.length === 0 ? (
          <Empty msg={`No knowledge records for ${ctx.clientName ?? "this client"} yet.`} />
        ) : (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-gray-600">Client: <span className="text-gray-400">{ctx.clientName}</span></p>
            {ctx.knowledge.map((k) => (
              <div key={k.id} className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs ${k.importance >= 4 ? "text-yellow-500" : "text-gray-600"}`}>●</span>
                  <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{k.category}</span>
                  <span className="text-xs font-medium text-gray-300">{k.title}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed pl-4">{k.content}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 7 — Research */}
      <Section title="Related Research" badge={ctx.research.length} defaultOpen={ctx.research.length > 0}>
        {ctx.research.length === 0 ? (
          <Empty msg="No linked research. Link items to client, agent, or cycle." />
        ) : (
          <div className="space-y-2">
            {ctx.research.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-300">{r.title}</p>
                  {r.category && <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{r.category}</span>}
                  {r.link_type && <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-500">{r.link_type}</span>}
                </div>
                {r.key_insights && <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{r.key_insights}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 8 — Deliverable */}
      <Section title="Deliverable Context" badge={ctx.deliverable ? "linked" : "none"} defaultOpen={!!ctx.deliverable}>
        {!ctx.deliverable ? <Empty msg="No deliverable linked." /> : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Row label="Title" value={ctx.deliverable.title} />
              <Row label="Type" value={ctx.deliverable.type} />
              <Row label="Platform" value={ctx.deliverable.platform} />
              <Row label="Status" value={ctx.deliverable.status} />
            </div>
            {ctx.revisions.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-gray-600">Recent Revisions</p>
                <div className="space-y-1.5">
                  {ctx.revisions.map((r) => (
                    <div key={r.id} className="rounded-lg border border-gray-200 bg-black px-3 py-2">
                      <p className="text-xs text-gray-400">{r.revision_notes || "No notes."}</p>
                      <p className="mt-1 text-xs text-gray-700">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

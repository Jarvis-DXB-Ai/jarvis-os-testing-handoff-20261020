"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type LinkedItem = {
  id: string
  link_type: string | null
  research_library: {
    id: string
    title: string
    category: string | null
    source_type: string | null
    key_insights: string | null
  } | null
}

const SOURCE_ICONS: Record<string, string> = {
  "Podcast": "🎙", "YouTube": "▶", "Website": "🌐", "Pinterest": "📌",
  "Awwwards": "🏆", "Book": "📖", "Course": "🎓", "Internal": "🔒",
  "Competitor": "👁", "Client": "🤝",
}

const LINK_TYPE_COLORS: Record<string, string> = {
  "Inspiration":        "border-pink-900 text-pink-400",
  "Strategy":           "border-violet-900 text-violet-400",
  "Brand Reference":    "border-amber-900 text-amber-400",
  "Funnel Reference":   "border-orange-900 text-orange-400",
  "Prompt Reference":   "border-cyan-900 text-cyan-400",
  "QC Reference":       "border-red-900 text-red-400",
  "Competitor Insight": "border-yellow-900 text-yellow-400",
  "Educational":        "border-green-900 text-green-400",
}

type Props = {
  filterField: "client_id" | "skill_id" | "agent_id" | "monthly_cycle_id"
  filterId: string
}

export default function LinkedResearch({ filterField, filterId }: Props) {
  const [items, setItems] = useState<LinkedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("research_links")
        .select(`
          id, link_type,
          research_library(id, title, category, source_type, key_insights)
        `)
        .eq(filterField, filterId)
      setItems((data ?? []) as unknown as LinkedItem[])
      setLoading(false)
    }
    load()
  }, [filterField, filterId])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left"
      >
        <span className="text-xs font-medium uppercase tracking-wider text-white/38">
          Linked Research
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-xs text-white/42">
          {items.length}
        </span>
        <span className="text-xs text-white/28">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const r = item.research_library
            if (!r) return null
            const ltStyle = item.link_type
              ? LINK_TYPE_COLORS[item.link_type] ?? "border-white/10 text-white/42"
              : "border-white/10 text-white/34"
            const srcIcon = r.source_type ? SOURCE_ICONS[r.source_type] ?? "◈" : null
            const isOpen = expandedItemId === item.id

            return (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20">
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3"
                  onClick={() => setExpandedItemId(isOpen ? null : item.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-white/75">{r.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {srcIcon && <span className="text-xs text-white/34">{srcIcon} {r.source_type}</span>}
                      {r.category && <span className="text-xs text-white/28">{r.category}</span>}
                    </div>
                  </div>
                  {item.link_type && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${ltStyle}`}>
                      {item.link_type}
                    </span>
                  )}
                  <a
                    href="/research"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-white/34 transition hover:text-emerald-200"
                    title="View in Research Library"
                  >
                    ↗
                  </a>
                  <span className="shrink-0 text-xs text-white/24">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && r.key_insights && (
                  <div className="border-t border-white/10 px-4 pb-3 pt-2">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-white/30">Key Insights</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/46">{r.key_insights}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

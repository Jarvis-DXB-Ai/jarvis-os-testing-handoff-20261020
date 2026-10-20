'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Sidebar from '@/components/layout/sidebar'

interface AuditSession {
  id: string
  created_at: string
  title: string
  audit_type: string
  mode: string
  status: string
  source_file: string | null
  metadata: Record<string, unknown> | null
  clients?: { name: string } | null
  pending_count?: number
  approved_count?: number
  rejected_count?: number
}

const MODE_COLORS: Record<string, string> = {
  lean: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  full: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}
const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  reviewed: 'bg-green-500/10 text-green-400 border-green-500/20',
  archived: 'bg-zinc-500/10 text-zinc-500 border-zinc-700',
}
const TYPE_LABEL: Record<string, string> = {
  external_research: 'Research Audit',
  external_client: 'Client Audit',
  competitor: 'Competitor Audit',
}

export default function AuditReviewsPage() {
  const [sessions, setSessions] = useState<AuditSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // supabase from import
      const { data: sessionData } = await supabase
        .from('audit_sessions')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })

      if (!sessionData) { setLoading(false); return }

      // fetch finding counts per session
      const enriched = await Promise.all(sessionData.map(async (s) => {
        const { data: findings } = await supabase
          .from('audit_findings')
          .select('status')
          .eq('audit_session_id', s.id)

        const counts = (findings || []).reduce(
          (acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc },
          {} as Record<string, number>
        )
        return {
          ...s,
          pending_count: counts.pending || 0,
          approved_count: counts.approved || 0,
          rejected_count: counts.rejected || 0,
        }
      }))

      setSessions(enriched)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="ops-dark jarvis-dark-shell min-h-screen text-white">
      <Sidebar />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-semibold tracking-[2px] uppercase text-amber-700 mb-1">Intelligence</p>
            <h1 className="text-2xl font-bold text-[#f5f0e8] tracking-tight">Audit Reviews</h1>
            <p className="text-sm text-[#5a5550] mt-1">
              Approve findings from completed audits to promote them into Jarvis OS memory.
            </p>
          </div>
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="text-sm text-[#5a5550]">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-[#5a5550]">No audit sessions yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((s) => {
              const total = (s.pending_count || 0) + (s.approved_count || 0) + (s.rejected_count || 0)
              const approvedPct = total > 0 ? Math.round(((s.approved_count || 0) / total) * 100) : 0
              const clientName = (s.clients as { name?: string } | null)?.name || 'Unknown client'

              return (
                <Link
                  key={s.id}
                  href={`/audit-reviews/${s.id}`}
                  className="block border border-[#1c1c1c] rounded-xl bg-[#0f0f0f] hover:border-[#2a2a2a] hover:bg-[#111] transition-all p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${MODE_COLORS[s.mode] || MODE_COLORS.lean}`}>
                          {s.mode}
                        </span>
                        <span className="text-[10px] text-[#5a5550] font-medium">
                          {TYPE_LABEL[s.audit_type] || s.audit_type}
                        </span>
                        <span className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border ${STATUS_COLORS[s.status] || STATUS_COLORS.pending_review}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#e8e4dc] leading-snug">{s.title}</p>
                      <p className="text-xs text-[#5a5550] mt-0.5">
                        {clientName} · {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {s.metadata?.estimated_cost_usd != null && (
                          <> · ~${Number(s.metadata.estimated_cost_usd).toFixed(2)}</>
                        )}
                      </p>
                    </div>

                    {/* Finding counts */}
                    <div className="flex items-center gap-3 text-right shrink-0">
                      <div className="text-center">
                        <p className="text-lg font-bold text-amber-400">{s.pending_count}</p>
                        <p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Pending</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-400">{s.approved_count}</p>
                        <p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Approved</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#3a3a3a]">{s.rejected_count}</p>
                        <p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Rejected</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {total > 0 && (
                    <div className="mt-4">
                      <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${approvedPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#5a5550] mt-1">{approvedPct}% approved · {total} findings total</p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

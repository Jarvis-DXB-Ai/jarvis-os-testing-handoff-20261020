"use client"

import { useState } from "react"
import type { SocialProviderConnection, SocialProviderConnectionsSnapshot } from "@/lib/social-provider-connections"

type Props = {
  clientId: string
  snapshot: SocialProviderConnectionsSnapshot | null
  loading: boolean
  onSnapshotChange: (snapshot: SocialProviderConnectionsSnapshot) => void
}

function platformLabel(platform: SocialProviderConnection["platform"]) {
  if (platform === "instagram") return "Instagram"
  if (platform === "facebook") return "Facebook"
  return "Meta Ad Account"
}

function statusLabel(status: SocialProviderConnection["status"] | "unsupported") {
  return status === "connected" ? "Connected" : status === "needs_attention" ? "Needs Attention" : status === "expired" ? "Expired" : status === "disconnected" ? "Disconnected" : status === "not_mapped" ? "Needs Jarvis Mapping" : status === "not_connected" ? "Not Connected" : "Unsupported by Current Zernio API"
}

function statusTone(status: SocialProviderConnection["status"] | "unsupported") {
  if (status === "connected") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
  if (status === "unsupported") return "border-white/10 bg-white/[0.04] text-white/55"
  return "border-amber-300/25 bg-amber-300/10 text-amber-100"
}

function synchronizedAt(value: string | null | undefined) {
  if (!value) return "Not synchronized yet"
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(value))
}

export default function ZernioConnectionPanel({ clientId, snapshot, loading, onSnapshotChange }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const connections = snapshot?.connections ?? []
  const accountFor = (platform: "instagram" | "facebook") => connections.find(connection => connection.platform === platform) ?? null

  const sync = async () => {
    setSyncing(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/social-connections`, { method: "POST" })
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; snapshot?: SocialProviderConnectionsSnapshot }
      if (!response.ok || !payload.ok || !payload.snapshot) throw new Error(payload.error || "Zernio synchronization failed.")
      onSnapshotChange(payload.snapshot)
      setMessage("Zernio connection mapping refreshed.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Zernio synchronization failed.")
    } finally {
      setSyncing(false)
    }
  }

  return <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="jarvis-eyebrow">Connections</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Zernio provider readiness</h2>
        <p className="mt-1 text-xs leading-5 text-white/45">Cached client mapping on load. Refresh is an explicit, read-only Zernio request.</p>
      </div>
      <button type="button" onClick={() => void sync()} disabled={syncing || loading} className="w-fit rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
        {syncing ? "Syncing Zernio…" : "Sync Zernio"}
      </button>
    </div>
    {(error || message) && <p className={`mt-3 rounded-xl border px-3 py-2 text-xs ${error ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`}>{error || message}</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      {(["instagram", "facebook"] as const).map(platform => {
        const connection = accountFor(platform)
        const status = connection?.status ?? "not_mapped"
        return <div key={platform} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-white">{platformLabel(platform)}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{loading ? "Loading" : statusLabel(status)}</span></div>
          <p className="mt-3 text-sm text-white/72">{connection?.accountName || "No verified mapping"}</p>
          <p className="mt-1 text-xs text-white/42">{connection?.handle || "Run Sync Zernio to discover this account."}</p>
          <p className="mt-3 text-[10px] text-white/35">Provider: Zernio · {synchronizedAt(connection?.lastSyncedAt)}</p>
        </div>
      })}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-white">Meta Ads</p><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(snapshot?.adAccount.status ?? "unsupported")}`}>{statusLabel(snapshot?.adAccount.status ?? "unsupported")}</span></div>
        <p className="mt-3 text-xs leading-5 text-white/52">{snapshot?.adAccount.detail || "No cached capability result yet."}</p>
        <a href="https://zernio.com" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-emerald-100 hover:text-emerald-50">Open Zernio ↗</a>
      </div>
    </div>
  </section>
}

"use client"

/* eslint-disable @next/next/no-img-element -- Client Brain logos are short-lived, scoped signed URLs. */

import Link from "next/link"
import {clientOfficeHref} from "@/lib/office-client-view.mjs"
import { useMemo, useState } from "react"

import type { ClientIndexClient, ClientIndexData, ClientIndexSignal } from "@/lib/client-index-server"
import styles from "@/components/clients/client-index.module.css"

type View = "cards" | "rows"
type Sort = "attention" | "name" | "recent"

const signalTone: Record<ClientIndexSignal["tone"], string> = {
  good: styles.good,
  warning: styles.warning,
  danger: styles.danger,
  neutral: styles.neutral,
  unknown: styles.unknown,
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase()
}

function attentionRank(client: ClientIndexClient) {
  if (client.attention.some((item) => item.tone === "danger")) return 0
  if (client.attention.length) return 1
  return 2
}

function activityLabel(value: string | null) {
  return value ? `Planner activity ${value}` : "No planner activity"
}

function ClientLogo({ client, compact = false }: { client: ClientIndexClient; compact?: boolean }) {
  return <span className={`${styles.logo} ${compact ? styles.logoCompact : ""}`}>
    <span aria-hidden={!client.logoUrl} className={styles.logoFallback}>{initials(client.name)}</span>
    {client.logoUrl ? <img src={client.logoUrl} alt={`${client.name} logo`} /> : null}
  </span>
}

function SignalCell({ signal }: { signal: ClientIndexSignal }) {
  return <div className={styles.signalCell}>
    <span>{signal.label}</span>
    <strong className={signalTone[signal.tone]}>{signal.value}</strong>
    <small>{signal.detail}</small>
  </div>
}

function ClientCard({ client, view, open, onToggle }: { client: ClientIndexClient; view: View; open: boolean; onToggle: () => void }) {
  const fixture=client.name.startsWith('TEST ');
  const officeHref=fixture?`/clients/${client.id}`:clientOfficeHref(client.id);
  const worst = attentionRank(client)
  const visibleSignals = view === "cards" ? client.signals.slice(0, 3) : []
  const detailSignals = view === "cards" ? client.signals.slice(3) : client.signals
  const statusLabel = client.status && client.status !== "active" ? client.status.replace(/[_-]+/g, " ") : null
  return <article className={`${styles.client} ${view === "rows" ? styles.row : ""} ${open ? styles.open : ""}`}>
    <i className={`${styles.accent} ${worst === 0 ? styles.accentDanger : worst === 1 ? styles.accentWarning : ""}`} />
    <Link href={officeHref} className={styles.clientMain}>
      <div className={styles.identityRow}>
        <ClientLogo client={client} compact={view === "rows"} />
        <span className={styles.identity}>
          <strong>{client.name}</strong>
          <small>{client.industry || "Industry not set"}{statusLabel ? ` · ${statusLabel}` : ""}{client.lastActivity ? ` · ${activityLabel(client.lastActivity)}` : ""}</small>
        </span>
        {view === "rows" ? <span className={`${styles.attention} ${worst === 0 ? styles.danger : worst === 1 ? styles.warning : ""}`}><i />{client.attention.length ? `${client.attention.length} signal${client.attention.length === 1 ? "" : "s"}` : "Nothing waiting"}</span> : null}
      </div>
      {view === "cards" ? <div className={styles.faceSignals}>{visibleSignals.map((signal) => <SignalCell key={signal.label} signal={signal} />)}</div> : null}
      {view === "cards" ? <div className={styles.clientFooter}>
        <span className={`${styles.attention} ${worst === 0 ? styles.danger : worst === 1 ? styles.warning : ""}`}><i />{client.attention.length ? `${client.attention.length} signal${client.attention.length === 1 ? "" : "s"}` : "Nothing waiting"}</span>
        <span className={styles.insight}>{fixture?'Open workspace':'Open office'}<b aria-hidden="true">↗</b></span>
      </div> : <span className={styles.insight}>{fixture?'Open workspace':'Open office'}<b aria-hidden="true">↗</b></span>}
    </Link>
    <button type="button" className={styles.officeInsight} onClick={onToggle} aria-expanded={open}>{open?'Hide details':'Client details'} {open?'−':'+'}</button>
    {open ? <div className={styles.clientDetail}>
      {detailSignals.length ? <div className={styles.detailSignals}>{detailSignals.map((signal) => <SignalCell key={signal.label} signal={signal} />)}</div> : null}
      {client.attention.length ? <section className={styles.attentionList} aria-label={`Attention signals for ${client.name}`}>
        <p>What is asking for you</p>
        {client.attention.map((item) => <Link key={item.id} href={item.href} className={`${styles.attentionItem} ${item.tone === "danger" ? styles.attentionDanger : ""}`}>
          <i /><span><strong>{item.title}</strong><small>{item.detail}</small></span><em>{item.source}</em>
        </Link>)}
      </section> : <p className={styles.quiet}>Nothing is asking for you on this client.</p>}
      <div className={styles.workspaceLinks}>
        <Link href={officeHref}>{fixture?'Open test workspace →':'Open client office →'}</Link><Link href={`/clients/${client.id}`}>Workspace</Link>
        <span>
          <Link href={`/clients/${client.id}/brain`}>Brain</Link>
          <Link href={`/clients/${client.id}/planner`}>Planner</Link>
          <Link href={`/clients/${client.id}/social`}>Social</Link>
          <Link href={`/clients/${client.id}/ai-content/studio`}>Studio</Link>
        </span>
      </div>
    </div> : null}
  </article>
}

export default function ClientIndex({ initialData }: { initialData: ClientIndexData }) {
  const data=useMemo(()=>{const active=initialData.active.filter(c=>!c.name.startsWith('TEST ')),inactive=initialData.inactive.filter(c=>!c.name.startsWith('TEST ')),counts=active.map(c=>Number(c.signals.find(s=>s.label==='Awaiting review')?.value.match(/^\d+/)?.[0]??0));return {...initialData,active,inactive,reviewTotal:counts.reduce((a,b)=>a+b,0),reviewClientCount:counts.filter(n=>n>0).length};},[initialData]);
  const fixtures=[...initialData.active,...initialData.inactive].filter(c=>c.name.startsWith('TEST '));
  const [view, setView] = useState<View>("cards")
  const [sort, setSort] = useState<Sort>("attention")
  const [query, setQuery] = useState("")
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const activeClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return data.active
      .filter((client) => !normalizedQuery || `${client.name} ${client.industry || ""}`.toLowerCase().includes(normalizedQuery))
      .filter((client) => !attentionOnly || client.attention.length > 0)
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name)
        if (sort === "recent") return (right.lastActivity || "").localeCompare(left.lastActivity || "") || left.name.localeCompare(right.name)
        return attentionRank(left) - attentionRank(right) || right.attention.length - left.attention.length || left.name.localeCompare(right.name)
      })
  }, [attentionOnly, data.active, query, sort])
  const inactiveClients = useMemo(() => data.inactive.filter((client) => {
    const normalizedQuery = query.trim().toLowerCase()
    return !normalizedQuery || `${client.name} ${client.industry || ""}`.toLowerCase().includes(normalizedQuery)
  }), [data.inactive, query])
  const total = data.active.length + data.inactive.length

  return <main className={styles.page}>
    <div className={styles.canvas}>
      <header className={styles.header}>
        <div><p>Clients</p><h1>All clients <span>{data.active.length} active · {data.inactive.length} inactive</span></h1></div>
        <Link href="/clients/new" className={styles.newClient}>＋ New client</Link>
      </header>
      {(!query.trim()||'demo restaurant democlientb simulation'.includes(query.trim().toLowerCase()))&&!attentionOnly&&<Link href="/office/demo" className={styles.demoOffice} aria-label="Open Demo office"><span className={styles.demoMark} aria-hidden="true">D</span><span><strong>Demo <small>Interactive simulation</small></strong><p>A restaurant’s simulated workday: dining campaigns, table enquiries, bookings and invoices.</p></span><b>Enter office ↗</b></Link>}
      <section className={styles.summary} aria-label="Review summary">
        <div><p>Awaiting your review</p><strong>{data.reviewTotal}</strong><span>item{data.reviewTotal === 1 ? "" : "s"} across {data.reviewClientCount} {data.reviewClientCount === 1 ? "client" : "clients"}</span></div>
        <i />
        <p>Every figure below is a count of canonical rows, not a score. Where a client has no record for a signal, the row says so rather than showing a zero.</p>
      </section>
      <section className={styles.controls} aria-label="Client list controls">
        <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" aria-label="Search clients" /></label>
        <button type="button" className={attentionOnly ? styles.selected : ""} onClick={() => setAttentionOnly((current) => !current)}>Needs attention only</button>
        <label className={styles.sort}><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="attention">Attention</option><option value="name">Name</option><option value="recent">Recently active</option></select></label>
        <span className={styles.viewToggle}><button type="button" className={view === "cards" ? styles.selected : ""} onClick={() => setView("cards")} aria-label="Card view">▦</button><button type="button" className={view === "rows" ? styles.selected : ""} onClick={() => setView("rows")} aria-label="Row view">☷</button></span>
      </section>
      {activeClients.length ? <section className={`${styles.clientList} ${view === "cards" ? styles.cards : styles.rows}`}>{activeClients.map((client) => <ClientCard key={client.id} client={client} view={view} open={openId === client.id} onToggle={() => setOpenId((current) => current === client.id ? null : client.id)} />)}</section> : <div className={styles.empty}>{total ? "No client matches this filter." : "No clients are recorded yet."}</div>}
      {data.inactive.length ? <section className={styles.inactive}>
        <button type="button" onClick={() => setInactiveOpen((current) => !current)} aria-expanded={inactiveOpen}><b>{inactiveOpen ? "⌄" : "›"}</b>Inactive <span>{data.inactive.length}</span><small>Not counted in any figure above</small></button>
        {inactiveOpen ? <div className={styles.inactiveRows}>{inactiveClients.map((client) => <ClientCard key={client.id} client={client} view="rows" open={openId === client.id} onToggle={() => setOpenId((current) => current === client.id ? null : client.id)} />)}</div> : null}
      </section> : null}
      {fixtures.length>0&&<details className={styles.fixtureGroup}><summary>Test clients · {fixtures.length}</summary><p>Isolated QA records. These are excluded from your client totals.</p><div className={styles.inactiveRows}>{fixtures.map(client=><ClientCard key={client.id} client={client} view="rows" open={openId===client.id} onToggle={()=>setOpenId(current=>current===client.id?null:client.id)}/>)}</div></details>}
    </div>
  </main>
}

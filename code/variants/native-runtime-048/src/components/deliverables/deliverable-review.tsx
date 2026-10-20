"use client"
import { useState } from "react"
import Link from "next/link"
import styles from "./deliverable-review.module.css"

type Deliverable = { title: string; client_id?: string | null; monthly_cycle_id?: string | null; status: string; approval_status: string | null; type: string; platform: string | null; content_type: string | null; priority: string | null; due_date: string | null; assigned_agent: string | null; description: string | null; created_at: string }
type Asset = { id: string; name: string; file_url: string | null; thumbnail_url: string | null; status: string; version: number; model_used: string | null; prompt: string | null }
type Copy = { id: string; copy_type: string; platform: string | null; status: string; version: number; content: string; tone: string | null }
type Revision = { id: string; created_at: string; requested_by: string | null; status: string; note: string | null }
type Activity = { id: string; created_at: string; actor: string; action: string; summary: string | null }
const normalize = (value: string | null) => (value ?? "").toLowerCase().replaceAll(" ", "_")
const readable = (value: string | null) => value ? value.replaceAll("_", " ") : "Not recorded"
const date = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(value)) : "No date"
function Preview({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return <div className={styles.preview}>{url && !failed ? <img src={url} alt={name} onError={() => setFailed(true)} /> : <span>No preview</span>}</div>
}
export function DeliverableReview({ deliverable: d, assets, copy, revisions, activity, loading, error, onEdit, onRetry }: { deliverable: Deliverable | null; assets: Asset[]; copy: Copy[]; revisions: Revision[]; activity: Activity[]; loading: boolean; error: string | null; onEdit: () => void; onRetry: () => void }) {
  if (error) return <main className={styles.shell}><h1>Deliverable unavailable</h1><div className={styles.banner} role="alert"><p>Could not load the complete deliverable. No partial records are shown.</p><button onClick={onRetry}>Try again</button></div></main>
  if (loading) return <main className={styles.shell} aria-busy="true"><h1>Loading deliverable…</h1><div className={styles.grid}>{[0, 1, 2].map(i => <div key={i} className={styles.asset}><div className={styles.preview} /><p>Loading asset…</p></div>)}</div></main>
  if (!d) return <main className={styles.shell}><h1>Deliverable not found</h1><Link href="/workspaces/social-media">Back to Content</Link></main>
  const assetReady = assets.some(asset => normalize(asset.status) === "final")
  const copyReady = copy.length > 0
  const approval = normalize(d.approval_status)
  const approved = approval === "approved"
  const pending = ["pending", "awaiting_client", "awaiting_client_approval", "pending_client_approval"].includes(approval)
  const blocker = pending ? "Awaiting client approval" : !assets.length && !copy.length ? "Nothing produced yet" : !assetReady ? "No final asset recorded" : !copyReady ? "No copy recorded" : !approved ? "Approval not completed" : "On track"
  return <main className={styles.shell}>
    <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/workspaces/social-media">Content</Link>{d.client_id && <Link href={`/clients/${d.client_id}`}>Client workspace</Link>}{d.monthly_cycle_id && <Link href={`/cycles/${d.monthly_cycle_id}`}>Monthly cycle</Link>}</nav>
    <div className={styles.header}><h1>{d.title}</h1><div className={styles.chips}>{[["A Assets", assetReady], ["C Copy", copyReady], ["✓ Approval", approved]].map(([name, ready]) => <span key={String(name)} className={`${styles.chip} ${ready ? styles.ready : styles.missing}`}>{name}</span>)}</div></div>
    <div className={styles.chips}>{[d.status, `Approval: ${readable(d.approval_status)}`, d.type, d.platform, d.priority].filter(Boolean).map((value, i) => <span key={i} className={styles.chip}>{readable(value)}</span>)}<button onClick={onEdit}>Edit and workflow controls</button></div>
    <div className={styles.banner}>{blocker}</div>
    <section className={styles.section}><h2><em>01</em> Assets <small>{assets.length} recorded</small></h2><div className={styles.grid}>{assets.map(asset => <details className={`${styles.asset} ${normalize(asset.status) === "failed" ? styles.failed : ""}`} key={asset.id}><summary><Preview key={asset.thumbnail_url} url={asset.thumbnail_url} name={asset.name} /><div className={styles.assetBody}><strong>{asset.name}</strong><div className={styles.chips}><span className={styles.chip}>v{asset.version}</span><span className={styles.chip}>{readable(asset.status)}</span></div><p>Model: {asset.model_used || "Not recorded"}</p>{normalize(asset.status) === "failed" && <p>Failure reason not recorded in the asset fields. Review its revision history.</p>}</div></summary><div className={styles.assetBody}><p className={styles.pre}>{asset.prompt || "Prompt not recorded"}</p>{asset.file_url && <a href={asset.file_url} target="_blank" rel="noopener noreferrer">Open file →</a>}</div></details>)}</div>{!assets.length && <p className={styles.empty}>No assets recorded yet.</p>}</section>
    <section className={styles.section}><h2><em>02</em> Copy <small>{copy.length} {copy.length === 1 ? "item" : "items"}</small></h2>{copy.map(item => <article className={styles.card} key={item.id}><div className={styles.chips}>{[item.copy_type, item.platform, `v${item.version}`, item.status].filter(Boolean).map((value, i) => <span key={i} className={styles.chip}>{readable(value)}</span>)}</div><p className={styles.pre}>{item.content}</p><small>Tone: {item.tone || "Not recorded"}</small></article>)}{!copy.length && <p className={styles.empty}>No copy recorded yet.</p>}</section>
    <section className={styles.section}><h2><em>03</em> Revisions</h2>{revisions.map(item => <article className={styles.timeline} key={item.id}><small>{date(item.created_at)} · {item.requested_by || "Not recorded"} · {readable(item.status)}</small><p>{item.note || "No note recorded"}</p></article>)}{!revisions.length && <p className={styles.empty}>No revisions recorded.</p>}</section>
    <section className={styles.section}><h2><em>04</em> Details</h2><dl className={styles.details}>{[["Due", date(d.due_date)], ["Type", d.type], ["Platform", d.platform], ["Content type", d.content_type], ["Priority", d.priority], ["Assigned agent", d.assigned_agent || "Not assigned"], ["Created", date(d.created_at)]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || "Not recorded"}</dd></div>)}</dl>{d.description && <p className={styles.pre}>{d.description}</p>}</section>
    <section className={styles.section}><h2><em>05</em> Activity</h2>{activity.map(item => <article className={styles.timeline} key={item.id}><small>{date(item.created_at)} · {item.actor}</small><p>{item.summary || readable(item.action)}</p></article>)}{!activity.length && <p className={styles.empty}>No activity recorded.</p>}</section>
  </main>
}

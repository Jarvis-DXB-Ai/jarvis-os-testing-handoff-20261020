"use client";

import Link from "next/link";
import styles from "./client-suite.module.css";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ClientWorkspaceOverview } from "@/components/clients/client-workspace-context";
import { PostPreview, SocialPostStats } from "./social-post-card";

type PlanItem = { id: string; position: number; pillar: string | null; subject: string | null; creative_concept: string | null; production_method: string | null; planned_date: string | null; visual_direction: string | null; status: string };
type PlanDetail = { plan: { id: string; plan_month: string; status: string; target_feed_count: number }; items: PlanItem[] } | null;

const compact = (value: number | null | undefined) => typeof value === "number" ? new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value) : "Not tracked";
const label = (value: string | null | undefined, fallback = "Not tracked") => value ? value.replaceAll("_", " ") : fallback;

const month = (value: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function Section({ number, title, children, meta }: { number: string; title: string; children: React.ReactNode; meta?: string }) {
  return <section className="client-v2-section"><header><span>{number}</span><h2>{title}</h2><i />{meta ? <small>{meta}</small> : null}</header>{children}</section>;
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="client-v2-empty">{children}</div>; }
function Metric({ label: title, value, note, lead = false }: { label: string; value: string; note: string; lead?: boolean }) { return <article className={`client-v2-metric ${lead ? "is-lead" : ""}`}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
export function ClientOverviewV2({ clientId, initialData }: { clientId: string; initialData?: ClientWorkspaceOverview }) {
  return <ClientOverviewContent key={clientId} clientId={clientId} initialData={initialData} />;
}

function subscribeSuggestionPreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("jarvis-suggestion-preference", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("jarvis-suggestion-preference", callback);
  };
}

function ClientOverviewContent({ clientId, initialData }: { clientId: string; initialData?: ClientWorkspaceOverview }) {
  const preferenceKey = `jarvis.client.${clientId}.suggestionsHidden`;
  const hidden = useSyncExternalStore(subscribeSuggestionPreference,
    () => sessionStorage.getItem(preferenceKey) === "1", () => false);
  function setHidden(value: boolean) {
    if (value) sessionStorage.setItem(preferenceKey, "1"); else sessionStorage.removeItem(preferenceKey);
    window.dispatchEvent(new Event("jarvis-suggestion-preference"));
  }
  const [data, setData] = useState<ClientWorkspaceOverview | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [openGap, setOpenGap] = useState<number | null>(null);
  const [upcomingExpanded,setUpcomingExpanded]=useState(false);
  useEffect(() => {
    if (initialData) return;
    let active = true;
    void fetch(`/api/clients/${clientId}/overview?view=summary`)
      .then(async r => {
        const body = await r.json() as { overview?: ClientWorkspaceOverview; error?: string };
        if (!r.ok || !body.overview) throw new Error(body.error || "Overview unavailable");
        if (active) setData(body.overview);
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Overview unavailable"); });
    return () => { active = false; };
  }, [clientId, initialData]);
  const suggestions = useMemo(() => data?.attention.slice(0, 5) ?? [], [data]);
  useEffect(() => {
    if (hidden || suggestions.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSuggestionIndex(i => (i + 1) % suggestions.length), 8000);
    return () => clearInterval(timer);
  }, [hidden, suggestions.length]);
  if (!data && !error) return <div className="client-v2-loading" />;
  if (!data) return <Empty>{error}</Empty>;

  const posts = (data.performance.topPosts?.length ? data.performance.topPosts : data.performance.topPost ? [data.performance.topPost] : []).slice(0, 3);
  const suggestion = suggestions[suggestionIndex] ?? null;
  const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value)) : "Unscheduled";
  return <div className="client-v2-page">
    {!hidden ? <section className={styles.priority}><div><span>JARVIS SUGGESTION {suggestions.length ? `${suggestionIndex + 1} / ${suggestions.length}` : ""}</span><h2>{suggestion?.title || "No priority intervention is currently tracked."}</h2><p>{suggestion?.detail || data.pipeline.nextStep}</p><div className="client-ov3-suggestion-row"><Link href={suggestion?.href || `/clients/${clientId}/planner`}>{suggestion ? "Open" : "Open Planner"}</Link>{suggestions.length > 1 ? <div className="client-ov3-suggestion-arrows"><button type="button" aria-label="Previous suggestion" onClick={() => setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length)}>‹</button><button type="button" aria-label="Next suggestion" onClick={() => setSuggestionIndex(i => (i + 1) % suggestions.length)}>›</button></div> : null}</div>{suggestions.length > 1 ? <div className="client-v2-suggestion-nav">{suggestions.map((item, index) => <button aria-label={`Show suggestion ${index + 1}`} className={index === suggestionIndex ? "on" : ""} key={item.id} onClick={() => setSuggestionIndex(index)} />)}</div> : null}</div><button aria-label="Hide suggestions" onClick={() => { setHidden(true); }}>×</button></section> : null}
    <Section number="01" title="Top performing" meta="Ranked by reach · retained 30-day sample"><div className={styles.postGrid}>{posts.length ? posts.map((post, index) => <article key={post.postUrl || `${post.publishedAt}-${index}`} className={styles.post}><PostPreview src={post.thumbnailUrl} /><div className={styles.postBody}><span className={styles.eyebrow}>0{index + 1} · {post.platform}</span>{post.reachVsMedian !== null && post.reachVsMedian >= 1.5 ? <span className={styles.tag}>{post.reachVsMedian.toFixed(1)}× sample median</span> : null}<h3>{post.title || post.captionExcerpt || label(post.postType)}</h3><p>{post.publishedAt ? dateLabel(post.publishedAt) : "Date unavailable"} · {label(post.postType)}</p><SocialPostStats post={post}/><p className={styles.legend}>Reach {compact(post.reach)} · Views {compact(post.views)}</p>{post.postUrl && /^https?:\/\//.test(post.postUrl) ? <a href={post.postUrl} target="_blank" rel="noopener noreferrer">View post ↗</a> : <p>Post link unavailable</p>}</div></article>) : <Empty>No observed post performance is retained yet.</Empty>}</div></Section>
    <Section number="02" title="Upcoming" meta={`${data.upcoming.length} planned posts`}>{data.upcoming.length ? <><div className={styles.upcoming}>{data.upcoming.slice(0,upcomingExpanded?undefined:5).map(item=><Link key={item.id} href={`/clients/${clientId}/social?tab=publishing&item=${item.id}&month=${item.date?.slice(0,7)||""}&kind=${item.format}`}><PostPreview src={item.thumbnailUrl}/><div><strong>{item.title}</strong><small>{dateLabel(item.date)}{item.time?` · ${item.time}`:''} · {label(item.format)}</small><span className={styles.tag}>{label(item.status)}</span></div></Link>)}</div>{data.upcoming.length>5?<button type="button" className={styles.textLink} aria-expanded={upcomingExpanded} onClick={()=>setUpcomingExpanded(value=>!value)}>{upcomingExpanded?'Show less':`Show all ${data.upcoming.length}`}</button>:null}</>:<Empty>Nothing is scheduled to publish yet.</Empty>}</Section>
    <Section number="03" title="Brain health"><div className="client-v2-metrics"><Metric lead label="Evidence records" value={compact(data.brain.recordCount)} note="Non-archived Brain records" /><Metric label="Needs review" value={compact(data.brain.openGapCount)} note={data.brain.updatedAt ? `Last updated ${dateLabel(data.brain.updatedAt)}` : "Open evidence gaps"} /></div>
      {data.brainGaps.length ? <div className="client-ov3-gaps">{data.brainGaps.slice(0, 5).map((gap, index) => { const open = openGap === index; return <article key={gap.id} className={`client-ov3-gap${open ? " is-open" : ""}`}><button type="button" onClick={() => setOpenGap(open ? null : index)} aria-expanded={open}><span className="client-ov3-gap-dot" /><strong>{gap.title}</strong>{gap.priority ? <em>{label(gap.priority)}</em> : null}<i>{open ? "–" : "+"}</i></button>{open ? <div className="client-ov3-gap-body">{gap.detail ? <p>{gap.detail}</p> : null}<Link href={gap.href}>Open in Brain →</Link></div> : null}</article>; })}</div> : null}
    </Section>
  </div>;
}

export function ClientPlannerV2({ clientId, detail }: { clientId: string; detail: PlanDetail }) {
  const [view, setView] = useState<"grid" | "schedule">("grid");
  if (!detail) return <div className="client-v2-page"><Section number="01" title="Plan"><Empty>No monthly plan exists for this client yet.<Link href={`/clients/${clientId}/planner?plan=new`}>Open Planner</Link></Empty></Section></div>;
  const { plan, items } = detail;
  return <div className="client-v2-page"><Section number="01" title="Plan" meta={month(plan.plan_month)}><div className="client-v2-planhead"><strong>{label(plan.status)}</strong><span>{items.length} of {plan.target_feed_count || "—"} items</span><Link href={`/clients/${clientId}/planner?plan=${plan.id}`}>Open planning workflow</Link></div><nav className="client-v2-subnav">{(["grid", "schedule"] as const).map(item => <button className={view === item ? "on" : ""} onClick={() => setView(item)} key={item}>{item}</button>)}</nav>{view === "grid" ? <div className="client-v2-grid">{items.map(item => <article key={item.id} className={`is-${item.status}`}><small>{item.planned_date || "Unscheduled"}</small><b>{label(item.production_method, "Method")}</b><strong>{item.subject || item.creative_concept || "Untitled plan item"}</strong><span>{label(item.pillar)}</span></article>)}</div> : <div className="client-v2-schedule">{items.map(item => <article key={item.id}><i className={`is-${item.status}`} /><div><strong>{item.subject || item.creative_concept || "Untitled plan item"}</strong><small>{item.planned_date || "Unscheduled"} · {label(item.status)}</small></div><Link href={`/clients/${clientId}/planner?plan=${plan.id}`}>{item.status === "blocked" ? "Resolve" : item.status === "draft" ? "Produce" : "Open"}</Link></article>)}</div>}</Section></div>;
}

export function ClientStudioV2({ clientId, detail }: { clientId: string; detail: PlanDetail }) {
  const item = detail?.items[0];
  return <div className="client-v2-page client-v2-studio"><Section number="01" title="Brief" meta={detail ? month(detail.plan.plan_month) : "No current plan"}>{item ? <div className="client-v2-brief"><strong>{item.subject || item.creative_concept || "Untitled plan item"}</strong><p>{item.visual_direction || "No resolved visual direction is recorded for this item."}</p><span>{label(item.production_method)} · {label(item.pillar)}</span></div> : <Empty>Choose a monthly plan item before beginning controlled production.</Empty>}</Section><Section number="02" title="Versions">{item ? <Empty>Versions, final selection, corrections, and generation remain in the controlled Studio workspace. No version is generated or changed here.<Link href={`/clients/${clientId}/ai-content/studio?legacy=1`}>Open Studio workspace</Link></Empty> : <Empty>No production item is available.</Empty>}</Section><div className="client-v2-composer"><span>Controlled production</span><Link href={`/clients/${clientId}/ai-content/studio?legacy=1`}>Open composer</Link></div></div>;
}

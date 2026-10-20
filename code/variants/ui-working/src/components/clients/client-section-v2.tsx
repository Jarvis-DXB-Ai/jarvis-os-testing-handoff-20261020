"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ClientWorkspaceOverview } from "@/components/clients/client-workspace-context";
import type { SocialPerformanceOverview } from "@/lib/social-performance";

type PlanItem = { id: string; position: number; pillar: string | null; subject: string | null; creative_concept: string | null; production_method: string | null; planned_date: string | null; visual_direction: string | null; status: string };
type PlanDetail = { plan: { id: string; plan_month: string; status: string; target_feed_count: number }; items: PlanItem[] } | null;

const compact = (value: number | null | undefined) => typeof value === "number" ? new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value) : "Not tracked";
const label = (value: string | null | undefined, fallback = "Not tracked") => value ? value.replaceAll("_", " ") : fallback;
const delta = (current: number | null, prior: number | null) => current === null || prior === null || prior === 0 ? "No comparison" : `${((current - prior) / prior * 100).toFixed(1)}% vs prior 30`;
const month = (value: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function Section({ number, title, children, meta }: { number: string; title: string; children: React.ReactNode; meta?: string }) {
  return <section className="client-v2-section"><header><span>{number}</span><h2>{title}</h2><i />{meta ? <small>{meta}</small> : null}</header>{children}</section>;
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="client-v2-empty">{children}</div>; }
function Metric({ label: title, value, note, lead = false }: { label: string; value: string; note: string; lead?: boolean }) { return <article className={`client-v2-metric ${lead ? "is-lead" : ""}`}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function PostRows({ posts }: { posts: SocialPerformanceOverview["postObservations"] }) {
  const [sort, setSort] = useState<"reach" | "saves" | "shares">("reach");
  const rows = useMemo(() => [...posts].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1)), [posts, sort]);
  if (!rows.length) return <Empty>No observed posts are retained for the selected period.</Empty>;
  return <div className="client-v2-posts"><div className="client-v2-sort">{(["reach", "saves", "shares"] as const).map(key => <button className={sort === key ? "on" : ""} onClick={() => setSort(key)} key={key}>By {key}</button>)}</div>{rows.map((post, index) => <article key={post.id} className="client-v2-post"><b>{index + 1}</b><div><strong>{post.title || label(post.postType, "Observed post")}</strong><small>{post.publishedAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(post.publishedAt)) : "Date unavailable"}</small></div><span>{compact(post.reach)}<small>reach</small></span><span>{compact(post[sort])}<small>{sort}</small></span></article>)}</div>;
}

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
    () => localStorage.getItem(preferenceKey) === "1", () => false);
  function setHidden(value: boolean) {
    if (value) localStorage.setItem(preferenceKey, "1"); else localStorage.removeItem(preferenceKey);
    window.dispatchEvent(new Event("jarvis-suggestion-preference"));
  }
  const [data, setData] = useState<ClientWorkspaceOverview | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [openGap, setOpenGap] = useState<number | null>(0);
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
    if (hidden || suggestions.length < 2) return;
    const timer = setInterval(() => setSuggestionIndex(i => (i + 1) % suggestions.length), 8000);
    return () => clearInterval(timer);
  }, [hidden, suggestions.length]);
  if (!data && !error) return <div className="client-v2-loading" />;
  if (!data) return <Empty>{error}</Empty>;
  const instagram = data.socialPerformance.instagram;
  const posts = data.performance.topPosts?.length ? data.performance.topPosts : data.performance.topPost ? [data.performance.topPost] : [];
  const suggestion = suggestions[suggestionIndex] ?? null;
  const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value)) : "Unscheduled";
  // Every headline metric states the same comparison: this 30-day window against
  // the one before it. A metric without a retained prior window says so rather
  // than borrowing another metric's trend.
  const vsPrior = (current: number | null | undefined, prior: number | null | undefined) =>
    typeof current !== "number" || typeof prior !== "number" || prior === 0
      ? "No prior 30 days retained"
      : `${(current - prior) / prior >= 0 ? "+" : ""}${(((current - prior) / prior) * 100).toFixed(1)}% vs prior 30 days`;
  return <div className="client-v2-page">
    {!hidden ? <section className="client-v2-suggestion"><div><span>JARVIS SUGGESTION {suggestions.length ? `${suggestionIndex + 1} / ${suggestions.length}` : ""}</span><h2>{suggestion?.title || "No priority intervention is currently tracked."}</h2><p>{suggestion?.detail || data.pipeline.nextStep}</p><div className="client-ov3-suggestion-row"><Link href={suggestion?.href || `/clients/${clientId}/planner`}>{suggestion ? "Open" : "Open Planner"}</Link>{suggestions.length > 1 ? <div className="client-ov3-suggestion-arrows"><button type="button" aria-label="Previous suggestion" onClick={() => setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length)}>‹</button><button type="button" aria-label="Next suggestion" onClick={() => setSuggestionIndex(i => (i + 1) % suggestions.length)}>›</button></div> : null}</div>{suggestions.length > 1 ? <div className="client-v2-suggestion-nav">{suggestions.map((item, index) => <button aria-label={`Show suggestion ${index + 1}`} className={index === suggestionIndex ? "on" : ""} key={item.id} onClick={() => setSuggestionIndex(index)} />)}</div> : null}</div><button aria-label="Hide suggestions" onClick={() => { setHidden(true); }}>×</button></section> : <button className="client-v2-restore" onClick={() => { setHidden(false); }}>Restore Jarvis suggestions</button>}
    <Section number="01" title="Performance" meta="Social: last 30 days vs prior 30"><div className="client-v2-metrics">
      <Metric lead label="Followers" value={compact(instagram?.followers)} note={vsPrior(instagram?.followers, instagram?.previous?.followers)} />
      <Metric label="Reach" value={compact(instagram?.postReach)} note={vsPrior(instagram?.postReach, instagram?.previous?.postReach)} />
      <Metric label="Views" value={compact(instagram?.views)} note={vsPrior(instagram?.views, instagram?.previous?.views)} />
      <Metric label="Engagements" value={compact(instagram?.engagements)} note={vsPrior(instagram?.engagements, instagram?.previous?.engagements)} />
      <Metric label="Jarvis plan published" value={compact(data.pipeline.published.count)} note={`${data.pulse.label}${data.pipeline.published.failed ? ` · ${data.pipeline.published.failed} failed` : ""}`} />
    </div></Section>
    <Section number="02" title="Top performing" meta={posts.length > 1 ? `Top ${posts.length} by reach · retained 30-day sample` : "Ranked by reach"}><div className="client-v2-top">{posts.length ? posts.map((post, index) => <article key={post.postUrl || `${post.publishedAt}-${index}`} className="client-v2-post"><b>{index + 1}</b><div><strong>{post.title || post.captionExcerpt || label(post.postType)}</strong><small>{post.publishedAt ? dateLabel(post.publishedAt) : "Date unavailable"} · {post.platform}{post.reachVsMedian && post.reachVsMedian >= 2 ? ` · ${post.reachVsMedian.toFixed(1)}× median` : ""}</small></div><span>{compact(post.reach)}<small>reach</small></span><span>{compact(post.interactions)}<small>interactions</small></span></article>) : <Empty>No observed post performance is retained yet.</Empty>}</div></Section>
    <Section number="03" title="Ads"><Empty>Campaign performance is not tracked. Connect an approved ad-metrics sync to show this section.</Empty></Section>
    <Section number="04" title="Upcoming" meta={`Next ${data.upcoming.length} scheduled`}>{data.upcoming.length ? <div className="client-v2-schedule">{data.upcoming.slice(0, 5).map(item => <article key={item.id}><i /><div><strong>{item.title}</strong><small>{dateLabel(item.date)}{item.time ? ` · ${item.time}` : ""} · {label(item.format)}</small></div><Link href={`/clients/${clientId}/planner`}>{label(item.status)}</Link></article>)}</div> : <Empty>Nothing is scheduled to publish yet.</Empty>}</Section>
    <Section number="05" title="Brain health"><div className="client-v2-metrics"><Metric lead label="Evidence records" value={compact(data.brain.recordCount)} note="Non-archived Brain records" /><Metric label="Needs review" value={compact(data.brain.openGapCount)} note={data.brain.updatedAt ? `Last updated ${dateLabel(data.brain.updatedAt)}` : "Open evidence gaps"} /></div>
      {data.brainGaps.length ? <div className="client-ov3-gaps">{data.brainGaps.slice(0, 5).map((gap, index) => { const open = openGap === index; return <article key={gap.id} className={`client-ov3-gap${open ? " is-open" : ""}`}><button type="button" onClick={() => setOpenGap(open ? null : index)} aria-expanded={open}><span className="client-ov3-gap-dot" /><strong>{gap.title}</strong>{gap.priority ? <em>{label(gap.priority)}</em> : null}<i>{open ? "–" : "+"}</i></button>{open ? <div className="client-ov3-gap-body">{gap.detail ? <p>{gap.detail}</p> : null}<Link href={gap.href}>Open in Brain →</Link></div> : null}</article>; })}</div> : null}
    </Section>
  </div>;
}

export function ClientSocialV2({ clientId, performance }: { clientId: string; performance: SocialPerformanceOverview }) {
  const [view, setView] = useState<"performance" | "posts" | "audience" | "insights">("performance");
  const ig = performance.platforms.instagram;
  const current = ig.current; const previous = ig.previous;
  const followerBars = performance.followerObservations.slice(-30);
  return <div className="client-v2-page"><nav className="client-v2-subnav">{(["performance", "posts", "audience", "insights"] as const).map(item => <button className={view === item ? "on" : ""} onClick={() => setView(item)} key={item}>{item}</button>)}</nav>
    {view === "performance" ? <><Section number="01" title="Performance" meta="Cached provider observations"><div className="client-v2-metrics"><Metric lead label="Reach" value={compact(current?.postReach)} note={delta(current?.postReach ?? null, previous?.postReach ?? null)} /><Metric label="Views" value={compact(current?.views)} note={delta(current?.views ?? null, previous?.views ?? null)} /><Metric label="Engagements" value={compact(current?.engagements)} note={delta(current?.engagements ?? null, previous?.engagements ?? null)} /><Metric label="Followers" value={compact(current?.followers)} note={delta(current?.followers ?? null, previous?.followers ?? null)} /></div><div className="client-v2-bars">{followerBars.length ? followerBars.map(point => <i title={point.date} key={point.id} style={{ height: `${Math.max(8, ((point.followers - Math.min(...followerBars.map(x => x.followers))) / Math.max(1, Math.max(...followerBars.map(x => x.followers)) - Math.min(...followerBars.map(x => x.followers)))) * 100)}%` }} />) : <Empty>No daily follower observations are retained.</Empty>}</div></Section></> : null}
    {view === "posts" ? <Section number="01" title="Posts" meta="Observed performance"><PostRows posts={performance.postObservations} /></Section> : null}
    {view === "audience" ? <Section number="01" title="Audience" meta="Instagram only">{performance.audience ? <div className="client-v2-audience">{([{ title: "Cities", values: performance.audience.topCities }, { title: "Countries", values: performance.audience.topCountries }, { title: "Age", values: performance.audience.ageDistribution }, { title: "Gender", values: performance.audience.genderDistribution }]).map(({ title, values }) => <article key={title}><h3>{title}</h3>{values.map(v => <p key={v.label}><span>{v.label}</span><i><b style={{ width: `${v.percent}%` }} /></i><small>{v.percent}%</small></p>)}</article>)}</div> : <Empty>No Instagram audience breakdown is retained. Facebook does not provide this breakdown.</Empty>}</Section> : null}
    {view === "insights" ? <Section number="01" title="Insights" meta="Evidence-grounded"><Empty>{performance.postObservations.length ? "Insights are available in Social Intelligence, where confidence and sample size are preserved." : "No observed-post sample exists yet; insight confidence cannot be calculated."}<Link href={`/clients/${clientId}/social?tab=dashboard`}>Open Social Intelligence</Link></Empty></Section> : null}
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

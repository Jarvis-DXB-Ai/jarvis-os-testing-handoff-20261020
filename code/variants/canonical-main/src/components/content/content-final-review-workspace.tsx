"use client";

import { useState } from "react";

type Manifest = Record<string, unknown>;
type PublishingLifecycle = {
  manifestId: string;
  targets: Array<{
    manifestTargetId: string;
    platform: string;
    accountLabel: string | null;
    scheduledAt: string | null;
    authorization: { id: string; mode: string; state: string; executionId: string | null } | null;
    execution: { status: string; providerPostId: string | null } | null;
    publication: { publishedAt: string | null; observationCount: number; observationState: "linked" | "unobserved" | "not_published" };
  }>;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function action(clientId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/clients/${clientId}/content-lineage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "Final review action failed.");
  return payload;
}

export default function ContentFinalReviewWorkspace({ clientId, initial, initialPublishingLifecycles }: { clientId: string; initial: Manifest[]; initialPublishingLifecycles: PublishingLifecycle[] }) {
  const [manifests, setManifests] = useState(initial);
  const [publishingLifecycles, setPublishingLifecycles] = useState(initialPublishingLifecycles);
  const [reviewer, setReviewer] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const response = await fetch(`/api/clients/${clientId}/content-lineage?view=reviews`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "Unable to refresh final reviews.");
    setManifests(payload.manifests ?? []);
    setPublishingLifecycles(payload.publishingLifecycles ?? []);
  };
  const run = async (manifest: Manifest, kind: "approve" | "handoff" | "prepare", manifestTargetId?: string) => {
    const id = text(manifest.id);
    setBusyId(`${id}:${kind}:${manifestTargetId ?? ""}`);
    setMessage("");
    try {
      await action(clientId, kind === "approve"
        ? { action: "approve_final_review", manifestId: id, reviewer }
        : kind === "handoff"
          ? { action: "handoff_approved_manifest", manifestId: id }
          : { action: "prepare_lineage_dry_run", manifestId: id, manifestTargetId });
      await refresh();
      setMessage(kind === "approve" ? "Final review approved." : kind === "handoff" ? "Approved review linked to Publishing in dry-run mode." : "Exact dry-run execution prepared. No provider request was sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Final review action failed.");
    } finally {
      setBusyId("");
    }
  };
  return <>
    {message && <p role="status" className="mt-5 rounded-lg border border-white/10 bg-white/[.035] px-3 py-2 text-sm text-white/65">{message}</p>}
    <div className="mt-5 flex max-w-sm items-center gap-2"><label className="sr-only" htmlFor="final-reviewer">Reviewer</label><input id="final-reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Human reviewer name" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/45" /></div>
    <section className="mt-5 space-y-3">
      {manifests.length === 0 ? <div className="rounded-xl border border-dashed border-white/12 px-5 py-8 text-sm text-white/45">No final-review snapshot exists yet. Finalize Studio media, approve the caption, then prepare a client-scoped Publishing draft.</div> : manifests.map((manifest) => {
        const media = manifest.media_snapshot && typeof manifest.media_snapshot === "object" ? manifest.media_snapshot as Record<string, unknown> : {};
        const schedule = manifest.schedule_snapshot && typeof manifest.schedule_snapshot === "object" ? manifest.schedule_snapshot as Record<string, unknown> : {};
        const plan = manifest.plan_snapshot && typeof manifest.plan_snapshot === "object" ? manifest.plan_snapshot as Record<string, unknown> : {};
        const targets = Array.isArray(manifest.target_snapshot) ? manifest.target_snapshot : [];
        const status = text(manifest.review_status);
        const id = text(manifest.id);
        const lifecycle = publishingLifecycles.find((value) => value.manifestId === id);
        return <article key={id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] sm:grid sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="bg-black/25">{text(manifest.media_signed_url) ? <>
            {/* Signed private-storage URLs are intentionally not sent through an external image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={text(manifest.media_signed_url)} alt={text(media.fileName) || "Final media"} className="h-52 w-full object-cover sm:h-full" />
          </> : <div className="grid h-52 place-items-center text-xs text-white/30">Visual unavailable</div>}</div>
          <div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/42">Version {String(manifest.manifest_version)}</p><h2 className="mt-1 text-base font-semibold">{text(media.fileName) || "Final media"}</h2></div><span className="rounded-full border border-white/12 px-2.5 py-1 text-xs font-semibold capitalize text-white/70">{status.replace("_", " ")}</span></div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/78">{text(manifest.caption_snapshot)}</p>
            <div className="mt-4 grid gap-2 text-xs text-white/48 sm:grid-cols-2 lg:grid-cols-4"><p>Platforms: {targets.map((target) => typeof target === "object" && target ? text((target as Record<string, unknown>).platform) : "").filter(Boolean).join(", ") || "Not selected"}</p><p>Schedule: {text(schedule.date) && text(schedule.time) ? `${text(schedule.date)} · ${text(schedule.time)}` : "Not scheduled"}</p><p>Plan: {text(plan.subject) || text(plan.creativeConcept) || "Lineage provenance"}</p><p>{manifest.approved_at ? `Approved by ${text(manifest.approved_by) || "reviewer"}` : text(manifest.stale_reason) || "Awaiting human review"}</p></div>
            {status === "approved" && <div className="mt-5 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.035] p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100/75">Publishing lineage</p><div className="mt-2 space-y-2">{(lifecycle?.targets ?? []).map((target) => { const key = `${id}:prepare:${target.manifestTargetId}`; return <div key={target.manifestTargetId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/62"><p><span className="font-medium text-white/82">{target.platform}</span>{target.accountLabel ? ` · ${target.accountLabel}` : ""} · {target.authorization ? `${target.authorization.mode.replace("_", " ")} ${target.authorization.state}` : "not prepared"}{target.execution ? ` · execution ${target.execution.status}` : ""}{target.publication.observationState === "linked" ? ` · ${target.publication.observationCount} observation${target.publication.observationCount === 1 ? "" : "s"} linked` : target.publication.observationState === "unobserved" ? " · published, no cached observation yet" : ""}</p>{!target.authorization && <button type="button" disabled={busyId === key} onClick={() => void run(manifest, "prepare", target.manifestTargetId)} className="rounded border border-emerald-300/30 px-2.5 py-1.5 font-semibold text-emerald-100 disabled:opacity-40">{busyId === key ? "Preparing…" : "Prepare dry-run"}</button>}</div>; })}{!lifecycle?.targets.length && <p className="text-xs text-white/45">No immutable platform target was captured in this manifest.</p>}</div><p className="mt-2 text-[11px] text-white/42">Dry-run preparation records the exact payload and idempotency boundary only. It does not call a provider.</p></div>}
            <div className="mt-5 flex flex-wrap gap-2">{status === "ready" && <button type="button" disabled={!reviewer.trim() || busyId === `${id}:approve:`} onClick={() => void run(manifest, "approve")} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#052010] disabled:opacity-40">{busyId === `${id}:approve:` ? "Approving…" : "Approve final review"}</button>}{status === "approved" && <button type="button" disabled={busyId === `${id}:handoff:`} onClick={() => void run(manifest, "handoff")} className="rounded-lg border border-emerald-300/30 bg-emerald-300/[.08] px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-40">{busyId === `${id}:handoff:` ? "Linking…" : "Link to Publishing (dry run)"}</button>}</div>
          </div>
        </article>;
      })}
    </section>
  </>;
}

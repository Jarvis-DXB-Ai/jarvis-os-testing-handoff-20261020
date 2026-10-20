"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import styles from "./roadmap-workspace.module.css";
import {
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  IDEA_VALUES,
  ROADMAP_PRIORITIES,
  capabilityStatus,
  ideaCategoryLabel,
  ideaStatusLabel,
  ideaValueLabel,
  statusLabel,
  type RoadmapCapability,
  type RoadmapIdea,
  type RoadmapItem,
  type RoadmapSnapshot,
  type RoadmapStatus,
} from "@/lib/roadmap";

type View = "roadmap" | "ideas";
type ComposerKind = "capability" | "implementation";
const roadmapStatusClass: Record<RoadmapStatus, string> = {
  not_started: styles.neutral, planned: styles.planned, in_progress: styles.progress,
  blocked: styles.critical, needs_review: styles.progress, completed: styles.done,
  deferred: styles.neutral, idea: styles.neutral,
};
const ideaStatusClass: Record<RoadmapIdea["status"], string> = {
  idea: styles.neutral, researching: styles.progress, shortlisted: styles.planned,
  promoted_to_roadmap: styles.done, parked: styles.neutral, rejected: styles.critical,
};
const EditorContext = createContext<{ error: string | null; saving: boolean }>({ error: null, saving: false });

function requestJson(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  });
}

export default function RoadmapWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: RoadmapSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<View>("roadmap");
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    initialSnapshot.releases.find(
      (release) => release.phase.release_status === "active",
    )?.phase.id ??
      initialSnapshot.releases[0]?.phase.id ??
      "",
  );
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<RoadmapIdea | null>(null);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [quickCapture, setQuickCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRelease =
    snapshot.releases.find(
      (release) => release.phase.id === selectedReleaseId,
    ) ?? snapshot.releases[0];
  const ideasByPhase = new Map(
    snapshot.ideas
      .filter((idea) => idea.status !== "rejected")
      .map((idea) => [idea.potential_phase_id, 0]),
  );
  snapshot.ideas
    .filter((idea) => idea.status !== "rejected")
    .forEach((idea) =>
      ideasByPhase.set(
        idea.potential_phase_id,
        (ideasByPhase.get(idea.potential_phase_id) ?? 0) + 1,
      ),
    );

  function refresh(next: RoadmapSnapshot) {
    setSnapshot(next);
    setSelectedItem((current) =>
      current
        ? (next.items.find((item) => item.id === current.id) ?? null)
        : null,
    );
    setSelectedIdea((current) =>
      current
        ? (next.ideas.find((idea) => idea.id === current.id) ?? null)
        : null,
    );
  }
  async function updateItem(item: RoadmapItem, patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson(`/api/roadmap/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedUpdatedAt: item.updated_at, patch }),
      });
      refresh(data.snapshot);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save Roadmap item.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createItem(input: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson("/api/roadmap", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          projectId: snapshot.project.id,
          ...input,
        }),
      });
      refresh(data.snapshot);
      setComposer(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create Roadmap item.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveIdea(
    idea: Record<string, unknown>,
    existing?: RoadmapIdea,
  ) {
    setSaving(true);
    setError(null);
    try {
      const data = existing
        ? await requestJson(`/api/roadmap/ideas/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              expectedUpdatedAt: existing.updated_at,
              idea,
            }),
          })
        : await requestJson("/api/roadmap/ideas", {
            method: "POST",
            body: JSON.stringify({ projectId: snapshot.project.id, idea }),
          });
      refresh(data.snapshot);
      setQuickCapture(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save Idea.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function promoteIdea(
    idea: RoadmapIdea,
    promotion: Record<string, unknown>,
  ) {
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson(`/api/roadmap/ideas/${idea.id}/promote`, {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt: idea.updated_at, promotion }),
      });
      refresh(data.snapshot);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to promote Idea.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorContext.Provider value={{ error, saving }}><main className={styles.page}>
      <div className={styles.canvas}>
        <header className={styles.header}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[.16em] text-[color:var(--j-recommend)]">
                {snapshot.project.name} · {snapshot.totalProgress}% of committed
                scope complete
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-[-.035em] sm:text-4xl">
                Roadmap
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--j-text-3)]">
                Plan the next release, track committed work and capture what comes next.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setView("ideas");
                  setQuickCapture(true);
                }}
                className="rounded-lg border border-[var(--j-hair-2)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--j-text-3)] hover:bg-[var(--j-neutral-wash)]"
              >
                Capture idea
              </button>
              <button
                onClick={() => setComposer("implementation")}
                className="rounded-lg border border-[var(--j-hair-2)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--j-text-3)] hover:bg-[var(--j-neutral-wash)]"
              >
                Add implementation
              </button>
              <button
                onClick={() => setComposer("capability")}
                className="rounded-lg bg-[var(--j-recommend)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--j-on-green)] hover:bg-[var(--j-done)]"
              >
                Add capability
              </button>
            </div>
          </div>
          <div className={styles.tabs} aria-label="Roadmap views">
            <Tab active={view === "roadmap"} onClick={() => setView("roadmap")}>
              Build
            </Tab>
            <Tab active={view === "ideas"} onClick={() => setView("ideas")}>
              Ideas{" "}
              <span className="ml-1 text-[color:var(--j-text-3)]">
                {
                  snapshot.ideas.filter(
                    (idea) =>
                      !["promoted_to_roadmap", "rejected"].includes(
                        idea.status,
                      ),
                  ).length
                }
              </span>
            </Tab>
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-[var(--j-critical-edge)] bg-[var(--j-critical-wash)] px-4 py-3 text-sm text-[color:var(--j-critical)]"
          >
            {error}
          </div>
        )}
        {view === "roadmap" ? (
          <RoadmapView
            snapshot={snapshot}
            selectedRelease={selectedRelease}
            selectedReleaseId={selectedReleaseId}
            ideasByPhase={ideasByPhase}
            onRelease={setSelectedReleaseId}
            onOpen={setSelectedItem}
          />
        ) : (
          <IdeasView
            snapshot={snapshot}
            onAdd={() => setQuickCapture(true)}
            onOpen={setSelectedIdea}
          />
        )}
      </div>
      {composer && (
        <RoadmapComposer
          kind={composer}
          snapshot={snapshot}
          initialReleaseId={selectedRelease?.phase.id ?? ""}
          saving={saving}
          onClose={() => setComposer(null)}
          onSubmit={createItem}
        />
      )}
      {quickCapture && (
        <QuickCapture
          saving={saving}
          onClose={() => setQuickCapture(false)}
          onSubmit={(idea) => saveIdea(idea)}
        />
      )}
      {selectedItem && (
        <RoadmapItemDrawer
          item={selectedItem}
          snapshot={snapshot}
          saving={saving}
          onClose={() => setSelectedItem(null)}
          onSave={updateItem}
        />
      )}
      {selectedIdea && (
        <IdeaDrawer
          idea={selectedIdea}
          snapshot={snapshot}
          saving={saving}
          onClose={() => setSelectedIdea(null)}
          onSave={saveIdea}
          onPromote={promoteIdea}
        />
      )}
    </main></EditorContext.Provider>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`${styles.tab} ${active ? styles.activeTab : ""}`}
    >
      {children}
    </button>
  );
}

function RoadmapView({
  snapshot,
  selectedRelease,
  selectedReleaseId,
  ideasByPhase,
  onRelease,
  onOpen,
}: {
  snapshot: RoadmapSnapshot;
  selectedRelease: RoadmapSnapshot["releases"][number] | undefined;
  selectedReleaseId: string;
  ideasByPhase: Map<string | null, number>;
  onRelease: (id: string) => void;
  onOpen: (item: RoadmapItem) => void;
}) {
  const mission = snapshot.currentMission;
  return (
    <>
      <section className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,.5fr)]">
        <div className={styles.mission}>
          <p className="text-[11px] font-medium uppercase tracking-[.16em] text-[color:var(--j-recommend)]">
            Current mission
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-medium tracking-[-.04em] sm:text-4xl">
            {mission?.item?.title ??
              mission?.capability.item.title ??
              "No current mission is recorded"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--j-text-3)]">
            {mission?.item?.description ??
              mission?.capability.item.description ??
              "Set a focus item through the existing Roadmap drawer when work is ready to be explicitly prioritised."}
          </p>
          {mission && (
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--j-hair-2)] pt-4 text-xs text-[color:var(--j-text-3)]">
              <span>{mission.release.name}</span>
              <span>{mission.capability.item.title}</span>
              <span className="text-[color:var(--j-recommend)]">
                {mission.item
                  ? statusLabel(mission.item.status)
                  : statusLabel(mission.capability.status)}
              </span>
            </div>
          )}
        </div>
        <aside className={styles.nextMission}>
          <p className="text-[11px] font-medium uppercase tracking-[.15em] text-[color:var(--j-text-3)]">
            Next ready work
          </p>
          <h2 className="mt-3 text-xl font-medium tracking-tight">
            {snapshot.nextMissionDetail?.item?.title ??
              snapshot.nextMission?.title ??
              "No next mission is recorded"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--j-text-3)]">
            {snapshot.nextMissionDetail?.item?.description ??
              snapshot.nextMission?.description ??
              "Resolve a recorded blocker or add committed scope through the existing roadmap controls."}
          </p>
        </aside>
      </section>
      <section
        aria-label="Release progression"
        className="mt-8 overflow-x-auto pb-2"
      >
        <div className="flex min-w-max items-stretch gap-0 px-1">
          {snapshot.releases.map((release, index) => {
            const selected = selectedReleaseId === release.phase.id;
            const active = release.phase.release_status === "active";
            return (
              <div className="flex items-center" key={release.phase.id}>
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="h-px w-8 bg-[var(--j-neutral-wash)] lg:w-12"
                  />
                )}
                <button
                  onClick={() => onRelease(release.phase.id)}
                  aria-pressed={selected}
                  className={`${styles.release} ${selected ? styles.selectedRelease : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[.15em] text-[color:var(--j-recommend)]">
                        OS {index + 1}
                      </p>
                      <h2 className="mt-2 text-lg font-medium">
                        {release.phase.name.replace(/^OS \d+ - /, "")}
                      </h2>
                    </div>
                    {active && (
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--j-recommend)] " />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--j-text-3)]">
                    {release.phase.description}
                  </p>
                  <div className="mt-5 h-1 overflow-hidden rounded-full bg-[var(--j-neutral-wash)]">
                    <div
                      className="h-full bg-[var(--j-recommend)]"
                      style={{ width: `${release.progress}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[.12em] text-[color:var(--j-text-3)]">
                    <span>{release.phase.release_status}</span>
                    <span>{release.progress}%</span>
                  </div>
                  {ideasByPhase.get(release.phase.id) ? (
                    <p className="mt-3 text-xs text-[color:var(--j-text-3)]">
                      {ideasByPhase.get(release.phase.id)} uncommitted idea
                      {ideasByPhase.get(release.phase.id) === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      {selectedRelease && (
        <section className="mt-9">
          <div className="flex flex-col justify-between gap-4 border-b border-[var(--j-hair-2)] pb-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[.15em] text-[color:var(--j-recommend)]">
                Committed capability map
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-tight">
                {selectedRelease.phase.name}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--j-text-3)]">
                {selectedRelease.phase.goal}
              </p>
            </div>
            {selectedRelease.phase.completion_condition && (
              <p className="max-w-md rounded-xl border border-[var(--j-hair-2)] bg-[var(--j-neutral-wash)] px-4 py-3 text-xs leading-5 text-[color:var(--j-text-3)]">
                Complete when: {selectedRelease.phase.completion_condition}
              </p>
            )}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedRelease.capabilities.map((capability) => (
              <CapabilityCard
                key={capability.item.id}
                capability={capability}
                onOpen={() => onOpen(capability.item)}
              />
            ))}
          </div>
        </section>
      )}
      <section className="mt-9 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Panel title="Current blockers" eyebrow="Needs intervention">
          {snapshot.activeBlockers.length ? (
            snapshot.activeBlockers.map((item) => (
              <RoadmapLink
                key={item.id}
                item={item}
                snapshot={snapshot}
                onOpen={onOpen}
                tone="rose"
              />
            ))
          ) : (
            <Empty text="No active blockers are recorded." />
          )}
        </Panel>
        <Panel title="Completed milestones" eyebrow="Delivery history">
          {snapshot.completedMilestones.length ? (
            snapshot.completedMilestones
              .slice(0, 6)
              .map((item) => (
                <RoadmapLink
                  key={item.id}
                  item={item}
                  snapshot={snapshot}
                  onOpen={onOpen}
                  tone="emerald"
                />
              ))
          ) : (
            <Empty text="No completed milestones are recorded." />
          )}
        </Panel>
      </section>
    </>
  );
}
function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--j-hair-2)] bg-[var(--j-panel)] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[.15em] text-[color:var(--j-text-3)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-[color:var(--j-text-3)]">{text}</p>;
}
function CapabilityCard({
  capability,
  onOpen,
}: {
  capability: RoadmapCapability;
  onOpen: () => void;
}) {
  const status = capabilityStatus(
    capability.item,
    capability.implementationItems,
  );
  return (
    <button
      onClick={onOpen}
      className={styles.card}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-medium tracking-[-.015em]">
          {capability.item.title}
        </h3>
        <span
          className={`${styles.badge} ${roadmapStatusClass[status]}`}
        >
          {statusLabel(status)}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-[color:var(--j-text-3)]">
        {capability.item.description}
      </p>
      <div className="mt-5 flex justify-between text-xs text-[color:var(--j-text-3)]">
        <span>
          {capability.implementationItems.length} implementation item
          {capability.implementationItems.length === 1 ? "" : "s"}
        </span>
        <span>{capability.progress}% complete</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--j-neutral-wash)]">
        <div
          className="h-full bg-[var(--j-recommend)]"
          style={{ width: `${capability.progress}%` }}
        />
      </div>
    </button>
  );
}
function lastUpdated(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  return days === 0
    ? "Last updated today"
    : `Last updated ${days} day${days === 1 ? "" : "s"} ago`;
}
function RoadmapLink({
  item,
  snapshot,
  onOpen,
  tone,
}: {
  item: RoadmapItem;
  snapshot: RoadmapSnapshot;
  onOpen: (item: RoadmapItem) => void;
  tone: "rose" | "emerald";
}) {
  const itemById = new Map(
    snapshot.items.map((candidate) => [candidate.id, candidate]),
  );
  const waiting = snapshot.dependencies
    .map((dependency) =>
      dependency.depends_on_item_id === item.id
        ? itemById.get(dependency.item_id)
        : null,
    )
    .filter((candidate): candidate is RoadmapItem => Boolean(candidate));
  return (
    <button
      onClick={() => onOpen(item)}
      className="block w-full border-b border-[var(--j-hair-2)] py-4 text-left last:border-0"
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`text-sm font-medium ${tone === "rose" ? "text-[color:var(--j-critical)]" : "text-[color:var(--j-recommend)]"}`}
        >
          {item.title}
        </p>
        <span className="shrink-0 text-[11px] text-[color:var(--j-text-3)]">
          {lastUpdated(item.updated_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--j-text-3)]">
        {item.blocker_reason ?? item.description}
      </p>
      {tone === "rose" && waiting.length > 0 ? (
        <p className="mt-2 text-xs text-[color:var(--j-progress)]">
          {waiting.length} dependent item{waiting.length === 1 ? "" : "s"}{" "}
          waiting behind this
        </p>
      ) : null}
    </button>
  );
}

function IdeasView({
  snapshot,
  onAdd,
  onOpen,
}: {
  snapshot: RoadmapSnapshot;
  onAdd: () => void;
  onOpen: (idea: RoadmapIdea) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [value, setValue] = useState("all");
  const [phaseId, setPhaseId] = useState("all");
  const filtered = useMemo(
    () =>
      snapshot.ideas.filter((idea) => {
        const haystack = [
          idea.title,
          idea.description,
          idea.notes,
          idea.dependency_notes,
          idea.category,
          ...idea.toolLinks.map((link) => link.tool?.name),
          ...idea.agentLinks.map((link) => link.agent?.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (!search || haystack.includes(search.toLowerCase())) &&
          (status === "all" || idea.status === status) &&
          (value === "all" || idea.potential_value === value) &&
          (phaseId === "all" || idea.potential_phase_id === phaseId)
        );
      }),
    [snapshot.ideas, search, status, value, phaseId],
  );
  const potential = snapshot.ideas
    .filter(
      (idea) => !["promoted_to_roadmap", "rejected"].includes(idea.status),
    )
    .filter((idea) => idea.potential_value === "high").length;
  return (
    <>
      <section className="mt-7 flex flex-col justify-between gap-5 border-b border-[var(--j-hair-2)] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[.16em] text-[color:var(--j-recommend)]">
            Strategic backlog
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight">
            Idea Vault
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--j-text-3)]">
            Capture hypotheses without turning them into committed work.
            Promotion retains the original record and its provenance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[color:var(--j-text-3)]">
          <span className="rounded-full border border-[var(--j-hair-2)] px-3 py-2">
            {snapshot.ideas.length} captured
          </span>
          <span className="rounded-full border border-[var(--j-hair-2)] px-3 py-2">
            {
              snapshot.ideas.filter(
                (idea) => idea.status === "promoted_to_roadmap",
              ).length
            }{" "}
            promoted
          </span>
          <span className="rounded-full border border-[var(--j-hair-2)] px-3 py-2">
            {potential} high potential
          </span>
          <button
            onClick={onAdd}
            className="rounded-lg bg-[var(--j-recommend)] px-3.5 py-2 text-sm font-medium text-[color:var(--j-on-green)] hover:bg-[var(--j-done)]"
          >
            Capture idea
          </button>
        </div>
      </section>
      <section className={styles.filters} aria-label="Idea filters">
        <input
          aria-label="Search ideas"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ideas, dependencies, tools or agents"
          className="min-w-0 flex-1 rounded-lg border border-[var(--j-hair-2)] bg-[var(--j-raised)] px-3 py-2.5 text-sm outline-none focus:border-[var(--j-recommend-edge)]"
        />
        <Filter label="Idea status" value={status} onChange={setStatus}>
          <option value="all">All statuses</option>
          {IDEA_STATUSES.map((item) => (
            <option value={item} key={item}>
              {ideaStatusLabel(item)}
            </option>
          ))}
        </Filter>
        <Filter label="Potential value" value={value} onChange={setValue}>
          <option value="all">All value</option>
          {IDEA_VALUES.map((item) => (
            <option value={item} key={item}>
              {ideaValueLabel(item)}
            </option>
          ))}
        </Filter>
        <Filter label="Release" value={phaseId} onChange={setPhaseId}>
          <option value="all">All releases</option>
          {snapshot.releases.map((release) => (
            <option key={release.phase.id} value={release.phase.id}>
              {release.phase.name}
            </option>
          ))}
        </Filter>
      </section>
      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((idea) => (
          <IdeaCard
            idea={idea}
            snapshot={snapshot}
            onOpen={() => onOpen(idea)}
            key={idea.id}
          />
        ))}
        {!filtered.length && (
          <div className="rounded-2xl border border-dashed border-[var(--j-hair-2)] p-6 text-sm text-[color:var(--j-text-3)]">
            No Ideas match this view.
          </div>
        )}
      </section>
    </>
  );
}
function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-md border border-[var(--j-hair-2)] bg-[var(--j-raised)] px-3 py-2 text-sm text-[color:var(--j-text-3)]"
    >
      {children}
    </select>
  );
}
function IdeaCard({
  idea,
  snapshot,
  onOpen,
}: {
  idea: RoadmapIdea;
  snapshot: RoadmapSnapshot;
  onOpen: () => void;
}) {
  const phase = snapshot.phases.find(
    (item) => item.id === idea.potential_phase_id,
  );
  return (
    <button
      onClick={onOpen}
      className={styles.card}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[.12em] text-[color:var(--j-recommend)]">
            {ideaCategoryLabel(idea.category)}
          </p>
          <h3 className="mt-1 text-base font-medium">{idea.title}</h3>
        </div>
        <span
          className={`${styles.badge} ${ideaStatusClass[idea.status]}`}
        >
          {ideaStatusLabel(idea.status)}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[color:var(--j-text-3)]">
        {idea.description || "No description yet."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[.1em] text-[color:var(--j-text-3)]">
        <span>{phase?.name.replace(/^OS \d+ - /, "") ?? "Unassigned"}</span>
        <span>{ideaValueLabel(idea.potential_value)} value</span>
        <span>{ideaValueLabel(idea.complexity)} complexity</span>
      </div>
      {idea.promoted_roadmap_item_id && (
        <p className="mt-3 text-xs text-[color:var(--j-recommend)]">Linked to Roadmap</p>
      )}
    </button>
  );
}

function QuickCapture({
  saving,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: (idea: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal title="Capture Idea" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            title,
            description,
            category: "other",
            potential_value: "medium",
            complexity: "medium",
            status: "idea",
          });
        }}
      >
        <Field label="Title">
          <input
            autoFocus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClass} min-h-28`}
            placeholder="What could this enable?"
          />
        </Field>
        <Actions onCancel={onClose} submitLabel="Capture" saving={saving} />
      </form>
    </Modal>
  );
}

function RoadmapComposer({
  kind,
  snapshot,
  initialReleaseId,
  saving,
  onClose,
  onSubmit,
}: {
  kind: ComposerKind;
  snapshot: RoadmapSnapshot;
  initialReleaseId: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  const [phaseId, setPhaseId] = useState(
    initialReleaseId || snapshot.releases[0]?.phase.id || "",
  );
  const [parentItemId, setParentItemId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const capabilities =
    snapshot.releases.find((release) => release.phase.id === phaseId)
      ?.capabilities ?? [];
  return (
    <Modal
      title={
        kind === "capability" ? "Add capability" : "Add implementation item"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            phaseId,
            parentItemId: kind === "capability" ? null : parentItemId,
            title,
            description,
            priority,
            itemType: kind,
          });
        }}
      >
        <SelectField label="OS release" value={phaseId} onChange={setPhaseId}>
          {snapshot.releases.map((release) => (
            <option value={release.phase.id} key={release.phase.id}>
              {release.phase.name}
            </option>
          ))}
        </SelectField>
        {kind === "implementation" && (
          <SelectField
            label="Capability"
            value={parentItemId}
            onChange={setParentItemId}
          >
            <option value="">Select capability</option>
            {capabilities.map((capability) => (
              <option value={capability.item.id} key={capability.item.id}>
                {capability.item.title}
              </option>
            ))}
          </SelectField>
        )}
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClass} min-h-24`}
          />
        </Field>
        <SelectField label="Priority" value={priority} onChange={setPriority}>
          {ROADMAP_PRIORITIES.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <Actions onCancel={onClose} submitLabel="Create" saving={saving} />
      </form>
    </Modal>
  );
}

function RoadmapItemDrawer({
  item,
  snapshot,
  saving,
  onClose,
  onSave,
}: {
  item: RoadmapItem;
  snapshot: RoadmapSnapshot;
  saving: boolean;
  onClose: () => void;
  onSave: (item: RoadmapItem, patch: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(item);
  const isCapability = draft.item_type === "capability";
  const children = snapshot.items.filter(
    (candidate) => candidate.parent_item_id === item.id,
  );
  return (
    <Drawer
      title={draft.title}
      eyebrow={isCapability ? "Capability" : "Implementation item"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(item, {
            title: draft.title,
            description: draft.description,
            status: draft.status,
            priority: draft.priority,
            progress: draft.progress,
            is_focus: draft.is_focus,
            metadata: draft.metadata,
          });
        }}
      >
        <Field label="Title">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={draft.description || ""}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            className={`${inputClass} min-h-24`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {!isCapability && (
            <SelectField
              label="Status"
              value={draft.status}
              onChange={(value) =>
                setDraft({ ...draft, status: value as RoadmapStatus })
              }
            >
              {[
                "not_started",
                "planned",
                "in_progress",
                "blocked",
                "needs_review",
                "completed",
                "deferred",
              ].map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value as RoadmapStatus)}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label="Priority"
            value={draft.priority}
            onChange={(value) =>
              setDraft({ ...draft, priority: value as RoadmapItem["priority"] })
            }
          >
            {ROADMAP_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>
        {!isCapability && (
          <Field label={`Progress ${draft.progress}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={draft.progress}
              onChange={(event) =>
                setDraft({ ...draft, progress: Number(event.target.value) })
              }
              className="mt-2 w-full accent-[var(--j-recommend)]"
            />
          </Field>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm text-[color:var(--j-text-3)]">
          <input
            type="checkbox"
            checked={draft.is_focus}
            onChange={(event) =>
              setDraft({ ...draft, is_focus: event.target.checked })
            }
          />{" "}
          Current focus
        </label>
        {isCapability && (
          <section className="mt-6 border-t border-[var(--j-hair-2)] pt-5">
            <h3 className="text-sm font-medium">Implementation items</h3>
            <p className="mt-2 text-sm text-[color:var(--j-text-3)]">
              {children.length
                ? `${children.length} linked item${children.length === 1 ? "" : "s"}`
                : "No committed implementation items yet."}
            </p>
          </section>
        )}
        <Actions
          onCancel={onClose}
          submitLabel="Save changes"
          saving={saving}
        />
      </form>
    </Drawer>
  );
}

function IdeaDrawer({
  idea,
  snapshot,
  saving,
  onClose,
  onSave,
  onPromote,
}: {
  idea: RoadmapIdea;
  snapshot: RoadmapSnapshot;
  saving: boolean;
  onClose: () => void;
  onSave: (idea: Record<string, unknown>, existing: RoadmapIdea) => void;
  onPromote: (idea: RoadmapIdea, promotion: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(idea);
  const [showPromotion, setShowPromotion] = useState(false);
  const [phaseId, setPhaseId] = useState(
    idea.potential_phase_id ?? snapshot.releases[0]?.phase.id ?? "",
  );
  const [itemType, setItemType] = useState("capability");
  const [parentItemId, setParentItemId] = useState("");
  const capabilities =
    snapshot.releases.find((release) => release.phase.id === phaseId)
      ?.capabilities ?? [];
  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  const relatedCapabilityIds = draft.capabilityLinks.map(
    (link) => link.roadmap_item_id,
  );
  const relatedToolIds = draft.toolLinks.map((link) => link.tool_id);
  const relatedAgentIds = draft.agentLinks.map((link) => link.agent_id);
  const relatedSkillIds = draft.skillLinks.map((link) => link.agent_skill_id);
  const payload = (status = draft.status) => ({
    title: draft.title,
    description: draft.description ?? "",
    category: draft.category,
    potential_phase_id: draft.potential_phase_id ?? "",
    potential_value: draft.potential_value,
    complexity: draft.complexity,
    status,
    dependency_notes: draft.dependency_notes ?? "",
    notes: draft.notes ?? "",
    capabilityLinks: relatedCapabilityIds.map((roadmap_item_id) => ({
      roadmap_item_id,
      relationship_type: "candidate_for",
    })),
    toolLinks: relatedToolIds.map((tool_id) => ({
      tool_id,
      relationship_type: "candidate_for",
    })),
    agentLinks: relatedAgentIds.map((agent_id) => ({
      agent_id,
      relationship_type: "candidate_for",
    })),
    skillIds: relatedSkillIds,
  });
  const availableStatuses = IDEA_STATUSES.filter(
    (status) =>
      status !== "promoted_to_roadmap" ||
      Boolean(draft.promoted_roadmap_item_id),
  );
  return (
    <Drawer title={draft.title} eyebrow="Idea Vault" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(payload(), idea);
        }}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={`${styles.badge} ${ideaStatusClass[draft.status]}`}
          >
            {ideaStatusLabel(draft.status)}
          </span>
          {draft.promoted_roadmap_item_id && (
            <span className="rounded border border-[var(--j-recommend-edge)] bg-[var(--j-recommend-wash)] px-2 py-1 text-[11px] font-medium text-[color:var(--j-recommend)]">
              LINKED TO ROADMAP
            </span>
          )}
        </div>
        <Field label="Title">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={draft.description ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            className={`${inputClass} min-h-24`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Status"
            value={draft.status}
            onChange={(value) =>
              setDraft({ ...draft, status: value as RoadmapIdea["status"] })
            }
          >
            {availableStatuses.map((value) => (
              <option value={value} key={value}>
                {ideaStatusLabel(value)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Potential OS"
            value={draft.potential_phase_id ?? ""}
            onChange={(value) =>
              setDraft({ ...draft, potential_phase_id: value || null })
            }
          >
            <option value="">Unassigned</option>
            {snapshot.releases.map((release) => (
              <option value={release.phase.id} key={release.phase.id}>
                {release.phase.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Category"
            value={draft.category}
            onChange={(value) =>
              setDraft({ ...draft, category: value as RoadmapIdea["category"] })
            }
          >
            {IDEA_CATEGORIES.map((value) => (
              <option value={value} key={value}>
                {ideaCategoryLabel(value)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Potential value"
            value={draft.potential_value}
            onChange={(value) =>
              setDraft({
                ...draft,
                potential_value: value as RoadmapIdea["potential_value"],
              })
            }
          >
            {IDEA_VALUES.map((value) => (
              <option value={value} key={value}>
                {ideaValueLabel(value)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Complexity"
            value={draft.complexity}
            onChange={(value) =>
              setDraft({
                ...draft,
                complexity: value as RoadmapIdea["complexity"],
              })
            }
          >
            {IDEA_VALUES.map((value) => (
              <option value={value} key={value}>
                {ideaValueLabel(value)}
              </option>
            ))}
          </SelectField>
        </div>
        <Field label="Dependencies / considerations">
          <textarea
            value={draft.dependency_notes ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, dependency_notes: event.target.value })
            }
            className={`${inputClass} min-h-20`}
          />
        </Field>
        <Field label="Internal notes">
          <textarea
            value={draft.notes ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
            className={`${inputClass} min-h-20`}
          />
        </Field>
        <RelationshipList
          label="Related capabilities"
          options={snapshot.releases.flatMap((release) =>
            release.capabilities.map((capability) => ({
              id: capability.item.id,
              label: `${release.phase.name.replace(/^OS \d+ - /, "")} · ${capability.item.title}`,
            })),
          )}
          selected={relatedCapabilityIds}
          onToggle={(id) =>
            setDraft({
              ...draft,
              capabilityLinks: toggleId(relatedCapabilityIds, id).map(
                (roadmap_item_id) => ({
                  id: `local-${roadmap_item_id}`,
                  idea_id: draft.id,
                  roadmap_item_id,
                  relationship_type: "candidate_for",
                  capability: null,
                }),
              ),
            })
          }
        />
        <RelationshipList
          label="Related Tools"
          options={snapshot.ideaOptions.tools.map((tool) => ({
            id: tool.id,
            label: tool.name,
          }))}
          selected={relatedToolIds}
          onToggle={(id) =>
            setDraft({
              ...draft,
              toolLinks: toggleId(relatedToolIds, id).map((tool_id) => ({
                id: `local-${tool_id}`,
                idea_id: draft.id,
                tool_id,
                relationship_type: "candidate_for",
                tool: null,
              })),
            })
          }
        />
        <RelationshipList
          label="Related Agents"
          options={snapshot.ideaOptions.agents.map((agent) => ({
            id: agent.id,
            label: agent.name,
          }))}
          selected={relatedAgentIds}
          onToggle={(id) =>
            setDraft({
              ...draft,
              agentLinks: toggleId(relatedAgentIds, id).map((agent_id) => ({
                id: `local-${agent_id}`,
                idea_id: draft.id,
                agent_id,
                relationship_type: "candidate_for",
                agent: null,
              })),
            })
          }
        />
        <RelationshipList
          label="Related Skills"
          options={snapshot.ideaOptions.skills.map((skill) => ({
            id: skill.id,
            label: `${skill.name}${skill.agent_name ? ` · ${skill.agent_name}` : ""}`,
          }))}
          selected={relatedSkillIds}
          onToggle={(id) =>
            setDraft({
              ...draft,
              skillLinks: toggleId(relatedSkillIds, id).map(
                (agent_skill_id) => ({
                  id: `local-${agent_skill_id}`,
                  idea_id: draft.id,
                  agent_skill_id,
                  skill: null,
                }),
              ),
            })
          }
        />
        <p className="mt-5 text-xs text-[color:var(--j-text-3)]">
          Created {new Date(idea.created_at).toLocaleDateString()} · Updated{" "}
          {new Date(idea.updated_at).toLocaleDateString()}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(payload("parked"), idea)}
            className="rounded-md border border-[var(--j-progress-edge)] px-3 py-2 text-xs font-medium text-[color:var(--j-progress)] disabled:opacity-50"
          >
            Park
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(payload("rejected"), idea)}
            className="rounded-md border border-[var(--j-critical-edge)] px-3 py-2 text-xs font-medium text-[color:var(--j-critical)] disabled:opacity-50"
          >
            Reject
          </button>
        </div>
        <Actions onCancel={onClose} submitLabel="Save Idea" saving={saving} />
      </form>
      {idea.status !== "promoted_to_roadmap" && idea.status !== "rejected" && (
        <section className="mt-6 border-t border-[var(--j-hair-2)] pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Promote to Roadmap</h3>
              <p className="mt-1 text-xs text-[color:var(--j-text-3)]">
                The original Idea stays as provenance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPromotion(!showPromotion)}
              className="rounded-md border border-[var(--j-recommend-edge)] px-3 py-2 text-sm text-[color:var(--j-recommend)]"
            >
              {showPromotion ? "Cancel" : "Promote"}
            </button>
          </div>
          {showPromotion && (
            <div className="mt-4 rounded-lg border border-[var(--j-recommend-edge)] bg-[var(--j-recommend-wash)] p-3">
              <SelectField
                label="Target OS"
                value={phaseId}
                onChange={setPhaseId}
              >
                {snapshot.releases.map((release) => (
                  <option key={release.phase.id} value={release.phase.id}>
                    {release.phase.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Create"
                value={itemType}
                onChange={setItemType}
              >
                <option value="capability">Capability</option>
                <option value="implementation">Implementation item</option>
              </SelectField>
              {itemType === "implementation" && (
                <SelectField
                  label="Parent capability"
                  value={parentItemId}
                  onChange={setParentItemId}
                >
                  <option value="">Select capability</option>
                  {capabilities.map((capability) => (
                    <option key={capability.item.id} value={capability.item.id}>
                      {capability.item.title}
                    </option>
                  ))}
                </SelectField>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onPromote(idea, {
                    phase_id: phaseId,
                    item_type: itemType,
                    parent_item_id: parentItemId,
                    priority: "medium",
                    title: draft.title,
                    description: draft.description ?? "",
                  })
                }
                className="mt-4 rounded-md bg-[var(--j-recommend)] px-3 py-2 text-sm font-medium text-[color:var(--j-on-green)] disabled:opacity-50"
              >
                {saving ? "Promoting..." : "Confirm promotion"}
              </button>
            </div>
          )}
        </section>
      )}
    </Drawer>
  );
}

function RelationshipList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOptions = options.filter((option) =>
    selected.includes(option.id),
  );
  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-[color:var(--j-text-3)] hover:text-white"
      >
        {label} {selectedOptions.length ? `(${selectedOptions.length})` : ""}
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
        {selectedOptions.map((option) => (
          <span
            className="rounded border border-[var(--j-hair-2)] px-2 py-1 text-[11px] text-[color:var(--j-text-3)]"
            key={option.id}
          >
            {option.label}
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-[var(--j-hair-2)] p-2">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-[color:var(--j-text-3)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={() => onToggle(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
const inputClass = styles.input;
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block text-xs text-[color:var(--j-text-3)]">
      {label}
      {children}
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block text-xs text-[color:var(--j-text-3)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} text-white`}
      >
        {children}
      </select>
    </label>
  );
}
function Actions({
  onCancel,
  submitLabel,
  saving,
}: {
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-[var(--j-hair-2)] pt-5">
      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className="rounded-md px-3 py-2 text-sm text-[color:var(--j-text-3)] hover:bg-[var(--j-neutral-wash)]"
      >
        Cancel
      </button>
      <button
        disabled={saving}
        className="rounded-md bg-[var(--j-recommend)] px-3 py-2 text-sm font-medium text-[color:var(--j-on-green)] disabled:opacity-50"
      >
        {saving ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}
function EditorSurface({ title, eyebrow, drawer = false, onClose, children }: {
  title: string; eyebrow?: string; drawer?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { error, saving } = useContext(EditorContext);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const fields = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(el => el.getClientRects().length);
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", trap);
    dialog?.showModal();
    return () => { dialog?.removeEventListener("keydown", trap); dialog?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={styles.overlay} aria-label={title}
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
    onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className={drawer ? styles.drawer : styles.modal}>
      <header className={styles.editorHeader}>
        <div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div>
        <button type="button" disabled={saving} onClick={onClose} className={styles.closeButton} aria-label="Close">×</button>
      </header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {children}
    </div>
  </dialog>;
}
function Modal({title, onClose, children}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <EditorSurface title={title} onClose={onClose}>{children}</EditorSurface>;
}
function Drawer({title, eyebrow, onClose, children}: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <EditorSurface drawer title={title} eyebrow={eyebrow} onClose={onClose}>{children}</EditorSurface>;
}

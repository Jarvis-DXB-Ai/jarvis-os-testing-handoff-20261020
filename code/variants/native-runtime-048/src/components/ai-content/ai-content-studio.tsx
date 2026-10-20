"use client";
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-unused-vars -- Studio media uses signed URLs; retained action state stays ready for the existing server-authorized flows. */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ManualPromptExport } from "./manual-prompt-export";
import styles from "./studio-design.module.css";

type RefRole =
  | "composition_inspiration"
  | "food_truth"
  | "drink_truth"
  | "venue_truth"
  | "person_identity_truth"
  | "product_truth"
  | "wardrobe_styling"
  | "lighting_mood"
  | "pose_action"
  | "other_truth"
  | "general_reference";
type Reference = {
  id: string;
  display_name: string;
  role: RefRole;
  reference_order: number;
  source_type?: string;
  source_metadata: Record<string, unknown>;
  thumbnail_url?: string | null;
};
type Session = {
  id: string;
  title: string;
  creative_request: string;
  aspect_ratio: string;
  updated_at: string;
};
type Generation = {
  id: string;
  version: number;
  status: string;
  aspect_ratio: string;
  output_resolution?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  failure_reason?: string | null;
  prompt_text: string;
  final_content?: { id: string } | null;
};
type PromptVersion = {
  id: string;
  provider_prompt: string;
  status: string;
  execution_mode: string;
  prompt_version: string;
  execution?: { failure_diagnostic?: string };
};
type Detail = {
  session: Session;
  references: Reference[];
  generations: Generation[];
  prompts: PromptVersion[];
  max_references: number;
  mode: "live" | "fixture" | "unavailable";
  generation_available: boolean;
};
type InitialStudioData = { sessions: Session[]; detail: Detail | null };
type PickerAsset = {
  id: string;
  title: string;
  category: string;
  thumbnail_url: string | null;
  generation_ready: boolean;
  readiness_reason?: string | null;
  metadata_warning?: string | null;
};
type Picker = "food" | "drinks" | "venue" | null;
type LineageTarget = {
  id: string;
  label: string;
  cycleKey: string;
  hasMedia: boolean;
  hasPublishingDraft: boolean;
};

const RATIOS = ["1:1", "4:5", "3:2", "2:3", "16:9", "9:16"];
const label = (role: RefRole) =>
  role === "composition_inspiration"
    ? "Inspiration"
    : role === "food_truth"
      ? "Food"
      : role === "drink_truth"
        ? "Drink"
        : role === "venue_truth"
          ? "Venue"
          : "Reference";
const tone = (role: RefRole) => role.endsWith("_truth") ? "border-emerald-300/35 text-emerald-100" : "border-white/[.16] text-white/60";
const monthInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const titleFor = (generation: Generation) =>
  generation.prompt_text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((word) => word.length > 2)
    .slice(0, 5)
    .join(" ") || `AI Content Version ${generation.version}`;
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(new Date(value));
async function api<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || "Unable to complete this request.");
  return payload as T;
}

function ReferenceCard({
  reference,
  index,
  onRemove,
  onStart,
  onDrop,
  onInspect,
}: {
  reference: Reference;
  index: number;
  onRemove: () => void;
  onStart: () => void;
  onDrop: () => void;
  onInspect: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const metadata = Object.keys(reference.source_metadata).length > 0;
  return (
    <div
      draggable
      onDragStart={onStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="group relative w-16 flex-none cursor-grab active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={onInspect}
        className={`relative block w-full overflow-hidden rounded-[11px] border bg-[#161719] text-left ${tone(reference.role)}`}
      >
        <span className="block aspect-[4/5] bg-white/[.035]">
          {reference.thumbnail_url && !previewFailed ? (
            <img
              src={reference.thumbnail_url}
              onError={() => setPreviewFailed(true)}
              alt=""
              loading="lazy" decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full place-items-center text-[9px] text-white/30">
              No preview
            </span>
          )}
        </span>
        <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-white">
          {label(reference.role)}
        </span>
        <span className="absolute left-1 top-1 rounded bg-black/75 px-1 py-0.5 text-[8px] text-white/70">
          {index + 1}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove Image ${index + 1}`}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-black group-hover:block"
      >
        ×
      </button>
      <p
        className={`mt-1 truncate text-center text-[9px] ${metadata ? "text-white/48" : "text-amber-100/65"}`}
      >
        {metadata ? label(reference.role) : "Metadata limited"}
      </p>
    </div>
  );
}
function GenerationCard({
  generation,
  base,
  prompt,
  onCorrect,
  onFinalize,
  onAttach,
  onPreview,
  onRetry,
  onPrompt,
}: {
  generation: Generation;
  base: string;
  prompt: PromptVersion | null;
  onCorrect: () => void;
  onFinalize: () => void;
  onAttach: () => void;
  onPreview: () => void;
  onRetry: () => void;
  onPrompt: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const incomplete = !generation.image_url;
  const state =
    generation.status === "generated"
      ? "Generated"
      : generation.status === "generating"
        ? "Generating"
        : generation.status === "failed"
          ? "Failed"
          : "Prepared package";
  return (
    <article
      id={`generation-${generation.id}`}
      className={`${styles.generation} group relative mb-4 break-inside-avoid overflow-hidden rounded-[18px] border border-white/[.08] bg-[#141416]`}
      data-status={generation.status}
    >
      {generation.thumbnail_url && !previewFailed ? (
        <button
          type="button"
          onClick={onPreview}
          className="block w-full bg-black"
        >
          <img
            src={generation.thumbnail_url}
            onError={() => setPreviewFailed(true)}
            alt={`Generated version ${generation.version}`}
            loading="lazy" decoding="async"
            className="block h-auto w-full"
          />
        </button>
      ) : (
        <div className="relative flex aspect-[4/5] min-h-56 flex-col justify-between overflow-hidden bg-[radial-gradient(115%_100%_at_10%_0%,rgba(74,222,128,.16),transparent_48%),linear-gradient(145deg,#1b1c1f,#0d0d0f)] p-4">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(45deg,transparent_48%,rgba(255,255,255,.06)_49%,rgba(255,255,255,.06)_51%,transparent_52%)] [background-size:18px_18px]" />
          <div className="relative flex items-start justify-between">
            <span
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${generation.status === "failed" ? "border-red-300/25 bg-red-400/10 text-red-100" : "border-emerald-300/20 bg-emerald-300/[.08] text-emerald-100"}`}
            >
              {state}
            </span>
            <span className="font-mono text-[10px] text-white/35">
              V{generation.version}
            </span>
          </div>
          <div className="relative">
            <p className="text-sm font-semibold text-white/85">
              {generation.status === "failed"
                ? "Generation did not complete"
                : generation.image_url ? "Preview unavailable" : "No rendered image retained"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/42">
              {generation.status === "failed"
                ? generation.failure_reason ||
                  "The retained execution did not return an image."
                : "This is a recorded Studio package, not a substitute image."}
            </p>
            <p className="mt-4 text-[10px] uppercase tracking-[.13em] text-white/35">
              {generation.output_resolution || "4K"} · {generation.aspect_ratio}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/[.07] px-3 py-2.5">
        <span className="font-mono text-[10px] text-white/42">
          V{generation.version}
        </span>
        {!incomplete && (
          <a
            href={`${base}/generations/${generation.id}/download`}
            className="text-xs text-white/56 hover:text-white"
          >
            Download
          </a>
        )}
        <button
          type="button"
          onClick={onCorrect}
          disabled={generation.status !== "generated"}
          className="text-xs text-emerald-100/85 hover:text-emerald-50 disabled:cursor-not-allowed disabled:text-white/22"
        >
          Correct
        </button>
        <button type="button" onClick={onPrompt} className="min-h-9 text-xs text-white/60">Prompt</button>
        {generation.image_url && (!generation.thumbnail_url || previewFailed) ? <button type="button" onClick={onPreview} className="min-h-9 text-xs text-white/60">View original</button> : null}
        {generation.status === "failed" && prompt && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-amber-100/90"
          >
            Retry
          </button>
        )}
        {generation.status === "generated" && !generation.final_content && (
          <button
            type="button"
            onClick={onFinalize}
            className="ml-auto text-xs font-semibold text-white/78 hover:text-white"
          >
            Save as final
          </button>
        )}
        {generation.final_content && (
          <>
            <button type="button" onClick={onAttach} className="ml-auto text-xs font-semibold text-emerald-100 hover:text-emerald-50">Attach to content item</button>
            <span className="text-xs font-semibold text-white/42">Finalized</span>
          </>
        )}
      </div>
    </article>
  );
}

export const AI_CONTENT_GENERATION_LIFECYCLE_FIXTURE = {
  pending: { status: "generating", aspectRatio: "4:5" },
  completed: { status: "generated", aspectRatio: "4:5", hasImage: true },
  expected: { placeholder: true, composerCompacts: true, imageVisible: true },
} as const;

export default function AiContentStudio({
  clientId,
  initial,
}: {
  clientId: string;
  initial: InitialStudioData;
}) {
  const [sessions, setSessions] = useState<Session[]>(initial.sessions);
  const [detail, setDetail] = useState<Detail | null>(initial.detail);
  const [assets, setAssets] = useState<PickerAsset[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [studioView,setStudioView]=useState<"create"|"results">("results");
  const [correction, setCorrection] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [finalizing, setFinalizing] = useState<Generation | null>(null);
  const [attaching, setAttaching] = useState<Generation | null>(null);
  const [lineageTargets, setLineageTargets] = useState<LineageTarget[]>([]);
  const [selectedLineageId, setSelectedLineageId] = useState("");
  const [promptInspecting, setPromptInspecting] = useState<Generation | null>(null);
  const [correctionVersion, setCorrectionVersion] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<Generation | null>(null);
  const [inspecting, setInspecting] = useState<Reference | null>(null);
  const [finalTitle, setFinalTitle] = useState("");
  const [finalMonth, setFinalMonth] = useState(monthInput);
  const [uploadState, setUploadState] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (previewing) previewRef.current?.showModal(); }, [previewing]);
  const promptDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (promptInspecting) promptDialogRef.current?.showModal(); }, [promptInspecting]);
  const pickerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (picker) pickerRef.current?.showModal(); else pickerRef.current?.close(); }, [picker]);
  const inspectRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const height = `${node.getBoundingClientRect().height}px`;
      rootRef.current?.style.setProperty("--studio-composer-height", height);
      document.documentElement.style.setProperty("--active-studio-composer-height", height);
    });
    observer.observe(node);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--active-studio-composer-height"); };
  }, [detail?.session.id]);
  useEffect(() => {
    if (inspecting) inspectRef.current?.showModal();
  }, [inspecting]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(0);
  const creatingPromptRef = useRef(false);
  const base = `/api/clients/${clientId}/ai-content`;
  const refresh = useCallback(
    async (id: string) => {
      const next = await api<Detail>(`${base}/${id}`);
      setDetail(next);
      setSessions((current) => [
        next.session,
        ...current.filter((item) => item.id !== next.session.id),
      ]);
      return next;
    },
    [base],
  );
  const selectSession = async (sessionId: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await refresh(sessionId);
      setCorrection(""); setCorrectionOpen(false); setCorrectionVersion(null); setShowPrompt(false); setExpanded(true);
      const url = new URL(window.location.href); url.searchParams.set("session", sessionId);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open session."); }
    finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true);
    try {
      const next = await api<Detail>(base, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDetail(next);
      setSessions((current) => [next.session, ...current]);
      setExpanded(true);
      setShowPrompt(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create an image workspace.",
      );
    } finally {
      setBusy(false);
    }
  };
  const update = async (patch: Record<string, unknown>) => {
    if (!detail) return;
    try {
      setDetail(
        await api<Detail>(`${base}/${detail.session.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the Studio state.",
      );
    }
  };
  const openPicker = async (next: Exclude<Picker, null>) => {
    setError("");
    try {
      if (!assets.length)
        setAssets(
          (await api<{ assets: PickerAsset[] }>(`${base}/picker`)).assets,
        );
      setPicker(next);
      setSearch("");
      setPicked([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load Client Brain references.",
      );
    }
  };
  const addSelected = async () => {
    if (!detail || !picker || !picked.length) return;
    const role: RefRole =
      picker === "food"
        ? "food_truth"
        : picker === "drinks"
          ? "drink_truth"
          : "venue_truth";
    setBusy(true);
    try {
      let next = detail;
      for (const id of picked)
        next = await api<Detail>(`${base}/${detail.session.id}/references`, {
          method: "POST",
          body: JSON.stringify({
            source_type: "client_brain_asset",
            source_id: id,
            role,
          }),
        });
      setDetail(next);
      setPicker(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add selected references.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!detail) return;
    try {
      setDetail(
        await api<Detail>(`${base}/${detail.session.id}/references/${id}`, {
          method: "DELETE",
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove this reference.",
      );
    }
  };
  const moveReference = async (reference: Reference, order: number) => {
    if (!detail || busy) return;
    setBusy(true);
    try { setDetail(await api<Detail>(`${base}/${detail.session.id}/references/${reference.id}`, { method: "PATCH", body: JSON.stringify({ reference_order: order }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reorder references."); }
    finally { setBusy(false); }
  };
  const reorder = async (target: Reference) => {
    if (!detail || !dragged || dragged === target.id) return;
    const order =
      detail.references.findIndex((reference) => reference.id === target.id) +
      1;
    setDragged(null);
    try {
      setDetail(
        await api<Detail>(
          `${base}/${detail.session.id}/references/${dragged}`,
          { method: "PATCH", body: JSON.stringify({ reference_order: order }) },
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save reference order.",
      );
    }
  };
  const upload = async (files: File[]) => {
    if (!detail || !files.length) return;
    const allowed = files.slice(
      0,
      Math.max(0, detail.max_references - detail.references.length),
    );
    setBusy(true);
    try {
      let next = detail;
      for (const [index, file] of allowed.entries()) {
        setUploadState(`Uploading ${index + 1} / ${allowed.length}`);
        const form = new FormData();
        form.set("file", file);
        next = await api<Detail>(`${base}/${detail.session.id}/references`, {
          method: "POST",
          body: form,
        });
      }
      setDetail(next);
      setUploadState("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to upload inspiration.",
      );
    } finally {
      setBusy(false);
    }
  };
  const createPrompt = async () => {
    if (!detail || creatingPromptRef.current) return;
    creatingPromptRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<Detail>(`${base}/${detail.session.id}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          correction: correction || undefined,
        }),
      });
      setDetail(next);
      setCorrection("");
      setCorrectionOpen(false);
      setShowPrompt(false);
      setExpanded(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create the Creative Director prompt.",
      );
      await refresh(detail.session.id).catch(() => undefined);
    } finally {
      creatingPromptRef.current = false;
      setBusy(false);
    }
  };
  const savePrompt = async (prompt: PromptVersion, text: string) => {
    if (!detail || text === prompt.provider_prompt) return;
    try {
      setDetail(
        await api<Detail>(`${base}/${detail.session.id}/prompt/${prompt.id}`, {
          method: "PATCH",
          body: JSON.stringify({ providerPrompt: text }),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save the prompt.",
      );
    }
  };
  const generate = async (promptId: string) => {
    if (!detail) return;
    setBusy(true);
    setError("");
    pendingRef.current += 1;
    const pending: Generation = {
      id: `pending-${pendingRef.current}`,
      version: (detail.generations[0]?.version ?? 0) + 1,
      status: "generating",
      aspect_ratio: detail.session.aspect_ratio,
      output_resolution: "4K",
      prompt_text: detail.prompts[0]?.provider_prompt ?? "",
    };
    setDetail({ ...detail, generations: [pending, ...detail.generations] });
    try {
      const next = await api<Detail>(`${base}/${detail.session.id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          promptVersionId: promptId,
          requestId: crypto.randomUUID(),
        }),
      });
      setDetail(next);
      setExpanded(false);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Generation failed.";
      setDetail((current) =>
        current
          ? {
              ...current,
              generations: current.generations.map((item) =>
                item.id === pending.id
                  ? { ...item, status: "failed", failure_reason: message }
                  : item,
              ),
            }
          : current,
      );
      setError(message);
    } finally {
      setBusy(false);
    }
  };
  const correct = async (generation: Generation) => {
    if (!detail || generation.status !== "generated") return;
    try {
      const attached = detail.references.some(
        (reference) =>
          reference.source_type === "generated_version" &&
          Number(reference.source_metadata.source_version) ===
            generation.version,
      );
      if (!attached)
        await api<Detail>(`${base}/${detail.session.id}/references`, {
          method: "POST",
          body: JSON.stringify({
            source_type: "generated_version",
            source_id: generation.id,
            role: "general_reference",
          }),
        });
      setDetail(await api<Detail>(`${base}/${detail.session.id}`, {
        method: "PATCH", body: JSON.stringify({ active_generation_id: generation.id }),
      }));
      setCorrection(
        `Keep what is working in Version ${generation.version}, but `,
      );
      setCorrectionVersion(generation.version);
      setCorrectionOpen(true);
      setExpanded(true);
      setShowPrompt(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to prepare this correction.",
      );
    }
  };
  const finalize = async () => {
    if (!detail || !finalizing) return;
    setBusy(true);
    try {
      await api(`${base}/generations/${finalizing.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          title: finalTitle,
          monthStart: `${finalMonth}-01`,
          contentType: "ai_photography",
        }),
      });
      await refresh(detail.session.id);
      setFinalizing(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save Final Content.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openAttach = async (generation: Generation) => {
    if (!generation.final_content) return;
    setBusy(true);
    try {
      const result = await api<{ targets: LineageTarget[] }>(`/api/clients/${clientId}/content-lineage`);
      setLineageTargets(result.targets);
      setSelectedLineageId(result.targets[0]?.id ?? "");
      setAttaching(generation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load content items.");
    } finally {
      setBusy(false);
    }
  };
  const attachToLineage = async () => {
    if (!attaching?.final_content || !selectedLineageId) return;
    setBusy(true);
    try {
      await api(`/api/clients/${clientId}/content-lineage`, {
        method: "POST",
        body: JSON.stringify({
          action: "attach_final_studio_asset",
          lineageItemId: selectedLineageId,
          finalContentItemId: attaching.final_content.id,
          replace: lineageTargets.find((target) => target.id === selectedLineageId)?.hasMedia === true,
        }),
      });
      if (detail) await refresh(detail.session.id);
      setAttaching(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to attach the final Studio asset.");
    } finally {
      setBusy(false);
    }
  };
  const prompt =
    detail?.prompts.find(
      (item) =>
        item.status === "ready" &&
        item.execution_mode === detail.mode &&
        (detail.mode !== "live" ||
          item.prompt_version ===
            "ai-content-creative-director-v2.5-multimodal"),
    ) ?? null;
  const failedPrompt =
    detail?.prompts.find((item) => item.status === "failed") ?? null;
  const compact = !expanded && !showPrompt;
  const categories =
    picker === "food"
      ? ["food"]
      : picker === "drinks"
        ? ["drinks"]
        : ["interiors", "exteriors", "venue_items"];
  const pickerAssets = assets.filter(
    (asset) =>
      categories.includes(asset.category) &&
      `${asset.title} ${asset.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section
      ref={rootRef}
      className={`${styles.root} studio-workspace min-h-[48vh] text-white`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          setDropActive(false);
          void upload(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <div className={detail ? styles.content : "pb-20"}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] text-xs font-semibold text-emerald-100">
              AI
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-100/70">
                Content Studio
              </p>
              <h2 className="mt-0.5 truncate text-lg font-semibold tracking-[-.03em] text-white">
                {detail?.session.title || "Generation workspace"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="text-white/42 hover:text-white"
            >
              Sessions
            </button>
            <Link
              href={`/clients/${clientId}/brain?section=content`}
              className="text-emerald-100/80 hover:text-emerald-50"
            >
              Content Library
            </Link>
          </div>
        </header>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-300/25 bg-red-400/[.08] px-4 py-3 text-sm text-red-100"
          >
            {error}
          </p>
        )}
        {!detail ? (
          <section className="grid min-h-[48vh] place-items-center">
            <div className="max-w-sm text-center">
              <p className="text-sm text-white/58">
                There is no active Studio session selected.
              </p>
              <p className="mt-2 text-xs leading-5 text-white/35">
                Start a new workspace only when you are ready to record a
                creative request and references.
              </p>
              <div className={styles.sessionList}>{sessions.map(session => <Link key={session.id} href={`/clients/${clientId}/ai-content/studio?session=${session.id}`} onNavigate={event => { event.preventDefault(); void selectSession(session.id); }}>{session.title}<small>{dateLabel(session.updated_at)}</small></Link>)}</div>
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy}
                className="mt-5 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#06210f] disabled:opacity-40"
              >
                Create Studio session
              </button>
            </div>
          </section>
        ) : (
          <>
            <nav aria-label="Studio sessions" className={styles.sessions}>{sessions.map(session => <Link key={session.id} aria-current={session.id === detail.session.id ? "page" : undefined} href={`/clients/${clientId}/ai-content/studio?session=${session.id}`} onNavigate={event => { event.preventDefault(); void selectSession(session.id); }}>{session.title}</Link>)}<button type="button" disabled={busy} onClick={() => setDetail(null)}>+ New</button></nav>
            <nav className={styles.viewTabs} aria-label="Studio view">{(["results","create"] as const).map(view=><button type="button" key={view} aria-pressed={studioView===view} onClick={()=>setStudioView(view)}>{view==="results"?"Images":"References & brief"}</button>)}</nav><div hidden={studioView!=="create"}><section className={styles.brief}><span>Creative brief</span><h3>Creative request</h3><p>{detail.session.creative_request || "No creative request recorded yet."}</p><button type="button" onClick={() => { setExpanded(true); requestAnimationFrame(() => composerRef.current?.querySelector('textarea')?.focus()); }}>Edit brief</button></section>
            <section className={styles.lanes} aria-label="Reference firewall">
              {(["truth", "direction"] as const).map(kind => <details key={kind} className={styles.lane} data-kind={kind}><summary>{kind === "truth" ? "Client references" : "Style references"}<span>{detail.references.filter(ref => ref.role.endsWith("_truth") === (kind === "truth")).length}</span></summary><p>{kind === "truth" ? "Client assets only — these fix identity." : "Framing and mood only — never identity."}</p><div className={styles.laneList}>{detail.references.filter(ref => ref.role.endsWith("_truth") === (kind === "truth")).map(reference => { const index = detail.references.findIndex(ref => ref.id === reference.id); return <div key={reference.id}><ReferenceCard reference={reference} index={index} onInspect={() => setInspecting(reference)} onRemove={() => void remove(reference.id)} onStart={() => setDragged(reference.id)} onDrop={() => void reorder(reference)} /><div className={styles.order}><button type="button" aria-label={`Move reference ${index + 1} earlier`} disabled={busy || index === 0} onClick={() => void moveReference(reference, index)}>←</button><button type="button" aria-label={`Move reference ${index + 1} later`} disabled={busy || index === detail.references.length - 1} onClick={() => void moveReference(reference, index + 2)}>→</button></div></div>; })}</div>{!detail.references.some(ref => ref.role.endsWith("_truth") === (kind === "truth")) ? <p>No {kind === "truth" ? "factual" : "direction"} references attached.</p> : null}</details>)}
            </section>
            <p className="mt-3 text-xs text-white/55">Reference numbers define prompt order across both lanes. Moving a reference changes that order.</p></div><div hidden={studioView!=="results"}>
            <section className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/36">
                  Generation history
                </p>
                <p className="mt-1 text-sm text-white/48">
                  Updated {dateLabel(detail.session.updated_at)} ·{" "}
                  {detail.generations.length} retained run
                  {detail.generations.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg border border-white/[.08] bg-white/[.03] px-2.5 py-1.5 text-xs text-white/55">
                  {detail.session.aspect_ratio}
                </span>
                <span className="rounded-lg border border-white/[.08] bg-white/[.03] px-2.5 py-1.5 text-xs text-white/55">
                  4K output
                </span>
                {detail.mode === "fixture" && (
                  <span className="rounded-lg border border-amber-300/20 bg-amber-300/[.08] px-2.5 py-1.5 text-xs text-amber-100">
                    Fixture records
                  </span>
                )}
              </div>
            </section>
            <section
              className={styles.versions}
              aria-label="Generation history"
            >
              {detail.generations.map((generation) => (
                <GenerationCard
                  key={generation.id}
                  generation={generation}
                  base={base}
                  prompt={prompt}
                  onCorrect={() => void correct(generation)}
                  onFinalize={() => {
                    setFinalizing(generation);
                    setFinalTitle(titleFor(generation));
                  }}
                  onAttach={() => void openAttach(generation)}
                  onPreview={() => setPreviewing(generation)}
                  onPrompt={() => setPromptInspecting(generation)}
                  onRetry={() => void generate(prompt!.id)}
                />
              ))}
            </section>
            {detail.generations.length === 0 && (
              <section className="mt-5 grid min-h-[34vh] place-items-center rounded-[20px] border border-dashed border-white/[.12] bg-white/[.018] p-8 text-center">
                <div>
                  <p className="text-sm text-white/58">
                    Your images will appear here.
                  </p>
                  <p className="mt-2 text-xs text-white/35">
                    Open the composer to describe an image and add your references.
                  </p>
                </div>
              </section>
            )}
            </div>
          </>
        )}
      </div>
      {detail && (
        <section
          ref={composerRef}
          aria-label="Studio composer"
          className={`${styles.composer} fixed bottom-3 left-1/2 z-30 w-[calc(100%-1rem)] -translate-x-1/2 rounded-[20px] border border-white/[.12] bg-[#111214]/[.98] shadow-[0_18px_55px_rgba(0,0,0,.42)] backdrop-blur-xl sm:bottom-5 sm:left-[calc(50%+128px)] sm:w-[min(980px,calc(100%-19rem))] ${compact ? "p-3" : "p-3 sm:p-4"}`}
        >
          <div className={styles.composerTop}><span>{detail.references.length} of {detail.max_references} references · {correctionOpen ? `Correction${correctionVersion ? ` · Applies to v${correctionVersion}` : ""}` : "Creative request"}</span><button type="button" onClick={() => { setExpanded(value => !value); setShowPrompt(false); }} aria-expanded={expanded}>{expanded ? "Minimise" : "Open composer"}</button></div>
          <div hidden={!expanded && !showPrompt}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) =>
              void upload(Array.from(event.target.files ?? []))
            }
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[.07] pt-2 text-[11px] text-white/46">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="hover:text-white"
            >
              Upload inspiration
            </button>
            <button
              type="button"
              onClick={() => void openPicker("food")}
              className="hover:text-white"
            >
              Link food
            </button>
            <button
              type="button"
              onClick={() => void openPicker("drinks")}
              className="hover:text-white"
            >
              Link drink
            </button>
            <button
              type="button"
              onClick={() => void openPicker("venue")}
              className="hover:text-white"
            >
              Link venue
            </button>
            {uploadState && (
              <span className="text-white/30">{uploadState}</span>
            )}
          </div>
          {showPrompt && prompt ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between gap-3">
                <span className="text-[11px] text-white/45">
                  Production prompt
                </span>
                <button
                  type="button"
                  onClick={() => setShowPrompt(false)}
                  className="text-[11px] text-white/45 hover:text-white"
                >
                  Close
                </button>
              </div>
              <textarea
                key={prompt.id}
                defaultValue={prompt.provider_prompt}
                onBlur={(event) => void savePrompt(prompt, event.target.value)}
                className="h-40 w-full resize-y rounded-xl border border-emerald-300/15 bg-black/25 p-3 text-xs leading-5 text-white/80 outline-none focus:border-emerald-300/45"
              />
            </div>
          ) : compact ? (
            <input
              value={detail.session.creative_request}
              onChange={(event) =>
                setDetail({
                  ...detail,
                  session: {
                    ...detail.session,
                    creative_request: event.target.value,
                  },
                })
              }
              onBlur={() =>
                void update({
                  creative_request: detail.session.creative_request,
                })
              }
              placeholder="Describe a correction or new idea…"
              className="mt-3 w-full border-0 bg-transparent px-1 py-1 text-sm text-white/80 outline-none placeholder:text-white/25"
            />
          ) : (
            <>
              <textarea
                value={detail.session.creative_request}
                onChange={(event) =>
                  setDetail({
                    ...detail,
                    session: {
                      ...detail.session,
                      creative_request: event.target.value,
                    },
                  })
                }
                onBlur={() =>
                  void update({
                    creative_request: detail.session.creative_request,
                  })
                }
                placeholder="Describe what you want to create…"
                className="mt-3 min-h-24 w-full resize-none rounded-xl border border-white/[.08] bg-black/20 p-3 text-sm leading-6 text-white/90 outline-none placeholder:text-white/25 focus:border-emerald-300/40"
              />
              {correctionOpen && (
                <input
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                  placeholder="Describe the correction for this variation…"
                  className="mt-2 w-full rounded-lg border border-white/[.08] bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/45"
                />
              )}
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[.07] pt-3">
            <span className="rounded-lg bg-white/[.055] px-2.5 py-1.5 text-xs text-white/65">
              Nano Banana Pro
            </span>
            <span className="rounded-lg bg-white/[.055] px-2.5 py-1.5 text-xs text-white/65">
              4K
            </span>
            <select
              aria-label="Aspect ratio"
              value={detail.session.aspect_ratio}
              onChange={(event) =>
                void update({ aspect_ratio: event.target.value })
              }
              className="rounded-lg border-0 bg-white/[.055] px-2.5 py-1.5 text-xs text-white outline-none"
            >
              {RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
            <span className="rounded-lg bg-white/[.055] px-2.5 py-1.5 text-xs text-white/55">
              1 image
            </span>
            <span className="flex-1" />
            {prompt && !showPrompt && (
              <>
                <span className="text-xs text-emerald-100/75">
                  Prompt ready
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setShowPrompt(true);
                  }}
                  className="text-xs text-white/45 hover:text-white"
                >
                  Edit prompt
                </button>
              </>
            )}
            {failedPrompt && !prompt && (
              <span
                title={failedPrompt.execution?.failure_diagnostic}
                className="text-xs text-amber-100/75"
              >
                Prompt needs attention
              </span>
            )}
            {compact && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-xs text-white/45 hover:text-white"
              >
                Expand
              </button>
            )}
            <ManualPromptExport clientId={clientId} sessionId={detail.session.id}
              brief={detail.session.creative_request} correction={correction} aspectRatio={detail.session.aspect_ratio}
              referenceRevision={JSON.stringify(detail.references)} disabled={busy} promptId={prompt?.execution_mode === "live" ? prompt.id : undefined} />
            <button
              type="button"
              onClick={() =>
                prompt ? void generate(prompt.id) : void createPrompt()
              }
              disabled={
                busy ||
                !detail.session.creative_request.trim() ||
                !detail.generation_available
              }
              className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#03120c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "Creating prompt…"
                : prompt
                  ? "Generate image"
                  : failedPrompt
                    ? "Retry"
                    : correctionOpen
                      ? "Create variation prompt"
                      : "Create AI prompt"}
            </button>
          </div>
          {!detail.generation_available && (
            <p className="mt-2 text-[11px] text-amber-100/70">
              Image generation is off for this workspace.
            </p>
          )}
          </div>
        </section>
      )}
      <dialog ref={pickerRef} onClose={() => setPicker(null)} className="m-auto max-h-[85dvh] w-[min(720px,calc(100%-2rem))] overflow-auto rounded-2xl border border-white/15 bg-[#101013] p-5 text-white backdrop:bg-black/70" aria-label="Choose Client Brain references">
        <header className="flex items-center justify-between gap-4"><h2 className="text-lg">Link {picker === "drinks" ? "drink" : picker} references</h2><button type="button" disabled={busy} onClick={() => setPicker(null)} className="min-h-11 px-3">Close</button></header>
        <p className="mt-2 text-sm text-white/60">Choose from Client Brain. The server checks reference eligibility when you add it.</p>
        <label className="mt-4 block text-sm">Search assets<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3" /></label>
        {error ? <p role="alert" className="mt-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{pickerAssets.map(asset => <label key={asset.id} className="flex min-h-20 items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={picked.includes(asset.id)} disabled={busy || !asset.generation_ready || (!picked.includes(asset.id) && picked.length >= (detail?.max_references ?? 10) - (detail?.references.length ?? 0))} onChange={event => setPicked(current => event.target.checked ? [...current,asset.id] : current.filter(id => id !== asset.id))} className="size-5 shrink-0 accent-emerald-300" /><span className="min-w-0"><strong className="block text-sm font-medium">{asset.title}</strong><small className="mt-1 block text-white/60">{asset.category}</small>{asset.metadata_warning ? <small className="mt-1 block text-amber-200">{asset.metadata_warning}</small> : null}{asset.readiness_reason ? <small className="mt-1 block text-red-200">{asset.readiness_reason}</small> : null}</span></label>)}</div>
        {!pickerAssets.length ? <p className="my-6 text-sm text-white/60">{search ? "No assets match this search." : "No matching Client Brain assets are available."}</p> : null}
        <footer className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-white/60">{picked.length} selected · {Math.max(0,(detail?.max_references ?? 10) - (detail?.references.length ?? 0))} slots available</span><button type="button" onClick={() => void addSelected()} disabled={busy || !picked.length} className="min-h-11 rounded-lg bg-emerald-300 px-4 text-sm font-medium text-[#042b14] disabled:opacity-40">{busy ? "Adding…" : "Add references"}</button></footer>
      </dialog>
      <dialog ref={previewRef} onClose={() => setPreviewing(null)} className="m-auto max-h-[90dvh] w-[min(1100px,calc(100%-2rem))] overflow-auto rounded-2xl border border-white/15 bg-[#101013] p-4 text-white backdrop:bg-black/80" aria-label="Full version image">{previewing ? <><div className="flex items-center justify-between gap-4"><h2>Version {previewing.version}</h2><button type="button" onClick={() => previewRef.current?.close()} className="min-h-11 px-3">Close</button></div>{previewing.image_url ? <img src={previewing.image_url} alt={`Full image, version ${previewing.version}`} className="mx-auto mt-3 max-h-[72dvh] max-w-full object-contain" /> : <p>Image unavailable.</p>}</> : null}</dialog>
      <dialog ref={promptDialogRef} onClose={() => setPromptInspecting(null)} className="m-auto max-h-[85dvh] w-[min(660px,calc(100%-2rem))] overflow-auto rounded-2xl border border-white/15 bg-[#101013] p-6 text-white backdrop:bg-black/70" aria-label="Recorded version prompt">{promptInspecting ? <><div className="flex items-center justify-between gap-4"><h2 className="text-lg">Version {promptInspecting.version} · Recorded prompt</h2><button type="button" onClick={() => promptDialogRef.current?.close()} className="min-h-11 px-3">Close</button></div><p className="mt-3 text-xs text-white/60">This is the prompt saved with this version. Editing the current creative request does not rewrite it.</p><pre className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-white/80">{promptInspecting.prompt_text || "No prompt text was retained for this version."}</pre>{promptInspecting.failure_reason ? <p className="mt-4 text-sm text-red-200">{promptInspecting.failure_reason}</p> : null}</> : null}</dialog>
      <dialog ref={inspectRef} onClose={() => setInspecting(null)} className="m-auto max-h-[85dvh] w-[min(560px,calc(100%-2rem))] overflow-auto rounded-2xl border border-white/15 bg-[#101013] p-6 text-white backdrop:bg-black/70" aria-label="Reference details">{inspecting ? <><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-white/50">Reference {inspecting.reference_order}</p><h2 className="mt-2 text-lg">{inspecting.display_name}</h2></div><button type="button" onClick={() => inspectRef.current?.close()} className="min-h-11 px-3">Close</button></div><p className="mt-4 text-sm">Role: {inspecting.role.replaceAll("_", " ")}</p><p className="mt-2 text-sm text-white/60">Source: {inspecting.source_type?.replaceAll("_", " ") || "Not recorded"}</p><p className="mt-4 text-sm text-white/60">{inspecting.role.endsWith("_truth") ? "This reference supplies factual context. Eligibility is checked again by the server before production." : "This reference supplies creative direction. It does not establish client identity or product facts."}</p><pre className="mt-4 whitespace-pre-wrap break-words text-xs text-white/60">{JSON.stringify(inspecting.source_metadata, null, 2)}</pre></> : null}</dialog>
      {finalizing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-label="Save final content" className="w-full max-w-md rounded-2xl border border-white/12 bg-[#161719] p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-100/70">Studio finalization</p>
            <h3 className="mt-2 text-lg font-semibold">Save Version {finalizing.version} as Final Content</h3>
            <label className="mt-5 block text-xs text-white/52">Title<input value={finalTitle} onChange={(event) => setFinalTitle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/45" /></label>
            <label className="mt-3 block text-xs text-white/52">Content month<input type="month" value={finalMonth} onChange={(event) => setFinalMonth(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/45" /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFinalizing(null)} className="rounded-lg px-3 py-2 text-sm text-white/55 hover:text-white">Cancel</button><button type="button" disabled={busy} onClick={() => void finalize()} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#052010] disabled:opacity-45">{busy ? "Saving…" : "Save final"}</button></div>
          </div>
        </div>
      )}
      {attaching && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-label="Attach to content item" className="w-full max-w-md rounded-2xl border border-white/12 bg-[#161719] p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-100/70">Canonical lineage</p>
            <h3 className="mt-2 text-lg font-semibold">Attach final Studio asset</h3>
            <p className="mt-2 text-sm leading-5 text-white/50">This references the finalized asset without copying its media. Existing final media can only be replaced deliberately.</p>
            {lineageTargets.length ? <label className="mt-5 block text-xs text-white/52">Content item<select value={selectedLineageId} onChange={(event) => setSelectedLineageId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/45">{lineageTargets.map((target) => <option key={target.id} value={target.id}>{target.cycleKey} · {target.label}{target.hasMedia ? " · replaces current media" : ""}</option>)}</select></label> : <p className="mt-5 rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">No approved-plan content items are available for this client yet.</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAttaching(null)} className="rounded-lg px-3 py-2 text-sm text-white/55 hover:text-white">Cancel</button><button type="button" disabled={busy || !selectedLineageId} onClick={() => void attachToLineage()} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#052010] disabled:opacity-45">{busy ? "Attaching…" : "Attach"}</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

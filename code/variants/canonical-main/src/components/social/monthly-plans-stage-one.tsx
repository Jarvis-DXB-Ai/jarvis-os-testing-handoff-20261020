"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MonthlyConceptGridStage,
  type ActiveConceptGrid,
} from "@/components/social/monthly-concept-grid-stage";
import { MonthlyIndividualProduction } from "@/components/social/monthly-individual-production";
import { MonthlyVisualDirectionStage } from "@/components/social/monthly-visual-direction-stage";
import {
  VISUAL_DIRECTION_OPTIONS,
  type VisualDirectionFields,
} from "@/lib/social-monthly-visual-direction-types";

type PlanStatus = "draft" | "strategy_ready" | "plan_ready" | "approved";
type ItemStatus = "draft" | "ready" | "approved_for_plan" | "blocked";
type PlanningReadinessState =
  | "ready"
  | "needs_review"
  | "needs_production_setup"
  | "blocked";

type MonthlyPlan = {
  id: string;
  client_id: string;
  platform: "instagram";
  plan_month: string;
  target_feed_count: number;
  status: PlanStatus;
  monthly_context: string;
  owner_client_notes: string;
  priority_offers: string;
  items_to_avoid: string;
  products_to_push: string;
  temporary_availability_notes: string;
  commercial_priorities: string;
  other_month_notes: string;
  research_context: Record<string, unknown>;
  strategy: Record<string, unknown>;
  visual_direction: string;
  grid_notes: string;
  facebook_mirror: boolean;
  client_brain_snapshot: PlanningSnapshot;
  ai_provenance?: Record<string, unknown>;
  snapshot_at: string | null;
  approved_at: string | null;
  updated_at: string;
  item_count?: number;
};

type PlanItem = {
  id: string;
  position: number;
  planned_date: string | null;
  date_fixed: boolean;
  pillar: Pillar;
  objective: string;
  subject: string;
  creative_concept: string;
  production_method: ProductionMethod;
  required_assets: string[];
  missing_asset_note: string;
  visual_direction: string;
  shot_scale: VisualDirectionFields["shot_scale"];
  camera_angle: VisualDirectionFields["camera_angle"];
  composition: VisualDirectionFields["composition"];
  human_presence: VisualDirectionFields["human_presence"];
  interaction: VisualDirectionFields["interaction"];
  motion: VisualDirectionFields["motion"];
  production_aspect_ratio: "4:5";
  grid_crop_behavior: VisualDirectionFields["grid_crop_behavior"];
  visual_direction_source?: VisualDirectionFields["visual_direction_source"];
  grid_role: GridRole;
  activation_record_id: string | null;
  commercial_rationale: string;
  caption_brief: string;
  status: ItemStatus;
  metadata?: Record<string, unknown>;
  supporting_product_asset_ids?: string[];
  scene_requires_visible_products?: boolean;
  production_feasibility?: {
    state: string;
    label: string;
    reasons: string[];
    primary_asset_ids: string[];
    supporting_asset_ids: string[];
  };
  planning_readiness?: {
    state: PlanningReadinessState;
    label: "Ready" | "Needs Review" | "Setup Needed" | "Blocked";
    reason: string | null;
  };
  production_summary?: {
    candidate_count: number;
    selected: boolean;
    preview_url: string | null;
    preview_label:
      "Selected candidate" | "Latest candidate" | "Reference preview" | null;
  };
  updated_at: string;
};

type PlanningSnapshot = {
  client?: { id: string; name: string; subtype: string | null };
  intelligence?: Array<{
    subsection: string;
    title: string;
    summary: string | null;
    status: string;
  }>;
  menus?: Array<{
    id: string;
    name: string;
    availability: string | null;
    status: string;
  }>;
  activations?: Array<{
    id: string;
    name: string;
    proposition: string | null;
    status: string;
    temporal_status: string;
  }>;
  assets?: Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
    activation_ids: string[];
  }>;
  learnings?: Array<{
    category: string;
    statement: string;
    confidence: string;
  }>;
  warnings?: Array<{ code: string; message: string }>;
  retrieved_at?: string;
};

type SnapshotCardValue = {
  id: string;
  label: string;
};

type Activity = {
  id: string;
  action_type: string;
  summary: string;
  created_at: string;
};
type PlanDetail = {
  plan: MonthlyPlan;
  items: PlanItem[];
  activity: Activity[];
};
type ProductionReadiness = {
  status: "ready" | "blocked";
  blocked_reasons: string[];
};

type Pillar =
  "lifestyle" | "food" | "drinks" | "interiors" | "events" | "bts_service";
type ProductionMethod =
  | "ai_photography"
  | "graphic_design"
  | "photo_graphic_overlay"
  | "existing_asset"
  | "carousel"
  | "other";
type GridRole =
  | "hero_food"
  | "lifestyle_break"
  | "graphic_accent"
  | "venue_breather"
  | "human_moment"
  | "product_detail"
  | "event_commercial"
  | "other";

const PILLARS: Array<{ value: Pillar; label: string; tone: string }> = [
  {
    value: "lifestyle",
    label: "Lifestyle",
    tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  },
  {
    value: "food",
    label: "Food",
    tone: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  },
  {
    value: "drinks",
    label: "Drinks",
    tone: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  },
  {
    value: "interiors",
    label: "Interiors",
    tone: "border-blue-300/25 bg-blue-300/10 text-blue-100",
  },
  {
    value: "events",
    label: "Events",
    tone: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  },
  {
    value: "bts_service",
    label: "BTS & Service",
    tone: "border-white/15 bg-white/[0.06] text-white/70",
  },
];

const METHODS: Array<{ value: ProductionMethod; label: string }> = [
  { value: "ai_photography", label: "AI Photography" },
  { value: "graphic_design", label: "Graphic Design" },
  { value: "photo_graphic_overlay", label: "Photo + Graphic Overlay" },
  { value: "existing_asset", label: "Existing Asset" },
  { value: "carousel", label: "Carousel" },
  { value: "other", label: "Other" },
];

const GRID_ROLES: Array<{ value: GridRole; label: string }> = [
  { value: "hero_food", label: "Hero Food" },
  { value: "lifestyle_break", label: "Lifestyle Break" },
  { value: "graphic_accent", label: "Graphic Accent" },
  { value: "venue_breather", label: "Venue Breather" },
  { value: "human_moment", label: "Human Moment" },
  { value: "product_detail", label: "Product Detail" },
  { value: "event_commercial", label: "Event / Commercial" },
  { value: "other", label: "Other" },
];

const VISUAL_SHOT_SCALES = VISUAL_DIRECTION_OPTIONS.shot_scale.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["shot_scale"]; label: string }>;
const VISUAL_CAMERA_ANGLES = VISUAL_DIRECTION_OPTIONS.camera_angle.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["camera_angle"]; label: string }>;
const VISUAL_COMPOSITIONS = VISUAL_DIRECTION_OPTIONS.composition.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["composition"]; label: string }>;
const VISUAL_HUMAN_PRESENCE = VISUAL_DIRECTION_OPTIONS.human_presence.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["human_presence"]; label: string }>;
const VISUAL_INTERACTIONS = VISUAL_DIRECTION_OPTIONS.interaction.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["interaction"]; label: string }>;
const VISUAL_MOTIONS = VISUAL_DIRECTION_OPTIONS.motion.map(
  ([value, label]) => ({ value, label }),
) as Array<{ value: VisualDirectionFields["motion"]; label: string }>;
const VISUAL_GRID_CROPS = VISUAL_DIRECTION_OPTIONS.grid_crop_behavior.map(
  ([value, label]) => ({ value, label }),
) as Array<{
  value: VisualDirectionFields["grid_crop_behavior"];
  label: string;
}>;

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  strategy_ready: "Strategy Ready",
  plan_ready: "Plan Ready",
  approved: "Approved",
};

const PLANNER_STAGES = [
  { id: "context", label: "Context" },
  { id: "strategy", label: "Strategy" },
  { id: "feed-plan", label: "Feed Plan" },
  { id: "visual-direction", label: "Visual Direction" },
  { id: "concept-grid", label: "Concept Grid" },
  { id: "production", label: "Production" },
] as const;

type PlannerStage = (typeof PLANNER_STAGES)[number]["id"];

function plannerStage(value: string | null): PlannerStage {
  return PLANNER_STAGES.some((stage) => stage.id === value)
    ? (value as PlannerStage)
    : "context";
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function defaultMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthParts(value: string) {
  const [year, month] = value.split("-");
  return { year: Number(year), month: Number(month) };
}

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function compactDate(value?: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function listValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function humanQcDetails(item: PlanItem) {
  const root = item.metadata;
  const planning = root && typeof root.planning_ai === "object" && root.planning_ai !== null
    ? root.planning_ai as Record<string, unknown>
    : {};
  return {
    title: textValue(planning.candidate_concept_title) || item.subject,
    supportingSubjects: listValue(planning.supporting_subjects),
  };
}

function pillarConfig(value: Pillar) {
  return PILLARS.find((item) => item.value === value) ?? PILLARS[0];
}

function apiError(payload: unknown, fallback: string) {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false)
    throw new Error(apiError(payload, "Unable to complete this request."));
  return payload as T;
}

function PlanBadge({ status }: { status: PlanStatus }) {
  const tone =
    status === "approved"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : status === "plan_ready"
        ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
        : status === "strategy_ready"
          ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
          : "border-white/10 bg-white/[0.045] text-white/60";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}
    >
      {PLAN_STATUS_LABEL[status]}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const common =
    "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/22 focus:border-emerald-300/35";
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-white/48">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className={common}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={common}
        />
      )}
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-white/48">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/35"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function diversityWarnings(items: PlanItem[]) {
  const warnings: string[] = [];
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const repeats = (values: string[], label: string, limit: number) => {
    let run = 0;
    let previous = "";
    for (const value of values) {
      run = value === previous ? run + 1 : 1;
      previous = value;
      if (value && run > limit) {
        warnings.push(`${label} appears ${run} times consecutively.`);
        break;
      }
    }
  };
  repeats(
    ordered.map((item) => item.pillar),
    "One pillar",
    2,
  );
  repeats(
    ordered.map((item) => item.production_method),
    "One production method",
    2,
  );
  repeats(
    ordered.map((item) => item.grid_role),
    "One grid role",
    2,
  );
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (
      current.planned_date &&
      next.planned_date &&
      current.planned_date > next.planned_date
    ) {
      warnings.push(
        "Publishing Order must remain oldest-to-newest by proposed date.",
      );
      break;
    }
  }
  const subjects = new Map<string, number>();
  for (const item of ordered) {
    const key = item.subject.trim().toLowerCase();
    if (key) subjects.set(key, (subjects.get(key) ?? 0) + 1);
  }
  for (const [subject, count] of subjects)
    if (count >= 3)
      warnings.push(`${subject} appears in ${count} Feed concepts.`);
  if (
    ordered.length >= 6 &&
    ordered.filter((item) => item.pillar === "lifestyle").length <= 1
  )
    warnings.push("Only one Lifestyle post exists in this month.");
  if (
    ordered.filter((item) => item.production_method === "graphic_design")
      .length >= Math.ceil(Math.max(ordered.length, 1) / 2)
  )
    warnings.push("Graphic Design is carrying half or more of the plan.");
  return [...new Set(warnings)];
}

function emptyItem(position: number): PlanItem {
  return {
    id: "",
    position,
    planned_date: null,
    date_fixed: false,
    pillar: "lifestyle",
    objective: "",
    subject: "",
    creative_concept: "",
    production_method: "ai_photography",
    required_assets: [],
    supporting_product_asset_ids: [],
    scene_requires_visible_products: false,
    missing_asset_note: "",
    shot_scale: "other",
    camera_angle: "other",
    composition: "other",
    human_presence: "none",
    interaction: "none",
    motion: "static",
    visual_direction: "",
    production_aspect_ratio: "4:5",
    grid_crop_behavior: "safe",
    visual_direction_source: "unassigned",
    grid_role: "other",
    activation_record_id: null,
    commercial_rationale: "",
    caption_brief: "",
    status: "draft",
    updated_at: "",
  };
}

export default function MonthlyPlansStageOne({
  clientId,
}: {
  clientId: string;
}) {
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const initialMonth = monthParts(defaultMonth());
  const [createMonth, setCreateMonth] = useState(initialMonth.month);
  const [createYear, setCreateYear] = useState(String(initialMonth.year));
  const [targetCount, setTargetCount] = useState("15");
  const [showItem, setShowItem] = useState<PlanItem | null>(null);
  const [itemDraft, setItemDraft] = useState<PlanItem | null>(null);
  const [productionItem, setProductionItem] = useState<PlanItem | null>(null);
  const [contextDraft, setContextDraft] = useState<Record<string, string>>({});
  const [savedContext, setSavedContext] = useState("");
  const [showResearchContext, setShowResearchContext] = useState(false);
  const [gridFeedback, setGridFeedback] = useState<string | null>(null);
  const [strategyDraft, setStrategyDraft] = useState<Record<string, string>>(
    {},
  );
  const [planningAi, setPlanningAi] = useState<{
    configured: boolean;
    provider: string;
    model: string;
    prompt_version: string;
  } | null>(null);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningAction, setPlanningAction] = useState<
    "full_plan" | "strategy_only" | "feed_plan" | "single_concept" | null
  >(null);
  const [activeConceptGrid, setActiveConceptGrid] =
    useState<ActiveConceptGrid | null>(null);
  const [activeStage, setActiveStage] = useState<PlannerStage>(() =>
    typeof window === "undefined"
      ? "context"
      : plannerStage(new URLSearchParams(window.location.search).get("stage")),
  );
  const [productionReadiness, setProductionReadiness] = useState<
    Record<string, ProductionReadiness>
  >({});

  useEffect(() => {
    if (activeStage !== "production" || !detail) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setProductionReadiness({});
      const entries = await Promise.all(
        detail.items.map(async (item) => {
          try {
            const response = await requestJson<{
              package: ProductionReadiness;
            }>(
              `/api/clients/${clientId}/monthly-plans/${detail.plan.id}/items/${item.id}/production`,
            );
            return [item.id, response.package] as const;
          } catch {
            return [
              item.id,
              {
                status: "blocked" as const,
                blocked_reasons: ["Current package could not be inspected."],
              },
            ] as const;
          }
        }),
      );
      if (!cancelled) setProductionReadiness(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStage, clientId, detail]);

  useEffect(() => {
    const syncStageFromUrl = () =>
      setActiveStage(
        plannerStage(new URLSearchParams(window.location.search).get("stage")),
      );
    window.addEventListener("popstate", syncStageFromUrl);
    return () => window.removeEventListener("popstate", syncStageFromUrl);
  }, []);

  const selectStage = useCallback(
    (stage: PlannerStage) => {
      setActiveStage(stage);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "monthly_plans");
      if (detail?.plan.id) url.searchParams.set("plan", detail.plan.id);
      url.searchParams.set("stage", stage);
      window.history.pushState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [detail],
  );

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<{ plans: MonthlyPlan[] }>(
        `/api/clients/${clientId}/monthly-plans`,
      );
      setPlans(data.plans);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Monthly Plans.",
      );
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const openPlan = useCallback(
    async (planId: string, syncUrl = true) => {
      setSaving(true);
      setError(null);
      setActiveConceptGrid(null);
      if (syncUrl && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "monthly_plans");
        url.searchParams.set("plan", planId);
        window.history.pushState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      try {
        const data = await requestJson<PlanDetail>(
          `/api/clients/${clientId}/monthly-plans/${planId}`,
        );
        setDetail(data);
        const research = data.plan.research_context ?? {};
        const rawMonthlyContext =
          data.plan.monthly_context || data.plan.owner_client_notes || "";
        setContextDraft({
          monthly_context: rawMonthlyContext,
          additional_research_context: textValue(research.additional_context),
        });
        setSavedContext(
          JSON.stringify({
            monthly_context: rawMonthlyContext,
            additional_research_context: textValue(research.additional_context),
          }),
        );
        const strategy = data.plan.strategy ?? {};
        const compactPriorities = listValue(strategy.priorities);
        setStrategyDraft({
          primary_objective: textValue(strategy.primary_objective),
          secondary_objectives: (compactPriorities.length
            ? compactPriorities
            : listValue(strategy.secondary_objectives)
          ).join("\n"),
          commercial_priorities: compactPriorities.length
            ? compactPriorities.join("\n")
            : Array.isArray(strategy.commercial_priorities)
              ? listValue(strategy.commercial_priorities).join("\n")
              : textValue(strategy.commercial_priorities),
          content_pillar_plan:
            strategy.content_pillar_distribution &&
            typeof strategy.content_pillar_distribution === "object"
              ? Object.entries(
                  strategy.content_pillar_distribution as Record<
                    string,
                    unknown
                  >,
                )
                  .map(([pillar, count]) => `${pillar}: ${count}`)
                  .join("\n")
              : textValue(strategy.content_pillar_plan),
          creative_notes:
            textValue(strategy.creative_direction) ||
            textValue(strategy.creative_notes),
          visual_rhythm: textValue(strategy.visual_rhythm),
          commercial_vs_editorial_balance: textValue(
            strategy.commercial_vs_editorial_balance,
          ),
          key_monthly_focus: listValue(strategy.key_monthly_focus).join("\n"),
          what_to_avoid: Array.isArray(strategy.avoid)
            ? listValue(strategy.avoid).join("\n")
            : textValue(strategy.what_to_avoid),
          strategy_rationale: textValue(strategy.strategy_rationale),
          visual_direction: data.plan.visual_direction,
          grid_notes: data.plan.grid_notes,
        });
        try {
          const status = await requestJson<{
            planning_ai: {
              configured: boolean;
              provider: string;
              model: string;
              prompt_version: string;
            };
          }>(`/api/clients/${clientId}/monthly-plans/${planId}/generate`);
          setPlanningAi(status.planning_ai);
        } catch {
          setPlanningAi(null);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this plan.",
        );
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    if (detail || loading || plans.length === 0) return;
    const planId = new URLSearchParams(window.location.search).get("plan");
    if (planId) {
      const timer = window.setTimeout(() => {
        void openPlan(planId, false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [detail, loading, openPlan, plans.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPlans();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPlans]);

  const createPlan = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson<{ plan: MonthlyPlan; created: boolean }>(
        `/api/clients/${clientId}/monthly-plans`,
        {
          method: "POST",
          body: JSON.stringify({
            plan_month: monthStart(
              Number(createYear) || initialMonth.year,
              createMonth,
            ),
            target_feed_count: Number(targetCount) || 15,
          }),
        },
      );
      await loadPlans();
      await openPlan(data.plan.id);
      setShowCreate(false);
      setNotice(
        data.created
          ? "Monthly Plan created with a scoped Client Brain snapshot."
          : "Opened the existing canonical Monthly Plan for this month.",
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create this Monthly Plan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    await openPlan(detail.plan.id);
    await loadPlans();
  };

  const savePlanAction = async (
    action: string,
    body: Record<string, unknown> = {},
  ) => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/clients/${clientId}/monthly-plans/${detail.plan.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            expected_updated_at: detail.plan.updated_at,
            ...body,
          }),
        },
      );
      await refreshDetail();
      setNotice(
        action === "approve"
          ? "Plan approved. Stage 2 production is still intentionally unavailable."
          : "Monthly Plan saved.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the Monthly Plan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveContext = () =>
    savePlanAction("save_context", {
      monthly_context: contextDraft.monthly_context ?? "",
      facebook_mirror: detail?.plan.facebook_mirror !== false,
      research_context: {
        additional_context: contextDraft.additional_research_context ?? "",
      },
    });

  const saveStrategy = () =>
    savePlanAction("save_strategy", {
      strategy: {
        primary_objective: strategyDraft.primary_objective,
        secondary_objectives: strategyDraft.secondary_objectives
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        commercial_priorities: strategyDraft.commercial_priorities
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        content_pillar_plan: strategyDraft.content_pillar_plan,
        content_pillar_distribution: Object.fromEntries(
          strategyDraft.content_pillar_plan.split("\n").flatMap((line) => {
            const match = line.match(
              /^\s*(lifestyle|food|drinks|interiors|events|bts_service)\s*:\s*(\d+)\s*$/i,
            );
            return match ? [[match[1].toLowerCase(), Number(match[2])]] : [];
          }),
        ),
        creative_direction: strategyDraft.creative_notes,
        visual_rhythm: strategyDraft.visual_rhythm,
        commercial_vs_editorial_balance:
          strategyDraft.commercial_vs_editorial_balance,
        key_monthly_focus: strategyDraft.key_monthly_focus
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        avoid: strategyDraft.what_to_avoid
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        strategy_rationale: strategyDraft.strategy_rationale,
      },
      visual_direction: strategyDraft.visual_direction,
      grid_notes: strategyDraft.grid_notes,
    });

  const generatePlan = async (
    mode: "full_plan" | "strategy_only" | "feed_plan" | "single_concept",
    options: { itemId?: string; correction?: string } = {},
  ) => {
    if (!detail) return;
    if (!planningAi?.configured) {
      setError(
        "Planning AI is not currently available. Manual planning remains available.",
      );
      return;
    }
    const replacesExisting = mode === "full_plan" || mode === "feed_plan";
    const confirmationMessage =
      mode === "feed_plan"
        ? detail.items.length > 0
          ? "This will replace the existing Feed concepts. Continue?"
          : "Generate a new Feed plan from the saved Monthly Strategy? Continue?"
        : replacesExisting && detail.items.length > 0
          ? "This will replace the existing Feed concepts. Continue?"
          : null;
    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      setNotice(
        "Feed plan generation cancelled. Existing concepts were preserved.",
      );
      return;
    }
    setPlanningBusy(true);
    setPlanningAction(mode);
    setError(null);
    setNotice(
      mode === "feed_plan"
        ? "Generating Feed Plan from the saved Monthly Strategy..."
        : mode === "full_plan"
          ? "Generating Monthly Strategy and Feed Plan..."
          : mode === "strategy_only"
            ? "Generating Monthly Strategy..."
            : "Regenerating Feed concept...",
    );
    try {
      let expectedUpdatedAt = detail.plan.updated_at;
      if (contextDirty) {
        const saved = await requestJson<{ plan: MonthlyPlan }>(
          `/api/clients/${clientId}/monthly-plans/${detail.plan.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              action: "save_context",
              expected_updated_at: expectedUpdatedAt,
              monthly_context: contextDraft.monthly_context ?? "",
              facebook_mirror: detail.plan.facebook_mirror !== false,
              research_context: {
                additional_context:
                  contextDraft.additional_research_context ?? "",
              },
            }),
          },
        );
        expectedUpdatedAt = saved.plan.updated_at;
      }
      const result = await requestJson<{
        mode: string;
        warnings?: string[];
        execution?: { actual_cost_usd?: number };
      }>(`/api/clients/${clientId}/monthly-plans/${detail.plan.id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          expected_updated_at: expectedUpdatedAt,
          mode,
          replace_existing: replacesExisting && detail.items.length > 0,
          item_id: options.itemId,
          correction: options.correction,
        }),
      });
      setShowItem(null);
      setItemDraft(null);
      await refreshDetail();
      const cost =
        typeof result.execution?.actual_cost_usd === "number"
          ? ` · $${result.execution.actual_cost_usd.toFixed(4)}`
          : "";
      setNotice(
        mode === "single_concept"
          ? `Feed concept regenerated${cost}.`
          : mode === "strategy_only"
            ? `Monthly Strategy regenerated${cost}.`
            : `Monthly Strategy and Feed plan generated${cost}.`,
      );
    } catch (generationError) {
      setNotice(null);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Planning AI could not generate this plan. The existing plan was preserved.",
      );
    } finally {
      setPlanningBusy(false);
      setPlanningAction(null);
    }
  };

  const saveItem = async () => {
    if (!detail || !itemDraft) return;
    setSaving(true);
    setError(null);
    const body = {
      ...itemDraft,
      expected_updated_at: itemDraft.updated_at,
      required_assets: itemDraft.required_assets,
    };
    try {
      if (itemDraft.id) {
        await requestJson(
          `/api/clients/${clientId}/monthly-plans/${detail.plan.id}/items/${itemDraft.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
      } else {
        await requestJson(
          `/api/clients/${clientId}/monthly-plans/${detail.plan.id}/items`,
          { method: "POST", body: JSON.stringify(body) },
        );
      }
      setShowItem(null);
      setItemDraft(null);
      await refreshDetail();
      setNotice("Feed concept saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the Feed concept.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!detail || !itemDraft?.id) return;
    setSaving(true);
    try {
      await requestJson(
        `/api/clients/${clientId}/monthly-plans/${detail.plan.id}/items/${itemDraft.id}`,
        { method: "DELETE" },
      );
      setShowItem(null);
      setItemDraft(null);
      await refreshDetail();
      setNotice(
        "Feed concept removed. The plan count now reflects the actual number of concepts.",
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to remove the Feed concept.",
      );
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (item: PlanItem, direction: -1 | 1) => {
    if (!detail) return;
    const nextPosition = item.position + direction;
    if (nextPosition < 1 || nextPosition > detail.items.length) return;
    setSaving(true);
    try {
      await requestJson(
        `/api/clients/${clientId}/monthly-plans/${detail.plan.id}/items/${item.id}/reorder`,
        {
          method: "POST",
          body: JSON.stringify({ target_position: nextPosition }),
        },
      );
      await refreshDetail();
      setGridFeedback(
        `Moved ${item.subject || "Feed concept"} in Publishing Order; the Instagram preview now reflects its new visual position.`,
      );
    } catch (moveError) {
      const message =
        moveError instanceof Error
          ? moveError.message
          : "Unable to reorder the Feed concept.";
      setGridFeedback(message);
    } finally {
      setSaving(false);
    }
  };

  const generatedWarnings = useMemo(() => {
    const provenance = detail?.plan.ai_provenance;
    return provenance && Array.isArray(provenance.warnings)
      ? provenance.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [];
  }, [detail]);
  const warnings = useMemo(
    () => [
      ...new Set([
        ...(detail ? diversityWarnings(detail.items) : []),
        ...generatedWarnings,
      ]),
    ],
    [detail, generatedWarnings],
  );
  const incompleteCount =
    detail?.items.filter(
      (item) => !item.objective || !item.subject || !item.creative_concept,
    ).length ?? 0;
  const readinessCounts = useMemo(() => {
    const counts: Record<PlanningReadinessState, number> = {
      ready: 0,
      needs_review: 0,
      needs_production_setup: 0,
      blocked: 0,
    };
    for (const item of detail?.items ?? []) {
      const state = item.planning_readiness?.state
        ?? (item.production_feasibility?.state === "production_ready" ? "ready" : "needs_production_setup");
      counts[state] += 1;
    }
    return counts;
  }, [detail]);
  const snapshot = detail?.plan.client_brain_snapshot;
  const contextSignature = JSON.stringify({
    monthly_context: contextDraft.monthly_context ?? "",
    additional_research_context: contextDraft.additional_research_context ?? "",
  });
  const contextDirty = Boolean(detail && contextSignature !== savedContext);

  useEffect(() => {
    if (!contextDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [contextDirty]);

  if (loading)
    return (
      <section className="jarvis-panel text-sm text-white/50">
        Loading Monthly Plans...
      </section>
    );

  if (!detail) {
    return (
      <section className="space-y-6">
        <div className="jarvis-panel flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="jarvis-eyebrow">Monthly Plans</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">
              Plan the month before producing it.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
              Instagram Feed is the canonical visual plan. Planning AI builds
              strategy and concepts from saved Client Brain truth; approval
              still happens before production.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-200"
          >
            Create Monthly Plan
          </button>
        </div>
        {error && (
          <p className="rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}
        {plans.length === 0 ? (
          <div className="jarvis-panel border-dashed text-center">
            <p className="text-lg font-semibold text-white">
              No Monthly Plans yet.
            </p>
            <p className="mt-2 text-sm text-white/45">
              Create a month when the client is ready to plan it. No fake
              September plan has been seeded.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => void openPlan(plan.id)}
                className="rounded-2xl border border-white/10 bg-black/25 p-5 text-left transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {dateLabel(plan.plan_month)}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Instagram Feed · {plan.item_count ?? 0}/
                      {plan.target_feed_count} concepts · Facebook mirror{" "}
                      {plan.facebook_mirror ? "on" : "off"}
                    </p>
                  </div>
                  <PlanBadge status={plan.status} />
                </div>
                <p className="mt-5 text-xs text-white/35">
                  Updated{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(plan.updated_at))}
                </p>
              </button>
            ))}
          </div>
        )}
        {showCreate && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0e0b] p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="jarvis-eyebrow">Create</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    New Monthly Plan
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-sm text-white/55 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-white/48">
                    Month
                  </span>
                  <select
                    aria-label="Month"
                    value={createMonth}
                    onChange={(event) =>
                      setCreateMonth(Number(event.target.value))
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/35"
                  >
                    {MONTHS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-white/48">
                    Year
                  </span>
                  <input
                    aria-label="Year"
                    type="number"
                    min="2024"
                    max="2100"
                    inputMode="numeric"
                    value={createYear}
                    onChange={(event) => setCreateYear(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/35"
                  />
                </label>
                <div className="sm:col-span-2">
                  <Field
                    label="Feed Posts"
                    value={targetCount}
                    onChange={setTargetCount}
                    placeholder="15"
                  />
                </div>
                <p className="sm:col-span-2 text-xs leading-relaxed text-white/38">
                  Instagram is canonical. Facebook mirroring is stored as plan
                  metadata only; no publishing will occur.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void createPlan()}
                  className="sm:col-span-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Monthly Plan"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  const busy = saving || planningBusy;
  const visualDirectionCount = detail.items.filter(
    (item) =>
      item.visual_direction_source !== "unassigned" &&
      item.visual_direction.trim().split(/\s+/).filter(Boolean).length >= 25,
  ).length;
  const selectedCandidateCount = detail.items.filter(
    (item) => item.production_summary?.selected === true,
  ).length;
  const stageState: Record<PlannerStage, string> = {
    context: contextDraft.monthly_context?.trim() ? "✓" : "",
    strategy: detail.plan.status === "draft" ? "" : "✓",
    "feed-plan": detail.items.length
      ? `${detail.items.length}/${detail.plan.target_feed_count}`
      : "",
    "visual-direction":
      visualDirectionCount === detail.plan.target_feed_count
        ? "✓"
        : visualDirectionCount
          ? `! ${visualDirectionCount}/${detail.plan.target_feed_count}`
          : "",
    "concept-grid": activeConceptGrid ? "✓" : "",
    production: `${selectedCandidateCount}/${detail.plan.target_feed_count}`,
  };
  const currentStageIndex = PLANNER_STAGES.findIndex(
    (stage) => stage.id === activeStage,
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => {
              if (
                !contextDirty ||
                window.confirm(
                  "You have unsaved Monthly Context changes. Leave without saving?",
                )
              ) {
                const url = new URL(window.location.href);
                url.searchParams.delete("plan");
                url.searchParams.delete("stage");
                window.history.pushState(
                  {},
                  "",
                  `${url.pathname}${url.search}${url.hash}`,
                );
                setDetail(null);
                setError(null);
                setNotice(null);
              }
            }}
            className="text-xs font-semibold text-emerald-200/70 hover:text-emerald-100"
          >
            ← Monthly Plans
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              {dateLabel(detail.plan.plan_month)}
            </h2>
            <PlanBadge status={detail.plan.status} />
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/48">
              Instagram Feed
            </span>
            <span className="text-xs text-white/40">
              {detail.items.length}/{detail.plan.target_feed_count} posts
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void savePlanAction("refresh_snapshot")}
            disabled={busy}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]"
          >
            Refresh truth
          </button>
          {detail.plan.status === "approved" ? (
            <button
              type="button"
              onClick={() => void savePlanAction("reopen")}
              disabled={busy}
              className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-50"
            >
              Reopen Plan
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void savePlanAction("approve", { warnings_acknowledged: true })
              }
              disabled={
                busy || detail.items.length === 0 || incompleteCount > 0
              }
              className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              Approve Plan
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">
          {notice}
        </p>
      )}

      <nav
        aria-label="Monthly Planner stages"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      >
        {PLANNER_STAGES.map((stage, index) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => selectStage(stage.id)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${activeStage === stage.id ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/10 bg-black/25 text-white/58 hover:bg-white/[0.05]"}`}
          >
            <span className="mr-1.5 text-[10px] opacity-70">{index + 1}</span>
            {stage.label}
            {stageState[stage.id] && (
              <span className="ml-1.5 text-[10px] opacity-75">
                {stageState[stage.id]}
              </span>
            )}
          </button>
        ))}
      </nav>

      {activeStage === "context" && (
        <>
          <section className="jarvis-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="jarvis-eyebrow">1. Context</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Monthly Context
                </h3>
                <p className="mt-2 text-sm text-white/45">
                  The user provides messy human context. Jarvis structures it
                  later. These notes remain scoped to this month and never
                  mutate Client Brain.
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/45">
                Manual input
              </span>
            </div>
            <label className="mt-6 block">
              <span className="text-[11px] font-semibold text-white/48">
                MONTHLY CONTEXT
              </span>
              <textarea
                aria-label="Monthly Context"
                value={contextDraft.monthly_context ?? ""}
                onChange={(event) =>
                  setContextDraft((current) => ({
                    ...current,
                    monthly_context: event.target.value,
                  }))
                }
                rows={10}
                placeholder="Tell Jarvis anything relevant about this month - owner comments, priorities, events, offers, products to push, things to avoid, temporary changes, ideas or other context. Write naturally in any order."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/35"
              />
            </label>
            <p className="mt-2 text-xs text-white/38">
              Write anything Jarvis should know about this month.
            </p>
            <div className="mt-5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setShowResearchContext((current) => !current)}
                className="text-sm font-semibold text-white/68 hover:text-emerald-100"
              >
                {showResearchContext ? "Hide" : "Add"} Research / Additional
                Context
              </button>
              {showResearchContext && (
                <label className="mt-4 block">
                  <span className="text-[11px] font-semibold text-white/48">
                    RESEARCH / ADDITIONAL CONTEXT
                  </span>
                  <textarea
                    aria-label="Research / Additional Context"
                    value={contextDraft.additional_research_context ?? ""}
                    onChange={(event) =>
                      setContextDraft((current) => ({
                        ...current,
                        additional_research_context: event.target.value,
                      }))
                    }
                    rows={5}
                    placeholder="Optional manual research notes. Planning AI does not call web research."
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35"
                  />
                </label>
              )}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveContext()}
                className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
              >
                Save & Continue
              </button>
              {contextDirty && (
                <span className="text-xs text-amber-100">Unsaved changes</span>
              )}
            </div>
          </section>

          <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-white/68">
              View scoped Client Brain snapshot
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SnapshotCard
                label="Intelligence"
                values={(snapshot?.intelligence ?? []).map((record) => ({
                  id: `${record.subsection}:${record.title}`,
                  label: record.title,
                }))}
              />
              <SnapshotCard
                label="Menus"
                values={(snapshot?.menus ?? []).map((record) => ({
                  id: record.id,
                  label: record.name,
                }))}
              />
              <SnapshotCard
                label="Current Activations"
                values={(snapshot?.activations ?? [])
                  .filter(
                    (record) =>
                      record.temporal_status === "current" ||
                      record.temporal_status === "scheduled",
                  )
                  .map((record) => ({ id: record.id, label: record.name }))}
              />
              <SnapshotCard
                label="Approved Assets"
                values={(snapshot?.assets ?? []).map((record) => ({
                  id: record.id,
                  label: `${record.name} · ${record.category}`,
                }))}
              />
            </div>
            {(snapshot?.warnings?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs text-amber-50/80">
                {snapshot?.warnings?.map((warning) => (
                  <p key={warning.code}>{warning.message}</p>
                ))}
              </div>
            )}
          </details>
        </>
      )}

      {activeStage === "strategy" && (
        <section className="jarvis-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="jarvis-eyebrow">2. Strategy</p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Concise Monthly Strategy
              </h3>
              <p className="mt-2 text-sm text-white/45">
                Planning AI turns the saved Monthly Context and current Client
                Brain into an editable strategy. It never approves, produces,
                schedules, or publishes content.
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${planningAi?.configured ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-50" : "border-amber-300/20 bg-amber-300/[0.07] text-amber-50"}`}
            >
              {planningAi?.configured
                ? `${planningAi.provider} · ${planningAi.model}`
                : "Manual strategy available"}
            </span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field
              label="Primary Objective"
              value={strategyDraft.primary_objective ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  primary_objective: value,
                }))
              }
              placeholder="e.g. Build consideration for private dining"
            />
            <Field
              label="Secondary Objectives (one per line)"
              value={strategyDraft.secondary_objectives ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  secondary_objectives: value,
                }))
              }
              multiline
            />
            <Field
              label="Commercial Priorities"
              value={strategyDraft.commercial_priorities ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  commercial_priorities: value,
                }))
              }
              multiline
            />
            <Field
              label="Content Pillar Plan"
              value={strategyDraft.content_pillar_plan ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  content_pillar_plan: value,
                }))
              }
              multiline
              placeholder="food: 6\ndrinks: 2\n..."
            />
            <Field
              label="Creative Direction"
              value={strategyDraft.creative_notes ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  creative_notes: value,
                }))
              }
              multiline
            />
            <Field
              label="Visual Rhythm"
              value={strategyDraft.visual_rhythm ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  visual_rhythm: value,
                }))
              }
              multiline
            />
            <Field
              label="Commercial vs Editorial Balance"
              value={strategyDraft.commercial_vs_editorial_balance ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  commercial_vs_editorial_balance: value,
                }))
              }
              multiline
            />
            <Field
              label="Key Monthly Focus (one per line)"
              value={strategyDraft.key_monthly_focus ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  key_monthly_focus: value,
                }))
              }
              multiline
            />
            <Field
              label="Visual Direction"
              value={strategyDraft.visual_direction ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  visual_direction: value,
                }))
              }
              multiline
            />
            <Field
              label="What to Avoid"
              value={strategyDraft.what_to_avoid ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  what_to_avoid: value,
                }))
              }
              multiline
            />
            <Field
              label="Strategy Rationale"
              value={strategyDraft.strategy_rationale ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  strategy_rationale: value,
                }))
              }
              multiline
            />
            <Field
              label="Grid Notes"
              value={strategyDraft.grid_notes ?? ""}
              onChange={(value) =>
                setStrategyDraft((current) => ({
                  ...current,
                  grid_notes: value,
                }))
              }
              multiline
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {PILLARS.map((pillar) => (
              <span
                key={pillar.value}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${pillar.tone}`}
              >
                {pillar.label}
              </span>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveStrategy()}
              className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
            >
              Save Strategy
            </button>
            {planningAi?.configured && !detail.items.length && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void generatePlan("full_plan")}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.05] disabled:opacity-40"
              >
                {planningAction === "full_plan"
                  ? "Generating Plan..."
                  : "Generate Plan"}
              </button>
            )}
            {planningAi?.configured && detail.items.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Regenerating the strategy will not replace the Feed plan, but existing concepts may no longer match it. Continue?",
                    )
                  )
                    return;
                  void generatePlan("strategy_only");
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.05] disabled:opacity-40"
              >
                Regenerate Strategy
              </button>
            )}
          </div>
        </section>
      )}

      {activeStage === "feed-plan" && (
        <section className="jarvis-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="jarvis-eyebrow">3. Feed Plan</p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Structured Instagram Feed concepts
              </h3>
              <p className="mt-2 text-sm text-white/45">
                Strategy can be approved with ordinary production setup notes.
                Captions, images, Stories, Reels, scheduling, and publishing
                remain outside this stage.
              </p>
              {detail.items.length > 0 && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full border border-emerald-300/25 px-2 py-1 text-emerald-100">{readinessCounts.ready} Ready</span>
                    <span className="rounded-full border border-amber-300/25 px-2 py-1 text-amber-100">{readinessCounts.needs_review} Needs Review</span>
                    <span className="rounded-full border border-sky-300/25 px-2 py-1 text-sky-100">{readinessCounts.needs_production_setup} Setup Needed</span>
                    {readinessCounts.blocked > 0 && <span className="rounded-full border border-red-300/25 px-2 py-1 text-red-100">{readinessCounts.blocked} Blocked</span>}
                  </div>
                  {readinessCounts.blocked > 0 && (
                    <p className="mt-2 text-xs text-red-100/80">
                      Blocked concepts need an explicit human decision before Individual Production. The strategic month remains visible for QC.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {planningAi?.configured && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generatePlan("feed_plan")}
                  className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-50 disabled:opacity-40"
                >
                  {planningAction === "feed_plan"
                    ? "Regenerating Feed Plan..."
                    : "Regenerate Feed Plan"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const item = emptyItem(detail.items.length + 1);
                  setItemDraft(item);
                  setShowItem(item);
                }}
                className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:opacity-40"
              >
                Add Feed Item
              </button>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <div className="hidden grid-cols-[48px_140px_1fr_150px_130px_118px] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-white/38 lg:grid">
              <span>Slot</span>
              <span>Date</span>
              <span>Concept</span>
              <span>Pillar</span>
              <span>Method</span>
              <span>Production readiness</span>
            </div>
            {detail.items.length === 0 ? (
              <div className="p-8 text-center text-sm text-white/42">
                No Feed concepts yet. Generate the plan or add a concept
                manually.
              </div>
            ) : (
              detail.items.map((item) => {
                const humanQc = humanQcDetails(item);
                const readinessReason = item.planning_readiness?.reason;
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setItemDraft({ ...item });
                    setShowItem(item);
                  }}
                  className="grid w-full gap-2 border-b border-white/[0.07] px-4 py-4 text-left transition last:border-none hover:bg-white/[0.035] lg:grid-cols-[48px_140px_1fr_150px_130px_118px] lg:items-center"
                >
                  <span className="text-sm font-semibold text-emerald-100">
                    {item.position}
                  </span>
                  <span className="text-xs text-white/48">
                    {compactDate(item.planned_date)}
                    {item.date_fixed ? " · fixed" : ""}
                  </span>
                  <span>
                    <strong className="block text-sm font-semibold text-white">
                      {humanQc.title || "Untitled concept"}
                    </strong>
                    <span className="mt-1 block text-xs text-white/58">
                      Primary: {item.subject || "Not specified"}
                    </span>
                    {humanQc.supportingSubjects.length > 0 && (
                      <span className="mt-1 block truncate text-xs text-white/42">
                        Supporting: {humanQc.supportingSubjects.join(" · ")}
                      </span>
                    )}
                    <span className="mt-1 block truncate text-xs text-white/38">
                      {item.creative_concept || "Add a creative concept"}
                    </span>
                  </span>
                  <span>
                    <PillarChip pillar={item.pillar} />
                  </span>
                  <span className="text-xs text-white/58">
                    {
                      METHODS.find(
                        (method) => method.value === item.production_method,
                      )?.label
                    }
                  </span>
                  <span>
                    <PlanningReadinessChip item={item} />
                    {readinessReason && (
                      <span className="mt-1 block text-[10px] leading-relaxed text-white/42">
                        {readinessReason}
                      </span>
                    )}
                  </span>
                </button>
                )
              })
            )}
          </div>
          <button
            type="button"
            disabled={busy || detail.items.length === 0}
            onClick={() => void savePlanAction("mark_plan_ready")}
            className="mt-5 rounded-xl border border-sky-300/25 bg-sky-300/10 px-4 py-2.5 text-sm font-semibold text-sky-50 disabled:opacity-40"
          >
            Mark Plan Ready
          </button>
          <p className="mt-2 text-xs text-white/42">
            Setup and review notes guide human QC and Individual Production; they do not prevent approving a sound monthly strategy.
          </p>
        </section>
      )}

      {activeStage === "visual-direction" && (
        <MonthlyVisualDirectionStage
          clientId={clientId}
          planId={detail.plan.id}
          items={detail.items}
          onGenerated={refreshDetail}
        />
      )}

      {activeStage === "concept-grid" && (
        <>
          <section>
            <div>
              <p className="jarvis-eyebrow">5. Grid</p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Instagram Profile Preview
              </h3>
              <p className="mt-2 text-sm text-white/45">
                Structured tiles show the publishing order. A selected Concept
                Grid appears here as one month-level storyboard, never as 15
                production images.
              </p>
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.64fr)_minmax(280px,0.36fr)] xl:items-start">
              <InstagramPlanningPreview
                clientName={snapshot?.client?.name ?? "Client"}
                items={detail.items}
                storyboard={activeConceptGrid}
                onOpen={(item) => {
                  setItemDraft({ ...item });
                  setShowItem(item);
                }}
                onMove={moveItem}
                disabled={saving}
              />
              <div className="jarvis-panel h-fit">
                <p className="jarvis-eyebrow">Visual Rhythm</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Plan Summary
                </h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <RhythmSummary
                    label="Posts"
                    value={`${detail.items.length}/${detail.plan.target_feed_count}`}
                    detail="planned"
                  />
                  <RhythmSummary
                    label="Pillars"
                    value={String(
                      new Set(detail.items.map((item) => item.pillar)).size,
                    )}
                    detail="represented"
                  />
                  <RhythmSummary
                    label="Methods"
                    value={String(
                      new Set(
                        detail.items.map((item) => item.production_method),
                      ).size,
                    )}
                    detail="represented"
                  />
                  <RhythmSummary
                    label="Missing assets"
                    value={String(
                      detail.items.filter((item) =>
                        item.missing_asset_note.trim(),
                      ).length,
                    )}
                    detail="flagged"
                  />
                </div>
                {gridFeedback && (
                  <p
                    className={`mt-5 rounded-xl border px-3 py-3 text-xs ${gridFeedback.startsWith("Moved") ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-50" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-50"}`}
                  >
                    {gridFeedback}
                  </p>
                )}
                <div className="mt-5 space-y-2">
                  {warnings.length === 0 ? (
                    <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-3 text-sm text-emerald-50">
                      No obvious structured-plan repetition detected.
                    </p>
                  ) : (
                    warnings.map((warning) => (
                      <p
                        key={warning}
                        className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-3 text-sm text-amber-50"
                      >
                        {warning}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <MonthlyConceptGridStage
            clientId={clientId}
            planId={detail.plan.id}
            planUpdatedAt={`${detail.plan.updated_at}:${detail.items.map((item) => item.updated_at).join("|")}`}
            onActiveGridChange={setActiveConceptGrid}
          />
        </>
      )}

      {activeStage === "production" && (
        <section className="jarvis-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="jarvis-eyebrow">6. Production</p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Final creative production
              </h3>
              <p className="mt-2 text-sm text-white/45">
                Open one post at a time to inspect its truth, Visual Direction,
                inspiration, and production readiness before generating a
                candidate.
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/48">
              {selectedCandidateCount}/{detail.plan.target_feed_count} selected
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {detail.items.map((item) => {
              const currentPackage = productionReadiness[item.id];
              const truthReady = currentPackage?.status === "ready";
              const directionReady =
                item.visual_direction_source !== "unassigned" &&
                item.visual_direction.trim().split(/\s+/).filter(Boolean)
                  .length >= 25;
              const candidateCount =
                item.production_summary?.candidate_count ?? 0;
              const selected = item.production_summary?.selected === true;
              const previewUrl = item.production_summary?.preview_url;
              const previewLabel = item.production_summary?.preview_label;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setProductionItem(item)}
                  className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.04]"
                >
                  <div className="relative aspect-[4/5] bg-white/[0.04]">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-relaxed text-white/35">
                        No candidate or approved reference preview yet.
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent p-2.5">
                      <span className="text-[10px] font-semibold text-emerald-100">
                        P{String(item.position).padStart(2, "0")} ·{" "}
                        {compactDate(item.planned_date)}
                      </span>
                      <PillarChip pillar={item.pillar} />
                    </div>
                    {previewLabel && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white/82">
                        {previewLabel}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-white">
                      {item.subject || "Untitled concept"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/42">
                      {item.pillar.replaceAll("_", " ")} ·{" "}
                      {item.production_method.replaceAll("_", " ")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      <span
                        className={`rounded-full border px-2 py-1 ${truthReady ? "border-emerald-300/20 text-emerald-50" : currentPackage ? "border-amber-300/20 text-amber-50" : "border-white/10 text-white/45"}`}
                      >
                        {truthReady
                          ? "Package ready"
                          : currentPackage
                            ? "Package blocked"
                            : "Inspecting package"}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 ${directionReady ? "border-emerald-300/20 text-emerald-50" : "border-amber-300/20 text-amber-50"}`}
                      >
                        {directionReady
                          ? "Direction ready"
                          : "Direction needed"}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-white/48">
                        {candidateCount} candidate
                        {candidateCount === 1 ? "" : "s"}
                      </span>
                      {selected && (
                        <span className="rounded-full border border-sky-300/25 bg-sky-300/[0.07] px-2 py-1 text-sky-50">
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <details className="mt-5 border-t border-white/10 pt-4">
            <summary className="cursor-pointer text-xs font-semibold text-white/52">
              Planning history
            </summary>
            <div className="mt-3 space-y-3">
              {detail.activity.length ? (
                detail.activity.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-3 last:border-none"
                  >
                    <p className="text-sm text-white/68">{entry.summary}</p>
                    <time className="shrink-0 text-xs text-white/34">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(entry.created_at))}
                    </time>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/38">No plan activity yet.</p>
              )}
            </div>
          </details>
        </section>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <button
          type="button"
          disabled={currentStageIndex === 0}
          onClick={() => selectStage(PLANNER_STAGES[currentStageIndex - 1].id)}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 disabled:opacity-30"
        >
          ← Previous
        </button>
        <span className="text-xs text-white/35">
          {currentStageIndex + 1} of {PLANNER_STAGES.length}
        </span>
        <button
          type="button"
          disabled={currentStageIndex === PLANNER_STAGES.length - 1}
          onClick={() => selectStage(PLANNER_STAGES[currentStageIndex + 1].id)}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {showItem && itemDraft && (
        <ItemDrawer
          item={itemDraft}
          setItem={setItemDraft}
          activations={snapshot?.activations ?? []}
          onClose={() => {
            setShowItem(null);
            setItemDraft(null);
          }}
          onSave={() => void saveItem()}
          onDelete={itemDraft.id ? () => void deleteItem() : undefined}
          onRegenerate={
            itemDraft.id && planningAi?.configured
              ? (correction) =>
                  void generatePlan("single_concept", {
                    itemId: itemDraft.id,
                    correction,
                  })
              : undefined
          }
          saving={busy}
        />
      )}
      {productionItem && (
        <MonthlyIndividualProduction
          clientId={clientId}
          planId={detail.plan.id}
          itemId={productionItem.id}
          onClose={() => setProductionItem(null)}
          onChanged={() => void refreshDetail()}
        />
      )}
    </section>
  );
}

function SnapshotCard({
  label,
  values,
}: {
  label: string;
  values: SnapshotCardValue[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/38">
        {label}
      </p>
      <div className="mt-2 space-y-1.5">
        {values.length ? (
          values.slice(0, 4).map((value) => (
            <p key={value.id} className="truncate text-xs text-white/68">
              {value.label}
            </p>
          ))
        ) : (
          <p className="text-xs text-white/30">No current records returned.</p>
        )}
      </div>
    </div>
  );
}

function PillarChip({ pillar }: { pillar: Pillar }) {
  const config = pillarConfig(pillar);
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${config.tone}`}
    >
      {config.label}
    </span>
  );
}

function PlanningReadinessChip({ item }: { item: PlanItem }) {
  const readiness = item.planning_readiness ?? (item.production_feasibility?.state === "production_ready"
    ? { state: "ready" as const, label: "Ready" as const, reason: null }
    : { state: "needs_production_setup" as const, label: "Setup Needed" as const, reason: item.missing_asset_note || item.production_feasibility?.reasons.join(" ") || "Production setup is required before this concept can be made." });
  const tone = readiness.state === "ready"
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
    : readiness.state === "needs_review"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
      : readiness.state === "blocked"
        ? "border-red-300/30 bg-red-300/10 text-red-100"
        : "border-sky-300/30 bg-sky-300/10 text-sky-100";
  return (
    <span className={`inline-flex max-w-full rounded-full border px-2 py-1 text-[10px] font-semibold ${tone}`} title={readiness.reason ?? undefined}>
      {readiness.label}
    </span>
  );
}

function InstagramPlanningPreview({
  clientName,
  items,
  storyboard,
  onOpen,
  onMove,
  disabled,
}: {
  clientName: string;
  items: PlanItem[];
  storyboard: ActiveConceptGrid | null;
  onOpen: (item: PlanItem) => void;
  onMove: (item: PlanItem, direction: -1 | 1) => void;
  disabled: boolean;
}) {
  const publishingItems = [...items].sort(
    (left, right) => left.position - right.position,
  );
  const gridItems = publishingItems.slice(0, 15).reverse();
  return (
    <div
      className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/15 bg-[#090b0a] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
      data-testid="instagram-planning-grid"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-xs font-semibold text-emerald-100">
          {clientName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {clientName}
          </p>
          <p className="text-[10px] text-white/38">Instagram Feed Plan</p>
        </div>
        <span className="ml-auto text-[10px] font-medium text-white/42">
          {items.length} posts
        </span>
      </div>
      {storyboard?.image_url ? (
        <div className="relative aspect-[3/5] overflow-hidden bg-black">
          <img
            src={storyboard.image_url}
            alt={`Concept Grid version ${storyboard.version} for ${clientName}`}
            className="absolute left-0 top-1/2 block h-auto w-full -translate-y-1/2"
          />
          <span className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[9px] font-semibold text-white/75">
            Storyboard v{storyboard.version}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-white/[0.10]">
          {Array.from({ length: 15 }, (_, index) => {
            const item = gridItems[index];
            return item ? (
              <InstagramPlanningTile
                key={item.id}
                item={item}
                onOpen={() => onOpen(item)}
                onMove={(direction) => onMove(item, direction)}
                disabled={disabled}
                isFirst={index === 0}
                isLast={index === gridItems.length - 1}
              />
            ) : (
              <div
                key={`empty-${index}`}
                className="flex aspect-square flex-col justify-between bg-[#0b0e0c] p-2 text-white/25"
              >
                <span className="text-[10px] font-semibold">{index + 1}</span>
                <span className="text-[9px] leading-tight">
                  Awaiting
                  <br />
                  concept
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="px-4 py-2.5 text-[10px] text-white/34">
        {storyboard?.image_url
          ? "Concept Grid is one planning storyboard in Instagram display order. Open the structured Feed concepts above for item-level detail."
          : "Instagram Profile Preview: newest-to-oldest. Arrows move the concept visually left or right while preserving one chronological Publishing Order."}
      </p>
    </div>
  );
}

function InstagramPlanningTile({
  item,
  onOpen,
  onMove,
  disabled,
  isFirst,
  isLast,
}: {
  item: PlanItem;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const config = pillarConfig(item.pillar);
  const method =
    METHODS.find((entry) => entry.value === item.production_method)?.label ??
    "Other";
  return (
    <article className="group relative aspect-square overflow-hidden bg-[#101512]">
      <button
        type="button"
        onClick={onOpen}
        className={`absolute inset-0 p-2 text-left transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${config.tone}`}
        aria-label={`Open concept ${item.position}: ${item.subject || "Untitled concept"}`}
      >
        <span className="absolute left-2 top-1.5 text-[9px] font-semibold opacity-70">
          {item.position}
        </span>
        <div className="flex h-full flex-col justify-end">
          <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-white">
            {item.subject || "Untitled concept"}
          </p>
          <span className="mt-1 truncate text-[8px] font-semibold uppercase tracking-wide text-white/60">
            {method}
          </span>
          {item.production_feasibility && (
            <span className="mt-1 line-clamp-1 text-[8px] font-semibold leading-tight text-white/70">
              {item.production_feasibility.label}
            </span>
          )}
        </div>
      </button>
      <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          disabled={disabled || isFirst}
          onClick={(event) => {
            event.stopPropagation();
            onMove(1);
          }}
          aria-label={`Move concept ${item.position} visually left (newer)`}
          className="grid h-5 w-5 place-items-center rounded border border-white/20 bg-black/60 text-[10px] text-white disabled:opacity-30"
        >
          ←
        </button>
        <button
          type="button"
          disabled={disabled || isLast}
          onClick={(event) => {
            event.stopPropagation();
            onMove(-1);
          }}
          aria-label={`Move concept ${item.position} visually right (older)`}
          className="grid h-5 w-5 place-items-center rounded border border-white/20 bg-black/60 text-[10px] text-white disabled:opacity-30"
        >
          →
        </button>
      </div>
    </article>
  );
}

function RhythmSummary({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/38">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-white/38">{detail}</p>
    </div>
  );
}

function ItemDrawer({
  item,
  setItem,
  activations,
  onClose,
  onSave,
  onDelete,
  onRegenerate,
  saving,
}: {
  item: PlanItem;
  setItem: (item: PlanItem) => void;
  activations: Array<{ id: string; name: string; temporal_status: string }>;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onRegenerate?: (correction: string) => void;
  saving: boolean;
}) {
  const update = <K extends keyof PlanItem>(key: K, value: PlanItem[K]) =>
    setItem({ ...item, [key]: value });
  const [correction, setCorrection] = useState("");
  const planning =
    item.metadata &&
    typeof item.metadata.planning_ai === "object" &&
    item.metadata.planning_ai !== null &&
    !Array.isArray(item.metadata.planning_ai)
      ? (item.metadata.planning_ai as Record<string, unknown>)
      : {};
  const supportingIds =
    item.supporting_product_asset_ids ??
    (Array.isArray(planning.supporting_product_asset_ids)
      ? planning.supporting_product_asset_ids.filter(
          (value): value is string => typeof value === "string",
        )
      : []);
  const sceneRequiresProducts =
    item.scene_requires_visible_products ??
    planning.scene_requires_visible_products === true;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/70 backdrop-blur-sm">
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#080c09] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="jarvis-eyebrow">Feed Concept {item.position}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {item.id ? "Edit concept" : "Add concept"}
            </h3>
            {item.production_feasibility && (
              <p className="mt-2 text-xs text-white/50">
                {item.production_feasibility.label}
                {item.production_feasibility.reasons[0]
                  ? `: ${item.production_feasibility.reasons[0]}`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-white/55 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-white/48">
              Proposed Date
            </span>
            <input
              type="date"
              value={item.planned_date ?? ""}
              onChange={(event) =>
                update("planned_date", event.target.value || null)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <label className="mt-7 flex items-center gap-2 text-xs text-white/58">
            <input
              type="checkbox"
              checked={item.date_fixed}
              onChange={(event) => update("date_fixed", event.target.checked)}
            />{" "}
            Fixed date
          </label>
          <SelectField
            label="Content Pillar"
            value={item.pillar}
            options={PILLARS.map(({ value, label }) => ({ value, label }))}
            onChange={(value) => update("pillar", value)}
          />
          <SelectField
            label="Production Method"
            value={item.production_method}
            options={METHODS}
            onChange={(value) => update("production_method", value)}
          />
          <Field
            label="Objective"
            value={item.objective}
            onChange={(value) => update("objective", value)}
          />
          <Field
            label="Subject"
            value={item.subject}
            onChange={(value) => update("subject", value)}
          />
          <Field
            label="Creative Concept"
            value={item.creative_concept}
            onChange={(value) => update("creative_concept", value)}
            multiline
          />
          <Field
            label="Required Assets / Types (one per line)"
            value={item.required_assets.join("\n")}
            onChange={(value) =>
              update(
                "required_assets",
                value
                  .split("\n")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              )
            }
            multiline
          />
          <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="flex items-center gap-2 text-xs font-medium text-white/70">
              <input
                type="checkbox"
                checked={sceneRequiresProducts}
                onChange={(event) =>
                  update(
                    "scene_requires_visible_products",
                    event.target.checked,
                  )
                }
              />{" "}
              Identifiable food or drinks are visible in this scene
            </label>
            {sceneRequiresProducts && (
              <Field
                label="Supporting Food / Drink Truth Asset IDs (up to three, one per line)"
                value={supportingIds.join("\n")}
                onChange={(value) =>
                  setItem({
                    ...item,
                    scene_requires_visible_products: true,
                    supporting_product_asset_ids: value
                      .split("\n")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                      .slice(0, 3),
                  })
                }
                placeholder="Select approved exact Food or Drink Truth only."
                multiline
              />
            )}
          </div>
          <Field
            label="Missing Asset"
            value={item.missing_asset_note}
            onChange={(value) => update("missing_asset_note", value)}
            placeholder="Flag a missing truth asset instead of inventing it."
            multiline
          />
          <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-white/60">
                  Visual Direction
                </p>
                <p className="mt-1 text-xs text-white/38">
                  Controlled art direction for this production concept. Save
                  explicitly to apply a manual change.
                </p>
              </div>
              <span className="text-[10px] font-semibold text-white/38">
                Master: 4:5 · Grid composition:{" "}
                {item.grid_crop_behavior.replaceAll("_", "-")}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Shot Scale"
                value={item.shot_scale}
                options={VISUAL_SHOT_SCALES}
                onChange={(value) => update("shot_scale", value)}
              />
              <SelectField
                label="Camera Angle"
                value={item.camera_angle}
                options={VISUAL_CAMERA_ANGLES}
                onChange={(value) => update("camera_angle", value)}
              />
              <SelectField
                label="Composition"
                value={item.composition}
                options={VISUAL_COMPOSITIONS}
                onChange={(value) => update("composition", value)}
              />
              <SelectField
                label="Human Presence"
                value={item.human_presence}
                options={VISUAL_HUMAN_PRESENCE}
                onChange={(value) => update("human_presence", value)}
              />
              <SelectField
                label="Interaction"
                value={item.interaction}
                options={VISUAL_INTERACTIONS}
                onChange={(value) => update("interaction", value)}
              />
              <SelectField
                label="Motion"
                value={item.motion}
                options={VISUAL_MOTIONS}
                onChange={(value) => update("motion", value)}
              />
              <SelectField
                label="Grid Composition"
                value={item.grid_crop_behavior}
                options={VISUAL_GRID_CROPS}
                onChange={(value) => update("grid_crop_behavior", value)}
              />
            </div>
          </div>
          <Field
            label="Visual Direction"
            value={item.visual_direction}
            onChange={(value) => update("visual_direction", value)}
            multiline
          />
          <SelectField
            label="Grid Role"
            value={item.grid_role}
            options={GRID_ROLES}
            onChange={(value) => update("grid_role", value)}
          />
          <label className="block">
            <span className="text-[11px] font-semibold text-white/48">
              Activation / Campaign
            </span>
            <select
              value={item.activation_record_id ?? ""}
              onChange={(event) =>
                update("activation_record_id", event.target.value || null)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
            >
              <option value="">No linked activation</option>
              {activations.map((activation) => (
                <option key={activation.id} value={activation.id}>
                  {activation.name}
                  {activation.temporal_status !== "current"
                    ? ` · ${activation.temporal_status}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Commercial Rationale"
            value={item.commercial_rationale}
            onChange={(value) => update("commercial_rationale", value)}
            multiline
          />
          <Field
            label="Caption Angle / Brief"
            value={item.caption_brief}
            onChange={(value) => update("caption_brief", value)}
            multiline
          />
          <SelectField
            label="Status"
            value={item.status}
            options={[
              { value: "draft", label: "Draft" },
              { value: "ready", label: "Ready" },
              { value: "approved_for_plan", label: "Approved for Plan" },
              { value: "blocked", label: "Blocked" },
            ]}
            onChange={(value) => update("status", value)}
          />
        </div>
        {onRegenerate && (
          <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-300/[0.05] p-4">
            <Field
              label="Correction / Direction (optional)"
              value={correction}
              onChange={setCorrection}
              placeholder="e.g. make this a lighter editorial break"
              multiline
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => onRegenerate(correction)}
              className="mt-3 rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-50 disabled:opacity-40"
            >
              Regenerate Concept
            </button>
          </div>
        )}
        <div className="sticky bottom-0 mt-7 flex flex-wrap justify-between gap-3 border-t border-white/10 bg-[#080c09] pt-5">
          <div>
            {onDelete && (
              <button
                type="button"
                disabled={saving}
                onClick={onDelete}
                className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-2.5 text-sm font-semibold text-red-100"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/65"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

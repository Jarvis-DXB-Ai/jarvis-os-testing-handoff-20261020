import "server-only";

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core";
import { loadClientIndexAttentionBase } from "@/lib/home-dashboard-server";
import { measureServerLoader } from "@/lib/server-performance";

type Row = Record<string, unknown>;
type SignalTone = "good" | "warning" | "danger" | "neutral" | "unknown";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const currentStatuses = new Set(["approved", "current", "active"]);

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function monthLabel(value: string) {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return null;
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Dubai",
      }).format(date);
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Dubai",
      }).format(date);
}

function sourceLabel(source: Record<string, unknown>) {
  return (
    (
      {
        agent_runtime: "Agent run",
        client_brain: "Brain",
        social_intelligence: "Social",
      } as Record<string, string>
    )[text(source.system)] ?? "Jarvis"
  );
}

export type ClientIndexSignal = {
  label: "Planner" | "Awaiting review" | "Brain" | "Social data";
  value: string;
  detail: string;
  tone: SignalTone;
};
export type ClientIndexAttention = {
  id: string;
  title: string;
  detail: string;
  source: string;
  href: string;
  tone: "warning" | "danger";
};
export type ClientIndexClient = {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  logoUrl: string | null;
  lastActivity: string | null;
  signals: ClientIndexSignal[];
  attention: ClientIndexAttention[];
};
export type ClientIndexData = {
  generatedAt: string;
  active: ClientIndexClient[];
  inactive: ClientIndexClient[];
  reviewTotal: number;
  reviewClientCount: number;
};

/**
 * A bounded list read model for the client-management surface. Every record is
 * queried once and grouped by client_id; no per-client overview fan-out is used.
 */
export async function loadClientIndexData(): Promise<ClientIndexData> {
  return measureServerLoader("client-index", 11, async () => {
    const base = await loadClientIndexAttentionBase();
    const clientIds = base.clients.map((client) => client.id);
    if (!clientIds.length)
      return {
        generatedAt: new Date().toISOString(),
        active: [],
        inactive: [],
        reviewTotal: 0,
        reviewClientCount: 0,
      };

    const [
      plansResult,
      contentResult,
      brainResult,
      snapshotsResult,
      activityResult,
    ] = await Promise.all([
      db
        .from("social_monthly_content_plans")
        .select("client_id,plan_month,status,approved_at,created_at")
        .in("client_id", clientIds)
        .order("plan_month", { ascending: false })
        .limit(1_000),
      db
        .from("social_content_items")
        .select("client_id,status")
        .in("client_id", clientIds)
        .limit(5_000),
      db
        .from("client_brain_v2_records")
        .select("client_id,status")
        .in("client_id", clientIds)
        .neq("status", "archived")
        .limit(5_000),
      db
        .from("social_performance_snapshots")
        .select("client_id,synced_at")
        .in("client_id", clientIds)
        .order("synced_at", { ascending: false })
        .limit(2_000),
      db
        .from("social_monthly_plan_activity")
        .select("client_id,created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(2_000),
    ]);
    const failure = [
      plansResult,
      contentResult,
      brainResult,
      snapshotsResult,
      activityResult,
    ].find((result) => result.error);
    if (failure?.error)
      throw new Error("The client index could not be loaded.");

    const plansByClient = new Map<string, Row>();
    for (const row of (plansResult.data ?? []) as Row[]) {
      const clientId = text(row.client_id);
      if (clientId && !plansByClient.has(clientId))
        plansByClient.set(clientId, row);
    }
    const contentCountByClient = new Map<string, number>();
    const reviewsByClient = new Map<string, number>();
    for (const row of (contentResult.data ?? []) as Row[]) {
      const clientId = text(row.client_id);
      if (!clientId) continue;
      contentCountByClient.set(
        clientId,
        (contentCountByClient.get(clientId) ?? 0) + 1,
      );
      if (text(row.status) === "Ready for Review")
        reviewsByClient.set(clientId, (reviewsByClient.get(clientId) ?? 0) + 1);
    }
    const brainRowsByClient = new Map<string, Row[]>();
    for (const row of (brainResult.data ?? []) as Row[]) {
      const clientId = text(row.client_id);
      if (clientId)
        brainRowsByClient.set(clientId, [
          ...(brainRowsByClient.get(clientId) ?? []),
          row,
        ]);
    }
    const snapshotByClient = new Map<string, Row>();
    for (const row of (snapshotsResult.data ?? []) as Row[]) {
      const clientId = text(row.client_id);
      if (clientId && !snapshotByClient.has(clientId))
        snapshotByClient.set(clientId, row);
    }
    const activityByClient = new Map<string, Row>();
    for (const row of (activityResult.data ?? []) as Row[]) {
      const clientId = text(row.client_id);
      if (clientId && !activityByClient.has(clientId))
        activityByClient.set(clientId, row);
    }
    const attentionByClient = new Map<string, ClientIndexAttention[]>();
    for (const item of base.attention) {
      if (!item.clientId) continue;
      const tone = item.priority === "p1" ? "danger" : "warning";
      attentionByClient.set(item.clientId, [
        ...(attentionByClient.get(item.clientId) ?? []),
        {
          id: item.id,
          title: item.title,
          detail: item.detail,
          source: sourceLabel(record(item.source)),
          href: item.href,
          tone,
        },
      ]);
    }

    const clients = base.clients.map((client): ClientIndexClient => {
      const plan = plansByClient.get(client.id);
      const reviewCount = reviewsByClient.get(client.id) ?? 0;
      const contentCount = contentCountByClient.get(client.id) ?? 0;
      const brainRows = brainRowsByClient.get(client.id) ?? [];
      const currentBrainCount = brainRows.filter((row) =>
        currentStatuses.has(text(row.status)),
      ).length;
      const snapshot = snapshotByClient.get(client.id);
      const latestActivity = activityByClient.get(client.id);
      const planStatus = text(plan?.status);
      const planMonth = monthLabel(text(plan?.plan_month));
      const signals: ClientIndexSignal[] = [
        !plan
          ? {
              label: "Planner",
              value: "Not set up",
              detail: "No monthly plan is recorded.",
              tone: "unknown",
            }
          : {
              label: "Planner",
              value: titleCase(planStatus || "recorded"),
              detail: planMonth
                ? `Plan for ${planMonth}`
                : "Monthly plan record",
              tone:
                planStatus.toLowerCase() === "approved" ? "good" : "warning",
            },
        contentCount === 0 && !plan
          ? {
              label: "Awaiting review",
              value: "Not set up",
              detail: "No social workflow is recorded.",
              tone: "unknown",
            }
          : reviewCount === 0
            ? {
                label: "Awaiting review",
                value: "None",
                detail: "No content is awaiting review.",
                tone: "neutral",
              }
            : {
                label: "Awaiting review",
                value: `${reviewCount} item${reviewCount === 1 ? "" : "s"}`,
                detail: "Ready for a human decision.",
                tone: "warning",
              },
        brainRows.length === 0
          ? {
              label: "Brain",
              value: "Not set up",
              detail: "No Client Brain records are available.",
              tone: "unknown",
            }
          : currentBrainCount === 0
            ? {
                label: "Brain",
                value: "No current records",
                detail: `${brainRows.length} historical record${brainRows.length === 1 ? "" : "s"}`,
                tone: "warning",
              }
            : {
                label: "Brain",
                value: `${currentBrainCount} current record${currentBrainCount === 1 ? "" : "s"}`,
                detail: "Current or approved Client Brain truth.",
                tone: "good",
              },
        !snapshot
          ? {
              label: "Social data",
              value: "No cached data",
              detail: "No cached performance snapshot.",
              tone: "unknown",
            }
          : {
              label: "Social data",
              value: shortDate(text(snapshot.synced_at))
                ? `Cached ${shortDate(text(snapshot.synced_at))}`
                : "Cached snapshot",
              detail: "Platform-native metrics remain in Social.",
              tone: "neutral",
            },
      ];
      return {
        id: client.id,
        name: client.name,
        industry: client.industry,
        status: client.status,
        logoUrl: base.logoUrls.get(client.id) ?? null,
        lastActivity: shortDate(text(latestActivity?.created_at)),
        signals,
        attention: attentionByClient.get(client.id) ?? [],
      };
    });
    const active = clients.filter(
      (client) => client.status.toLowerCase() !== "inactive",
    );
    const inactive = clients.filter(
      (client) => client.status.toLowerCase() === "inactive",
    );
    const reviewCounts = active
      .map(
        (client) =>
          client.signals.find((signal) => signal.label === "Awaiting review")
            ?.value ?? "",
      )
      .map((value) => Number(value.match(/^\d+/)?.[0] ?? 0));
    return {
      generatedAt: new Date().toISOString(),
      active,
      inactive,
      reviewTotal: reviewCounts.reduce((total, count) => total + count, 0),
      reviewClientCount: reviewCounts.filter((count) => count > 0).length,
    };
  });
}

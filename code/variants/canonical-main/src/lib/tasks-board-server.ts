import "server-only";

import { loadTaskSuggestions } from "@/lib/home-dashboard-server";
import type { HomeTask, HomeTaskStatus } from "@/lib/home-dashboard";
import {
  clientBrainV2ServerClient as db,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import { measureServerLoader } from "@/lib/server-performance";
import {
  isTaskBoardStatus,
  type TaskBoardLink,
  type TaskBoardTask,
  type TasksBoardData,
} from "@/lib/tasks-board";

type Row = Record<string, unknown>;
const TASK_COLUMNS =
  "id,title,description,status,priority,due_at,completed_at,reviewed_at,archived_at,client_id,linked_object_type,linked_object_id,origin,source,evidence,source_evidence_hash,dedupe_identity,manual_order,created_at,updated_at";
const ARCHIVED_LIMIT = 60;

export class TasksBoardError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const taskStatus = (value: unknown): HomeTaskStatus =>
  isTaskBoardStatus(value) ? value : "not_started";
const priority = (value: unknown): HomeTask["priority"] =>
  value === "p1" || value === "p2" || value === "p3" ? value : "p3";

function valueSummary(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): string | null {
  if (depth > 3) return null;
  if (typeof value === "string") return value.trim().slice(0, 240) || null;
  if (Array.isArray(value))
    return (
      value
        .map((item) => valueSummary(item, depth + 1, seen))
        .find((item): item is string => Boolean(item)) ?? null
    );
  const source = record(value);
  if (!Object.keys(source).length || seen.has(source)) return null;
  seen.add(source);
  for (const key of [
    "summary",
    "recommendation",
    "diagnostic",
    "blockerReason",
    "title",
    "message",
    "detail",
  ]) {
    const result = valueSummary(source[key], depth + 1, seen);
    if (result) return result;
  }
  return null;
}

function sourceLabel(source: Row) {
  const system = text(source.system);
  return (
    (
      {
        finance: "Finance",
        client_brain: "Client Brain",
        agent_runtime: "Agent runtime",
        social_intelligence: "Social Intelligence",
        roadmap: "Roadmap",
        home: "Jarvis",
      } as Record<string, string>
    )[system] ?? "Jarvis"
  );
}

function linkedObject(
  task: Pick<
    HomeTask,
    | "client_id"
    | "linked_object_type"
    | "linked_object_id"
    | "source"
    | "evidence"
  >,
): TaskBoardLink | null {
  const type = task.linked_object_type;
  const id = task.linked_object_id;
  const evidence = valueSummary(task.evidence);
  if (type === "agent_run" && id)
    return {
      type: "Agent run",
      label: "Agent Runtime",
      href: "/agents?view=runs",
      evidence,
    };
  if (
    (type === "client_brain_record" || type === "brain_update_proposal") &&
    id &&
    task.client_id
  )
    return {
      type:
        type === "brain_update_proposal" ? "Brain proposal" : "Client Brain",
      label: "Client Brain",
      href: `/clients/${task.client_id}/brain`,
      evidence,
    };
  if (type === "roadmap_item" && id)
    return {
      type: "Roadmap item",
      label: "Roadmap",
      href: "/roadmap",
      evidence,
    };
  if (type === "social_intelligence_artifact" && id && task.client_id)
    return {
      type: "Social Intelligence",
      label: "Social Intelligence",
      href: `/clients/${task.client_id}/social`,
      evidence,
    };
  if (text(task.source.system) === "finance")
    return {
      type: "Finance signal",
      label: sourceLabel(task.source),
      href: null,
      evidence,
    };
  return evidence
    ? {
        type: sourceLabel(task.source),
        label: sourceLabel(task.source),
        href: null,
        evidence,
      }
    : null;
}

function mapTask(row: Row, clientNames: Map<string, string>): TaskBoardTask {
  const clientId = text(row.client_id) || null;
  const source = record(row.source);
  const evidence = record(row.evidence);
  const task: HomeTask = {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description) || null,
    status: taskStatus(row.status),
    priority: priority(row.priority),
    due_at: text(row.due_at) || null,
    completed_at: text(row.completed_at) || null,
    reviewed_at: text(row.reviewed_at) || null,
    archived_at: text(row.archived_at) || null,
    client_id: clientId,
    client_name: clientId ? (clientNames.get(clientId) ?? null) : null,
    linked_object_type: text(row.linked_object_type) || null,
    linked_object_id: text(row.linked_object_id) || null,
    origin: row.origin === "suggested" ? "suggested" : "manual",
    source,
    evidence,
    source_evidence_hash: text(row.source_evidence_hash) || null,
    dedupe_identity: text(row.dedupe_identity) || null,
    manual_order: Number(row.manual_order ?? 0),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
  return { ...task, linkedObject: linkedObject(task) };
}

export async function loadTasksBoardData(): Promise<TasksBoardData> {
  return measureServerLoader("tasks.board", 12, async () => {
    const [clientsResult, activeResult, archivedResult] = await Promise.all([
      db
        .from("clients")
        .select("id,name")
        .neq("status", "archived")
        .order("name")
        .limit(200),
      db
        .from("jarvis_tasks")
        .select(TASK_COLUMNS)
        .neq("status", "archived")
        .order("manual_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(400),
      db
        .from("jarvis_tasks")
        .select(TASK_COLUMNS)
        .eq("status", "archived")
        .order("archived_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(ARCHIVED_LIMIT),
    ]);
    const failure = [clientsResult, activeResult, archivedResult].find(
      (result) => result.error,
    );
    if (failure?.error)
      throw new TasksBoardError("The Tasks board could not be loaded.", 503);
    const clients = (clientsResult.data ?? [])
      .map((client) => ({ id: text(client.id), name: text(client.name) }))
      .filter((client) => client.id && client.name);
    const clientNames = new Map(
      clients.map((client) => [client.id, client.name]),
    );
    const tasks = [
      ...(activeResult.data ?? []),
      ...(archivedResult.data ?? []),
    ].map((row) => mapTask(row as Row, clientNames));
    const suggestions = await loadTaskSuggestions(clients, tasks);
    return {
      generatedAt: new Date().toISOString(),
      tasks,
      clients,
      suggestions,
      archivedLimit: ARCHIVED_LIMIT,
    };
  });
}

export async function reorderTasks(input: Record<string, unknown>) {
  const status = input.status;
  const expectedTaskIds = Array.isArray(input.expectedTaskIds)
    ? input.expectedTaskIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const orderedTaskIds = Array.isArray(input.orderedTaskIds)
    ? input.orderedTaskIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  if (!isTaskBoardStatus(status))
    throw new TasksBoardError("Task column is invalid.");
  if (
    !expectedTaskIds.length ||
    expectedTaskIds.length !== orderedTaskIds.length ||
    expectedTaskIds.length > 200 ||
    !expectedTaskIds.every(isUuid) ||
    !orderedTaskIds.every(isUuid)
  )
    throw new TasksBoardError("Task reorder request is invalid.");
  if (
    new Set(expectedTaskIds).size !== expectedTaskIds.length ||
    new Set(orderedTaskIds).size !== orderedTaskIds.length ||
    expectedTaskIds.some((id) => !orderedTaskIds.includes(id))
  )
    throw new TasksBoardError(
      "Task reorder request does not match the column.",
    );
  const result = await db.rpc("reorder_jarvis_tasks", {
    p_status: status,
    p_expected_task_ids: expectedTaskIds,
    p_ordered_task_ids: orderedTaskIds,
  });
  if (result.error) {
    if (
      ["TASK_REORDER_CONFLICT", "TASK_REORDER_COLUMN_MISMATCH"].some((code) =>
        result.error.message.includes(code),
      )
    )
      throw new TasksBoardError(
        "This column changed elsewhere. Refresh Tasks and try again.",
        409,
      );
    throw new TasksBoardError("Task order could not be saved.", 500);
  }
  return result.data ?? [];
}

export function tasksBoardErrorResponse(error: unknown) {
  const known =
    error instanceof TasksBoardError
      ? error
      : new TasksBoardError("Tasks request failed.", 500);
  return { message: known.message, status: known.status };
}

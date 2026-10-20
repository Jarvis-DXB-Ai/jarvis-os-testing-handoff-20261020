import type { HomeSuggestion, HomeTask, HomeTaskAction, HomeTaskStatus } from "@/lib/home-dashboard"

export const TASK_BOARD_STATUSES = ["not_started", "in_progress", "completed", "reviewed", "archived"] as const
export type TaskBoardStatus = (typeof TASK_BOARD_STATUSES)[number]

export type TaskBoardClient = { id: string; name: string }
export type TaskBoardLink = { type: string; label: string; href: string | null; evidence: string | null }
export type TaskBoardTask = HomeTask & { linkedObject: TaskBoardLink | null }
export type TasksBoardData = {
  generatedAt: string
  tasks: TaskBoardTask[]
  clients: TaskBoardClient[]
  suggestions: HomeSuggestion[]
  archivedLimit: number
}

export const TASK_STATUS_LABEL: Record<TaskBoardStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  reviewed: "Reviewed",
  archived: "Archived",
}

export const TASK_TRANSITIONS: Record<HomeTaskStatus, readonly TaskBoardStatus[]> = {
  not_started: ["not_started", "in_progress", "completed", "archived"],
  in_progress: ["in_progress", "completed", "archived"],
  completed: ["completed", "reviewed", "archived"],
  reviewed: ["reviewed", "archived"],
  archived: ["archived"],
}

export function transitionAction(from: HomeTaskStatus, to: TaskBoardStatus): "start" | "complete" | "review" | "archive" | null {
  if (from === to) return null
  if (!TASK_TRANSITIONS[from].includes(to)) return null
  if (to === "in_progress") return "start"
  if (to === "completed") return "complete"
  if (to === "reviewed") return "review"
  if (to === "archived") return "archive"
  return null
}

/**
 * A board column is a view of the existing lifecycle, not a browser-writable
 * status field. New tasks always begin through the canonical create flow and
 * this sequence describes the authorised transitions needed to reach a column.
 */
export function creationTransitionActions(target: TaskBoardStatus): readonly HomeTaskAction[] {
  if (target === "not_started") return []
  if (target === "in_progress") return ["start"]
  if (target === "completed") return ["complete"]
  if (target === "reviewed") return ["complete", "review"]
  return ["archive"]
}

/**
 * The server actions needed to drag a task from one board column to another.
 *
 * TASK_TRANSITIONS above describes the forward-only lifecycle the Tasks board
 * enforces. The Home dashboard lanes are the operator's own working board and
 * are deliberately free-moving in both directions, so this resolves a path to
 * `to` from any `from`, backwards included, using only authorised actions.
 *
 * One consequence worth knowing: the server refuses to review a task that was
 * never completed, so moving straight into "reviewed" records a completion
 * first. The completed_at stamp is therefore the moment of the drag.
 */
export function moveTransitionActions(from: HomeTaskStatus, to: TaskBoardStatus): readonly HomeTaskAction[] {
  if (from === to) return []
  if (to === "not_started") return ["reopen"]
  if (to === "in_progress") return ["start"]
  if (to === "completed") return ["complete"]
  if (to === "reviewed") return from === "completed" ? ["review"] : ["complete", "review"]
  return ["archive"]
}

export function reorderIds(ids: string[], movingId: string, beforeId: string | null) {
  const withoutMoving = ids.filter((id) => id !== movingId)
  if (!withoutMoving.includes(beforeId ?? "")) return [...withoutMoving, movingId]
  const index = withoutMoving.indexOf(beforeId as string)
  return [...withoutMoving.slice(0, index), movingId, ...withoutMoving.slice(index)]
}

export function isTaskBoardStatus(value: unknown): value is TaskBoardStatus {
  return typeof value === "string" && TASK_BOARD_STATUSES.includes(value as TaskBoardStatus)
}

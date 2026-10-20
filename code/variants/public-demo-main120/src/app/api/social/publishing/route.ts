import { NextResponse } from "next/server"
import {
  autoAssignStories,
  analyzeContentUnderstandingVision,
  autoScheduleFeed,
  addItemToPlanner,
  addReadyFeedToPlanner,
  addStoriesToPlanner,
  applyStoryWeekToMonth,
  assignStoryToSlot,
  createStorySlot,
  deleteStorySlot,
  ensurePublishingMonth,
  listPublishingMonths,
  loadPublishingWorkspace,
  mergeFeedItemsToCarousel,
  recordCaptionQualityReview,
  prepareContentUnderstandingBatchFixture,
  prepareContentUnderstandingFixture,
  generateOfflineCaptionOptions,
  generateLiveCaptionOptions,
  reorderFeedContent,
  removePlannerEntry,
  syncPlannerEntry,
  updatePlannerPlatforms,
  updatePlannerSchedule,
} from "@/lib/social-publishing-server"

export const runtime = "nodejs"

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(text(value), 10)
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Social Publishing request failed."
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const clientId = url.searchParams.get("client_id") ?? ""
  const monthStart = url.searchParams.get("month_start") ?? ""
  try {
    if (url.searchParams.get("list_months") === "1") {
      const months = await listPublishingMonths(clientId)
      return NextResponse.json({ ok: true, months })
    }
    const workspace = await loadPublishingWorkspace(clientId, monthStart)
    return NextResponse.json({ ok: true, workspace })
  } catch (error) {
    return responseError(error)
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 })
  const clientId = text(body.clientId)
  const monthStart = text(body.monthStart)
  const action = text(body.action)
  try {
    if (action === "create_month") {
      const month = await ensurePublishingMonth(clientId, monthStart, { timezone: text(body.timezone) })
      return NextResponse.json({ ok: true, month })
    }
    if (action === "reorder_feed") {
      const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.filter((id): id is string => typeof id === "string") : []
      await reorderFeedContent(clientId, monthStart, orderedIds)
      return NextResponse.json({ ok: true })
    }
    if (action === "auto_schedule_feed") {
      await autoScheduleFeed(clientId, monthStart, text(body.feedStartDate), integer(body.feedIntervalDays))
      return NextResponse.json({ ok: true })
    }
    if (action === "create_story_slot") {
      await createStorySlot(clientId, { weekday: integer(body.weekday), localTime: text(body.localTime), label: text(body.label) })
      return NextResponse.json({ ok: true })
    }
    if (action === "auto_assign_stories") {
      await autoAssignStories(clientId, monthStart)
      return NextResponse.json({ ok: true })
    }
    if (action === "assign_story_slot") {
      await assignStoryToSlot(clientId, text(body.itemId), text(body.slotId) || null)
      return NextResponse.json({ ok: true })
    }
    if (action === "delete_story_slot") {
      await deleteStorySlot(clientId, text(body.slotId))
      return NextResponse.json({ ok: true })
    }
    if (action === "apply_story_week") {
      const count = await applyStoryWeekToMonth(clientId, monthStart)
      return NextResponse.json({ ok: true, count })
    }
    if (action === "add_stories_to_planner") {
      await addStoriesToPlanner(clientId, monthStart)
      return NextResponse.json({ ok: true })
    }
    if (action === "add_ready_feed_to_planner") {
      const result = await addReadyFeedToPlanner(clientId, monthStart)
      return NextResponse.json({ ok: true, ...result })
    }
    if (action === "add_item_to_planner") {
      await addItemToPlanner(clientId, text(body.contentItemId))
      return NextResponse.json({ ok: true })
    }
    if (action === "update_planner_schedule") {
      await updatePlannerSchedule(clientId, { contentItemId: text(body.contentItemId), storyPlacementId: text(body.storyPlacementId) || null, scheduledDate: body.scheduledDate, scheduledTime: body.scheduledTime })
      return NextResponse.json({ ok: true })
    }
    if (action === "update_planner_platforms") {
      await updatePlannerPlatforms(clientId, { contentItemId: text(body.contentItemId), platforms: body.platforms })
      return NextResponse.json({ ok: true })
    }
    if (action === "sync_planner_entry") {
      await syncPlannerEntry(clientId, { contentItemId: text(body.contentItemId), storyPlacementId: text(body.storyPlacementId) || null })
      return NextResponse.json({ ok: true })
    }
    if (action === "remove_planner_entry") {
      await removePlannerEntry(clientId, { contentItemId: text(body.contentItemId), storyPlacementId: text(body.storyPlacementId) || null })
      return NextResponse.json({ ok: true })
    }
    if (action === "merge_feed_carousel") {
      const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.filter((id): id is string => typeof id === "string") : []
      await mergeFeedItemsToCarousel(clientId, monthStart, orderedIds)
      return NextResponse.json({ ok: true })
    }
    if (action === "generate_offline_captions") {
      await generateOfflineCaptionOptions(clientId, text(body.itemId))
      return NextResponse.json({ ok: true })
    }
    if (action === "prepare_content_understanding_fixture") {
      const result = await prepareContentUnderstandingFixture(clientId, text(body.itemId))
      return NextResponse.json({ ok: true, result })
    }
    if (action === "analyze_content_understanding_vision") {
      const result = await analyzeContentUnderstandingVision(clientId, text(body.itemId))
      return NextResponse.json({ ok: true, result })
    }
    if (action === "prepare_content_understanding_batch_fixture") {
      const result = await prepareContentUnderstandingBatchFixture(clientId, monthStart)
      return NextResponse.json({ ok: true, result })
    }
    if (action === "generate_live_captions") {
      const generationId = await generateLiveCaptionOptions(clientId, text(body.itemId))
      return NextResponse.json({ ok: true, generationId })
    }
    if (action === "refresh_captions") {
      const generationId = await generateLiveCaptionOptions(clientId, text(body.itemId), { refresh: true })
      return NextResponse.json({ ok: true, generationId })
    }
    if (action === "record_caption_quality_review") {
      await recordCaptionQualityReview(clientId, text(body.itemId), body.review && typeof body.review === "object" ? body.review as Record<string, unknown> : {})
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: "Unsupported Social Publishing action." }, { status: 400 })
  } catch (error) {
    return responseError(error)
  }
}

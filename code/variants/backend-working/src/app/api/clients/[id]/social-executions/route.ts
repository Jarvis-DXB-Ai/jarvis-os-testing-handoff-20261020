import { NextResponse } from "next/server"
import { dispatchAuthorizedSocialExecutionBatch, dispatchReservedSocialExecution, preflightSocialExecutionBatch, recoverSocialExecution, reserveSocialExecution } from "@/lib/social-provider-execution-server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const monthStart = new URL(request.url).searchParams.get("month_start") ?? ""
  try { return NextResponse.json({ ok: true, preflight: await preflightSocialExecutionBatch({ clientId, monthStart }) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to preflight Social scheduling." }, { status: 400 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 })
  try {
    const action = body.action
    if (action === "reserve") {
      const itemId = typeof body.itemId === "string" ? body.itemId : ""
      const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : ""
      const platforms = Array.isArray(body.platforms) && body.platforms.every(value => value === "instagram" || value === "facebook") ? body.platforms as Array<"instagram" | "facebook"> : undefined
      return NextResponse.json({ ok: true, execution: await reserveSocialExecution({ clientId, itemId, idempotencyKey, platforms }) })
    }
    if (action === "dispatch") {
      const executionId = typeof body.executionId === "string" ? body.executionId : ""
      // An explicit double-entry value prevents the browser from turning a
      // harmless refresh into an external scheduling request.
      if (body.confirmExecutionId !== executionId) return NextResponse.json({ ok: false, error: "Explicit execution confirmation is required." }, { status: 409 })
      return NextResponse.json({ ok: true, execution: await dispatchReservedSocialExecution({ clientId, executionId }) })
    }
    if (action === "recover") {
      const executionId = typeof body.executionId === "string" ? body.executionId : ""
      return NextResponse.json({ ok: true, execution: await recoverSocialExecution({ clientId, executionId }) })
    }
    if (action === "schedule_batch") {
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((value): value is string => typeof value === "string") : []
      const authorization = typeof body.authorization === "string" ? body.authorization : ""
      return NextResponse.json({ ok: true, results: await dispatchAuthorizedSocialExecutionBatch({ clientId, itemIds, authorization }) })
    }
    return NextResponse.json({ ok: false, error: "Unsupported execution action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Social execution failed." }, { status: 409 })
  }
}

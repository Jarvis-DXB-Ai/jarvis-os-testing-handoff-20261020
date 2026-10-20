import { NextRequest, NextResponse } from "next/server"
import { ToolRegistryError, updateTool } from "@/lib/tools-server"

export const runtime = "nodejs"

function failure(error: unknown) {
  const known = error instanceof ToolRegistryError ? error : new ToolRegistryError("Tool Registry request failed.", 500)
  return NextResponse.json({ error: known.message }, { status: known.status })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ toolId: string }> }) {
  try {
    const [{ toolId }, body] = await Promise.all([context.params, request.json()])
    if (!body || typeof body.expectedUpdatedAt !== "string" || !body.patch || typeof body.patch !== "object") throw new ToolRegistryError("Tool update request is invalid.")
    return NextResponse.json(await updateTool(toolId, body.expectedUpdatedAt, body.patch as Record<string, unknown>))
  } catch (error) { return failure(error) }
}


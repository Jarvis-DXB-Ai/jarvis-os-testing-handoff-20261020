import { NextRequest, NextResponse } from "next/server"
import { createTool, loadToolRegistrySnapshot, ToolRegistryError } from "@/lib/tools-server"

export const runtime = "nodejs"

function failure(error: unknown) {
  const known = error instanceof ToolRegistryError ? error : new ToolRegistryError("Tool Registry request failed.", 500)
  return NextResponse.json({ error: known.message }, { status: known.status })
}

export async function GET() { try { return NextResponse.json(await loadToolRegistrySnapshot()) } catch (error) { return failure(error) } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json(await createTool(body), { status: 201 })
  } catch (error) { return failure(error) }
}


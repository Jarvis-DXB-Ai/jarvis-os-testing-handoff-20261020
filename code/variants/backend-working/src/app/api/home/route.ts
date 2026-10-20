import { ownerForRequest } from "@/lib/owner-request-server";
import { NextResponse } from "next/server"

import { getHomeDashboardData, homeDashboardErrorResponse } from "@/lib/home-dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(request: Request) {
  const owner = await ownerForRequest(request);
  if (owner instanceof Response) return owner;
  try { return NextResponse.json(await getHomeDashboardData(owner.subject)) }
  catch (error) { const failure = homeDashboardErrorResponse(error); return NextResponse.json({ error: failure.message }, { status: failure.status }) }
}

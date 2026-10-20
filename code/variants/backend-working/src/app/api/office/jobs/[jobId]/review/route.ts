import { NextRequest, NextResponse } from "next/server";
import { officeTeamError, reviewOfficeTeamJob } from "@/lib/office-team-server";
import { requireInternalJarvisMutation } from "@/lib/internal-api-request";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { try { requireInternalJarvisMutation(request); const { jobId } = await params; const body = await request.json() as Record<string, unknown>; return NextResponse.json({ job: await reviewOfficeTeamJob(jobId, typeof body.note === "string" ? body.note : "") }); } catch (error) { const e = officeTeamError(error); return NextResponse.json({ error: e.message }, { status: e.status }); } }

import { NextRequest, NextResponse } from "next/server";
import { officeTeamError } from "@/lib/office-team-server";
import { dispatchOfficeTeamJob } from "@/lib/office-team-dispatch-server";
import { requireInternalJarvisMutation } from "@/lib/internal-api-request";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { try { requireInternalJarvisMutation(request); const { jobId } = await params; return NextResponse.json(await dispatchOfficeTeamJob(request, jobId)); } catch (error) { const e = officeTeamError(error); return NextResponse.json({ error: e.message }, { status: e.status }); } }

import { NextRequest, NextResponse } from "next/server";
import { isAgentRuntimeInternalRequest } from "@/lib/agent-runtime-dispatch-server";
import { executeOfficeTeamJob, officeTeamError } from "@/lib/office-team-server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!isAgentRuntimeInternalRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { jobId?: unknown };
    if (typeof body.jobId !== "string") return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    const job = await executeOfficeTeamJob(body.jobId);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) {
    const e = officeTeamError(error);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireInternalJarvisMutation } from "@/lib/internal-api-request";
import { cancelOfficeTeamJob, officeTeamError } from "@/lib/office-team-server";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireInternalJarvisMutation(request);
    const { jobId } = await params;
    return NextResponse.json({ job: await cancelOfficeTeamJob(jobId) });
  } catch (error) {
    const e = officeTeamError(error);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

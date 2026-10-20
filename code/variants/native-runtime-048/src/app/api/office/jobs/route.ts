import { after, NextRequest, NextResponse } from "next/server";
import { createOfficeTeamJob, loadOfficeTeamCatalog, markOfficeLocalDispatchFailure, officeTeamError } from "@/lib/office-team-server";
import { requireInternalJarvisMutation } from "@/lib/internal-api-request";
import { dispatchOfficeTeamJob } from "@/lib/office-team-dispatch-server";
export const runtime = "nodejs";
export const maxDuration = 900;
export async function GET() { try { return NextResponse.json(await loadOfficeTeamCatalog()); } catch (error) { const e = officeTeamError(error); return NextResponse.json({ error: e.message }, { status: e.status }); } }
export async function POST(request: NextRequest) {
  try {
    requireInternalJarvisMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const job = await createOfficeTeamJob(body);
    if (body.autoStart === true && job.status === "queued") {
      if (process.env.NODE_ENV === "production" && process.env.JARVIS_ISOLATED_TEST !== "1") {
        // Dispatch is quick and acknowledged before responding. The Workflow
        // takes over execution so the browser can close safely.
        await dispatchOfficeTeamJob(request, job.id);
      } else {
        after(async () => {
          try { await dispatchOfficeTeamJob(request, job.id); }
          catch (error) {
            console.error("Office local execution failed after enqueue:", error instanceof Error ? error.message : "Unknown failure");
            await markOfficeLocalDispatchFailure(job.id);
          }
        });
      }
    }
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    const e = officeTeamError(error);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

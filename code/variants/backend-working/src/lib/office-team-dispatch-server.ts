import "server-only";

import { executeOfficeTeamJob, OfficeTeamError } from "@/lib/office-team-server";

const INTERNAL_HEADER = "x-jarvis-agent-runtime-token";

/** The local preview executes directly; the deployed app hands ownership to a durable Workflow. */
export async function dispatchOfficeTeamJob(request: Request, jobId: string) {
  if (process.env.NODE_ENV !== "production" || process.env.JARVIS_ISOLATED_TEST === "1") {
    return { job: await executeOfficeTeamJob(jobId) };
  }
  const token = process.env.AGENT_RUNTIME_INTERNAL_TOKEN?.trim();
  const origin = process.env.JARVIS_RUNTIME_WORKER_ORIGIN?.trim();
  if (!token || !origin) throw new OfficeTeamError("Office Workflow dispatch is not configured.", 503);
  const response = await fetch(`${origin}/_jarvis/office/start`, {
    method: "POST", headers: { "content-type": "application/json", [INTERNAL_HEADER]: token },
    body: JSON.stringify({ jobId }), cache: "no-store",
  });
  if (!response.ok) throw new OfficeTeamError(`Office Workflow dispatch failed with HTTP ${response.status}.`, 502);
  return { accepted: true, jobId };
}

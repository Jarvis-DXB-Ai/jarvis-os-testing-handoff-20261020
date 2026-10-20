import { NextResponse } from "next/server";
import { clientBrainV2ErrorResponse } from "@/lib/client-brain-v2-server-core";
import { loadClientOverview } from "@/lib/client-overview-server";
import { serverTiming } from "@/lib/server-performance";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();
  try {
    const { id } = await params;
    return NextResponse.json(
      { ok: true, overview: await loadClientOverview(id, { includeMedia: new URL(request.url).searchParams.get("view") !== "summary" }) },
      {
        headers: {
          "Server-Timing": serverTiming(
            "client-overview",
            performance.now() - startedAt,
          ),
        },
      },
    );
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: response.message },
      {
        status: response.status,
        headers: {
          "Server-Timing": serverTiming(
            "client-overview",
            performance.now() - startedAt,
          ),
        },
      },
    );
  }
}

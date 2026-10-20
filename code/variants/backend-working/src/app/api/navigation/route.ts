import { NextResponse } from "next/server";

import { loadClientNavigation } from "@/lib/client-navigation-server";
import { serverTiming } from "@/lib/server-performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    const clients = await loadClientNavigation();
    return NextResponse.json(
      { clients },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
          "Server-Timing": serverTiming(
            "navigation",
            performance.now() - startedAt,
          ),
        },
      },
    );
  } catch {
    return NextResponse.json(
      { clients: [] },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": serverTiming(
            "navigation",
            performance.now() - startedAt,
          ),
        },
      },
    );
  }
}

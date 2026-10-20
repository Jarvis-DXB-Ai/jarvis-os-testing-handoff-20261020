import { NextRequest, NextResponse } from "next/server";

import {
  homeDashboardErrorResponse,
  markHomeNotificationsRead,
} from "@/lib/home-dashboard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "mark_read")
      return NextResponse.json({ error: "Notification action is invalid." }, { status: 400 });
    await markHomeNotificationsRead(body.sourceKeys);
    return NextResponse.json({ marked: true });
  } catch (error) {
    const failure = homeDashboardErrorResponse(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

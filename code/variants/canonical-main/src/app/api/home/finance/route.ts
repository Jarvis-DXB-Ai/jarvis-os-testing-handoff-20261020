import { NextRequest, NextResponse } from "next/server";

import {
  getHomeFinanceData,
  homeDashboardErrorResponse,
} from "@/lib/home-dashboard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") ?? undefined;
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      return NextResponse.json(
        { error: "Month must use YYYY-MM." },
        { status: 400 },
      );
    return NextResponse.json(await getHomeFinanceData(month));
  } catch (error) {
    const failure = homeDashboardErrorResponse(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

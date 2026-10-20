import { NextResponse } from "next/server";
import { loadPaperclipOfficeSnapshot } from "@/lib/office-paperclip-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await loadPaperclipOfficeSnapshot(), { headers: { "Cache-Control": "no-store" } });
}

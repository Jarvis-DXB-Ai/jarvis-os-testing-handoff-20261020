import { NextResponse } from "next/server";
import { isUuid } from "@/lib/client-brain-v2-server-core";
import { loadSocialWorkspaceInitial } from "@/lib/social-workspace-initial-server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid client ID." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await loadSocialWorkspaceInitial(id)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Social." }, { status: 500 });
  }
}

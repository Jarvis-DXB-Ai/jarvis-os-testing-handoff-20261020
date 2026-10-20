import { NextResponse } from "next/server";
import { ownerForRequest } from "@/lib/owner-request-server";
import { exportAiContentManualPrompt } from "@/lib/ai-content-studio";
import { clientBrainV2ErrorResponse } from "@/lib/client-brain-v2-server-core";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const owner = await ownerForRequest(request);
  if (owner instanceof Response) return owner;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Send a Studio brief." }, { status: 400, headers });
    const { id, sessionId } = await params;
    return NextResponse.json(await exportAiContentManualPrompt(id, sessionId, body), { headers });
  } catch (error) {
    const known = clientBrainV2ErrorResponse(error);
    return NextResponse.json({ error: known.message }, { status: known.status, headers });
  }
}

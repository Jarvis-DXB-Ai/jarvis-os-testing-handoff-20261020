import { NextResponse } from "next/server";
import { clientBrainV2ServerClient as db, ClientBrainV2HttpError, clientBrainV2ErrorResponse, isUuid, requireClientBrainV2 } from "@/lib/client-brain-v2-server-core";
import { ensureAssetDisplayPreview, DISPLAY_PREVIEW_MAX_BYTES } from "@/lib/asset-display-preview";

// Owner-only API boundary; file authority comes from this client's session assignment.
export async function GET(_request: Request, context: { params: Promise<{ id: string; sessionId: string; fileId: string }> }) {
  try {
    const { id, sessionId, fileId } = await context.params;
    if (![id, sessionId, fileId].every(isUuid)) throw new ClientBrainV2HttpError("Invalid preview request.", 400);
    await requireClientBrainV2(id);
    const session = await db.from("ai_content_sessions").select("id").eq("id", sessionId).eq("client_id", id).eq("status", "active").maybeSingle();
    if (session.error) throw session.error;
    if (!session.data) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    const [references, generations] = await Promise.all([
      db.from("ai_content_session_references").select("id").eq("client_id", id).eq("session_id", sessionId).eq("file_object_id", fileId).limit(1),
      db.from("ai_content_generations").select("id").eq("client_id", id).eq("session_id", sessionId).eq("file_object_id", fileId).limit(1),
    ]);
    if (references.error || generations.error) throw references.error || generations.error;
    if (!references.data?.length && !generations.data?.length) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    const file = await db.from("client_brain_file_objects").select("id,storage_bucket,storage_path,preview_path,optimized_path,file_type").eq("id", fileId).maybeSingle();
    if (file.error) throw file.error;
    const path = file.data ? await ensureAssetDisplayPreview(db, file.data) : null;
    if (!path || !file.data) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    const image = await db.storage.from(file.data.storage_bucket).download(path);
    if (image.error || !image.data || image.data.size > DISPLAY_PREVIEW_MAX_BYTES) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    return new Response(image.data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status, headers: { "Cache-Control": "private, no-store" } });
  }
}

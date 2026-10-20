import { NextResponse } from "next/server";
import { clientBrainV2ServerClient as db, ClientBrainV2HttpError, clientBrainV2ErrorResponse, isUuid, requireClientBrainV2 } from "@/lib/client-brain-v2-server-core";
import { ensureAssetDisplayPreview, DISPLAY_PREVIEW_MAX_BYTES } from "@/lib/asset-display-preview";

// Covered by the existing owner-only Worker API boundary. No public storage URL,
// arbitrary file ID or original-image fallback is exposed by this endpoint.
export async function GET(_request: Request, context: { params: Promise<{ id: string; planId: string; itemId: string }> }) {
  try {
    const { id, planId, itemId } = await context.params;
    if (![id, planId, itemId].every(isUuid)) throw new ClientBrainV2HttpError("Invalid preview request.", 400);
    await requireClientBrainV2(id);
    const item = await db.from("social_monthly_content_plan_items").select("id").eq("id", itemId).eq("client_id", id).eq("monthly_plan_id", planId).maybeSingle();
    if (item.error) throw item.error;
    if (!item.data) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    const selected = await db.from("social_monthly_plan_production_artifacts").select("file_object_id").eq("client_id", id).eq("monthly_plan_id", planId).eq("monthly_plan_item_id", itemId).eq("is_selected", true).in("status", ["generated", "selected"]).order("version", { ascending: false }).limit(1).maybeSingle();
    if (selected.error) throw selected.error;
    if (!selected.data?.file_object_id) throw new ClientBrainV2HttpError("Preview unavailable.", 404);
    const file = await db.from("client_brain_file_objects").select("id,storage_bucket,storage_path,preview_path,optimized_path,file_type").eq("id", selected.data.file_object_id).maybeSingle();
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

import { NextRequest, NextResponse } from "next/server";

import {
  approveFinalReviewManifest,
  attachFinalStudioAssetToLineage,
  createFinalReviewManifest,
  createPublishingDraftForLineage,
  handoffApprovedManifestToPublishing,
  listLineageAttachmentTargets,
  loadClientFinalReviewManifests,
} from "@/lib/content-lineage-phase2-server";
import {
  loadClientManifestPublishingLifecycles,
  prepareLineageExecution,
} from "@/lib/content-lineage-phase3-server";

export const runtime = "nodejs";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Content lineage action could not be completed.";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mode = request.nextUrl.searchParams.get("view");
    if (mode === "reviews") {
      const [manifests, publishingLifecycles] = await Promise.all([
        loadClientFinalReviewManifests(id),
        loadClientManifestPublishingLifecycles(id),
      ]);
      return NextResponse.json({ ok: true, manifests, publishingLifecycles });
    }
    return NextResponse.json({ ok: true, targets: await listLineageAttachmentTargets(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "attach_final_studio_asset") {
      return NextResponse.json({ ok: true, ...(await attachFinalStudioAssetToLineage({
        clientId: id,
        lineageItemId: String(body.lineageItemId ?? ""),
        finalContentItemId: String(body.finalContentItemId ?? ""),
        replace: body.replace === true,
      })) });
    }
    if (action === "prepare_publishing_draft") {
      return NextResponse.json({ ok: true, ...(await createPublishingDraftForLineage({ clientId: id, lineageItemId: String(body.lineageItemId ?? "") })) });
    }
    if (action === "create_final_review") {
      return NextResponse.json({ ok: true, ...(await createFinalReviewManifest(id, String(body.lineageItemId ?? ""))) });
    }
    if (action === "approve_final_review") {
      return NextResponse.json({ ok: true, ...(await approveFinalReviewManifest({ clientId: id, manifestId: String(body.manifestId ?? ""), reviewer: String(body.reviewer ?? "") })) });
    }
    if (action === "handoff_approved_manifest") {
      return NextResponse.json({ ok: true, ...(await handoffApprovedManifestToPublishing(id, String(body.manifestId ?? ""))) });
    }
    if (action === "prepare_lineage_dry_run") {
      return NextResponse.json({ ok: true, ...(await prepareLineageExecution({
        clientId: id,
        manifestId: String(body.manifestId ?? ""),
        manifestTargetId: String(body.manifestTargetId ?? ""),
        mode: "dry_run",
      })) });
    }
    return NextResponse.json({ ok: false, error: "Unsupported content lineage action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 400 });
  }
}

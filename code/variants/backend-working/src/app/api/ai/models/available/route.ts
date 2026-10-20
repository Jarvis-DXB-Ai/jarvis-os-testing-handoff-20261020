import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  buildAiPhotographyModelSummaries,
  type AiModelRelationship,
} from "@/lib/ai-photography-models"
import type { AiModel, AiModelAsset, AiModelOutfit } from "@/lib/ai-model-library"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id") ?? ""
  if (!clientId) {
    return NextResponse.json({ success: false, error: "client_id is required." }, { status: 400 })
  }

  const [modelsRes, assetsRes, outfitsRes, relationshipsRes] = await Promise.all([
    sb.from("ai_models").select("*").eq("client_id", clientId).eq("status", "approved"),
    sb.from("ai_model_assets").select("*").eq("client_id", clientId).eq("status", "approved"),
    sb.from("ai_model_outfits").select("*").eq("client_id", clientId),
    sb.from("ai_model_relationships").select("*").eq("client_id", clientId).eq("status", "active"),
  ])

  const firstError = modelsRes.error ?? assetsRes.error ?? outfitsRes.error ?? relationshipsRes.error
  if (firstError) {
    return NextResponse.json({ success: false, error: firstError.message }, { status: 500 })
  }

  const models = (modelsRes.data ?? []) as AiModel[]
  const assets = (assetsRes.data ?? []) as AiModelAsset[]
  const outfits = (outfitsRes.data ?? []) as AiModelOutfit[]
  const relationships = (relationshipsRes.data ?? []) as AiModelRelationship[]

  return NextResponse.json({
    success: true,
    models: buildAiPhotographyModelSummaries(models, assets, outfits, relationships),
  })
}

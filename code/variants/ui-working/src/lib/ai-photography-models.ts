import {
  AI_MODEL_BASE_REFERENCE_SLOT_KEYS,
  aiModelSlotShortLabel,
  type AiModel,
  type AiModelAsset,
  type AiModelOutfit,
} from "@/lib/ai-model-library"

export const FINALISED_AI_MODEL_STATUS = "approved"

export type AiModelRelationship = {
  id: string
  client_id: string
  model_id: string
  related_model_id: string
  relationship_type: string
  relationship_label: string | null
  future_use: string | null
  notes: string | null
  status: "active" | "archived"
  created_at: string
  updated_at: string
}

export type AiPhotographyAvailableModel = {
  id: string
  client_id: string
  name: string
  role: string | null
  gender: string | null
  age: number | null
  nationality: string | null
  status: string
  approved_face_thumbnail: string | null
  approved_face_storage_path: string | null
  character_dna_complete: boolean
  character_dna_status: Array<{ slot: string; label: string; approved: boolean }>
  approved_outfit_count: number
  outfit_references: Array<{
    id: string
    model_id: string
    model_name: string
    label: string
    set_name: string
    occasion: string | null
    preview_url: string
    storage_path: string | null
    public_url: string | null
  }>
  relationships: Array<{
    related_model_id: string
    related_model_name: string
    relationship_type: string
    relationship_label: string | null
    notes: string | null
  }>
}

export function buildAiPhotographyModelSummaries(
  models: AiModel[],
  assets: AiModelAsset[],
  outfits: AiModelOutfit[],
  relationships: AiModelRelationship[] = [],
) {
  const modelsById = new Map(models.map(model => [model.id, model]))

  return models
    .filter(model => model.status === FINALISED_AI_MODEL_STATUS)
    .map((model): AiPhotographyAvailableModel => {
      const modelAssets = assets.filter(asset => asset.client_id === model.client_id && asset.model_id === model.id)
      const dnaStatus = AI_MODEL_BASE_REFERENCE_SLOT_KEYS.map(slot => ({
        slot,
        label: aiModelSlotShortLabel(slot),
        approved: modelAssets.some(asset => asset.asset_type === slot && asset.status === "approved"),
      }))
      const frontFace = modelAssets
        .filter(asset => asset.asset_type === "front_face" && asset.status === "approved")
        .sort((left, right) => right.version_number - left.version_number)[0]
      const approvedOutfitCount = modelAssets.filter(asset => asset.asset_type === "outfit" && asset.status === "approved").length
      const modelOutfits = outfits.filter(outfit => outfit.client_id === model.client_id && outfit.model_id === model.id)
      const outfitReferences = modelAssets
        .filter(asset => asset.asset_type === "outfit" && asset.status === "approved" && asset.image_url)
        .sort((left, right) => right.version_number - left.version_number)
        .map(asset => {
          const outfitId = typeof asset.generation_settings?.outfit_id === "string" ? asset.generation_settings.outfit_id : null
          const outfit = outfitId ? modelOutfits.find(item => item.id === outfitId) : null
          return {
            id: asset.id,
            model_id: model.id,
            model_name: model.model_name,
            label: outfit?.outfit_name ?? `Approved Outfit v${asset.version_number}`,
            set_name: outfit?.collection_style ?? outfit?.occasion ?? "Wardrobe Collection",
            occasion: outfit?.occasion ?? null,
            preview_url: asset.image_url ?? "",
            storage_path: asset.storage_path ?? null,
            public_url: asset.image_url ?? null,
          }
        })
      const activeRelationships = relationships
        .filter(relationship => relationship.client_id === model.client_id && relationship.model_id === model.id && relationship.status === "active")
        .map(relationship => ({
          related_model_id: relationship.related_model_id,
          related_model_name: modelsById.get(relationship.related_model_id)?.model_name ?? "Related model",
          relationship_type: relationship.relationship_type,
          relationship_label: relationship.relationship_label,
          notes: relationship.notes,
        }))

      return {
        id: model.id,
        client_id: model.client_id,
        name: model.model_name,
        role: model.model_role,
        gender: model.gender,
        age: model.age,
        nationality: model.nationality,
        status: model.status,
        approved_face_thumbnail: frontFace?.image_url ?? null,
        approved_face_storage_path: frontFace?.storage_path ?? null,
        character_dna_complete: dnaStatus.every(item => item.approved),
        character_dna_status: dnaStatus,
        approved_outfit_count: approvedOutfitCount,
        outfit_references: outfitReferences,
        relationships: activeRelationships,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function finalisedAiModelsForClient(models: AiModel[], clientId: string) {
  return models.filter(model => model.client_id === clientId && model.status === FINALISED_AI_MODEL_STATUS)
}

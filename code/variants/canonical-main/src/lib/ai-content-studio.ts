import "server-only";

import { createHash, randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import {
  clientBrainV2ServerClient,
  ClientBrainV2HttpError,
  isUuid,
  requireClientBrainV2,
} from "@/lib/client-brain-v2-server-core";
import { listPinterestInspirations } from "@/lib/client-brain-pinterest-inspiration-server";
import {
  loadRestaurantClientBrainV2AssetList,
  loadClientBrainV2AssetThumbnails,
} from "@/lib/client-brain-v2-assets-server";
import {
  buildIndividualProductionGeminiRequest,
  GEMINI_IMAGE_ASPECT_RATIOS,
  type GeminiImageAspectRatio,
  type GeminiInlineReferencePart,
  validateIndividualProductionGeminiRequest,
} from "@/lib/social-individual-production-provider-contract";
import {
  creativeDirectorSystemPrompt,
  creativeDirectorUserPrompt,
  parseCreativeDirectorPromptJson,
} from "@/lib/creative-director";
import { calcCost } from "@/lib/ai-tracker";
import { measureServerLoader } from "@/lib/server-performance";

const BUCKET = "client-assets";
const MAX_REFERENCES = 10;
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const PROMPT_VERSION = "ai-content-studio-v2.5";
const CREATIVE_DIRECTOR_PROMPT_VERSION =
  "ai-content-creative-director-v2.5-multimodal";
const CREATIVE_DIRECTOR_MAX_TOKENS = 6_000;
const CREATIVE_DIRECTOR_ACTION = "creative_director_prompt";
const MODEL = "gemini-3-pro-image-preview";
const CREATIVE_DIRECTOR_MODEL =
  process.env.AI_CONTENT_CREATIVE_DIRECTOR_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-sonnet-4-6";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const AI_CONTENT_REFERENCE_ROLES = [
  "composition_inspiration",
  "food_truth",
  "drink_truth",
  "venue_truth",
  "person_identity_truth",
  "product_truth",
  "wardrobe_styling",
  "lighting_mood",
  "pose_action",
  "other_truth",
  "general_reference",
] as const;
export type AiContentReferenceRole =
  (typeof AI_CONTENT_REFERENCE_ROLES)[number];

// No-network regression fixture: Studio must keep Pinterest in the creative
// lane and client assets in the factual-truth lane before provider execution.
export const AI_CONTENT_REFERENCE_FIREWALL_FIXTURE = {
  pinterest: "composition_inspiration" as const,
  food: "food_truth" as const,
  expected: {
    pinterestForbidden: "client food identity",
    foodInherited: "exact food identity",
  },
};

// Offline contract proof: image blocks are carried in display/persisted order and
// never stored in prompt persistence. The live request replaces these placeholders
// with transient native Anthropic base64 sources.
export const AI_CONTENT_MULTIMODAL_CONTRACT_FIXTURE = {
  references: [
    { id: "inspiration", role: "composition_inspiration", referenceOrder: 1 },
    { id: "food", role: "food_truth", referenceOrder: 2 },
    { id: "venue", role: "venue_truth", referenceOrder: 3 },
  ],
  expected: {
    nativeImageInputs: 3,
    orderedRoles: ["composition_inspiration", "food_truth", "venue_truth"],
  },
};

export function verifyAiContentMultimodalContractFixture() {
  return (
    AI_CONTENT_MULTIMODAL_CONTRACT_FIXTURE.references.length ===
      AI_CONTENT_MULTIMODAL_CONTRACT_FIXTURE.expected.nativeImageInputs &&
    AI_CONTENT_MULTIMODAL_CONTRACT_FIXTURE.references
      .map((reference) => reference.role)
      .every(
        (role, index) =>
          role ===
          AI_CONTENT_MULTIMODAL_CONTRACT_FIXTURE.expected.orderedRoles[index],
      )
  );
}

type StudioSessionRow = {
  id: string;
  client_id: string;
  title: string;
  creative_request: string;
  aspect_ratio: GeminiImageAspectRatio;
  output_resolution: "4K";
  correction_history: unknown;
  active_generation_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
type StudioReferenceRow = {
  id: string;
  client_id: string;
  session_id: string;
  source_type: string;
  source_record_id: string | null;
  file_object_id: string | null;
  display_name: string;
  role: AiContentReferenceRole;
  reference_order: number;
  inheritance: Record<string, unknown>;
  source_metadata: Record<string, unknown>;
  created_at: string;
};
type StudioGenerationRow = {
  id: string;
  client_id: string;
  session_id: string;
  version: number;
  status: string;
  execution_mode: string;
  provider: string;
  model: string;
  prompt_version: string;
  aspect_ratio: GeminiImageAspectRatio;
  output_resolution: string;
  prompt_text: string;
  reference_snapshot: StudioReferenceRow[];
  execution: Record<string, unknown>;
  file_object_id: string | null;
  failure_reason: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};
type StudioPromptRow = {
  id: string;
  client_id: string;
  session_id: string;
  version: number;
  status: string;
  execution_mode: string;
  provider: string;
  model: string;
  prompt_version: string;
  user_brief: string;
  correction: string | null;
  generated_prompt: string;
  provider_prompt: string;
  structured_context: Record<string, unknown>;
  execution: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
type CreativeDirectorRequestRow = {
  id: string;
  client_id: string;
  session_id: string;
  action_type: string;
  request_id: string;
  status: "pending" | "succeeded" | "failed";
  provider: string;
  model: string;
  prompt_version: string;
  prompt_version_id: string | null;
  raw_response: string | null;
  failure_diagnostic: string | null;
  execution: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
type FileRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  storage_bucket: string;
  storage_path: string;
  preview_path: string | null;
  optimized_path: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown> | null;
};
type FinalContentRow = {
  id: string;
  source_generation_id: string;
  client_content_month_id: string;
  content_type: string;
};

type StudioExecutionMode = "live" | "fixture" | "unavailable";
function mode(): StudioExecutionMode {
  if (process.env.AI_CONTENT_STUDIO_MODE === "live") return "live";
  if (process.env.AI_CONTENT_STUDIO_MODE === "fixture") return "fixture";
  return "unavailable";
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
const USEFUL_METADATA_KEYS = [
  "dish_name",
  "drink_name",
  "menu_display_name",
  "canonical_name",
  "verified_description",
  "description",
  "visual_presentation",
  "visible_ingredients",
  "serving_vessel",
  "venue_zone",
  "interior_exterior",
  "material_notes",
  "spatial_notes",
] as const;
function usefulMetadata(metadata: Record<string, unknown> | null | undefined) {
  const result: Record<string, string | number | boolean> = {};
  for (const key of USEFUL_METADATA_KEYS) {
    const value = metadata?.[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      result[key] = value;
  }
  return result;
}
function verifiedIdentity(reference: StudioReferenceRow) {
  const metadata = usefulMetadata(reference.source_metadata);
  return (
    text(metadata.dish_name) ||
    text(metadata.drink_name) ||
    text(metadata.menu_display_name) ||
    text(metadata.canonical_name) ||
    ""
  );
}
function safeName(value: string) {
  return (
    value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
    "reference"
  );
}
function extensionForMime(mime: string) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}
function defaultRole(
  category: string,
  sourceType: string,
): AiContentReferenceRole {
  if (sourceType === "pinterest_inspiration") return "composition_inspiration";
  if (sourceType === "generated_version") return "general_reference";
  if (category === "food") return "food_truth";
  if (category === "drinks") return "drink_truth";
  if (category === "interiors" || category === "exteriors")
    return "venue_truth";
  if (category === "people" || category === "lifestyle")
    return "person_identity_truth";
  if (category === "venue_items") return "product_truth";
  return "general_reference";
}

export function referenceInheritance(role: AiContentReferenceRole) {
  const definitions: Record<
    AiContentReferenceRole,
    { inherit: string[]; mayInfluence: string[]; mustNotInfluence: string[] }
  > = {
    composition_inspiration: {
      inherit: [
        "composition",
        "camera relationship",
        "gesture when requested",
        "creative technique",
      ],
      mayInfluence: ["crop", "angle", "framing", "lighting character"],
      mustNotInfluence: [
        "client food identity",
        "venue identity",
        "branding",
        "person identity",
        "props or furniture truth",
      ],
    },
    food_truth: {
      inherit: [
        "exact food identity",
        "portion",
        "shape",
        "plating",
        "visible garnish",
        "texture and vessel",
      ],
      mayInfluence: ["food realism", "visible presentation"],
      mustNotInfluence: [
        "background",
        "venue",
        "unrelated people",
        "camera unless requested",
      ],
    },
    drink_truth: {
      inherit: [
        "drink identity",
        "glass profile",
        "liquid colour",
        "garnish and fill level",
      ],
      mayInfluence: ["drink realism", "glass reflections"],
      mustNotInfluence: ["venue", "other props", "camera unless requested"],
    },
    venue_truth: {
      inherit: [
        "architecture",
        "furniture",
        "materials",
        "fixtures",
        "spatial relationships",
      ],
      mayInfluence: ["background", "surface", "practical lighting"],
      mustNotInfluence: ["people", "food identity", "unseen room geometry"],
    },
    person_identity_truth: {
      inherit: [
        "real identity",
        "face",
        "hair",
        "skin tone",
        "physical proportions",
      ],
      mayInfluence: ["likeness only"],
      mustNotInfluence: ["pose", "wardrobe", "background unless assigned"],
    },
    product_truth: {
      inherit: [
        "object identity",
        "material",
        "proportions",
        "visible branded details",
      ],
      mayInfluence: ["product realism"],
      mustNotInfluence: ["background", "venue", "unrelated styling"],
    },
    wardrobe_styling: {
      inherit: ["wardrobe and styling details"],
      mayInfluence: ["approved styling"],
      mustNotInfluence: ["identity", "venue", "food or drink truth"],
    },
    lighting_mood: {
      inherit: ["lighting character", "colour treatment"],
      mayInfluence: ["light direction and mood"],
      mustNotInfluence: ["identity", "food", "venue geometry or props"],
    },
    pose_action: {
      inherit: ["pose", "gesture", "action timing"],
      mayInfluence: ["human interaction"],
      mustNotInfluence: ["identity", "wardrobe", "client product truth"],
    },
    other_truth: {
      inherit: ["only the labelled factual detail"],
      mayInfluence: ["the labelled factual detail"],
      mustNotInfluence: ["all unlabelled visual information"],
    },
    general_reference: {
      inherit: ["only explicitly requested useful details"],
      mayInfluence: ["creative request only"],
      mustNotInfluence: ["client truth unless separately attached"],
    },
  };
  return definitions[role];
}

export function verifyAiContentReferenceFirewallFixture() {
  const pinterest = referenceInheritance(
    AI_CONTENT_REFERENCE_FIREWALL_FIXTURE.pinterest,
  );
  const food = referenceInheritance(AI_CONTENT_REFERENCE_FIREWALL_FIXTURE.food);
  return (
    pinterest.mustNotInfluence.includes(
      AI_CONTENT_REFERENCE_FIREWALL_FIXTURE.expected.pinterestForbidden,
    ) &&
    food.inherit.includes(
      AI_CONTENT_REFERENCE_FIREWALL_FIXTURE.expected.foodInherited,
    )
  );
}

async function signedUrl(file: FileRow | null, seconds = 60 * 30) {
  if (!file) return null;
  const path = file.preview_path || file.optimized_path || file.storage_path;
  const { data } = await clientBrainV2ServerClient.storage
    .from(file.storage_bucket)
    .createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

type FileUrlSigner = (file: FileRow | null, seconds?: number) => Promise<string | null>;

/** Reuses a signed URL only inside one Studio response and its existing TTL. */
function createRequestFileUrlSigner(): FileUrlSigner {
  const pending = new Map<string, Promise<string | null>>();
  return (file, seconds = 60 * 30) => {
    if (!file) return Promise.resolve(null);
    const path = file.preview_path || file.optimized_path || file.storage_path;
    const key = `${file.storage_bucket}:${path}:${seconds}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const next = measureServerLoader("signed-media.studio", 1, () => signedUrl(file, seconds));
    pending.set(key, next);
    return next;
  };
}

async function filesById(ids: string[]) {
  if (!ids.length) return new Map<string, FileRow>();
  const { data, error } = await clientBrainV2ServerClient
    .from("client_brain_file_objects")
    .select(
      "id,file_name,file_type,storage_bucket,storage_path,preview_path,optimized_path,file_size_bytes,metadata",
    )
    .in("id", ids);
  if (error)
    throw new ClientBrainV2HttpError("Unable to load reference files.", 500);
  return new Map((data ?? []).map((row) => [row.id, row as FileRow]));
}

async function hydrateReferences(rows: StudioReferenceRow[], sign: FileUrlSigner = signedUrl) {
  const byFile = await filesById(
    rows.flatMap((row) => (row.file_object_id ? [row.file_object_id] : [])),
  );
  return Promise.all(
    rows.map(async (row) => {
      const file = row.file_object_id
        ? (byFile.get(row.file_object_id) ?? null)
        : null;
      return {
        ...row,
        thumbnail_url: await sign(file),
        file_name: file?.file_name ?? null,
        file_type: file?.file_type ?? null,
      };
    }),
  );
}

async function sessionReferences(clientId: string, sessionId: string, sign: FileUrlSigner = signedUrl) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_session_references")
    .select("*")
    .eq("client_id", clientId)
    .eq("session_id", sessionId)
    .order("reference_order");
  if (error)
    throw new ClientBrainV2HttpError(
      "Unable to load AI Content references.",
      500,
    );
  return hydrateReferences((data ?? []) as StudioReferenceRow[], sign);
}

async function sessionGenerations(clientId: string, sessionId: string, sign: FileUrlSigner = signedUrl) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_generations")
    .select("*")
    .eq("client_id", clientId)
    .eq("session_id", sessionId)
    .order("version", { ascending: false });
  if (error)
    throw new ClientBrainV2HttpError(
      "Unable to load AI Content versions.",
      500,
    );
  const rows = (data ?? []) as StudioGenerationRow[];
  const byFile = await filesById(
    rows.flatMap((row) => (row.file_object_id ? [row.file_object_id] : [])),
  );
  const generationIds = rows.map((row) => row.id);
  const [
    { data: finalContent, error: finalContentError },
    { data: contentMonths, error: monthsError },
  ] = await Promise.all([
    generationIds.length
      ? clientBrainV2ServerClient
          .from("client_content_items")
          .select(
            "id, source_generation_id, client_content_month_id, content_type",
          )
          .eq("client_id", clientId)
          .eq("source", "ai_content")
          .in("source_generation_id", generationIds)
          .neq("final_state", "archived")
      : Promise.resolve({ data: [], error: null }),
    clientBrainV2ServerClient
      .from("client_content_months")
      .select("id, month_start")
      .eq("client_id", clientId),
  ]);
  if (finalContentError || monthsError)
    throw new ClientBrainV2HttpError(
      "Unable to load Final Content lineage.",
      500,
    );
  const monthById = new Map(
    (contentMonths ?? []).map((month) => [
      month.id as string,
      month.month_start as string,
    ]),
  );
  const finalByGeneration = new Map(
    ((finalContent ?? []) as FinalContentRow[]).map((item) => [
      item.source_generation_id,
      {
        id: item.id,
        month_start: monthById.get(item.client_content_month_id) ?? null,
        content_type: item.content_type,
      },
    ]),
  );
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_url: await sign(
        row.file_object_id ? (byFile.get(row.file_object_id) ?? null) : null,
        60 * 60,
      ),
      final_content: finalByGeneration.get(row.id) ?? null,
    })),
  );
}

async function sessionPrompts(clientId: string, sessionId: string) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_prompt_versions")
    .select("*")
    .eq("client_id", clientId)
    .eq("session_id", sessionId)
    .order("version", { ascending: false });
  if (error)
    throw new ClientBrainV2HttpError(
      "AI Content V2 persistence is not available. Apply the V2 Studio migration before creating prompts.",
      503,
    );
  return (data ?? []) as StudioPromptRow[];
}

async function assertSession(clientId: string, sessionId: string) {
  if (!isUuid(sessionId))
    throw new ClientBrainV2HttpError("AI Content session not found.", 404);
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data)
    throw new ClientBrainV2HttpError("AI Content session not found.", 404);
  return data as StudioSessionRow;
}

export async function listAiContentStudio(clientId: string) {
  const client = await requireClientBrainV2(clientId);
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_sessions")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error)
    throw new ClientBrainV2HttpError(
      "Unable to load AI Content sessions.",
      500,
    );
  const executionMode = mode();
  return {
    client,
    mode: executionMode,
    generation_available: executionMode === "live",
    provider: "google-gemini",
    model: MODEL,
    max_references: MAX_REFERENCES,
    output_resolution: "4K",
    sessions: data ?? [],
  };
}

/** Initial Studio payload: one selected session arrives with the list. */
export async function loadInitialAiContentStudio(clientId: string) {
  return measureServerLoader("studio.initial", 6, async () => {
    const listing = await listAiContentStudio(clientId);
    const selected = listing.sessions[0] ?? null;
    return {
      sessions: listing.sessions,
      detail: selected
        ? await getAiContentSession(clientId, selected.id)
        : null,
    };
  });
}

export async function getAiContentSession(clientId: string, sessionId: string) {
  const session = await assertSession(clientId, sessionId);
  const sign = createRequestFileUrlSigner();
  const [references, generations, prompts] = await Promise.all([
    sessionReferences(clientId, sessionId, sign),
    sessionGenerations(clientId, sessionId, sign),
    sessionPrompts(clientId, sessionId),
  ]);
  const executionMode = mode();
  return {
    session,
    references,
    generations,
    prompts,
    mode: executionMode,
    generation_available: executionMode === "live",
    provider: "google-gemini",
    model: MODEL,
    creative_director: {
      provider: "anthropic",
      model: CREATIVE_DIRECTOR_MODEL,
    },
    max_references: MAX_REFERENCES,
    output_resolution: "4K",
  };
}

export async function createAiContentSession(clientId: string, title?: string) {
  await requireClientBrainV2(clientId);
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_sessions")
    .insert({
      id: randomUUID(),
      client_id: clientId,
      title: text(title).slice(0, 120) || "Untitled generation",
    })
    .select("*")
    .single();
  if (error || !data)
    throw new ClientBrainV2HttpError(
      "Unable to create AI Content session.",
      500,
    );
  return getAiContentSession(clientId, data.id);
}

// Scoped cleanup for explicitly temporary Studio QA sessions. Only uploaded
// session-reference files are removed; Client Brain assets, generations and
// final content are never targets of this path.
export async function deleteAiContentSession(
  clientId: string,
  sessionId: string,
) {
  await assertSession(clientId, sessionId);
  const { data: referenceRows, error: referenceError } =
    await clientBrainV2ServerClient
      .from("ai_content_session_references")
      .select("source_type,file_object_id")
      .eq("client_id", clientId)
      .eq("session_id", sessionId);
  if (referenceError)
    throw new ClientBrainV2HttpError(
      "Unable to inspect temporary Studio references for cleanup.",
      500,
    );
  const uploadedFileIds = (referenceRows ?? [])
    .filter(
      (row) =>
        row.source_type === "session_upload" &&
        typeof row.file_object_id === "string",
    )
    .map((row) => row.file_object_id as string);
  const uploadedFiles = await filesById(uploadedFileIds);
  const { error: sessionError } = await clientBrainV2ServerClient
    .from("ai_content_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("client_id", clientId);
  if (sessionError)
    throw new ClientBrainV2HttpError(
      "Unable to remove the temporary AI Content session.",
      500,
    );
  for (const file of uploadedFiles.values()) {
    const { error } = await clientBrainV2ServerClient.storage
      .from(file.storage_bucket)
      .remove([file.storage_path]);
    if (error)
      throw new ClientBrainV2HttpError(
        "Temporary Studio storage cleanup did not complete.",
        500,
      );
  }
  if (uploadedFileIds.length) {
    const { error } = await clientBrainV2ServerClient
      .from("client_brain_file_objects")
      .delete()
      .in("id", uploadedFileIds);
    if (error)
      throw new ClientBrainV2HttpError(
        "Temporary Studio file cleanup did not complete.",
        500,
      );
  }
}

export async function updateAiContentSession(
  clientId: string,
  sessionId: string,
  input: {
    title?: unknown;
    creative_request?: unknown;
    aspect_ratio?: unknown;
    correction?: unknown;
    active_generation_id?: unknown;
  },
) {
  const session = await assertSession(clientId, sessionId);
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined)
    patch.title = text(input.title).slice(0, 120) || "Untitled generation";
  if (input.creative_request !== undefined)
    patch.creative_request = text(input.creative_request).slice(0, 10_000);
  if (input.aspect_ratio !== undefined) {
    if (
      !GEMINI_IMAGE_ASPECT_RATIOS.includes(
        input.aspect_ratio as GeminiImageAspectRatio,
      )
    )
      throw new ClientBrainV2HttpError("Choose a supported aspect ratio.", 400);
    patch.aspect_ratio = input.aspect_ratio;
  }
  if (input.correction !== undefined && text(input.correction))
    patch.correction_history = [
      ...(Array.isArray(session.correction_history)
        ? session.correction_history
        : []),
      {
        text: text(input.correction).slice(0, 2_000),
        created_at: new Date().toISOString(),
      },
    ];
  if (input.active_generation_id !== undefined) {
    const activeGenerationId =
      input.active_generation_id === null
        ? null
        : text(input.active_generation_id);
    if (activeGenerationId !== null && !isUuid(activeGenerationId))
      throw new ClientBrainV2HttpError(
        "Choose a valid generated version.",
        400,
      );
    if (activeGenerationId) {
      const { data: generation, error } = await clientBrainV2ServerClient
        .from("ai_content_generations")
        .select("id")
        .eq("id", activeGenerationId)
        .eq("client_id", clientId)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error || !generation)
        throw new ClientBrainV2HttpError(
          "The selected generated version is not available in this session.",
          409,
        );
    }
    patch.active_generation_id = activeGenerationId;
  }
  if (Object.keys(patch).length) {
    const { error } = await clientBrainV2ServerClient
      .from("ai_content_sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("client_id", clientId);
    if (error)
      throw new ClientBrainV2HttpError(
        "Unable to update AI Content session.",
        500,
      );
  }
  return getAiContentSession(clientId, sessionId);
}

async function sourceFileForAsset(clientId: string, assetId: string) {
  const { data: asset, error } = await clientBrainV2ServerClient
    .from("client_brain_v2_records")
    .select("id,title,status,metadata")
    .eq("id", assetId)
    .eq("client_id", clientId)
    .eq("top_section", "assets")
    .maybeSingle();
  if (error || !asset || asset.status === "archived")
    throw new ClientBrainV2HttpError(
      "This Client Brain asset is not available for this client.",
      409,
    );
  const category = String(asset.metadata?.asset_category ?? "unclassified");
  const isStaffIdentity =
    category === "staff" || category === "people" || category === "lifestyle";
  if (
    isStaffIdentity &&
    asset.metadata?.approved_for_generation !== true &&
    asset.metadata?.approved_for_generation !== "true"
  )
    throw new ClientBrainV2HttpError(
      "Staff identity requires explicit approval for generation.",
      409,
    );
  const { data: assignment } = await clientBrainV2ServerClient
    .from("client_brain_v2_record_files")
    .select("file_object_id")
    .eq("client_id", clientId)
    .eq("record_id", assetId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!assignment)
    throw new ClientBrainV2HttpError(
      "The selected asset has no usable image file.",
      409,
    );
  return { asset, fileObjectId: assignment.file_object_id, category };
}

async function sourceFileForPinterest(clientId: string, inspirationId: string) {
  const { data, error } = await clientBrainV2ServerClient
    .from("client_brain_pinterest_inspirations")
    .select(
      "id,title,status,analysis_state,file_object_id,creative_categories,shot_scale,camera_angle,composition,interaction,lighting_style,visual_summary",
    )
    .eq("id", inspirationId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .eq("analysis_state", "analyzed")
    .maybeSingle();
  if (error || !data?.file_object_id)
    throw new ClientBrainV2HttpError(
      "Choose an active Pinterest inspiration with completed creative analysis.",
      409,
    );
  return data;
}

async function sourceFileForGeneratedVersion(
  clientId: string,
  generationId: string,
) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_generations")
    .select(
      "id,session_id,version,file_object_id,prompt_text,aspect_ratio,generated_at",
    )
    .eq("id", generationId)
    .eq("client_id", clientId)
    .eq("status", "generated")
    .maybeSingle();
  if (error || !data?.file_object_id)
    throw new ClientBrainV2HttpError(
      "Choose a successful generated version with its original image available.",
      409,
    );
  return {
    id: data.id,
    title: `Version ${data.version}`,
    fileObjectId: data.file_object_id,
    category: "generated_version",
    metadata: {
      reference_kind: "previous_generated_image",
      source_session_id: data.session_id,
      source_version: data.version,
      aspect_ratio: data.aspect_ratio,
      generated_at: data.generated_at,
    },
  };
}

async function sourceFileForContent(clientId: string, contentId: string) {
  const { data, error } = await clientBrainV2ServerClient
    .from("client_content_items")
    .select(
      "id,file_name,content_type,source,source_file_object_id,final_state",
    )
    .eq("id", contentId)
    .eq("client_id", clientId)
    .neq("final_state", "archived")
    .maybeSingle();
  if (error || !data?.source_file_object_id)
    throw new ClientBrainV2HttpError(
      "This Content item does not retain a reusable original reference image.",
      409,
    );
  return {
    id: data.id,
    title: data.file_name || "Final Content",
    fileObjectId: data.source_file_object_id,
    category: "content_library",
    metadata: {
      reference_kind: "approved_final_content",
      content_type: data.content_type,
      source: data.source,
    },
  };
}

function validateVenueReferences(rows: StudioReferenceRow[]) {
  const venue = rows.filter((row) => row.role === "venue_truth");
  if (venue.length > 2)
    throw new ClientBrainV2HttpError(
      "Use no more than two Venue Truth references.",
      409,
    );
  if (venue.length === 2) {
    const zones = venue
      .map((row) => text(row.source_metadata?.venue_zone))
      .filter(Boolean);
    if (zones.length === 2 && zones[0] !== zones[1])
      throw new ClientBrainV2HttpError(
        "Two Venue Truth references must show the same physical venue zone.",
        409,
      );
  }
}

export async function addAiContentReference(
  clientId: string,
  sessionId: string,
  input: { source_type: string; source_id: string; role?: unknown },
) {
  await assertSession(clientId, sessionId);
  const existing = await sessionReferences(clientId, sessionId);
  if (existing.length >= MAX_REFERENCES)
    throw new ClientBrainV2HttpError(
      `A generation can use up to ${MAX_REFERENCES} references.`,
      409,
    );
  let source: {
    id: string;
    title: string;
    fileObjectId: string;
    category: string;
    metadata: Record<string, unknown>;
  };
  if (input.source_type === "client_brain_asset") {
    const asset = await sourceFileForAsset(clientId, input.source_id);
    source = {
      id: asset.asset.id,
      title: asset.asset.title,
      fileObjectId: asset.fileObjectId,
      category: asset.category,
      metadata: asset.asset.metadata ?? {},
    };
  } else if (input.source_type === "pinterest_inspiration") {
    const pin = await sourceFileForPinterest(clientId, input.source_id);
    source = {
      id: pin.id,
      title: pin.title,
      fileObjectId: pin.file_object_id,
      category: "pinterest",
      metadata: {
        creative_categories: pin.creative_categories,
        shot_scale: pin.shot_scale,
        camera_angle: pin.camera_angle,
        composition: pin.composition,
        interaction: pin.interaction,
        lighting_style: pin.lighting_style,
        visual_summary: pin.visual_summary,
      },
    };
  } else if (input.source_type === "generated_version") {
    source = await sourceFileForGeneratedVersion(clientId, input.source_id);
  } else if (input.source_type === "content_library") {
    source = await sourceFileForContent(clientId, input.source_id);
  } else {
    throw new ClientBrainV2HttpError("Unsupported reference source.", 400);
  }
  const role = AI_CONTENT_REFERENCE_ROLES.includes(
    input.role as AiContentReferenceRole,
  )
    ? (input.role as AiContentReferenceRole)
    : defaultRole(source.category, input.source_type);
  const row: StudioReferenceRow = {
    id: randomUUID(),
    client_id: clientId,
    session_id: sessionId,
    source_type: input.source_type,
    source_record_id: source.id,
    file_object_id: source.fileObjectId,
    display_name: source.title,
    role,
    reference_order: existing.length + 1,
    inheritance: referenceInheritance(role),
    source_metadata: { category: source.category, ...source.metadata },
    created_at: new Date().toISOString(),
  };
  validateVenueReferences([...(existing as StudioReferenceRow[]), row]);
  const { error } = await clientBrainV2ServerClient
    .from("ai_content_session_references")
    .insert(row);
  if (error)
    throw new ClientBrainV2HttpError("Unable to add the reference.", 500);
  return getAiContentSession(clientId, sessionId);
}

export async function uploadAiContentReference(
  clientId: string,
  sessionId: string,
  formData: FormData,
) {
  await assertSession(clientId, sessionId);
  const existing = await sessionReferences(clientId, sessionId);
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size)
    throw new ClientBrainV2HttpError("Choose one image reference.", 400);
  if (!file.type.startsWith("image/") || file.size > MAX_UPLOAD_BYTES)
    throw new ClientBrainV2HttpError(
      "Session references must be image files up to 16 MB.",
      400,
    );
  if (existing.length >= MAX_REFERENCES)
    throw new ClientBrainV2HttpError(
      `A generation can use up to ${MAX_REFERENCES} references.`,
      409,
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${clientId}/ai-content/session-references/${sessionId}/${randomUUID()}_${safeName(file.name)}`;
  const { error: uploadError } = await clientBrainV2ServerClient.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError)
    throw new ClientBrainV2HttpError(
      "Unable to store the session reference.",
      500,
    );
  const { data: fileObject, error: fileError } = await clientBrainV2ServerClient
    .from("client_brain_file_objects")
    .insert({
      storage_bucket: BUCKET,
      storage_path: path,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: bytes.length,
      metadata: {
        artifact_type: "ai_content_session_reference",
        client_id: clientId,
        session_id: sessionId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    })
    .select("id")
    .single();
  if (fileError || !fileObject) {
    await clientBrainV2ServerClient.storage.from(BUCKET).remove([path]);
    throw new ClientBrainV2HttpError(
      "Unable to register the session reference.",
      500,
    );
  }
  // An uploaded Pinterest/downloaded image is creative direction by default, not
  // Client Brain truth. The ordinary composer deliberately hides role management.
  const role = AI_CONTENT_REFERENCE_ROLES.includes(
    formData.get("role") as AiContentReferenceRole,
  )
    ? (formData.get("role") as AiContentReferenceRole)
    : "composition_inspiration";
  const { error } = await clientBrainV2ServerClient
    .from("ai_content_session_references")
    .insert({
      id: randomUUID(),
      client_id: clientId,
      session_id: sessionId,
      source_type: "session_upload",
      source_record_id: null,
      file_object_id: fileObject.id,
      display_name: file.name,
      role,
      reference_order: existing.length + 1,
      inheritance: referenceInheritance(role),
      source_metadata: { temporary: true },
    });
  if (error)
    throw new ClientBrainV2HttpError(
      "Unable to attach the session reference.",
      500,
    );
  return getAiContentSession(clientId, sessionId);
}

export async function updateAiContentReference(
  clientId: string,
  sessionId: string,
  referenceId: string,
  input: { role?: unknown; direction?: unknown; reference_order?: unknown },
) {
  const references = (await sessionReferences(
    clientId,
    sessionId,
  )) as StudioReferenceRow[];
  const current = references.find((reference) => reference.id === referenceId);
  if (!current) throw new ClientBrainV2HttpError("Reference not found.", 404);
  const requestedOrder =
    typeof input.reference_order === "number" &&
    Number.isInteger(input.reference_order)
      ? Math.min(Math.max(input.reference_order, 1), references.length)
      : null;
  if (requestedOrder && requestedOrder !== current.reference_order) {
    await clientBrainV2ServerClient
      .from("ai_content_session_references")
      .update({ reference_order: 0 })
      .eq("id", current.id);
    const movingDown = requestedOrder > current.reference_order;
    const affected = references.filter((reference) =>
      movingDown
        ? reference.reference_order > current.reference_order &&
          reference.reference_order <= requestedOrder
        : reference.reference_order >= requestedOrder &&
          reference.reference_order < current.reference_order,
    );
    await Promise.all(
      affected.map((reference) =>
        clientBrainV2ServerClient
          .from("ai_content_session_references")
          .update({
            reference_order: reference.reference_order + (movingDown ? -1 : 1),
          })
          .eq("id", reference.id),
      ),
    );
    await clientBrainV2ServerClient
      .from("ai_content_session_references")
      .update({ reference_order: requestedOrder })
      .eq("id", current.id);
  } else if (input.direction === "up" || input.direction === "down") {
    const neighbor = references.find(
      (reference) =>
        reference.reference_order ===
        current.reference_order + (input.direction === "up" ? -1 : 1),
    );
    if (neighbor) {
      await clientBrainV2ServerClient
        .from("ai_content_session_references")
        .update({ reference_order: 0 })
        .eq("id", current.id);
      await clientBrainV2ServerClient
        .from("ai_content_session_references")
        .update({ reference_order: current.reference_order })
        .eq("id", neighbor.id);
      await clientBrainV2ServerClient
        .from("ai_content_session_references")
        .update({ reference_order: neighbor.reference_order })
        .eq("id", current.id);
    }
  } else if (
    AI_CONTENT_REFERENCE_ROLES.includes(input.role as AiContentReferenceRole)
  ) {
    const role = input.role as AiContentReferenceRole;
    const next = references.map((reference) =>
      reference.id === referenceId ? { ...reference, role } : reference,
    );
    validateVenueReferences(next);
    const { error } = await clientBrainV2ServerClient
      .from("ai_content_session_references")
      .update({ role, inheritance: referenceInheritance(role) })
      .eq("id", referenceId)
      .eq("session_id", sessionId)
      .eq("client_id", clientId);
    if (error)
      throw new ClientBrainV2HttpError(
        "Unable to update the reference role.",
        500,
      );
  }
  return getAiContentSession(clientId, sessionId);
}

export async function removeAiContentReference(
  clientId: string,
  sessionId: string,
  referenceId: string,
) {
  const { error } = await clientBrainV2ServerClient
    .from("ai_content_session_references")
    .delete()
    .eq("id", referenceId)
    .eq("session_id", sessionId)
    .eq("client_id", clientId);
  if (error)
    throw new ClientBrainV2HttpError("Unable to remove the reference.", 500);
  const references = (await sessionReferences(
    clientId,
    sessionId,
  )) as StudioReferenceRow[];
  await Promise.all(
    references.map((reference, index) =>
      clientBrainV2ServerClient
        .from("ai_content_session_references")
        .update({ reference_order: index + 1 })
        .eq("id", reference.id),
    ),
  );
  return getAiContentSession(clientId, sessionId);
}

export async function studioPickerData(clientId: string) {
  const [assets, pinterest, generated, content] = await Promise.all([
    loadRestaurantClientBrainV2AssetList(clientId),
    listPinterestInspirations(clientId, {
      status: "active",
      analysisState: "analyzed",
    }),
    clientBrainV2ServerClient
      .from("ai_content_generations")
      .select("id,version,session_id,file_object_id,aspect_ratio,generated_at")
      .eq("client_id", clientId)
      .eq("status", "generated")
      .not("file_object_id", "is", null)
      .order("generated_at", { ascending: false })
      .limit(60),
    clientBrainV2ServerClient
      .from("client_content_items")
      .select(
        "id,file_name,content_type,source,source_file_object_id,final_state,created_at",
      )
      .eq("client_id", clientId)
      .neq("final_state", "archived")
      .not("source_file_object_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  if (generated.error || content.error)
    throw new ClientBrainV2HttpError(
      "Unable to load reusable Studio references.",
      500,
    );
  // The shared thumbnail endpoint deliberately caps each request. The Studio
  // needs the full searchable library, so preserve that guardrail and merge
  // several small server-side batches instead of issuing one invalid request.
  const assetIds = assets.assetRecords.map((asset) => asset.id);
  const thumbnailBatches = await Promise.all(
    Array.from({ length: Math.ceil(assetIds.length / 48) }, (_, index) =>
      loadClientBrainV2AssetThumbnails(
        clientId,
        assetIds.slice(index * 48, (index + 1) * 48),
      ),
    ),
  );
  const thumbnails = {
    thumbnailUrls: Object.assign(
      {},
      ...thumbnailBatches.map((batch) => batch.thumbnailUrls),
    ) as Record<string, string>,
  };
  const referenceFiles = await filesById([
    ...(generated.data ?? []).flatMap((row) =>
      row.file_object_id ? [row.file_object_id] : [],
    ),
    ...(content.data ?? []).flatMap((row) =>
      row.source_file_object_id ? [row.source_file_object_id] : [],
    ),
  ]);
  return {
    assets: assets.assetRecords.map((asset) => {
      const metadata = asset.metadata as Record<string, unknown>;
      const category = String(metadata.asset_category ?? "unclassified");
      const isStaffIdentity =
        category === "staff" ||
        category === "people" ||
        category === "lifestyle";
      const generationReady =
        !isStaffIdentity ||
        metadata.approved_for_generation === true ||
        metadata.approved_for_generation === "true";
      const hasUsefulMetadata = Boolean(
        metadata.dish_name ||
        metadata.drink_name ||
        metadata.menu_display_name ||
        metadata.verified_description ||
        metadata.visual_presentation ||
        metadata.venue_zone,
      );
      return {
        id: asset.id,
        title:
          text(metadata.dish_name) ||
          text(metadata.drink_name) ||
          text(metadata.menu_display_name) ||
          asset.title ||
          `Untitled ${category}`,
        category,
        thumbnail_url: thumbnails.thumbnailUrls[asset.id] ?? null,
        generation_ready: generationReady,
        readiness_reason: generationReady
          ? null
          : "Staff identity needs explicit approval for generation",
        metadata_warning: hasUsefulMetadata ? null : "Limited metadata",
      };
    }),
    pinterest: pinterest.inspirations.map((pin) => ({
      id: pin.id,
      title: pin.title,
      thumbnail_url: pin.file.signed_url,
      camera_angle: pin.camera_angle,
      composition: pin.composition,
      lighting_style: pin.lighting_style,
      shot_scale: pin.shot_scale,
      interaction: pin.interaction,
    })),
    generations: await Promise.all(
      (generated.data ?? []).map(async (row) => ({
        id: row.id,
        title: `Version ${row.version}`,
        session_id: row.session_id,
        aspect_ratio: row.aspect_ratio,
        thumbnail_url: await signedUrl(
          referenceFiles.get(row.file_object_id) ?? null,
        ),
      })),
    ),
    content: await Promise.all(
      (content.data ?? []).map(async (row) => ({
        id: row.id,
        title: row.file_name || "Final Content",
        content_type: row.content_type,
        source: row.source,
        thumbnail_url: await signedUrl(
          referenceFiles.get(row.source_file_object_id) ?? null,
        ),
      })),
    ),
  };
}

function referenceAssignments(references: StudioReferenceRow[]) {
  return references.map((reference, index) => ({
    image_number: index + 1,
    reference_id: reference.id,
    role: reference.role,
    identity: verifiedIdentity(reference) || null,
    controls: referenceInheritance(reference.role).inherit,
  }));
}

function buildStudioPrompt(
  clientName: string,
  session: StudioSessionRow,
  references: StudioReferenceRow[],
  correction?: string,
) {
  const hasFood = references.some(
    (reference) => reference.role === "food_truth",
  );
  const hasDrink = references.some(
    (reference) => reference.role === "drink_truth",
  );
  const hasVenue = references.some(
    (reference) => reference.role === "venue_truth",
  );
  const hasPerson =
    /\b(person|woman|man|diner|model|hand|hands|she|he)\b/i.test(
      session.creative_request,
    );
  const blocks = [
    `IMAGE OBJECTIVE\nCreate one final ${session.aspect_ratio} commercial image for ${clientName}. Deliver a single 4K photographic image.`,
    `CREATIVE CONCEPT\n${session.creative_request}${correction ? `\n\nCurrent correction for this selected version: ${correction}` : ""}`,
    `REFERENCE HIERARCHY\nCurrent Food, Drink, Venue and approved identity truth control their respective real-world details. Composition inspiration controls framing, camera relationship, gesture and editorial storytelling only. When references conflict, factual truth wins.`,
    `FINAL SCENE CONSTRUCTION\nBuild one coherent editorial moment that fulfils the creative concept. Add only the people or small styling elements necessary to make that moment physically believable; do not replace or redesign a selected real-world reference.`,
    `COMPOSITION & CAMERA\nUse the visual analysis of the composition reference for framing, crop, camera relationship and depth. Use natural photographic language; do not invent camera brands, lens models or exposure settings.`,
    hasPerson
      ? `PEOPLE / GESTURE / INTERACTION\nUse only the person detail needed by the concept. Keep hands, wrists, grip, plate weight, glass grip and object contact physically possible. No extra fingers, merged hands, floating objects or intersecting limbs.`
      : "",
    hasFood || hasDrink
      ? `PRODUCT FIDELITY\nKeep every selected food and drink visually recognizable: real portion, vessel or glass, shape, color, texture, garnish, fill level and visible presentation. Do not substitute generic food or drinks; do not assume alcohol.`
      : "",
    hasVenue
      ? `VENUE / BACKGROUND FIDELITY\nReproduce only the visible, selected venue details required by the concept. Do not invent unseen architecture, furniture, doors, windows, tables, fixtures or decorations. A venue reference does not require a wide shot.`
      : "",
    `LIGHTING & COLOR\nFollow the reference images' visible lighting character and the concept. Use believable direction, softness, contrast, temperature and shadow density without artificial HDR, plastic surfaces or fake bloom.`,
    `REALISM\nUse physically plausible proportions, material response, reflections, food texture and spatial relationships. Avoid duplicate objects, warped geometry, melted food, generic restaurant backgrounds and synthetic luxury styling.`,
    `STRICT DO-NOT-CHANGE RULES\nDo not blend factual identity between references. Do not alter selected food, drinks, glassware, plating, venue details or approved identity. Do not import details from filenames, prior sessions or unrelated generation history.`,
    `OUTPUT\nOne ${session.aspect_ratio}, 4K, high-fidelity commercial photograph.`,
  ].filter(Boolean);
  return {
    prompt: blocks.join("\n\n"),
    assignments: referenceAssignments(references),
  };
}

function directorInput(
  clientName: string,
  session: StudioSessionRow,
  references: StudioReferenceRow[],
  correction?: string,
) {
  return {
    clientName,
    aspectRatio: session.aspect_ratio,
    userCreativeDirection: [session.creative_request, correction]
      .filter(Boolean)
      .join("\n\nCorrection for this version: "),
    selectedAssets: references.map((reference) => ({
      id: reference.id,
      title: verifiedIdentity(reference) || reference.display_name,
      role:
        reference.source_type === "pinterest_inspiration"
          ? ("inspiration" as const)
          : reference.role === "food_truth"
            ? ("food_truth" as const)
            : reference.role === "drink_truth"
              ? ("drink_truth" as const)
              : reference.role === "venue_truth"
                ? ("venue_or_background_truth" as const)
                : reference.role === "person_identity_truth"
                  ? ("model_truth" as const)
                  : ("composition_reference" as const),
      category: text(reference.source_metadata.category) || null,
      metadata: usefulMetadata(reference.source_metadata),
    })),
  };
}

function textFromAnthropicContent(content: unknown) {
  return Array.isArray(content)
    ? content
        .filter(
          (block): block is { type: "text"; text: string } =>
            Boolean(block) &&
            typeof block === "object" &&
            "type" in block &&
            block.type === "text" &&
            "text" in block &&
            typeof block.text === "string",
        )
        .map((block) => block.text)
        .join("\n")
    : "";
}

type NativeAnthropicImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

async function nativeAnthropicImages(references: StudioReferenceRow[]) {
  const byFile = await filesById(
    references.flatMap((reference) =>
      reference.file_object_id ? [reference.file_object_id] : [],
    ),
  );
  const images: NativeAnthropicImage[] = [];
  for (const [index, reference] of references.entries()) {
    const file = reference.file_object_id
      ? byFile.get(reference.file_object_id)
      : null;
    if (!file?.file_type?.startsWith("image/"))
      throw new ClientBrainV2HttpError(
        `Reference Image ${index + 1} is not an image.`,
        409,
      );
    const { data, error } = await clientBrainV2ServerClient.storage
      .from(file.storage_bucket)
      .download(file.preview_path || file.optimized_path || file.storage_path);
    if (error || !data)
      throw new ClientBrainV2HttpError(
        `Reference Image ${index + 1} could not be prepared.`,
        409,
      );
    const source = Buffer.from(await data.arrayBuffer());
    const metadata = await sharp(source, {
      limitInputPixels: false,
    }).metadata();
    const supported =
      file.file_type === "image/jpeg" ||
      file.file_type === "image/png" ||
      file.file_type === "image/webp";
    const normalize =
      !supported || Math.max(metadata.width ?? 0, metadata.height ?? 0) > 1600;
    const bytes = normalize
      ? await sharp(source, { limitInputPixels: false })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 84, mozjpeg: true })
          .toBuffer()
      : source;
    images.push({
      mimeType: normalize
        ? "image/jpeg"
        : (file.file_type as NativeAnthropicImage["mimeType"]),
      base64: bytes.toString("base64"),
    });
  }
  return images;
}

async function creativeDirectorMessageContent(
  input: ReturnType<typeof directorInput>,
  references: StudioReferenceRow[],
) {
  const images = await nativeAnthropicImages(references);
  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: NativeAnthropicImage["mimeType"];
          data: string;
        };
      }
  > = [];
  references.forEach((reference, index) => {
    content.push({
      type: "text",
      text: `REFERENCE IMAGE ${index + 1} — role: ${reference.role}. Useful verified metadata only: ${JSON.stringify(usefulMetadata(reference.source_metadata))}`,
    });
    const image = images[index];
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mimeType,
        data: image.base64,
      },
    });
  });
  content.push({ type: "text", text: creativeDirectorUserPrompt(input) });
  return {
    content,
    imageCount: images.length,
    referenceOrder: references.map((reference) => reference.id),
  };
}

function referenceSnapshot(references: StudioReferenceRow[]) {
  return references.map((reference) => ({
    id: reference.id,
    role: reference.role,
    source_type: reference.source_type,
    display_name: reference.display_name,
    metadata: usefulMetadata(reference.source_metadata),
  }));
}

function requestSummary(request: CreativeDirectorRequestRow) {
  return {
    id: request.id,
    request_id: request.request_id,
    status: request.status,
    prompt_version_id: request.prompt_version_id,
    failure_diagnostic: request.failure_diagnostic,
  };
}

async function persistPromptVersion(input: {
  clientId: string;
  sessionId: string;
  executionMode: StudioExecutionMode;
  userBrief: string;
  correction?: string;
  status: "ready" | "failed";
  title?: string;
  prompt?: string;
  rawText?: string;
  references: StudioReferenceRow[];
  execution: Record<string, unknown>;
}) {
  const { data: latest, error: latestError } = await clientBrainV2ServerClient
    .from("ai_content_prompt_versions")
    .select("version")
    .eq("client_id", input.clientId)
    .eq("session_id", input.sessionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError)
    throw new ClientBrainV2HttpError(
      "Unable to determine the next Creative Director prompt version.",
      500,
    );
  const row = {
    id: randomUUID(),
    client_id: input.clientId,
    session_id: input.sessionId,
    version: (latest?.version ?? 0) + 1,
    status: input.status,
    execution_mode: input.executionMode,
    provider: "anthropic",
    model: CREATIVE_DIRECTOR_MODEL,
    prompt_version: CREATIVE_DIRECTOR_PROMPT_VERSION,
    user_brief: input.userBrief,
    correction: text(input.correction) || null,
    generated_prompt: input.prompt ?? "",
    provider_prompt: input.prompt ?? "",
    structured_context: {
      generation_title: input.title ?? null,
      raw_text: input.rawText ?? null,
      reference_snapshot: referenceSnapshot(input.references),
    },
    execution: input.execution,
  };
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_prompt_versions")
    .insert(row)
    .select("*")
    .single();
  if (error || !data)
    throw new ClientBrainV2HttpError(
      "Unable to retain the Creative Director result.",
      500,
    );
  return data as StudioPromptRow;
}

async function reserveCreativeDirectorRequest(
  clientId: string,
  sessionId: string,
  requestId: string,
) {
  const candidate = {
    id: randomUUID(),
    client_id: clientId,
    session_id: sessionId,
    action_type: CREATIVE_DIRECTOR_ACTION,
    request_id: requestId,
    status: "pending",
    provider: "anthropic",
    model: CREATIVE_DIRECTOR_MODEL,
    prompt_version: CREATIVE_DIRECTOR_PROMPT_VERSION,
    execution: {
      provider_called: false,
      provider_retries: 0,
      reserved_at: new Date().toISOString(),
    },
  };
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_provider_requests")
    .insert(candidate)
    .select("*")
    .single();
  if (!error && data)
    return { request: data as CreativeDirectorRequestRow, reserved: true };
  if (error?.code !== "23505")
    throw new ClientBrainV2HttpError(
      "Unable to reserve the Creative Director request.",
      500,
    );
  const { data: existing, error: existingError } =
    await clientBrainV2ServerClient
      .from("ai_content_provider_requests")
      .select("*")
      .eq("client_id", clientId)
      .eq("session_id", sessionId)
      .eq("action_type", CREATIVE_DIRECTOR_ACTION)
      .eq("request_id", requestId)
      .maybeSingle();
  if (existingError || !existing)
    throw new ClientBrainV2HttpError(
      "Unable to recover the existing Creative Director request.",
      500,
    );
  return { request: existing as CreativeDirectorRequestRow, reserved: false };
}

async function updateCreativeDirectorRequest(
  requestId: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_provider_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error || !data)
    throw new ClientBrainV2HttpError(
      "Unable to retain the Creative Director request state.",
      500,
    );
  return data as CreativeDirectorRequestRow;
}

async function incompleteCreativeDirectorResult(input: {
  clientId: string;
  sessionId: string;
  request: CreativeDirectorRequestRow;
  session: StudioSessionRow;
  correction?: string;
  references: StudioReferenceRow[];
  execution: Record<string, unknown>;
  rawText?: string;
  diagnostic: string;
}) {
  const prompt = await persistPromptVersion({
    clientId: input.clientId,
    sessionId: input.sessionId,
    executionMode: "live",
    userBrief: input.session.creative_request,
    correction: input.correction,
    status: "failed",
    rawText: input.rawText,
    references: input.references,
    execution: {
      ...input.execution,
      completion_status: "incomplete",
      failure_diagnostic: input.diagnostic,
    },
  });
  await updateCreativeDirectorRequest(input.request.id, {
    status: "failed",
    prompt_version_id: prompt.id,
    raw_response: input.rawText ?? null,
    failure_diagnostic: input.diagnostic,
    execution: { ...input.execution, completion_status: "incomplete" },
  });
  throw new ClientBrainV2HttpError(input.diagnostic, 502);
}

export async function createAiContentPrompt(
  clientId: string,
  sessionId: string,
  requestId: string,
  correction?: string,
) {
  if (!isUuid(requestId))
    throw new ClientBrainV2HttpError(
      "A valid Creative Director request ID is required.",
      400,
    );
  const session = await assertSession(clientId, sessionId);
  const references = (await sessionReferences(
    clientId,
    sessionId,
  )) as StudioReferenceRow[];
  if (!session.creative_request.trim())
    throw new ClientBrainV2HttpError(
      "Describe what you want to create before making a prompt.",
      409,
    );
  if (references.length > MAX_REFERENCES)
    throw new ClientBrainV2HttpError(
      `A generation can use up to ${MAX_REFERENCES} references.`,
      409,
    );
  validateVenueReferences(references);
  const executionMode = mode();
  if (executionMode === "unavailable")
    throw new ClientBrainV2HttpError(
      "Creative Director is not enabled for this environment. Configure AI_CONTENT_STUDIO_MODE=live before creating a production prompt.",
      503,
    );
  const client = await requireClientBrainV2(clientId);
  const reservation = await reserveCreativeDirectorRequest(
    clientId,
    sessionId,
    requestId,
  );
  if (!reservation.reserved)
    return {
      ...(await getAiContentSession(clientId, sessionId)),
      creative_director_request: requestSummary(reservation.request),
    };
  const { prompt: deterministicPrompt, assignments } = buildStudioPrompt(
    client.name,
    session,
    references,
    correction,
  );
  const input = directorInput(client.name, session, references, correction);
  const multimodal = await creativeDirectorMessageContent(input, references);
  const baseExecution = {
    provider_called: false,
    provider_retries: 0,
    native_image_input_count: multimodal.imageCount,
    reference_order: multimodal.referenceOrder,
    reference_assignments: assignments,
    multimodal_contract: "anthropic-native-image-v1",
    created_at: new Date().toISOString(),
  };
  if (executionMode === "fixture") {
    const prompt = await persistPromptVersion({
      clientId,
      sessionId,
      executionMode,
      userBrief: session.creative_request,
      correction,
      status: "ready",
      title: "Creative Director fixture",
      prompt: deterministicPrompt,
      references,
      execution: baseExecution,
    });
    const request = await updateCreativeDirectorRequest(
      reservation.request.id,
      {
        status: "succeeded",
        prompt_version_id: prompt.id,
        execution: baseExecution,
      },
    );
    return {
      ...(await getAiContentSession(clientId, sessionId)),
      message:
        "Creative Director fixture prompt saved. No Anthropic request was made.",
      creative_director_request: requestSummary(request),
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await incompleteCreativeDirectorResult({
      clientId,
      sessionId,
      request: reservation.request,
      session,
      correction,
      references,
      execution: baseExecution,
      diagnostic:
        "Creative Director is not configured. No provider call was made.",
    });
    throw new Error("Creative Director configuration failure was not raised.");
  }
  try {
    const startedAt = Date.now();
    const response = await new Anthropic({
      apiKey,
      maxRetries: 0,
    }).messages.create({
      model: CREATIVE_DIRECTOR_MODEL,
      max_tokens: CREATIVE_DIRECTOR_MAX_TOKENS,
      temperature: 0.2,
      system: creativeDirectorSystemPrompt(),
      messages: [{ role: "user", content: multimodal.content }],
    });
    const rawText = textFromAnthropicContent(response.content);
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
    };
    const execution = {
      ...baseExecution,
      provider_called: true,
      ...usage,
      latency_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason ?? null,
      max_output_tokens: CREATIVE_DIRECTOR_MAX_TOKENS,
      cost_usd_actual: calcCost(CREATIVE_DIRECTOR_MODEL, usage),
    };
    // Preserve paid output before deciding whether it is safe to use.
    await updateCreativeDirectorRequest(reservation.request.id, {
      raw_response: rawText,
      execution,
    });
    if (response.stop_reason !== "end_turn")
      await incompleteCreativeDirectorResult({
        clientId,
        sessionId,
        request: reservation.request,
        session,
        correction,
        references,
        execution,
        rawText,
        diagnostic:
          "Creative Director response was incomplete. No prompt was generated.",
      });
    const parsed = parseCreativeDirectorPromptJson(rawText, references.length);
    if (!parsed.ok)
      await incompleteCreativeDirectorResult({
        clientId,
        sessionId,
        request: reservation.request,
        session,
        correction,
        references,
        execution,
        rawText,
        diagnostic: parsed.diagnostic,
      });
    if (!parsed.ok)
      throw new Error("Creative Director parse failure was not raised.");
    const prompt = await persistPromptVersion({
      clientId,
      sessionId,
      executionMode,
      userBrief: session.creative_request,
      correction,
      status: "ready",
      title: parsed.value.title,
      prompt: parsed.value.prompt,
      rawText,
      references,
      execution: { ...execution, completion_status: "complete" },
    });
    const request = await updateCreativeDirectorRequest(
      reservation.request.id,
      {
        status: "succeeded",
        prompt_version_id: prompt.id,
        execution: { ...execution, completion_status: "complete" },
      },
    );
    return {
      ...(await getAiContentSession(clientId, sessionId)),
      creative_director_request: requestSummary(request),
    };
  } catch (cause) {
    if (cause instanceof ClientBrainV2HttpError) throw cause;
    const diagnostic =
      cause instanceof Error
        ? cause.message
        : "Creative Director request failed.";
    await incompleteCreativeDirectorResult({
      clientId,
      sessionId,
      request: reservation.request,
      session,
      correction,
      references,
      execution: {
        ...baseExecution,
        provider_called: true,
        failed_at: new Date().toISOString(),
      },
      diagnostic,
    });
  }
}

export async function updateAiContentPrompt(
  clientId: string,
  sessionId: string,
  promptId: string,
  providerPrompt: unknown,
) {
  await assertSession(clientId, sessionId);
  const next = text(providerPrompt).slice(0, 60_000);
  if (!next)
    throw new ClientBrainV2HttpError(
      "The provider prompt cannot be empty.",
      400,
    );
  const { error } = await clientBrainV2ServerClient
    .from("ai_content_prompt_versions")
    .update({ provider_prompt: next, updated_at: new Date().toISOString() })
    .eq("id", promptId)
    .eq("session_id", sessionId)
    .eq("client_id", clientId);
  if (error)
    throw new ClientBrainV2HttpError("Unable to save the prompt edit.", 500);
  return getAiContentSession(clientId, sessionId);
}

async function binaryParts(references: StudioReferenceRow[]) {
  const byFile = await filesById(
    references.flatMap((reference) =>
      reference.file_object_id ? [reference.file_object_id] : [],
    ),
  );
  const parts: GeminiInlineReferencePart[] = [];
  for (const [index, reference] of references.entries()) {
    const file = reference.file_object_id
      ? byFile.get(reference.file_object_id)
      : null;
    if (!file?.file_type?.startsWith("image/"))
      throw new ClientBrainV2HttpError(
        `Reference Image ${index + 1} is not an image.`,
        409,
      );
    const { data, error } = await clientBrainV2ServerClient.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (error || !data)
      throw new ClientBrainV2HttpError(
        `Reference Image ${index + 1} could not be prepared.`,
        409,
      );
    parts.push({
      label: `REFERENCE IMAGE ${index + 1} — ${reference.display_name} — role: ${reference.role}`,
      inlineData: {
        mimeType: file.file_type,
        data: Buffer.from(await data.arrayBuffer()).toString("base64"),
      },
    });
  }
  return parts;
}

export async function generateAiContent(
  clientId: string,
  sessionId: string,
  promptVersionId?: string,
  _requestId?: string,
) {
  const session = await assertSession(clientId, sessionId);
  const references = (await sessionReferences(
    clientId,
    sessionId,
  )) as StudioReferenceRow[];
  if (!promptVersionId || !isUuid(promptVersionId))
    throw new ClientBrainV2HttpError(
      "Create and review a Creative Director prompt before generating.",
      409,
    );
  const { data: promptVersion, error: promptError } =
    await clientBrainV2ServerClient
      .from("ai_content_prompt_versions")
      .select("*")
      .eq("id", promptVersionId)
      .eq("client_id", clientId)
      .eq("session_id", sessionId)
      .eq("status", "ready")
      .maybeSingle();
  if (promptError || !promptVersion)
    throw new ClientBrainV2HttpError(
      "The selected Creative Director prompt is not available.",
      409,
    );
  if (!references.length)
    throw new ClientBrainV2HttpError(
      "Add at least one approved truth or creative reference before generating.",
      409,
    );
  if (references.length > MAX_REFERENCES)
    throw new ClientBrainV2HttpError(
      `A generation can use up to ${MAX_REFERENCES} references.`,
      409,
    );
  validateVenueReferences(references);
  const executionMode = mode();
  if (executionMode === "unavailable")
    throw new ClientBrainV2HttpError(
      "Nano Banana generation is not enabled for this environment. Configure AI_CONTENT_STUDIO_MODE=live before generating.",
      503,
    );
  if (
    promptVersion.execution_mode !== executionMode ||
    (executionMode === "live" &&
      promptVersion.prompt_version !== CREATIVE_DIRECTOR_PROMPT_VERSION)
  )
    throw new ClientBrainV2HttpError(
      "Create and review a current live Creative Director prompt before generating.",
      409,
    );
  const { assignments } = buildStudioPrompt(
    (await requireClientBrainV2(clientId)).name,
    session,
    references,
  );
  const prompt = text(promptVersion.provider_prompt);
  // Assemble the same ordered Nano Banana request in dry-run mode, but retain
  // only its auditable shape. Inline image bytes remain transient.
  let dryRunPackage: Record<string, unknown> = {};
  if (executionMode === "fixture") {
    const parts = await binaryParts(references);
    const request = buildIndividualProductionGeminiRequest(prompt, parts, {
      aspectRatio: session.aspect_ratio,
      imageSize: "4K",
    });
    const issue = validateIndividualProductionGeminiRequest(request, {
      aspectRatio: session.aspect_ratio,
      imageSize: "4K",
    });
    if (issue)
      throw new ClientBrainV2HttpError(
        `Image generation could not be prepared: ${issue}.`,
        409,
      );
    dryRunPackage = {
      native_image_input_count: parts.length,
      reference_order: references.map((reference) => reference.id),
      production_contract: "nano-banana-native-image-v1",
    };
  }
  const { data: latest } = await clientBrainV2ServerClient
    .from("ai_content_generations")
    .select("version")
    .eq("client_id", clientId)
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  const generation = {
    id: randomUUID(),
    client_id: clientId,
    session_id: sessionId,
    prompt_version_id: promptVersionId,
    version,
    status: executionMode === "live" ? "generating" : "ready",
    execution_mode: executionMode,
    provider: "google-gemini",
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    aspect_ratio: session.aspect_ratio,
    output_resolution: "4K",
    prompt_text: prompt,
    reference_snapshot: references,
    execution: {
      provider_called: false,
      reference_assignments: assignments,
      ...dryRunPackage,
      created_at: new Date().toISOString(),
    },
  };
  const { data: stored, error } = await clientBrainV2ServerClient
    .from("ai_content_generations")
    .insert(generation)
    .select("*")
    .single();
  if (error || !stored)
    throw new ClientBrainV2HttpError(
      "Unable to retain the AI Content generation package. No provider call was made.",
      500,
    );
  if (executionMode === "fixture")
    return {
      ...(await getAiContentSession(clientId, sessionId)),
      message: "Generation fixture package saved. No Gemini request was made.",
    };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await clientBrainV2ServerClient
      .from("ai_content_generations")
      .update({ status: "failed", failure_reason: "Gemini is not configured." })
      .eq("id", stored.id);
    throw new ClientBrainV2HttpError(
      "Gemini is not configured. No image was generated.",
      503,
    );
  }
  try {
    const parts = await binaryParts(references);
    const request = buildIndividualProductionGeminiRequest(prompt, parts, {
      aspectRatio: session.aspect_ratio,
      imageSize: "4K",
    });
    const issue = validateIndividualProductionGeminiRequest(request, {
      aspectRatio: session.aspect_ratio,
      imageSize: "4K",
    });
    if (issue)
      throw new ClientBrainV2HttpError(
        `Image generation could not be prepared: ${issue}.`,
        409,
      );
    const startedAt = Date.now();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(300_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
        };
      }>;
    };
    if (!response.ok)
      throw new ClientBrainV2HttpError(
        payload.error?.message ||
          `Gemini image generation failed (${response.status}).`,
        response.status === 403 ? 503 : 502,
      );
    const image = payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.inlineData)
      .find((part) => part?.data);
    if (!image?.data)
      throw new ClientBrainV2HttpError(
        "Gemini did not return an image. This version was retained as failed.",
        502,
      );
    const mime = image.mimeType || "image/png";
    const bytes = Buffer.from(image.data, "base64");
    const filename = `${safeName((await requireClientBrainV2(clientId)).name)}-ai-content-${new Date().toISOString().slice(0, 10)}-v${String(version).padStart(2, "0")}.${extensionForMime(mime)}`;
    const path = `${clientId}/ai-content/generated/${sessionId}/${stored.id}.${extensionForMime(mime)}`;
    const { error: uploadError } = await clientBrainV2ServerClient.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError)
      throw new ClientBrainV2HttpError(
        "Image was generated but could not be stored.",
        500,
      );
    const { data: file, error: fileError } = await clientBrainV2ServerClient
      .from("client_brain_file_objects")
      .insert({
        storage_bucket: BUCKET,
        storage_path: path,
        file_name: filename,
        file_type: mime,
        file_size_bytes: bytes.length,
        metadata: {
          artifact_type: "ai_content_generated",
          client_id: clientId,
          session_id: sessionId,
          generation_id: stored.id,
          version,
        },
      })
      .select("id")
      .single();
    if (fileError || !file)
      throw new ClientBrainV2HttpError(
        "Image was generated but could not be registered.",
        500,
      );
    await clientBrainV2ServerClient
      .from("ai_content_generations")
      .update({
        status: "generated",
        file_object_id: file.id,
        generated_at: new Date().toISOString(),
        execution: {
          provider_called: true,
          latency_ms: Date.now() - startedAt,
          finish_reason: payload.candidates?.[0]?.finishReason ?? null,
          reference_assignments: assignments,
          usage: null,
          cost_usd_actual: null,
        },
      })
      .eq("id", stored.id);
    await clientBrainV2ServerClient
      .from("ai_content_sessions")
      .update({ active_generation_id: stored.id })
      .eq("id", sessionId)
      .eq("client_id", clientId);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Image generation failed.";
    await clientBrainV2ServerClient
      .from("ai_content_generations")
      .update({
        status: "failed",
        failure_reason: message,
        execution: {
          provider_called: true,
          failed_at: new Date().toISOString(),
          reference_assignments: assignments,
        },
      })
      .eq("id", stored.id);
    throw cause;
  }
  return getAiContentSession(clientId, sessionId);
}

export async function downloadAiContentGeneration(
  clientId: string,
  generationId: string,
) {
  const { data, error } = await clientBrainV2ServerClient
    .from("ai_content_generations")
    .select("id,file_object_id")
    .eq("id", generationId)
    .eq("client_id", clientId)
    .eq("status", "generated")
    .maybeSingle();
  if (error || !data?.file_object_id)
    throw new ClientBrainV2HttpError("Generated image not found.", 404);
  const file = (await filesById([data.file_object_id])).get(
    data.file_object_id,
  );
  if (!file) throw new ClientBrainV2HttpError("Generated file not found.", 404);
  const { data: body, error: downloadError } =
    await clientBrainV2ServerClient.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
  if (downloadError || !body)
    throw new ClientBrainV2HttpError(
      "Unable to download generated image.",
      500,
    );
  return { body, file };
}

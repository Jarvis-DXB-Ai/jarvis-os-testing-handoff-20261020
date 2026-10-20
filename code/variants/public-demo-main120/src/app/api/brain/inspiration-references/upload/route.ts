import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import {
  INSPIRATION_ASSET_CATEGORY,
  INSPIRATION_SOURCES,
  INSPIRATION_USAGES,
  folderSlug,
  heuristicInspirationFields,
  normalizeInspirationFolder,
  type InspirationSource,
  type InspirationUsage,
} from "@/lib/inspiration-references"

const BUCKET = "client-assets"
const MAX_FILES = 80
const MAX_REMOTE_BYTES = 16 * 1024 * 1024

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function pickSource(value: FormDataEntryValue | null): InspirationSource {
  return INSPIRATION_SOURCES.includes(value as InspirationSource) ? value as InspirationSource : "manual_upload"
}

function pickFolder(value: FormDataEntryValue | null) {
  return normalizeInspirationFolder(value)
}

function parseList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return []
  return value.split(",").map(item => item.trim()).filter(Boolean)
}

function parseUsage(value: FormDataEntryValue | null): InspirationUsage[] {
  const requested = parseList(value).filter(item => INSPIRATION_USAGES.includes(item as InspirationUsage)) as InspirationUsage[]
  return requested.length > 0 ? requested : ["photography", "videography", "graphic_design", "social", "content_planning"]
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === BUCKET)) {
    await sb.storage.createBucket(BUCKET, { public: false })
  }
}

async function fetchRemoteImage(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Image URL could not be fetched.")

  const contentType = response.headers.get("content-type") || "image/jpeg"
  if (!contentType.startsWith("image/")) throw new Error("Image URL must return an image.")

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_REMOTE_BYTES) throw new Error("Image URL is too large.")

  const extension =
    contentType.includes("png") ? "png" :
    contentType.includes("webp") ? "webp" :
    contentType.includes("gif") ? "gif" :
    "jpg"

  return { buffer, contentType, extension }
}

function metadataFor(input: {
  clientId: string
  title: string
  source: InspirationSource
  folder: string
  sourceUrl?: string
  notes?: string
  usage: InspirationUsage[]
  tags: string[]
  mode: string
  imageUrl?: string
}) {
  const heuristic = input.mode === "analyze"
    ? heuristicInspirationFields({ folder: input.folder, title: input.title, notes: input.notes, tags: input.tags })
    : {}

  return {
    type: "Inspiration Reference",
    title: input.title,
    source: input.source,
    folder: input.folder,
    imageUrl: input.imageUrl,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
    usage: input.usage,
    tags: input.tags,
    contentPillar: input.folder,
    campaignSystem: input.folder,
    inspirationOnly: true,
    usage_role: "creative_inspiration_only",
    uploadMode: input.mode === "analyze" ? "upload_plus_analyze" : "upload_only",
    analysisMethod: input.mode === "analyze" ? "local_heuristic_no_paid_ai" : "none",
    createdAt: new Date().toISOString(),
    ...heuristic,
  }
}

async function insertAsset(input: {
  clientId: string
  title: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  metadata: Record<string, unknown>
}) {
  const { data, error } = await sb
    .from("asset_uploads")
    .insert({
      client_id: input.clientId,
      file_name: input.title || input.fileName,
      file_path: input.filePath,
      file_type: input.fileType,
      asset_category: INSPIRATION_ASSET_CATEGORY,
      file_size: input.fileSize,
      extraction_status: input.metadata.uploadMode === "upload_plus_analyze" ? "completed" : "skipped",
      extraction_method: input.metadata.uploadMode === "upload_plus_analyze" ? "local_inspiration_heuristic" : "upload_only",
      source_quality: "original",
      metadata: input.metadata,
    })
    .select("id, file_name, asset_category, file_path, metadata")
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const clientId = formData.get("client_id")
    if (typeof clientId !== "string" || clientId.length === 0) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 })
    }

    const source = pickSource(formData.get("source"))
    const folder = pickFolder(formData.get("folder"))
    const title = typeof formData.get("title") === "string" ? String(formData.get("title")).trim() : ""
    const sourceUrl = typeof formData.get("source_url") === "string" ? String(formData.get("source_url")).trim() || undefined : undefined
    const notes = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() || undefined : undefined
    const tags = parseList(formData.get("tags"))
    const usage = parseUsage(formData.get("usage"))
    const mode = formData.get("upload_mode") === "analyze" ? "analyze" : "upload_only"
    const imageUrl = typeof formData.get("image_url") === "string" ? String(formData.get("image_url")).trim() : ""
    const files = formData.getAll("files[]").filter((file): file is File => file instanceof File && file.size > 0 && file.type.startsWith("image/"))

    if (files.length === 0 && !imageUrl) {
      return NextResponse.json({ error: "Add image files or an image URL." }, { status: 400 })
    }

    await ensureBucket()

    const uploaded = []
    for (const file of files.slice(0, MAX_FILES)) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const safeName = safeFileName(file.name)
      const path = `${clientId}/inspiration-references/${folderSlug(folder)}/${Date.now()}_${randomUUID()}_${safeName}`
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      })
      if (uploadError) throw new Error(uploadError.message)

      uploaded.push(await insertAsset({
        clientId,
        title: title || file.name,
        fileName: file.name,
        filePath: path,
        fileType: file.type || "image/jpeg",
        fileSize: buffer.length,
        metadata: metadataFor({ clientId, title: title || file.name, source, folder, sourceUrl, notes, usage, tags, mode }),
      }))
    }

    if (imageUrl) {
      const remote = await fetchRemoteImage(imageUrl)
      const remoteName = safeFileName(title || new URL(imageUrl).pathname.split("/").pop() || `url-reference.${remote.extension}`)
      const path = `${clientId}/inspiration-references/${folderSlug(folder)}/${Date.now()}_${randomUUID()}_${remoteName}.${remote.extension}`
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, remote.buffer, {
        contentType: remote.contentType,
        upsert: false,
      })
      if (uploadError) throw new Error(uploadError.message)

      uploaded.push(await insertAsset({
        clientId,
        title: title || "URL inspiration reference",
        fileName: remoteName,
        filePath: path,
        fileType: remote.contentType,
        fileSize: remote.buffer.length,
        metadata: metadataFor({ clientId, title: title || "URL inspiration reference", source: source === "manual_upload" ? "url" : source, folder, sourceUrl: sourceUrl || imageUrl, notes, usage, tags, mode, imageUrl }),
      }))
    }

    return NextResponse.json({ success: true, uploads: uploaded })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inspiration upload failed." },
      { status: 500 }
    )
  }
}

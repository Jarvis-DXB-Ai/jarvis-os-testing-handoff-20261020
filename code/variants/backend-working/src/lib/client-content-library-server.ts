import "server-only"

import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = "client-content"
const contentTypes = new Set(["feed", "carousel", "reel", "story", "graphic", "ai_photography", "video", "other"])
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const monthStart = (value: unknown) => /^\d{4}-\d{2}-01$/.test(text(value)) ? text(value) : null

type ContentItem = { id: string; monthStart: string; contentType: string; mediaType: string; source: string; sourceReference: Record<string, unknown>; sourceSessionId: string | null; sourceGenerationId: string | null; sourceFileObjectId: string | null; storageBucket: string | null; storagePath: string | null; fileName: string; mimeType: string; byteSize: number | null; width: number | null; height: number | null; finalState: string; createdAt: string; signedUrl: string | null }

async function requireClient(clientId: string) { const { data, error } = await db.from("clients").select("id").eq("id", clientId).maybeSingle(); if (error) throw new Error(error.message); if (!data) throw new Error("Client not found.") }
async function url(bucket: string | null, path: string | null) { if (!bucket || !path) return null; const { data } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60); return data?.signedUrl ?? null }
function map(row: Record<string, unknown>, start: string): ContentItem { return { id: text(row.id), monthStart: start, contentType: text(row.content_type), mediaType: text(row.media_type), source: text(row.source), sourceReference: row.source_reference && typeof row.source_reference === "object" ? row.source_reference as Record<string, unknown> : {}, sourceSessionId: text(row.source_session_id) || null, sourceGenerationId: text(row.source_generation_id) || null, sourceFileObjectId: text(row.source_file_object_id) || null, storageBucket: text(row.storage_bucket) || null, storagePath: text(row.storage_path) || null, fileName: text(row.file_name), mimeType: text(row.mime_type), byteSize: typeof row.byte_size === "number" ? row.byte_size : null, width: typeof row.width === "number" ? row.width : null, height: typeof row.height === "number" ? row.height : null, finalState: text(row.final_state), createdAt: text(row.created_at), signedUrl: null } }

export async function loadClientContentLibrary(clientId: string) {
  await requireClient(clientId)
  const [{ data: months, error: monthsError }, { data: items, error: itemsError }, { data: socialMonths, error: socialMonthsError }, { data: socialItems, error: socialItemsError }, { data: media, error: mediaError }] = await Promise.all([
    db.from("client_content_months").select("id, month_start").eq("client_id", clientId),
    db.from("client_content_items").select("*").eq("client_id", clientId).neq("final_state", "archived"),
    db.from("social_content_months").select("id, month_start").eq("client_id", clientId),
    db.from("social_content_items").select("id, social_content_month_id, content_kind, format, title, source, created_at").eq("client_id", clientId),
    db.from("social_content_media").select("id, social_content_item_id, storage_bucket, storage_path, file_name, mime_type, byte_size, width, height, created_at").eq("client_id", clientId).order("sort_order"),
  ])
  for (const result of [monthsError, itemsError, socialMonthsError, socialItemsError, mediaError]) if (result) throw new Error(result.message)
  const monthById = new Map((months ?? []).map(row => [row.id, row.month_start as string]))
  const socialMonthById = new Map((socialMonths ?? []).map(row => [row.id, row.month_start as string]))
  const explicit = (items ?? []).map(row => map(row as Record<string, unknown>, monthById.get(row.client_content_month_id) ?? "")).filter(item => item.monthStart)
  const social = (socialItems ?? []).flatMap(item => {
    const start = socialMonthById.get(item.social_content_month_id); const first = (media ?? []).find(candidate => candidate.social_content_item_id === item.id)
    if (!start || !first) return []
    return [map({ id: `social:${item.id}`, content_type: item.format ?? item.content_kind, media_type: String(first.mime_type).startsWith("video/") ? "video" : "image", source: "social_publishing", source_reference: { social_content_item_id: item.id, title: item.title ?? null }, storage_bucket: first.storage_bucket, storage_path: first.storage_path, file_name: first.file_name, mime_type: first.mime_type, byte_size: first.byte_size, width: first.width, height: first.height, final_state: "final", created_at: item.created_at }, start)]
  })
  const all = await Promise.all([...explicit, ...social].map(async item => ({ ...item, signedUrl: await url(item.storageBucket, item.storagePath) })))
  const starts = [...new Set([...monthById.values(), ...socialMonthById.values()])].sort().reverse()
  return { months: starts, items: all.sort((a, b) => b.monthStart.localeCompare(a.monthStart) || b.createdAt.localeCompare(a.createdAt)) }
}

export async function createContentMonth(clientId: string, value: unknown) {
  await requireClient(clientId); const start = monthStart(value); if (!start) throw new Error("Month must be the first day of a month.")
  const { data, error } = await db.from("client_content_months").upsert({ client_id: clientId, month_start: start }, { onConflict: "client_id,month_start" }).select("id, month_start").single()
  if (error) throw new Error(error.message); return data
}

export async function finalizeAiContentGeneration(clientId: string, generationId: string, input: { monthStart?: unknown; contentType?: unknown; title?: unknown }) {
  await requireClient(clientId)
  const requestedMonth = monthStart(input.monthStart)
  if (!requestedMonth) throw new Error("Choose a valid final Content month.")
  const requestedType = text(input.contentType)
  const contentType = contentTypes.has(requestedType) ? requestedType : "ai_photography"
  const title = text(input.title).slice(0, 140) || null
  const { data: generation, error: generationError } = await db.from("ai_content_generations").select("id, session_id, file_object_id, status, generated_at").eq("id", generationId).eq("client_id", clientId).eq("status", "generated").maybeSingle()
  if (generationError) throw new Error(generationError.message)
  if (!generation?.file_object_id) throw new Error("Only a successfully generated image can be saved as Final Content.")
  const { data: file, error: fileError } = await db.from("client_brain_file_objects").select("id, file_name, file_type, storage_bucket, storage_path, file_size_bytes, metadata").eq("id", generation.file_object_id).maybeSingle()
  if (fileError) throw new Error(fileError.message)
  if (!file) throw new Error("The generated image file is unavailable.")
  const month = await createContentMonth(clientId, requestedMonth)
  const base = db.from("client_content_items").select("id").eq("client_id", clientId).eq("client_content_month_id", month.id).eq("source", "ai_content").eq("source_generation_id", generation.id).eq("content_type", contentType).neq("final_state", "archived")
  const { data: existing, error: existingError } = await base.maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return { itemId: existing.id as string, created: false, monthStart: requestedMonth, contentType }
  const metadata = file.metadata && typeof file.metadata === "object" ? file.metadata as Record<string, unknown> : {}
  const mimeType = text(file.file_type) || "application/octet-stream"
  const mediaType = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "other"
  const { data: item, error: insertError } = await db.from("client_content_items").insert({
    client_id: clientId,
    client_content_month_id: month.id,
    content_type: contentType,
    media_type: mediaType,
    source: "ai_content",
    source_session_id: generation.session_id,
    source_generation_id: generation.id,
    source_file_object_id: file.id,
    source_reference: { source_type: "ai_content", source_session_id: generation.session_id, source_generation_id: generation.id, source_file_object_id: file.id, generated_at: generation.generated_at ?? null, title, canonical_media: { storage_bucket: file.storage_bucket, storage_path: file.storage_path } },
    storage_bucket: file.storage_bucket,
    storage_path: file.storage_path,
    file_name: file.file_name,
    mime_type: mimeType,
    byte_size: file.file_size_bytes,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
    final_state: "final",
  }).select("id").single()
  if (insertError?.code === "23505") {
    const { data: concurrent } = await base.maybeSingle()
    if (concurrent) return { itemId: concurrent.id as string, created: false, monthStart: requestedMonth, contentType }
  }
  if (insertError || !item) throw new Error(insertError?.message || "Unable to save the generated image as Final Content.")
  return { itemId: item.id as string, created: true, monthStart: requestedMonth, contentType }
}

export async function uploadClientContent(clientId: string, formData: FormData) {
  const month = await createContentMonth(clientId, formData.get("monthStart"))
  const requestedType = text(formData.get("contentType")); const contentType = contentTypes.has(requestedType) ? requestedType : "other"
  const files = formData.getAll("files").filter((value): value is File => value instanceof File)
  if (!files.length || files.length > 30) throw new Error("Upload between 1 and 30 files.")
  const created: string[] = []
  for (const file of files) {
    const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "other"
    if (mediaType === "image" && file.size > 10 * 1024 * 1024) throw new Error(`${file.name} exceeds the 10 MB image limit.`)
    if (mediaType === "video" && file.size > 100 * 1024 * 1024) throw new Error(`${file.name} exceeds the 100 MB video limit.`)
    const buffer = Buffer.from(await file.arrayBuffer()); let width: number | null = null; let height: number | null = null
    if (mediaType === "image") { const metadata = await sharp(buffer).metadata(); width = metadata.width ?? null; height = metadata.height ?? null }
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin"
    const path = `${clientId}/${month.month_start}/${randomUUID()}.${extension}`
    const { data: item, error: insertError } = await db.from("client_content_items").insert({ client_id: clientId, client_content_month_id: month.id, content_type: contentType, media_type: mediaType, source: "historical_upload", storage_bucket: BUCKET, storage_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream", byte_size: file.size, width, height }).select("id").single()
    if (insertError) throw new Error(insertError.message)
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false })
    if (uploadError) { await db.from("client_content_items").delete().eq("id", item.id).eq("client_id", clientId); throw new Error(uploadError.message) }
    created.push(item.id)
  }
  return created
}

export async function archiveClientContent(clientId: string, itemId: string) {
  if (itemId.startsWith("social:")) throw new Error("Social Publishing content remains owned by Publishing and cannot be archived here.")
  const { error } = await db.from("client_content_items").update({ final_state: "archived", archived_at: new Date().toISOString() }).eq("id", itemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

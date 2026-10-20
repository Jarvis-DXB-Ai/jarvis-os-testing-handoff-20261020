import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATH_PATTERN = /^social-thumbnails\/(instagram|facebook)\/[a-zA-Z0-9_-]+\.jpg$/

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Server database credentials are not configured.")
  return createClient(url, key)
}

/** A local-cache redirect only. It never dereferences a provider media URL. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = new URL(request.url).searchParams.get("path") || ""
  if (!UUID_PATTERN.test(id) || !PATH_PATTERN.test(path)) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    const sb = serviceClient()
    const [{ data: snapshots, error }, { data: observations, error: observationsError }] = await Promise.all([
      sb.from("social_performance_snapshots").select("top_posts").eq("client_id", id).eq("provider", "zernio").limit(100),
      sb.from("social_performance_post_observations").select("thumbnail_path").eq("client_id", id).eq("provider", "zernio").eq("thumbnail_path", path).limit(1),
    ])
    if (error || observationsError) throw error || observationsError
    const allowed = Boolean(observations?.length) || (snapshots ?? []).some(snapshot => Array.isArray(snapshot.top_posts) && snapshot.top_posts.some((post: unknown) => post && typeof post === "object" && (post as { thumbnailPath?: unknown }).thumbnailPath === path))
    if (!allowed) return NextResponse.json({ ok: false }, { status: 404 })
    const { data, error: signError } = await sb.storage.from("client-assets").createSignedUrl(path, 60 * 10)
    if (signError || !data?.signedUrl) return NextResponse.json({ ok: false }, { status: 404 })
    return NextResponse.redirect(data.signedUrl, { status: 307 })
  } catch { return NextResponse.json({ ok: false }, { status: 500 }) }
}

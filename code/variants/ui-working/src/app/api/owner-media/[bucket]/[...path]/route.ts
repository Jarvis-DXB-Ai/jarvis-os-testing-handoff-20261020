import { ownerForRequest } from "@/lib/owner-request-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ bucket: string; path: string[] }> }) {
  const owner = await ownerForRequest(request);
  if (owner instanceof Response) return owner;
  const { bucket, path } = await context.params;
  if (!["guest-models", "thumbnails"].includes(bucket)
    || path.some(part => !part || part === "." || part === ".." || /[\\/%?#\x00-\x1f]/.test(part)))
    return new Response("Not found", { status: 404 });
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return new Response("Media access is not configured", { status: 503 });
  const headers = new Headers({ apikey: key, authorization: `Bearer ${key}` });
  if (request.headers.has("range")) headers.set("range", request.headers.get("range")!);
  const response = await fetch(`${base}/storage/v1/object/authenticated/${bucket}/${path.map(encodeURIComponent).join("/")}`, {
    headers, cache: "no-store", redirect: "error", signal: request.signal,
  });
  if (!response.ok) return new Response("Media unavailable", { status: response.status === 404 ? 404 : 502 });
  const resultHeaders = new Headers({ "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  for (const name of ["content-type", "content-range", "accept-ranges", "content-length"])
    if (response.headers.has(name)) resultHeaders.set(name, response.headers.get(name)!);
  // Untrusted active content must not execute on the authenticated app origin.
  if (!/^(image\/(png|jpeg|webp|gif|avif)|video\/mp4)(;|$)/i.test(response.headers.get("content-type") || ""))
    resultHeaders.set("content-disposition", "attachment");
  resultHeaders.set("content-security-policy", "sandbox; default-src 'none'");
  return new Response(response.body, { status: response.status, headers: resultHeaders });
}

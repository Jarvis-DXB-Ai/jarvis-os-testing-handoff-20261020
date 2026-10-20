const privateBuckets = new Set(["guest-models", "thumbnails"]);

export function ownerMediaPath(bucket: string, path: string) {
  return `/api/owner-media/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Upgrade legacy public storage references at the read boundary, without rewriting client records. */
export function privateMediaUrl(value: string, supabaseUrl: string) {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/`;
  if (!value.startsWith(prefix)) return value;
  const [bucket, ...parts] = value.slice(prefix.length).split("/");
  if (!privateBuckets.has(bucket) || !parts.length) return value;
  try { return ownerMediaPath(bucket, parts.map(decodeURIComponent).join("/")); } catch { return value; }
}

export function privateMediaValues(value: unknown, supabaseUrl: string): unknown {
  if (typeof value === "string") return privateMediaUrl(value, supabaseUrl);
  if (Array.isArray(value)) return value.map(item => privateMediaValues(item, supabaseUrl));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, privateMediaValues(item, supabaseUrl)]));
  return value;
}

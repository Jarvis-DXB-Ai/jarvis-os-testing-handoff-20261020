import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DISPLAY_PREVIEW_MAX_EDGE = 640;
export const DISPLAY_PREVIEW_MAX_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const VERSION = 'v1';

// Display derivative only. Never use this buffer to replace a source or generation input.
export async function createAssetDisplayPreview(input: Buffer) {
  if (input.length > MAX_SOURCE_BYTES) throw new Error('Preview source exceeds the processing limit.');
  for (const [edge, quality] of [[640, 65], [512, 55], [384, 45]]) {
    const output = await sharp(input, { limitInputPixels: 80_000_000, animated: false })
      .rotate().resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 3 }).toBuffer();
    if (output.length <= DISPLAY_PREVIEW_MAX_BYTES) return output;
  }
  throw new Error('Unable to create a bounded display preview.');
}

type PreviewSource = { id: string; storage_bucket: string; storage_path: string; preview_path?: string | null; optimized_path?: string | null; file_type?: string | null };
const pending = new Map<string, Promise<string | null>>();

/** Caller must authorize and resolve this file through the client-scoped record assignment. */
export async function ensureAssetDisplayPreview(db: SupabaseClient, file: PreviewSource): Promise<string | null> {
  if (!file.file_type?.startsWith('image/')) return null;
  const bucket = db.storage.from(file.storage_bucket);
  // Existing preview is a useful source, but even it may be oversized. Never return it directly.
  const source = file.preview_path || file.optimized_path || file.storage_path;
  if (!source) return null;
  const { data: info, error } = await bucket.info(source);
  if (error || !info || (info.size ?? 0) > MAX_SOURCE_BYTES) return null;
  const revision = info.version || info.etag || info.lastModified || info.updatedAt;
  if (!revision) return null; // No stable revision means no safe reusable derivative identity.
  const hash = createHash('sha256').update(JSON.stringify([file.storage_bucket, source, revision])).digest('hex');
  const path = `display-previews/${VERSION}/${file.id}/${hash}.webp`;
  if (path === source || path === file.storage_path) throw new Error('Preview must not overwrite source.');
  const key = `${file.storage_bucket}/${path}`;
  const current = pending.get(key);
  if (current) return current;
  const work = (async () => {
    const existing = await bucket.exists(path);
    if (existing.data) return path;
    const downloaded = await bucket.download(source);
    if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_SOURCE_BYTES) return null;
    try {
      const preview = await createAssetDisplayPreview(Buffer.from(await downloaded.data.arrayBuffer()));
      const uploaded = await bucket.upload(path, preview, { contentType: 'image/webp', cacheControl: '1800', upsert: false });
      if (uploaded.error && !(await bucket.exists(path)).data) return null;
      return path;
    } catch { return null; } // Stable no-preview UI; never send the original as a fallback.
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

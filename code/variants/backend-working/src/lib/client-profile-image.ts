import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { clientBrainV2ServerClient as db, isUuid, ClientBrainV2HttpError } from '@/lib/client-brain-v2-server-core';
import { createAssetDisplayPreview } from '@/lib/asset-display-preview';
export type ProfileImageSlot = 'cover' | 'avatar';
const bucket = () => db.storage.from('client-assets');
export async function requireProfileClient(id: string) {
  if (!isUuid(id)) throw new ClientBrainV2HttpError('Invalid client.',400);
  const result = await db.from('clients').select('id').eq('id',id).maybeSingle();
  if (result.error) throw new ClientBrainV2HttpError('Client unavailable.',500);
  if (!result.data) throw new ClientBrainV2HttpError('Client not found.',404);
}
export async function profileRevision(id: string, slot: ProfileImageSlot): Promise<string | null> {
  const result = await bucket().download(`${id}/profile/${slot}.json`);
  if (result.error) {
    if (['400','404'].includes(String(result.error.statusCode)) && /not found|does not exist/i.test(result.error.message)) return null;
    throw new ClientBrainV2HttpError('Profile image unavailable.',503);
  }
  if (!result.data || result.data.size > 1024) return null;
  const value = JSON.parse(await result.data.text()) as { revision?: string };
  return value.revision && isUuid(value.revision) ? value.revision : null;
}
export async function saveProfileImage(id: string, slot: ProfileImageSlot, file: File) {
  await requireProfileClient(id);
  if (!file.size || file.size > 10*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new ClientBrainV2HttpError('Choose a JPEG, PNG or WebP image up to 10 MB.',400);
  const original = Buffer.from(await file.arrayBuffer());
  let preview: Buffer;
  try {
    const metadata = await sharp(original,{limitInputPixels:80_000_000}).metadata();
    if (!['jpeg','png','webp'].includes(metadata.format || '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
    preview = await createAssetDisplayPreview(original);
  } catch { throw new ClientBrainV2HttpError('This image could not be read. Choose a JPEG, PNG or WebP.',400); }
  const revision=randomUUID(); const prefix=`${id}/profile/${slot}/${revision}`;
  const paths=[`${prefix}/original`,`${prefix}/preview.webp`];
  try {
    const saved = await bucket().upload(paths[0],original,{contentType:file.type,upsert:false});
    if(saved.error) throw saved.error;
    const thumb = await bucket().upload(paths[1],preview,{contentType:'image/webp',upsert:false});
    if(thumb.error) throw thumb.error;
    const pointer=await bucket().upload(`${id}/profile/${slot}.json`,JSON.stringify({revision}),{contentType:'application/json',cacheControl:'0',upsert:true});
    if(pointer.error) throw pointer.error;
  } catch { await bucket().remove(paths); throw new ClientBrainV2HttpError('Image could not be saved. Your previous image is unchanged.',500); }
  // Prior revisions and byte-identical originals are retained. Only preview derivatives are displayed.
  return {url:`/api/clients/${id}/profile-image?slot=${slot}&v=${revision}`};
}
export async function readProfilePreview(id:string,slot:ProfileImageSlot) {
  await requireProfileClient(id);
  const revision=await profileRevision(id,slot);
  if(!revision) throw new ClientBrainV2HttpError('No profile image.',404);
  const result=await bucket().download(`${id}/profile/${slot}/${revision}/preview.webp`);
  if(result.error || !result.data || result.data.size>128*1024) throw new ClientBrainV2HttpError('Preview unavailable.',404);
  return result.data;
}

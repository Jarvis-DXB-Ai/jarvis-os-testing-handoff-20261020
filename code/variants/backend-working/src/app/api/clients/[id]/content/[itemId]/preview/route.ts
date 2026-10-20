import { NextResponse } from 'next/server';
import { clientBrainV2ServerClient as db, isUuid, ClientBrainV2HttpError, clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core';
import { ensureAssetDisplayPreview, DISPLAY_PREVIEW_MAX_BYTES } from '@/lib/asset-display-preview';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;itemId:string}>}) {
 try {
  const {id,itemId}=await params;
  if(!isUuid(id)||!isUuid(itemId)) throw new ClientBrainV2HttpError('Invalid preview.',400);
  const media=await db.from('social_content_media').select('id,storage_bucket,storage_path,mime_type').eq('client_id',id).eq('social_content_item_id',itemId).like('mime_type','image/%').order('sort_order').limit(1).maybeSingle();
  if(media.error) throw media.error;
  const path=media.data?await ensureAssetDisplayPreview(db,{...media.data,file_type:media.data.mime_type}):null;
  if(!path||!media.data) throw new ClientBrainV2HttpError('Preview unavailable.',404);
  const image=await db.storage.from(media.data.storage_bucket).download(path);
  if(image.error||!image.data||image.data.size>DISPLAY_PREVIEW_MAX_BYTES) throw new ClientBrainV2HttpError('Preview unavailable.',404);
  return new Response(image.data,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 } catch(error) { const response=clientBrainV2ErrorResponse(error); return NextResponse.json({error:response.message},{status:response.status}); }
}

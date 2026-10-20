import { NextResponse } from 'next/server';
import { ownerForRequest } from '@/lib/owner-request-server';
import { loadClientAssetsLibrary } from '@/lib/client-assets-library-server';
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerForRequest(request);
  if (owner instanceof Response) return owner;
  const headers = { 'Cache-Control': 'private, no-store' };
  try { return NextResponse.json(await loadClientAssetsLibrary((await params).id), { headers }); }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status, headers }); }
}

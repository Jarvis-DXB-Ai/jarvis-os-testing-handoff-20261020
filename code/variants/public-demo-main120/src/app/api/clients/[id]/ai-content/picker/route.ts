import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { studioPickerData } from '@/lib/ai-content-studio'
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await studioPickerData((await params).id)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

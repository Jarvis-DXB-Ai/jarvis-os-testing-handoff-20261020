import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { downloadAiContentGeneration } from '@/lib/ai-content-studio'
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; generationId: string }> }) {
  try {
    const { id, generationId } = await params; const { body, file } = await downloadAiContentGeneration(id, generationId)
    return new NextResponse(body, { headers: { 'Content-Type': file.file_type || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${file.file_name.replace(/[\"\\]/g, '')}"` } })
  } catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

import { NextRequest, NextResponse } from 'next/server'
import { finalizeAiContentGeneration } from '@/lib/client-content-library-server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; generationId: string }> }) {
  try {
    const { id, generationId } = await params
    const body = await request.json() as { monthStart?: unknown; contentType?: unknown; title?: unknown }
    return NextResponse.json({ ok: true, ...(await finalizeAiContentGeneration(id, generationId, body)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to save Final Content.' }, { status: 400 })
  }
}

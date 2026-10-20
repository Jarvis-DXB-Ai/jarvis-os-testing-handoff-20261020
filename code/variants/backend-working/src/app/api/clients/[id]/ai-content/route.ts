import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { createAiContentSession, listAiContentStudio } from '@/lib/ai-content-studio'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await listAiContentStudio((await params).id)) }
  catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as { title?: unknown }
    return NextResponse.json(await createAiContentSession((await params).id, typeof body.title === 'string' ? body.title : undefined), { status: 201 })
  } catch (error) { const known = clientBrainV2ErrorResponse(error); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

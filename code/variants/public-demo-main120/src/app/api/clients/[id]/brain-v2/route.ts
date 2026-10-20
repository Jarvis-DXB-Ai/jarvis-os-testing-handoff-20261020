import { NextRequest, NextResponse } from 'next/server'
import { isClientBrainV2Section } from '@/lib/client-brain-v2'
import {
  clientBrainV2ErrorResponse,
  loadClientBrainV2,
} from '@/lib/client-brain-v2-server'
import { saveClientBrainV2Intelligence } from '@/lib/client-brain-v2-mutations'
import { saveClientBrainV2BrandGuideline } from '@/lib/client-brain-v2-brand-guideline-mutations'
import { createClientBrainV2Source, saveClientBrainV2Source } from '@/lib/client-brain-v2-source-mutations'
import { saveClientBrainV2Learning } from '@/lib/client-brain-v2-learning-mutations'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const requestedSection = request.nextUrl.searchParams.get('section')
    const section = isClientBrainV2Section(requestedSection) ? requestedSection : 'intelligence'
    return NextResponse.json({ success: true, ...(await loadClientBrainV2(clientId, section)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    const result = body?.section === 'brand_guidelines'
      ? await saveClientBrainV2BrandGuideline(clientId, body)
      : body?.section === 'sources'
        ? await saveClientBrainV2Source(clientId, body)
        : body?.section === 'learnings'
          ? await saveClientBrainV2Learning(clientId, body)
        : await saveClientBrainV2Intelligence(clientId, body)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    const result = body?.section === 'sources'
      ? await createClientBrainV2Source(clientId, body)
      : await saveClientBrainV2Learning(clientId, body)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'
import { uploadClientBrainV2BrandFile } from '@/lib/client-brain-v2-brand-file-upload'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const result = await uploadClientBrainV2BrandFile(clientId, await request.formData())
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const { deleteUnlinkedClientBrainV2BrandFile } = await import('@/lib/client-brain-v2-brand-file-upload')
    await deleteUnlinkedClientBrainV2BrandFile(clientId, request.nextUrl.searchParams.get('asset_id') ?? '')
    return NextResponse.json({ success: true })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

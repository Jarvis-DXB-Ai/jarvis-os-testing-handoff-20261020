import { NextRequest, NextResponse } from 'next/server'
import {
  createClientBrainV2FileSource,
  openClientBrainV2SourceFile,
} from '@/lib/client-brain-v2-source-mutations'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    return NextResponse.json({ success: true, ...(await createClientBrainV2FileSource(clientId, await request.formData())) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const recordId = request.nextUrl.searchParams.get('record_id') ?? ''
    const fileId = request.nextUrl.searchParams.get('file_id') ?? ''
    return NextResponse.json({ success: true, ...(await openClientBrainV2SourceFile(clientId, recordId, fileId)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

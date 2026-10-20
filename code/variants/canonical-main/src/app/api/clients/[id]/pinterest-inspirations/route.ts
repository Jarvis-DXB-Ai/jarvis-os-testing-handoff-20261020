import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'
import { bulkUpdatePinterestInspirationStatus, listPinterestInspirations, uploadPinterestInspirations } from '@/lib/client-brain-pinterest-inspiration-server'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const filters = Object.fromEntries(['search', 'status', 'analysisState', 'category', 'shotScale', 'cameraAngle', 'composition', 'humanPresence', 'interaction', 'technique', 'lighting'].flatMap(key => {
      const value = request.nextUrl.searchParams.get(key)
      return value ? [[key, value]] : []
    }))
    return NextResponse.json({ success: true, ...(await listPinterestInspirations(clientId, filters)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    return NextResponse.json({ success: true, ...(await uploadPinterestInspirations(clientId, await request.formData())) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    return NextResponse.json({ success: true, ...(await bulkUpdatePinterestInspirationStatus(clientId, body?.ids, body?.status)) })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

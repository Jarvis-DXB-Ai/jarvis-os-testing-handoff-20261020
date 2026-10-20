import { NextRequest, NextResponse } from 'next/server'
import {
  assembleClientBrainPrompt,
  parsePromptAssemblyRequest,
} from '@/lib/client-brain-v2-prompt-assembly'
import { clientBrainV2ErrorResponse } from '@/lib/client-brain-v2-server-core'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const body = await request.json()
    const assemblyRequest = parsePromptAssemblyRequest(body)
    const result = await assembleClientBrainPrompt(clientId, assemblyRequest)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

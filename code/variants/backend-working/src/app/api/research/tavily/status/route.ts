import { NextResponse } from 'next/server'

import { jarvisResearchProvider } from '@/lib/jarvis-research-provider'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(jarvisResearchProvider.status())
}

import { NextResponse } from 'next/server'
import { JarvisResearchError, loadResearchRun } from '@/lib/jarvis-research-server'

export const runtime = 'nodejs'
export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try { const { runId } = await context.params; return NextResponse.json(await loadResearchRun(runId)) }
  catch (error) { const known = error instanceof JarvisResearchError ? error : new JarvisResearchError('Research run could not be loaded.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
}

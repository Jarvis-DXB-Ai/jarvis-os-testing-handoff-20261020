import { NextRequest, NextResponse } from 'next/server'
import { executeResearch, JarvisResearchError, loadResearchSnapshot } from '@/lib/jarvis-research-server'

export const runtime = 'nodejs'
function failure(error: unknown) { const known = error instanceof JarvisResearchError ? error : new JarvisResearchError('Research request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }
export async function GET() { try { return NextResponse.json(await loadResearchSnapshot()) } catch (error) { return failure(error) } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await executeResearch(await request.json())) } catch (error) { return failure(error) } }

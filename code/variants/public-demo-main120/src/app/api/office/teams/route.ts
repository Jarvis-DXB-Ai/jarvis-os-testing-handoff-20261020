import { NextRequest, NextResponse } from 'next/server';
import { requireInternalJarvisMutation } from '@/lib/internal-api-request';
import { officeTeamTasks, submitOfficeTeamTask, controlOfficeTeamTask } from '@/lib/office-paperclip-team-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await officeTeamTasks(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Saved team records could not be read.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  try {
    requireInternalJarvisMutation(request);
    const body = await request.json();
    if(body.kind==='conversation')throw new Error('Use the agent conversation route.');
    const job = body.action ? await controlOfficeTeamTask(body) : await submitOfficeTeamTask(body);
    return NextResponse.json({ job }, { status: body.action ? 200 : 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Team request failed.' }, { status: 400 }); }
}

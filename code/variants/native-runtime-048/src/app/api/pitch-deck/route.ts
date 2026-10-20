import { NextResponse } from 'next/server'
import { loadPitchDeckSnapshot, PitchDeckError, updatePitchDeckProfile } from '@/lib/pitch-deck-server'

function response(error: unknown) {
  const known = error instanceof PitchDeckError ? error : new PitchDeckError('Pitch Deck request failed.', 500)
  return NextResponse.json({ error: known.message }, { status: known.status })
}

export async function GET() { try { return NextResponse.json(await loadPitchDeckSnapshot()) } catch (error) { return response(error) } }
export async function PATCH(request: Request) { try { return NextResponse.json(await updatePitchDeckProfile(await request.json())) } catch (error) { return response(error) } }


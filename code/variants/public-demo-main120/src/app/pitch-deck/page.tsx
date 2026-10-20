import type { Metadata } from 'next'
import { PitchDeckStage } from '@/components/pitch-deck/pitch-deck-stage'
import { loadPitchDeckSnapshot } from '@/lib/pitch-deck-server'

export const metadata: Metadata = { title: 'Pitch Deck | Jarvis OS', robots: { index: false, follow: false, googleBot: { index: false, follow: false } } }

export default async function PitchDeckPage() {
  return <PitchDeckStage initialSnapshot={await loadPitchDeckSnapshot()} />
}

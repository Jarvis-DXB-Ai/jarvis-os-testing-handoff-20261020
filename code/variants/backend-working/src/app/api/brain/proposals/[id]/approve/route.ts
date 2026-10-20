import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { trackUsage, calcCost } from '@/lib/ai-tracker'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function isBulletList(text: string) {
  const lines = text.trim().split('\n').filter(Boolean)
  return lines.length > 0 && lines.filter(l => l.trim().startsWith('-') || l.trim().startsWith('•')).length >= lines.length * 0.6
}

// Merge two bullet lists using Haiku — deduplicate, combine unique intel, keep operational
async function mergeBullets(current: string, proposed: string, clientId?: string): Promise<string> {
  const startedAt = new Date()
  const resp = await ai.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: 'Merge two bullet lists into one operational intelligence list. Rules: output bullet list only (dashes), 4-10 bullets, each 4-10 words, no duplicates, no prose, confirmed facts only, most specific/detailed version of overlapping points wins. Output ONLY the merged bullet list.',
    messages: [{ role: 'user', content: `Current:\n${current}\n\nNew intel:\n${proposed}` }]
  })
  trackUsage({
    model:     'claude-haiku-4-5',
    route:     '/api/brain/proposals/[id]/approve',
    feature:   'enrich_merge',
    clientId,
    usage:     resp.usage,
    startedAt,
  }).catch(() => {})
  return (resp.content.find(b => b.type === 'text') as { text: string } | undefined)?.text?.trim() ?? proposed
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Optional body: { final_answer, correction_note }
  let finalAnswer: string | null = null
  let correctionNote: string | null = null
  try {
    const body = await req.json()
    if (body?.final_answer?.trim()) finalAnswer    = body.final_answer.trim()
    if (body?.correction_note?.trim()) correctionNote = body.correction_note.trim()
  } catch { /* no body — apply as-is */ }

  // Load proposal
  const { data: proposal, error: pErr } = await sb
    .from('brain_update_proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (pErr || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal already reviewed' }, { status: 400 })
  }

  const now       = new Date().toISOString()
  const wasEdited = finalAnswer !== null && finalAnswer !== proposal.proposed_answer

  // Determine the answer to write
  let answerToUse = finalAnswer ?? proposal.proposed_answer
  let mergeMethod = wasEdited ? 'manual_edit' : 'direct'

  // Enrichment merge: if both current and proposed are bullet lists, merge intelligently
  // UNLESS Calvin explicitly edited — in that case his edit wins
  if (!wasEdited && proposal.current_answer_snapshot
      && isBulletList(proposal.current_answer_snapshot)
      && isBulletList(proposal.proposed_answer)) {
    try {
      answerToUse = await mergeBullets(proposal.current_answer_snapshot, proposal.proposed_answer, proposal.client_id ?? undefined)
      mergeMethod = 'enrichment_merge'
    } catch {
      // fallback to proposed if merge fails
    }
  }

  // Mark proposal approved
  await sb.from('brain_update_proposals').update({
    status:      'approved',
    reviewed_at: now,
    reasoning:   [
      proposal.reasoning ?? '',
      wasEdited ? `[Edited before apply${correctionNote ? ': ' + correctionNote : ''}]` : '',
      mergeMethod === 'enrichment_merge' ? '[Enrichment merge applied]' : '',
    ].filter(Boolean).join(' '),
  }).eq('id', id)

  // Update client_brain
  const { data: updated, error: brainErr } = await sb
    .from('client_brain')
    .update({
      answer:     answerToUse,
      status:     'needs_review',
      source:     'asset_upload',
      updated_at: now,
    })
    .eq('id', proposal.client_brain_id)
    .select()
    .single()

  if (brainErr) {
    return NextResponse.json({ error: `Brain update failed: ${brainErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated_entry: updated, was_edited: wasEdited, merge_method: mergeMethod })
}

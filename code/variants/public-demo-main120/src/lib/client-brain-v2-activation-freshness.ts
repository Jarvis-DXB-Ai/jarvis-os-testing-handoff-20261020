import type {
  ClientBrainV2ActivationTemporalResolution,
  ClientBrainV2ActivationTemporalStatus,
  ClientBrainV2Record,
} from '@/lib/client-brain-v2'

const CURRENT_CONFIRMATION_WINDOW_DAYS = 30

function editorData(record: ClientBrainV2Record) {
  const value = record.metadata.editor_data
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : record.metadata
}

function stringDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  return value.slice(0, 10)
}

function dayStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function isBeforeToday(value: string | null, today: string) {
  return Boolean(value && value < today)
}

function isAfterToday(value: string | null, today: string) {
  return Boolean(value && value > today)
}

function isRecentlyVerified(value: string | null, now: Date) {
  if (!value) return false
  const checked = dayStart(value).getTime()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return checked <= today && checked >= today - CURRENT_CONFIRMATION_WINDOW_DAYS * 86_400_000
}

function sourceEvidence(record: ClientBrainV2Record) {
  return (record.relationships ?? [])
    .filter(relationship => relationship.record.top_section === 'sources')
    .map(relationship => ({
      title: relationship.record.title,
      status: relationship.record.status,
      sourceDate: stringDate(relationship.record.metadata.source_date) ?? relationship.record.effective_date,
      validUntil: relationship.record.valid_until,
      lastVerified: relationship.record.last_verified_at?.slice(0, 10) ?? null,
    }))
}

/**
 * Resolves a presentation/retrieval eligibility state from record dates and
 * linked source evidence. Recurrence describes a pattern, never live status.
 */
export function resolveActivationFreshness(
  record: ClientBrainV2Record,
  now = new Date(),
): ClientBrainV2ActivationTemporalResolution {
  const data = editorData(record)
  const today = now.toISOString().slice(0, 10)
  const startDate = stringDate(data.start_date) ?? record.effective_date
  const validUntil = stringDate(data.valid_until) ?? stringDate(data.end_date) ?? record.valid_until
  const lastVerified = stringDate(data.last_verified) ?? record.last_verified_at?.slice(0, 10) ?? null
  const reviewDate = stringDate(data.review_date) ?? record.review_at
  const source = sourceEvidence(record)
  const sourceStatuses = source.map(item => item.status)
  const lifecycle = String(data.status ?? record.status)
  const complete = (status: ClientBrainV2ActivationTemporalStatus, trustLine: string, evidenceLine: string) => ({
    status,
    trust_line: trustLine,
    evidence_line: evidenceLine,
    eligible_for_current_retrieval: status === 'current' || status === 'scheduled',
    start_date: startDate,
    valid_until: validUntil,
    last_verified: lastVerified,
    review_date: reviewDate,
    source_statuses: sourceStatuses,
  })

  if (lifecycle === 'superseded') return complete('superseded', 'Superseded record; not eligible for current use.', 'Lifecycle marked superseded.')
  if (lifecycle === 'historical') return complete('historical', 'Historical record; not eligible for current use.', 'Lifecycle marked historical.')
  if (isBeforeToday(validUntil, today)) return complete('expired', 'Ended validity window; not eligible for current use.', `Valid until ${validUntil}.`)
  if (isAfterToday(startDate, today)) return complete('scheduled', 'Future dated activation; eligible only as scheduled context.', `Starts ${startDate}.`)

  const recordHasActiveDatedCoverage = Boolean(
    startDate && startDate <= today && (!validUntil || validUntil >= today),
  )
  const sourceHasActiveDatedCoverage = source.some(item => Boolean(
    item.sourceDate && item.sourceDate <= today && (!item.validUntil || item.validUntil >= today),
  ))
  const currentEvidence = isRecentlyVerified(lastVerified, now)
    || source.some(item => isRecentlyVerified(item.lastVerified, now))
    || (recordHasActiveDatedCoverage && lifecycle === 'current')
    || (sourceHasActiveDatedCoverage && source.some(item => item.status === 'current'))

  if (lifecycle === 'current' && currentEvidence) {
    const evidence = lastVerified
      ? `Manually verified ${lastVerified}.`
      : sourceHasActiveDatedCoverage
        ? 'Linked dated source covers today.'
        : 'Dated active coverage includes today.'
    return complete('current', 'Current use is supported by dated or recently verified evidence.', evidence)
  }

  const monthOnly = typeof data.month === 'string' && data.month.trim()
  const reason = monthOnly
    ? 'Month-only timing has no year or end date.'
    : 'Schedule is recorded, but current validity is not verified.'
  return complete('needs_review', 'Do not treat this activation as currently live until it is verified.', reason)
}

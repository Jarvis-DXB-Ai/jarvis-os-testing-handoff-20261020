export const CRM_SOURCE_OPTIONS = [
  ['manual', 'Manual'],
  ['reservation', 'Reservation'],
  ['event', 'Event'],
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['walk_in', 'Walk-in'],
  ['sevenrooms', 'SevenRooms'],
  ['other', 'Other'],
] as const

export type CrmSource = (typeof CRM_SOURCE_OPTIONS)[number][0]
export type CrmContactStatus = 'active' | 'inactive' | 'archived'
export type CrmContactFilter = 'all' | 'complete' | 'missing_email' | 'missing_phone' | 'recent'

export type CrmContact = {
  id: string
  client_id: string
  first_name: string | null
  last_name: string | null
  display_name: string
  email: string | null
  phone: string | null
  phone_country_code: string | null
  company: string | null
  job_title: string | null
  date_of_birth: string | null
  nationality: string | null
  preferred_language: string | null
  notes: string | null
  source: CrmSource
  status: CrmContactStatus
  external_ids: Record<string, unknown>
  tags: string[]
  marketing_consent_email: boolean | null
  marketing_consent_sms: boolean | null
  marketing_consent_whatsapp: boolean | null
  consent_updated_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CrmContactInput = {
  first_name?: string
  last_name?: string
  display_name?: string
  email?: string
  phone?: string
  phone_country_code?: string
  company?: string
  job_title?: string
  date_of_birth?: string
  nationality?: string
  preferred_language?: string
  notes?: string
  source?: CrmSource
  status?: CrmContactStatus
  tags?: string[]
}

export type CrmSummary = {
  totalGuests: number
  guestsWithEmail: number
  guestsWithPhone: number
  incompleteProfiles: number
  missingEmail: number
  missingPhone: number
  missingBoth: number
  possibleDuplicateGroups: number
}

export const EMPTY_CRM_SUMMARY: CrmSummary = {
  totalGuests: 0,
  guestsWithEmail: 0,
  guestsWithPhone: 0,
  incompleteProfiles: 0,
  missingEmail: 0,
  missingPhone: 0,
  missingBoth: 0,
  possibleDuplicateGroups: 0,
}

export function crmSourceLabel(source: string) {
  return CRM_SOURCE_OPTIONS.find(option => option[0] === source)?.[1] ?? 'Other'
}

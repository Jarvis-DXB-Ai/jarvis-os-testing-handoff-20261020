import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { isClientModuleEnabled } from '@/lib/client-workspace-config'
import { CRM_SOURCE_OPTIONS, type CrmContactInput, type CrmSource } from '@/lib/crm'

export const crmServerClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export class CrmHttpError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function requireCrmClient(clientId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    throw new CrmHttpError('Invalid client ID.', 400)
  }

  const { data, error } = await crmServerClient
    .from('clients')
    .select('id, name, industry, notes')
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw new CrmHttpError('Unable to verify client access.', 500)
  if (!data) throw new CrmHttpError('Client not found.', 404)
  if (!isClientModuleEnabled(data, 'crm')) throw new CrmHttpError('CRM is not enabled for this client.', 403)
  return data
}

export function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeEmail(value: unknown) {
  return cleanText(value)?.toLowerCase() ?? null
}

export function normalizePhone(value: unknown) {
  const raw = cleanText(value)
  if (!raw) return null
  const compact = raw.replace(/[^0-9+]/g, '').replace(/^00/, '+')
  return compact || null
}

export function validateContactInput(value: unknown): CrmContactInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CrmHttpError('Invalid contact payload.', 400)
  const body = value as Record<string, unknown>
  const firstName = cleanText(body.first_name)
  const displayName = cleanText(body.display_name)
  if (!firstName && !displayName) throw new CrmHttpError('First name or display name is required.', 400)

  const email = normalizeEmail(body.email)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CrmHttpError('Enter a valid email address.', 400)

  const phone = normalizePhone(body.phone)
  if (phone && !/^\+?[0-9]{7,16}$/.test(phone)) throw new CrmHttpError('Enter a valid phone number.', 400)

  const validSources = new Set<string>(CRM_SOURCE_OPTIONS.map(option => option[0]))
  const source = validSources.has(String(body.source)) ? body.source as CrmSource : 'manual'
  const status = ['active', 'inactive', 'archived'].includes(String(body.status))
    ? body.status as CrmContactInput['status']
    : 'active'
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean).slice(0, 30)
    : []

  const dateOfBirth = cleanText(body.date_of_birth)
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new CrmHttpError('Date of birth must use YYYY-MM-DD.', 400)

  return {
    first_name: firstName ?? undefined,
    last_name: cleanText(body.last_name) ?? undefined,
    display_name: displayName ?? [firstName, cleanText(body.last_name)].filter(Boolean).join(' '),
    email: email ?? undefined,
    phone: phone ?? undefined,
    phone_country_code: cleanText(body.phone_country_code) ?? undefined,
    company: cleanText(body.company) ?? undefined,
    job_title: cleanText(body.job_title) ?? undefined,
    date_of_birth: dateOfBirth ?? undefined,
    nationality: cleanText(body.nationality) ?? undefined,
    preferred_language: cleanText(body.preferred_language) ?? undefined,
    notes: cleanText(body.notes) ?? undefined,
    source,
    status,
    tags,
  }
}

export async function findContactDuplicates(clientId: string, input: CrmContactInput, excludeId?: string) {
  const checks: Array<PromiseLike<{ data: Array<{ id: string; display_name: string }> | null; error: { message: string } | null }>> = []
  const matchTypes: string[] = []

  if (input.email) {
    let query = crmServerClient.from('crm_contacts').select('id, display_name').eq('client_id', clientId).is('deleted_at', null).eq('email', input.email).limit(5)
    if (excludeId) query = query.neq('id', excludeId)
    checks.push(query)
    matchTypes.push('email')
  }
  if (input.phone) {
    let query = crmServerClient.from('crm_contacts').select('id, display_name').eq('client_id', clientId).is('deleted_at', null).eq('phone', input.phone).limit(5)
    if (excludeId) query = query.neq('id', excludeId)
    checks.push(query)
    matchTypes.push('phone')
  }
  if (input.display_name) {
    let query = crmServerClient.from('crm_contacts').select('id, display_name').eq('client_id', clientId).is('deleted_at', null).ilike('display_name', input.display_name).limit(5)
    if (excludeId) query = query.neq('id', excludeId)
    checks.push(query)
    matchTypes.push('name')
  }

  const results = await Promise.all(checks)
  const matches = new Map<string, { id: string; display_name: string; matched_on: string[] }>()
  results.forEach((result, index) => {
    if (result.error) throw new CrmHttpError('Unable to check for duplicate contacts.', 500)
    for (const row of result.data ?? []) {
      const existing = matches.get(row.id) ?? { ...row, matched_on: [] }
      existing.matched_on.push(matchTypes[index])
      matches.set(row.id, existing)
    }
  })
  return [...matches.values()]
}

export function crmErrorResponse(error: unknown) {
  if (error instanceof CrmHttpError) return { message: error.message, status: error.status }
  return { message: 'CRM request failed.', status: 500 }
}

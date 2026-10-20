import { NextRequest, NextResponse } from 'next/server'
import { EMPTY_CRM_SUMMARY, type CrmContactFilter } from '@/lib/crm'
import {
  crmErrorResponse,
  crmServerClient,
  findContactDuplicates,
  requireCrmClient,
  validateContactInput,
} from '@/lib/crm-server'

const FILTERS = new Set<CrmContactFilter>(['all', 'complete', 'missing_email', 'missing_phone', 'recent'])

function searchTerm(value: string | null) {
  return (value ?? '').trim().replace(/[^a-zA-Z0-9@+._\-\s]/g, '').slice(0, 120)
}

function summaryFromRow(row: Record<string, unknown> | null) {
  if (!row) return EMPTY_CRM_SUMMARY
  return {
    totalGuests: Number(row.total_guests ?? 0),
    guestsWithEmail: Number(row.guests_with_email ?? 0),
    guestsWithPhone: Number(row.guests_with_phone ?? 0),
    incompleteProfiles: Number(row.incomplete_profiles ?? 0),
    missingEmail: Number(row.missing_email ?? 0),
    missingPhone: Number(row.missing_phone ?? 0),
    missingBoth: Number(row.missing_both ?? 0),
    possibleDuplicateGroups: Number(row.possible_duplicate_groups ?? 0),
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    await requireCrmClient(clientId)

    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? 1) || 1)
    const pageSize = Math.min(50, Math.max(10, Number(request.nextUrl.searchParams.get('page_size') ?? 25) || 25))
    const requestedFilter = request.nextUrl.searchParams.get('filter') as CrmContactFilter | null
    const filter: CrmContactFilter = requestedFilter && FILTERS.has(requestedFilter) ? requestedFilter : 'all'
    const search = searchTerm(request.nextUrl.searchParams.get('search'))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = crmServerClient
      .from('crm_contacts')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .is('deleted_at', null)

    if (search) {
      const pattern = `*${search}*`
      query = query.or([
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `display_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
      ].join(','))
    }
    if (filter === 'complete') query = query.not('email', 'is', null).not('phone', 'is', null)
    if (filter === 'missing_email') query = query.is('email', null)
    if (filter === 'missing_phone') query = query.is('phone', null)
    if (filter === 'recent') {
      const recent = new Date()
      recent.setDate(recent.getDate() - 30)
      query = query.gte('created_at', recent.toISOString())
    }

    const [contactsResult, qualityResult] = await Promise.all([
      query.order('updated_at', { ascending: false }).range(from, to),
      crmServerClient.from('crm_contact_data_quality').select('*').eq('client_id', clientId).maybeSingle(),
    ])

    if (contactsResult.error) throw contactsResult.error
    if (qualityResult.error) throw qualityResult.error

    return NextResponse.json({
      success: true,
      contacts: contactsResult.data ?? [],
      summary: summaryFromRow(qualityResult.data as Record<string, unknown> | null),
      pagination: {
        page,
        pageSize,
        total: contactsResult.count ?? 0,
        totalPages: Math.max(1, Math.ceil((contactsResult.count ?? 0) / pageSize)),
      },
      filter,
      search,
    })
  } catch (error) {
    const response = crmErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    await requireCrmClient(clientId)
    const raw = await request.json().catch(() => null) as (Record<string, unknown> & { allow_duplicate?: boolean }) | null
    const input = validateContactInput(raw)
    const duplicates = await findContactDuplicates(clientId, input)

    if (duplicates.length > 0 && raw?.allow_duplicate !== true) {
      return NextResponse.json({
        success: false,
        duplicateWarning: true,
        error: 'A possible duplicate guest already exists. Review before creating a separate profile.',
        matches: duplicates,
      }, { status: 409 })
    }

    const { data, error } = await crmServerClient
      .from('crm_contacts')
      .insert({ client_id: clientId, ...input })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, contact: data }, { status: 201 })
  } catch (error) {
    const response = crmErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

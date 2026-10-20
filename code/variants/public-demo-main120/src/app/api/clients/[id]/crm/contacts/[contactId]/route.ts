import { NextRequest, NextResponse } from 'next/server'
import {
  CrmHttpError,
  crmErrorResponse,
  crmServerClient,
  findContactDuplicates,
  requireCrmClient,
  validateContactInput,
} from '@/lib/crm-server'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function getContact(clientId: string, contactId: string, includeDeleted = false) {
  if (!validUuid(contactId)) throw new CrmHttpError('Invalid contact ID.', 400)
  let query = crmServerClient.from('crm_contacts').select('*').eq('client_id', clientId).eq('id', contactId)
  if (!includeDeleted) query = query.is('deleted_at', null)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) throw new CrmHttpError('Guest profile not found for this client.', 404)
  return data
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const { id: clientId, contactId } = await context.params
    await requireCrmClient(clientId)
    return NextResponse.json({ success: true, contact: await getContact(clientId, contactId) })
  } catch (error) {
    const response = crmErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const { id: clientId, contactId } = await context.params
    await requireCrmClient(clientId)
    const existing = await getContact(clientId, contactId)
    const raw = await request.json().catch(() => null) as (Record<string, unknown> & { allow_duplicate?: boolean }) | null
    const input = validateContactInput({ ...existing, ...(raw ?? {}) })
    const duplicates = await findContactDuplicates(clientId, input, contactId)

    if (duplicates.length > 0 && raw?.allow_duplicate !== true) {
      return NextResponse.json({
        success: false,
        duplicateWarning: true,
        error: 'This update may duplicate another guest. Review before saving.',
        matches: duplicates,
      }, { status: 409 })
    }

    const { data, error } = await crmServerClient
      .from('crm_contacts')
      .update(input)
      .eq('client_id', clientId)
      .eq('id', contactId)
      .is('deleted_at', null)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, contact: data })
  } catch (error) {
    const response = crmErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const { id: clientId, contactId } = await context.params
    await requireCrmClient(clientId)
    await getContact(clientId, contactId)

    const { error } = await crmServerClient
      .from('crm_contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('id', contactId)
      .is('deleted_at', null)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const response = crmErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}

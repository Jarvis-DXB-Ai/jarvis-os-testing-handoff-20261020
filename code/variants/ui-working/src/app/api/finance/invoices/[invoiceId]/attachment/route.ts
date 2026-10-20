import { NextRequest, NextResponse } from 'next/server'
import { clientBrainV2ServerClient as db, isUuid } from '@/lib/client-brain-v2-server-core'
import { FinanceCostsError } from '@/lib/finance-costs-server'

export const runtime = 'nodejs'
const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const extension = (mime: string) => mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg'
const failure = (error: unknown) => { const known = error instanceof FinanceCostsError ? error : new FinanceCostsError('Invoice attachment request failed.', 500); return NextResponse.json({ error: known.message }, { status: known.status }) }

export async function POST(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await context.params
    if (!isUuid(invoiceId)) throw new FinanceCostsError('Invoice is invalid.')
    const [{ data: invoice, error }, form] = await Promise.all([db.from('jarvis_finance_invoices').select('id,client_id').eq('id', invoiceId).maybeSingle(), request.formData()])
    if (error || !invoice) throw new FinanceCostsError('Invoice was not found.', 404)
    if (!invoice.client_id) throw new FinanceCostsError('Link this invoice to a client before uploading a document.')
    const file = form.get('file')
    if (!(file instanceof File)) throw new FinanceCostsError('Select a PDF, JPEG or PNG invoice file.')
    if (!allowed.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new FinanceCostsError('Invoice files must be PDF, JPEG or PNG and no larger than 10 MB.')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || `invoice.${extension(file.type)}`
    const path = `${invoice.client_id}/finance-invoices/${invoiceId}/${crypto.randomUUID()}-${safeName}`
    const upload = await db.storage.from('finance-documents').upload(path, file, { contentType: file.type, upsert: false })
    if (upload.error) throw new FinanceCostsError('Invoice document could not be uploaded.', 500)
    const { data: attachment, error: saveError } = await db.from('jarvis_finance_invoice_attachments').insert({ invoice_id: invoiceId, client_id: invoice.client_id, storage_bucket: 'finance-documents', storage_path: path, file_name: file.name.slice(0, 255), mime_type: file.type, byte_size: file.size }).select('id,invoice_id,client_id,storage_bucket,storage_path,file_name,mime_type,byte_size,created_at').single()
    if (saveError || !attachment) { await db.storage.from('finance-documents').remove([path]); throw new FinanceCostsError('Invoice document metadata could not be saved.', 500) }
    await db.from('jarvis_finance_activity').insert({ record_type: 'invoice_attachment', record_id: attachment.id, action: 'attachment_added', detail: { invoice_id: invoiceId, client_id: invoice.client_id } })
    const { data: signed, error: signedError } = await db.storage.from('finance-documents').createSignedUrl(path, 3600)
    if (signedError) throw new FinanceCostsError('Invoice document was saved but its secure preview could not be created.', 500)
    return NextResponse.json({ ...attachment, signed_url: signed.signedUrl }, { status: 201 })
  } catch (error) { return failure(error) }
}

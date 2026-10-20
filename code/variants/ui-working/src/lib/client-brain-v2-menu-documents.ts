import 'server-only'

import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

type OfficialDocument = {
  recordId: string
  sourceRecordId: string
  sourceTitle: string
  sourceVersion: string | null
  status: string
  fileName: string
  fileType: string | null
  pageCount: number | null
  url: string
  expiresAt: string
}

function sourceMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function loadCurrentOfficialDocument(
  clientId: string,
  recordId: string,
  expected: { subsection: 'menus' | 'activations'; recordType: 'menu' | 'activation'; label: string },
): Promise<{
  document: OfficialDocument | null
  missingReason?: string
}> {
  await requireClientBrainV2(clientId)
  if (!isUuid(recordId)) throw new ClientBrainV2HttpError(`${expected.label} not found.`, 404)

  const { data: record, error: recordError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .eq('id', recordId)
    .maybeSingle()
  if (recordError) throw new ClientBrainV2HttpError(`Unable to load the ${expected.label.toLowerCase()} document.`, 500)
  if (!record || record.subsection !== expected.subsection || record.record_type !== expected.recordType) throw new ClientBrainV2HttpError(`${expected.label} not found for this client.`, 404)

  const { data: links, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('to_record_id')
    .eq('client_id', clientId)
    .eq('from_record_id', recordId)
    .eq('relation_type', 'documented_by')
  if (linksError) throw new ClientBrainV2HttpError('Unable to resolve the official menu document.', 500)
  const sourceIds = [...new Set((links ?? []).map(link => link.to_record_id))]
  if (!sourceIds.length) return { document: null, missingReason: `No current official document is linked to this ${expected.label.toLowerCase()}.` }

  const { data: sources, error: sourcesError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, metadata, last_verified_at')
    .eq('client_id', clientId)
    .eq('top_section', 'sources')
    .eq('status', 'current')
    .in('id', sourceIds)
  if (sourcesError) throw new ClientBrainV2HttpError('Unable to load the official menu source.', 500)
  const source = (sources ?? [])
    .filter(item => sourceMetadata(item.metadata).menu_document === true)
    .sort((left, right) => String(right.last_verified_at ?? '').localeCompare(String(left.last_verified_at ?? '')))[0]
  if (!source) return { document: null, missingReason: `No current official document is linked to this ${expected.label.toLowerCase()}.` }

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('file_object_id, semantic_role, approval_status, sort_order')
    .eq('client_id', clientId)
    .eq('record_id', source.id)
    .eq('semantic_role', 'source_document')
    .eq('approval_status', 'approved')
    .order('sort_order')
    .limit(1)
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load the official menu file.', 500)
  const assignment = assignments?.[0]
  if (!assignment) return { document: null, missingReason: 'The current official menu source has no approved PDF file.' }

  const { data: file, error: fileError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_bucket, storage_path, file_name, file_type')
    .eq('id', assignment.file_object_id)
    .maybeSingle()
  if (fileError) throw new ClientBrainV2HttpError('Unable to load the official menu file.', 500)
  if (!file?.storage_bucket || !file.storage_path) return { document: null, missingReason: 'The current official menu file is unavailable.' }

  const expiresInSeconds = 60 * 30
  const { data: signed, error: signedError } = await clientBrainV2ServerClient.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, expiresInSeconds)
  if (signedError || !signed?.signedUrl) throw new ClientBrainV2HttpError('Unable to prepare the official menu document.', 500)
  const metadata = sourceMetadata(source.metadata)
  return {
    document: {
      recordId,
      sourceRecordId: source.id,
      sourceTitle: source.title,
      sourceVersion: typeof metadata.version === 'string' ? metadata.version : null,
      status: source.status,
      fileName: file.file_name,
      fileType: file.file_type ?? null,
      pageCount: typeof metadata.page_count === 'number' ? metadata.page_count : null,
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    },
  }
}

export function loadCurrentOfficialMenuDocument(clientId: string, menuId: string) {
  return loadCurrentOfficialDocument(clientId, menuId, { subsection: 'menus', recordType: 'menu', label: 'Menu' })
}

export function loadCurrentOfficialActivationDocument(clientId: string, activationId: string) {
  return loadCurrentOfficialDocument(clientId, activationId, { subsection: 'activations', recordType: 'activation', label: 'Activation' })
}

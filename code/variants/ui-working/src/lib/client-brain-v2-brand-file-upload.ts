import 'server-only'

import { createHash, randomUUID } from 'crypto'
import { extname } from 'path'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

const BUCKET = 'client-assets'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2'])
const BRAND_FILE_TYPES = new Set([
  'light_wordmark', 'dark_wordmark', 'brand_mark', 'primary_font', 'body_font',
  'graphic_element', 'icon', 'pattern', 'illustration', 'texture', 'other',
])

function text(value: FormDataEntryValue | null, label: string, max = 200) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  const normalized = value.trim()
  if (!normalized || normalized.length > max) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return normalized
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'brand-file'
}

function extension(file: File) {
  return extname(file.name).toLowerCase()
}

function validForType(brandFileType: string, file: File) {
  const fileExtension = extension(file)
  if (['light_wordmark', 'dark_wordmark', 'brand_mark', 'graphic_element', 'icon', 'pattern', 'illustration', 'texture', 'other'].includes(brandFileType)) {
    return IMAGE_EXTENSIONS.has(fileExtension) && file.type.startsWith('image/')
  }
  return FONT_EXTENSIONS.has(fileExtension)
}

export async function uploadClientBrainV2BrandFile(clientId: string, formData: FormData) {
  await requireClientBrainV2(clientId)
  const brandFileType = text(formData.get('brand_file_type'), 'Brand file type', 40)
  if (!BRAND_FILE_TYPES.has(brandFileType)) throw new ClientBrainV2HttpError('Brand file type is invalid.', 400)
  const title = text(formData.get('title'), 'File name')
  const rawFile = formData.get('file')
  if (!(rawFile instanceof File) || rawFile.size <= 0) throw new ClientBrainV2HttpError('Choose a file to upload.', 400)
  if (rawFile.size > MAX_FILE_BYTES) throw new ClientBrainV2HttpError('Brand files must be 10 MB or smaller.', 400)
  if (!validForType(brandFileType, rawFile)) {
    const expected = brandFileType.includes('font') ? '.otf, .ttf, .woff, or .woff2' : 'PNG, JPEG, or WEBP'
    throw new ClientBrainV2HttpError(`This file type is not supported. Use ${expected}.`, 400)
  }

  const fileExtension = extension(rawFile)
  const buffer = Buffer.from(await rawFile.arrayBuffer())
  const checksum = createHash('sha256').update(buffer).digest('hex')
  const { data: matchingFiles, error: matchingFilesError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id')
    .filter('metadata->>sha256', 'eq', checksum)
  if (matchingFilesError) throw new ClientBrainV2HttpError('Unable to validate this Brand File.', 500)
  const matchingFileIds = (matchingFiles ?? []).map(file => file.id)
  if (matchingFileIds.length) {
    const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
      .from('client_brain_v2_record_files')
      .select('record_id, file_object_id')
      .eq('client_id', clientId)
      .in('file_object_id', matchingFileIds)
    if (assignmentsError) throw new ClientBrainV2HttpError('Unable to validate this Brand File.', 500)
    const recordIds = [...new Set((assignments ?? []).map(assignment => assignment.record_id))]
    if (recordIds.length) {
      const { data: records, error: recordsError } = await clientBrainV2ServerClient
        .from('client_brain_v2_records')
        .select('id, metadata')
        .eq('client_id', clientId)
        .eq('top_section', 'assets')
        .eq('subsection', 'brand_files')
        .in('id', recordIds)
      if (recordsError) throw new ClientBrainV2HttpError('Unable to validate this Brand File.', 500)
      const existing = (records ?? []).find(record => (record.metadata as Record<string, unknown> | null)?.brand_file_type === brandFileType)
      if (existing) {
        const assignment = (assignments ?? []).find(candidate => candidate.record_id === existing.id)
        if (assignment) return { asset_id: existing.id, file_object_id: assignment.file_object_id }
      }
    }
  }

  const path = `${clientId}/client-brain-v2/brand/${brandFileType}/${randomUUID()}_${safeName(rawFile.name)}${fileExtension && !rawFile.name.toLowerCase().endsWith(fileExtension) ? fileExtension : ''}`
  const { error: uploadError } = await clientBrainV2ServerClient.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: rawFile.type || undefined, upsert: false })
  if (uploadError) throw new ClientBrainV2HttpError('Unable to store this Brand File.', 500)

  const { data, error } = await clientBrainV2ServerClient.rpc('create_client_brain_v2_brand_file', {
    p_client_id: clientId,
    p_title: title,
    p_brand_file_type: brandFileType,
    p_storage_bucket: BUCKET,
    p_storage_path: path,
    p_file_name: rawFile.name,
    p_file_type: rawFile.type || null,
    p_file_size_bytes: buffer.length,
    p_file_metadata: { uploaded_via: 'brand_kit_v2', extension: fileExtension, sha256: checksum },
  })
  if (error || !data) {
    await clientBrainV2ServerClient.storage.from(BUCKET).remove([path])
    throw new ClientBrainV2HttpError(error?.message || 'Unable to register this Brand File.', error?.code === 'PT403' ? 403 : 500)
  }

  return data as { asset_id: string; file_object_id: string }
}

export async function deleteUnlinkedClientBrainV2BrandFile(clientId: string, assetId: string) {
  await requireClientBrainV2(clientId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    throw new ClientBrainV2HttpError('Brand File is invalid.', 400)
  }
  const { data: asset, error: assetError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id')
    .eq('id', assetId).eq('client_id', clientId).eq('top_section', 'assets').eq('subsection', 'brand_files')
    .maybeSingle()
  if (assetError) throw new ClientBrainV2HttpError('Unable to validate the Brand File.', 500)
  if (!asset) return

  const { data: links, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('id')
    .eq('client_id', clientId).eq('to_record_id', assetId).limit(1)
  if (linksError) throw new ClientBrainV2HttpError('Unable to validate Brand File links.', 500)
  if (links?.length) throw new ClientBrainV2HttpError('This Brand File is already in use and cannot be removed automatically.', 409)

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('file_object_id')
    .eq('client_id', clientId).eq('record_id', assetId)
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load the Brand File.', 500)
  const fileIds = (assignments ?? []).map(row => row.file_object_id)
  const { data: files, error: filesError } = fileIds.length
    ? await clientBrainV2ServerClient.from('client_brain_file_objects').select('id, storage_bucket, storage_path').in('id', fileIds)
    : { data: [], error: null }
  if (filesError) throw new ClientBrainV2HttpError('Unable to load Brand File storage.', 500)
  const { error: recordError } = await clientBrainV2ServerClient.from('client_brain_v2_records').delete().eq('id', assetId).eq('client_id', clientId)
  if (recordError) throw new ClientBrainV2HttpError('Unable to remove the staged Brand File.', 500)
  for (const file of files ?? []) {
    await clientBrainV2ServerClient.storage.from(file.storage_bucket).remove([file.storage_path])
    await clientBrainV2ServerClient.from('client_brain_file_objects').delete().eq('id', file.id)
  }
}

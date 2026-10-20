import 'server-only'

import {
  humanConfirmedRestaurantAssetCategory,
  type ClientBrainV2AssetListFile,
  type ClientBrainV2AssetListRecord,
  type ClientBrainV2File,
  type ClientBrainV2Record,
  type ClientBrainV2RecordRelationship,
  type ClientBrainV2RestaurantAssetCategory,
} from '@/lib/client-brain-v2'
import { hasMeaningfulRestaurantAssetMetadata, type ClientBrainV2AssetEditOptions } from '@/lib/client-brain-v2-asset-edit'
import { packagePricingContextForAsset } from '@/lib/client-brain-v2-pricing'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server-core'

const ASSET_THUMBNAIL_BATCH_SIZE = 48

type AssetListRow = Pick<
  ClientBrainV2Record,
  'id' | 'client_id' | 'stable_key' | 'top_section' | 'subsection' | 'record_type' | 'title' | 'status' | 'priority' | 'updated_at'
> & {
  asset_category: string | null
  asset_category_source: string | null
  legacy_asset_category: string | null
  approved_for_generation: string | null
  dish_name: string | null
  drink_name: string | null
  menu_display_name: string | null
  menu_category: string | null
  drink_category: string | null
  price: string | null
  currency: string | null
  staff_name: string | null
  staff_position: string | null
  staff_department: string | null
  staff_active: string | null
  metadata: Record<string, unknown>
}

type AssetPricingDisplay = {
  menuDisplayName: string | null
  packagePrice: string | null
  packageCurrency: string | null
  hasMenuRelationship: boolean
}

function slimAssetMetadata(row: AssetListRow, pricing: AssetPricingDisplay) {
  const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata })
  return {
    asset_category: row.asset_category ?? 'unclassified',
    asset_category_source: row.asset_category_source ?? null,
    legacy_asset_category: row.legacy_asset_category ?? null,
    approved_for_generation: row.approved_for_generation === 'true'
      && hasMeaningfulRestaurantAssetMetadata(category, row.metadata, pricing.hasMenuRelationship ? ['linked-menu'] : []),
    dish_name: row.dish_name ?? null,
    drink_name: row.drink_name ?? null,
    menu_display_name: pricing.menuDisplayName ?? row.menu_display_name ?? null,
    menu_category: row.menu_category ?? null,
    drink_category: row.drink_category ?? null,
    price: row.price ?? null,
    currency: row.currency ?? null,
    package_price: pricing.packagePrice,
    package_currency: pricing.packageCurrency,
    staff_name: row.staff_name ?? null,
    staff_position: row.staff_position ?? null,
    staff_department: row.staff_department ?? null,
    staff_active: row.staff_active === 'true' ? true : row.staff_active === 'false' ? false : null,
  }
}

function slimAssetRecord(row: AssetListRow, files: ClientBrainV2AssetListFile[], pricing: AssetPricingDisplay): ClientBrainV2AssetListRecord {
  return {
    id: row.id,
    client_id: row.client_id,
    stable_key: row.stable_key,
    top_section: row.top_section,
    subsection: row.subsection,
    record_type: row.record_type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    updated_at: row.updated_at,
    metadata: slimAssetMetadata(row, pricing),
    files,
  }
}

async function loadAssetPricingDisplay(clientId: string, rows: AssetListRow[]) {
  const displayByAssetId = new Map<string, AssetPricingDisplay>()
  const assetIds = rows.map(row => row.id)
  if (!assetIds.length) return displayByAssetId

  const { data: links, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('from_record_id, to_record_id, relation_type')
    .eq('client_id', clientId)
    .in('relation_type', ['belongs_to_menu', 'supports_activation'])
    .in('from_record_id', assetIds)
  if (linksError) throw new ClientBrainV2HttpError('Unable to load Asset pricing references.', 500)

  const parentIds = [...new Set((links ?? []).map(link => link.to_record_id))]
  if (!parentIds.length) return displayByAssetId
  const { data: parents, error: parentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .in('id', parentIds)
  if (parentsError) throw new ClientBrainV2HttpError('Unable to load Asset pricing parents.', 500)

  const parentById = new Map((parents ?? []).map(parent => [parent.id, parent]))
  const linksByAssetId = new Map<string, typeof links>()
  for (const link of links ?? []) {
    const current = linksByAssetId.get(link.from_record_id) ?? []
    current.push(link)
    linksByAssetId.set(link.from_record_id, current)
  }
  for (const row of rows) {
    const relations = (linksByAssetId.get(row.id) ?? [])
      .flatMap(link => {
        const parent = parentById.get(link.to_record_id)
        return parent ? [{ record: parent }] : []
      })
    const menuDisplayName = relations.find(relation => relation.record.subsection === 'menus')?.record.title ?? null
    const ownPrice = row.price == null || row.price.trim() === '' ? null : Number(row.price)
    const packagePricing = packagePricingContextForAsset({
      itemPrice: Number.isFinite(ownPrice) ? ownPrice : null,
      relations,
    })
    displayByAssetId.set(row.id, {
      menuDisplayName,
      packagePrice: packagePricing ? String(packagePricing.price) : null,
      packageCurrency: packagePricing?.currency ?? null,
      hasMenuRelationship: relations.some(relation => relation.record.subsection === 'menus'),
    })
  }
  return displayByAssetId
}

function assetCounts(records: ClientBrainV2AssetListRecord[]) {
  const counts: Record<'all' | ClientBrainV2RestaurantAssetCategory, number> = {
    all: records.length,
    food: 0,
    drinks: 0,
    interiors: 0,
    exteriors: 0,
    venue_items: 0,
    staff: 0,
    unclassified: 0,
  }
  for (const record of records) counts[humanConfirmedRestaurantAssetCategory(record)] += 1
  return counts
}

async function loadAssetListFiles(clientId: string, recordIds: string[]) {
  const filesByRecord = new Map<string, ClientBrainV2AssetListFile[]>()
  if (!recordIds.length) return filesByRecord

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('id, record_id, file_object_id, semantic_role, approval_status, sort_order')
    .eq('client_id', clientId)
    .in('record_id', recordIds)
    .order('sort_order')
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load Asset file references.', 500)

  const fileObjectIds = [...new Set((assignments ?? []).map(assignment => assignment.file_object_id))]
  if (!fileObjectIds.length) return filesByRecord
  const { data: fileObjects, error: fileObjectsError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, file_name, file_type')
    .in('id', fileObjectIds)
  if (fileObjectsError) throw new ClientBrainV2HttpError('Unable to load Asset file names.', 500)

  const fileById = new Map((fileObjects ?? []).map(file => [file.id, file]))
  for (const assignment of assignments ?? []) {
    const file = fileById.get(assignment.file_object_id)
    if (!file) continue
    const current = filesByRecord.get(assignment.record_id) ?? []
    current.push({
      id: assignment.id,
      semantic_role: assignment.semantic_role,
      approval_status: assignment.approval_status,
      file_name: file.file_name,
      file_type: file.file_type,
    })
    filesByRecord.set(assignment.record_id, current)
  }
  return filesByRecord
}

export async function loadRestaurantClientBrainV2AssetList(
  clientId: string,
  existingClient?: Awaited<ReturnType<typeof requireClientBrainV2>>,
) {
  const client = existingClient ?? await requireClientBrainV2(clientId)
  const [{ data: countRows, error: countError }, { data: assetRows, error: assetsError }] = await Promise.all([
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('top_section, subsection, status')
      .eq('client_id', clientId)
      .or('status.neq.archived,top_section.eq.learnings'),
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id, client_id, stable_key, top_section, subsection, record_type, title, status, priority, updated_at, metadata, asset_category:metadata->>asset_category, asset_category_source:metadata->>asset_category_source, legacy_asset_category:metadata->>legacy_asset_category, approved_for_generation:metadata->>approved_for_generation, dish_name:metadata->>dish_name, drink_name:metadata->>drink_name, menu_display_name:metadata->>menu, menu_category:metadata->>menu_category, drink_category:metadata->>drink_category, price:metadata->>price, currency:metadata->>currency, staff_name:metadata->>staff_name, staff_position:metadata->>staff_position, staff_department:metadata->>staff_department, staff_active:metadata->>staff_active')
      .eq('client_id', clientId)
      .eq('top_section', 'assets')
      .neq('status', 'archived')
      .order('priority', { ascending: false })
      .order('title', { ascending: true }),
  ])
  if (countError) throw new ClientBrainV2HttpError('Unable to load Client Brain counts.', 500)
  if (assetsError) throw new ClientBrainV2HttpError('Unable to load Assets.', 500)

  const typedRows = (assetRows ?? []) as AssetListRow[]
  const recordIds = typedRows.map(record => record.id)
  const [filesByRecord, pricingByAssetId] = await Promise.all([
    loadAssetListFiles(clientId, recordIds),
    loadAssetPricingDisplay(clientId, typedRows),
  ])
  const records = typedRows.map(record => slimAssetRecord(record, filesByRecord.get(record.id) ?? [], pricingByAssetId.get(record.id) ?? {
    menuDisplayName: null,
    packagePrice: null,
    packageCurrency: null,
    hasMenuRelationship: false,
  }))
  const sectionCounts: Record<string, number> = {}
  const subsectionCounts: Record<string, number> = {}
  const statusCounts: Record<string, number> = {}
  for (const row of countRows ?? []) {
    sectionCounts[row.top_section] = (sectionCounts[row.top_section] ?? 0) + 1
    const key = `${row.top_section}:${row.subsection}`
    subsectionCounts[key] = (subsectionCounts[key] ?? 0) + 1
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  }

  return {
    client,
    section: 'assets' as const,
    assetRecords: records,
    assetCounts: assetCounts(records),
    counts: {
      total: (countRows ?? []).length,
      sections: sectionCounts,
      subsections: subsectionCounts,
      statuses: statusCounts,
    },
  }
}

export async function loadApprovedStaffIdentityAssets(clientId: string) {
  await requireClientBrainV2(clientId)
  const { data: records, error: recordsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, metadata, updated_at')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .eq('metadata->>asset_category', 'staff')
    .eq('metadata->>approved_for_generation', 'true')
    .neq('status', 'archived')
    .order('title')
  if (recordsError) throw new ClientBrainV2HttpError('Unable to load approved Staff identity references.', 500)

  const eligible = (records ?? []).filter(record => record.metadata?.staff_active !== false)
  const recordIds = eligible.map(record => record.id)
  if (!recordIds.length) return { assets: [] }
  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id, file_object_id, sort_order')
    .eq('client_id', clientId)
    .in('record_id', recordIds)
    .eq('semantic_role', 'truth_reference')
    .eq('approval_status', 'approved')
    .order('sort_order')
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load Staff identity files.', 500)
  const fileObjectIds = [...new Set((assignments ?? []).map(assignment => assignment.file_object_id))]
  if (!fileObjectIds.length) return { assets: [] }
  const { data: fileObjects, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_path, file_name, file_type')
    .in('id', fileObjectIds)
  if (filesError) throw new ClientBrainV2HttpError('Unable to load Staff identity file details.', 500)
  const fileById = new Map((fileObjects ?? []).map(file => [file.id, file]))
  const primaryFileByRecord = new Map<string, { storage_path: string; file_name: string; file_type: string | null }>()
  for (const assignment of assignments ?? []) {
    if (primaryFileByRecord.has(assignment.record_id)) continue
    const file = fileById.get(assignment.file_object_id)
    if (file) primaryFileByRecord.set(assignment.record_id, file)
  }
  return {
    assets: eligible.flatMap(record => {
      const file = primaryFileByRecord.get(record.id)
      if (!file) return []
      return [{
        id: record.id,
        file_name: record.title || file.file_name,
        asset_category: 'staff',
        file_path: file.storage_path,
        file_type: file.file_type,
        metadata: { ...record.metadata, source_type: 'client_brain_truth', asset_role: 'identity_truth' },
        status: 'approved',
        source_quality: 'approved',
        uploaded_at: record.updated_at,
      }]
    }),
  }
}

async function loadAssetEditOptions(clientId: string): Promise<ClientBrainV2AssetEditOptions> {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, top_section, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .or('subsection.eq.menus,subsection.eq.activations,top_section.eq.sources')
    .order('title')
  if (error) throw new ClientBrainV2HttpError('Unable to load Asset relationship options.', 500)

  const options = data ?? []
  return {
    menus: options.filter(record => record.subsection === 'menus'
      && record.record_type === 'menu'
      && record.metadata?.menu_taxonomy_status === 'active'),
    activations: options.filter(record => record.subsection === 'activations' && record.record_type === 'activation'),
    sources: options.filter(record => record.top_section === 'sources'),
  }
}

async function loadAssetFiles(clientId: string, recordId: string) {
  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('id, record_id, file_object_id, semantic_role, approval_status, sort_order')
    .eq('client_id', clientId)
    .eq('record_id', recordId)
    .order('sort_order')
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load Asset files.', 500)

  const fileObjectIds = [...new Set((assignments ?? []).map(assignment => assignment.file_object_id))]
  if (!fileObjectIds.length) return [] as ClientBrainV2File[]
  const { data: fileObjects, error: fileObjectsError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('*')
    .in('id', fileObjectIds)
  if (fileObjectsError) throw new ClientBrainV2HttpError('Unable to load Asset file details.', 500)

  const fileById = new Map((fileObjects ?? []).map(file => [file.id, file]))
  const files = (assignments ?? []).flatMap(assignment => {
    const file = fileById.get(assignment.file_object_id)
    if (!file) return []
    return [{ assignment, file }]
  })
  const urlsByFileId = await signedUrlsForFiles(files.map(({ file }) => file))
  return files.map(({ assignment, file }) => ({
    id: assignment.id,
    semantic_role: assignment.semantic_role,
    approval_status: assignment.approval_status,
    file_name: file.file_name,
    file_type: file.file_type,
    storage_path: file.storage_path,
    preview_path: file.preview_path,
    optimized_path: file.optimized_path,
    signed_url: urlsByFileId.get(file.id) ?? null,
    file_size_bytes: file.file_size_bytes ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    metadata: file.metadata ?? {},
  })) as ClientBrainV2File[]
}

async function loadAssetRelationships(clientId: string, recordId: string): Promise<ClientBrainV2RecordRelationship[]> {
  const { data: links, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('id, from_record_id, to_record_id, relation_type, metadata')
    .eq('client_id', clientId)
    .or(`from_record_id.eq.${recordId},to_record_id.eq.${recordId}`)
  if (linksError) throw new ClientBrainV2HttpError('Unable to load Asset relationships.', 500)

  const relatedIds = [...new Set((links ?? []).flatMap(link => [link.from_record_id, link.to_record_id]).filter(id => id !== recordId))]
  if (!relatedIds.length) return []
  const { data: relatedRecords, error: relatedRecordsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, client_id, stable_key, top_section, subsection, record_type, title, summary, status, effective_date, last_verified_at, valid_until, review_at, source_type, metadata')
    .eq('client_id', clientId)
    .in('id', relatedIds)
  if (relatedRecordsError) throw new ClientBrainV2HttpError('Unable to load related Asset records.', 500)
  const relatedById = new Map((relatedRecords ?? []).map(record => [record.id, record]))

  return (links ?? []).flatMap(link => {
    const outgoing = link.from_record_id === recordId
    const related = relatedById.get(outgoing ? link.to_record_id : link.from_record_id)
    if (!related) return []
    return [{
      id: link.id,
      relation_type: link.relation_type,
      direction: outgoing ? 'outgoing' : 'incoming',
      metadata: link.metadata ?? {},
      record: { ...related, files: [] },
    }]
  }) as ClientBrainV2RecordRelationship[]
}

async function signedUrlsForFiles(files: Array<Record<string, unknown>>) {
  const byBucket = new Map<string, Array<{ id: string; path: string }>>()
  for (const file of files) {
    const path = String(file.preview_path || file.optimized_path || file.storage_path || '')
    const bucket = String(file.storage_bucket || '')
    if (!path || !bucket) continue
    const current = byBucket.get(bucket) ?? []
    current.push({ id: String(file.id), path })
    byBucket.set(bucket, current)
  }

  const urlsByFileId = new Map<string, string>()
  await Promise.all([...byBucket.entries()].map(async ([bucket, filesForBucket]) => {
    const { data, error } = await clientBrainV2ServerClient.storage
      .from(bucket)
      .createSignedUrls(filesForBucket.map(file => file.path), 60 * 30)
    if (error) throw new ClientBrainV2HttpError('Unable to create Asset preview URLs.', 500)
    const urlsByPath = new Map((data ?? []).map(item => [item.path, item.signedUrl]))
    for (const file of filesForBucket) {
      const signedUrl = urlsByPath.get(file.path)
      if (signedUrl) urlsByFileId.set(file.id, signedUrl)
    }
  }))
  return urlsByFileId
}

export async function loadClientBrainV2AssetDetail(clientId: string, assetId: string) {
  if (!isUuid(assetId)) throw new ClientBrainV2HttpError('Asset not found.', 404)
  await requireClientBrainV2(clientId)
  const { data: record, error: recordError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('*')
    .eq('id', assetId)
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .neq('status', 'archived')
    .maybeSingle()
  if (recordError) throw new ClientBrainV2HttpError('Unable to load Asset.', 500)
  if (!record) throw new ClientBrainV2HttpError('Asset not found.', 404)

  const legacyAssetId = record.legacy_asset_upload_id as string | null
  const [files, relationships, assetEditOptions, legacyResult] = await Promise.all([
    loadAssetFiles(clientId, assetId),
    loadAssetRelationships(clientId, assetId),
    loadAssetEditOptions(clientId),
    legacyAssetId
      ? clientBrainV2ServerClient
        .from('asset_uploads')
        .select('id, asset_category, file_name, file_type, status, original_width, original_height, metadata')
        .eq('id', legacyAssetId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (legacyResult.error) throw new ClientBrainV2HttpError('Unable to load Asset legacy metadata.', 500)

  return {
    record: {
      ...record,
      files,
      relationships,
      versions: [],
      commercial: null,
      legacy_asset: legacyResult.data ?? null,
    } as ClientBrainV2Record,
    assetEditOptions,
  }
}

export async function loadClientBrainV2AssetThumbnails(clientId: string, assetIds: string[]) {
  if (!Array.isArray(assetIds) || assetIds.length > ASSET_THUMBNAIL_BATCH_SIZE || assetIds.some(id => !isUuid(id))) {
    throw new ClientBrainV2HttpError('Invalid Asset thumbnail request.', 400)
  }
  if (!assetIds.length) return { thumbnailUrls: {} as Record<string, string> }
  await requireClientBrainV2(clientId)

  const { data: records, error: recordsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .neq('status', 'archived')
    .in('id', assetIds)
  if (recordsError) throw new ClientBrainV2HttpError('Unable to validate Assets.', 500)
  const recordIds = (records ?? []).map(record => record.id)
  if (!recordIds.length) return { thumbnailUrls: {} as Record<string, string> }

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id, file_object_id, sort_order')
    .eq('client_id', clientId)
    .in('record_id', recordIds)
    .order('sort_order')
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load Asset thumbnails.', 500)

  const firstAssignmentByRecord = new Map<string, string>()
  for (const assignment of assignments ?? []) {
    if (!firstAssignmentByRecord.has(assignment.record_id)) firstAssignmentByRecord.set(assignment.record_id, assignment.file_object_id)
  }
  const fileObjectIds = [...new Set(firstAssignmentByRecord.values())]
  if (!fileObjectIds.length) return { thumbnailUrls: {} as Record<string, string> }
  const { data: files, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_bucket, storage_path, preview_path, optimized_path')
    .in('id', fileObjectIds)
  if (filesError) throw new ClientBrainV2HttpError('Unable to load Asset thumbnail files.', 500)
  const urlsByFileId = await signedUrlsForFiles((files ?? []) as Array<Record<string, unknown>>)

  return {
    thumbnailUrls: Object.fromEntries([...firstAssignmentByRecord.entries()].flatMap(([recordId, fileId]) => {
      const signedUrl = urlsByFileId.get(fileId)
      return signedUrl ? [[recordId, signedUrl]] : []
    })),
  }
}

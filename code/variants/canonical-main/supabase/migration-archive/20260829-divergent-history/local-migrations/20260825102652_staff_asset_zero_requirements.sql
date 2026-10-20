-- Staff is a first-class Asset category. It deliberately has no required
-- identity or employment metadata: the client-owned image is enough to save.

create or replace function public.apply_client_brain_v2_asset_edit(
  p_client_id uuid,
  p_asset_id uuid,
  p_expected_updated_at timestamptz,
  p_metadata jsonb,
  p_record_status text,
  p_last_verified_at timestamptz,
  p_semantic_role text,
  p_assignment_approval_status text,
  p_menu_ids uuid[] default '{}',
  p_activation_ids uuid[] default '{}',
  p_source_ids uuid[] default '{}',
  p_provenance jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing public.client_brain_v2_records%rowtype;
  target_id uuid;
  saved_updated_at timestamptz;
  resolved_gap_count integer := 0;
begin
  if not exists (select 1 from public.clients where id = p_client_id and brain_architecture_version = 'hospitality_restaurant_v2') then
    raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.';
  end if;
  select * into existing from public.client_brain_v2_records
  where id = p_asset_id and client_id = p_client_id and top_section = 'assets' for update;
  if not found then raise exception using errcode = 'PT404', message = 'Asset not found for this client.'; end if;
  if existing.updated_at <> p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This Asset changed after editing began. Your values are preserved; refresh before saving again.';
  end if;
  if coalesce(p_metadata->>'asset_category', '') not in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'staff') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset category.';
  end if;
  if p_semantic_role not in ('truth_reference', 'creative_reference', 'approved_marketing_asset', 'generated_asset', 'raw_asset', 'archived_asset') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset role.';
  end if;
  if p_assignment_approval_status not in ('approved', 'needs_review') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset approval state.';
  end if;
  if coalesce(p_metadata->>'asset_category', '') not in ('food', 'drinks') and cardinality(coalesce(p_menu_ids, '{}')) > 0 then
    raise exception using errcode = 'PT400', message = 'Only Food and Drink assets can link to Menus.';
  end if;
  foreach target_id in array coalesce(p_menu_ids, '{}') loop
    if not exists (select 1 from public.client_brain_v2_records where id = target_id and client_id = p_client_id and subsection = 'menus' and record_type = 'menu' and metadata->>'menu_taxonomy_status' = 'active') then
      raise exception using errcode = 'PT403', message = 'A selected Menu is not an active canonical Menu for this client.';
    end if;
  end loop;
  foreach target_id in array coalesce(p_activation_ids, '{}') loop
    if not exists (select 1 from public.client_brain_v2_records where id = target_id and client_id = p_client_id and subsection = 'activations' and record_type = 'activation') then
      raise exception using errcode = 'PT403', message = 'A selected Activation does not belong to this client.';
    end if;
  end loop;
  foreach target_id in array coalesce(p_source_ids, '{}') loop
    if not exists (select 1 from public.client_brain_v2_records where id = target_id and client_id = p_client_id and top_section = 'sources') then
      raise exception using errcode = 'PT403', message = 'A selected Source does not belong to this client.';
    end if;
  end loop;
  insert into public.client_brain_v2_record_versions (client_id, record_id, version_snapshot)
  values (p_client_id, p_asset_id, to_jsonb(existing) || jsonb_build_object(
    'asset_file_assignments', coalesce((select jsonb_agg(to_jsonb(assignment) order by assignment.sort_order, assignment.id) from public.client_brain_v2_record_files assignment where assignment.client_id = p_client_id and assignment.record_id = p_asset_id), '[]'::jsonb),
    'asset_relationships', coalesce((select jsonb_agg(to_jsonb(link) order by link.created_at, link.id) from public.client_brain_v2_links link where link.client_id = p_client_id and link.from_record_id = p_asset_id and (link.relation_type in ('belongs_to_menu', 'supports_activation') or exists (select 1 from public.client_brain_v2_records target where target.id = link.to_record_id and target.client_id = p_client_id and target.top_section = 'sources'))), '[]'::jsonb)
  ));
  perform set_config('jarvis.skip_client_brain_v2_record_version', 'on', true);
  update public.client_brain_v2_records set metadata = coalesce(p_metadata, '{}'::jsonb), status = p_record_status, last_verified_at = p_last_verified_at,
    source_type = 'client_provided', provenance = coalesce(existing.provenance, '{}'::jsonb) || coalesce(p_provenance, '{}'::jsonb)
  where id = p_asset_id and client_id = p_client_id returning updated_at into saved_updated_at;
  perform set_config('jarvis.skip_client_brain_v2_record_version', 'off', true);
  update public.client_brain_v2_record_files set semantic_role = p_semantic_role, approval_status = p_assignment_approval_status,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('edited_by', 'Manual Client Brain Edit', 'edited_at', now())
      || case when p_metadata ? 'approved_for_generation' then jsonb_build_object('approved_for_generation', (p_metadata->>'approved_for_generation')::boolean) else '{}'::jsonb end
  where client_id = p_client_id and record_id = p_asset_id;
  delete from public.client_brain_v2_links where client_id = p_client_id and from_record_id = p_asset_id and relation_type in ('belongs_to_menu', 'supports_activation');
  delete from public.client_brain_v2_links link using public.client_brain_v2_records target
  where link.client_id = p_client_id and link.from_record_id = p_asset_id and link.to_record_id = target.id and target.client_id = p_client_id and target.top_section = 'sources' and link.relation_type = 'derived_from';
  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'belongs_to_menu', jsonb_build_object('linked_by', 'Manual Client Brain Edit') from unnest(coalesce(p_menu_ids, '{}')) as selected(id) on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;
  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'supports_activation', jsonb_build_object('linked_by', 'Manual Client Brain Edit') from unnest(coalesce(p_activation_ids, '{}')) as selected(id) on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;
  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'derived_from', jsonb_build_object('linked_by', 'Manual Client Brain Edit') from unnest(coalesce(p_source_ids, '{}')) as selected(id) on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;
  if p_semantic_role = 'truth_reference' and coalesce((p_metadata->>'approved_for_generation')::boolean, false) then
    update public.client_brain_v2_records set status = 'resolved', last_verified_at = now(), provenance = provenance || jsonb_build_object('resolved_by', 'Manual Client Brain Asset Edit', 'resolved_by_asset_id', p_asset_id, 'resolved_at', now())
    where client_id = p_client_id and record_type = 'knowledge_gap' and stable_key = case p_metadata->>'asset_category'
      when 'food' then 'knowledge_gap:assets:missing_approved_food_truth_reference'
      when 'drinks' then 'knowledge_gap:assets:missing_approved_drink_truth_reference'
      when 'interiors' then 'knowledge_gap:assets:missing_approved_interior_truth_reference'
      when 'exteriors' then 'knowledge_gap:assets:missing_approved_exterior_truth_reference'
      when 'venue_items' then 'knowledge_gap:assets:missing_approved_venue_item_truth_reference'
    end and status not in ('resolved', 'superseded', 'archived');
    get diagnostics resolved_gap_count = row_count;
  end if;
  return jsonb_build_object('asset_id', p_asset_id, 'updated_at', saved_updated_at, 'resolved_gap_count', resolved_gap_count);
end;
$$;

create or replace function public.apply_client_brain_v2_asset_classification(
  p_client_id uuid, p_asset_id uuid, p_expected_updated_at timestamptz, p_category text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing public.client_brain_v2_records%rowtype; next_metadata jsonb; previous_category text; saved_updated_at timestamptz;
begin
  if not exists (select 1 from public.clients where id = p_client_id and brain_architecture_version = 'hospitality_restaurant_v2') then raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.'; end if;
  if p_category not in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'staff', 'unclassified') then raise exception using errcode = 'PT400', message = 'Invalid Asset category.'; end if;
  select * into existing from public.client_brain_v2_records where id = p_asset_id and client_id = p_client_id and top_section = 'assets' for update;
  if not found then raise exception using errcode = 'PT404', message = 'Asset not found for this client.'; end if;
  if existing.updated_at <> p_expected_updated_at then raise exception using errcode = 'PT409', message = 'This Asset changed after classification began. Refresh before saving again.'; end if;
  previous_category := case when existing.metadata->>'asset_category_source' = 'human_confirmed' then coalesce(existing.metadata->>'asset_category', 'unclassified') else 'unclassified' end;
  next_metadata := coalesce(existing.metadata, '{}'::jsonb) || jsonb_build_object('asset_category', p_category, 'asset_category_source', 'human_confirmed', 'asset_category_confirmed_at', now(), 'asset_category_confirmed_by', 'Manual Client Brain Classification');
  if previous_category is distinct from p_category then next_metadata := jsonb_set(next_metadata, '{asset_category_history}', coalesce(next_metadata->'asset_category_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('from', previous_category, 'to', p_category, 'changed_at', now(), 'changed_by', 'Manual Client Brain Classification')), true); end if;
  update public.client_brain_v2_records set metadata = next_metadata, provenance = coalesce(existing.provenance, '{}'::jsonb) || jsonb_build_object('manual_classification', true, 'classification_source', 'Manual Client Brain Classification', 'classified_at', now()) where id = p_asset_id and client_id = p_client_id returning updated_at into saved_updated_at;
  return jsonb_build_object('asset_id', p_asset_id, 'category', p_category, 'updated_at', saved_updated_at);
end;
$$;

create or replace function public.finalize_client_brain_v2_staff_ingestion(
  p_client_id uuid, p_draft_id uuid, p_title text, p_metadata jsonb, p_files jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft public.client_brain_v2_asset_ingestion_drafts%rowtype;
  v_asset_id uuid := gen_random_uuid();
  v_requested_approval boolean;
  v_staff_active boolean;
  v_file jsonb;
  v_file_id uuid;
  v_file_count integer := 0;
  v_title text := nullif(trim(p_title), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb) - 'approved_for_generation' - 'staff_active';
begin
  if not exists (select 1 from public.clients where id = p_client_id and brain_architecture_version = 'hospitality_restaurant_v2') then raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.'; end if;
  select * into v_draft from public.client_brain_v2_asset_ingestion_drafts where id = p_draft_id and client_id = p_client_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Staff ingestion draft not found.'; end if;
  if v_draft.asset_category <> 'staff' then raise exception using errcode = 'PT400', message = 'This finalizer only accepts Staff drafts.'; end if;
  if v_draft.state not in ('draft', 'ready_for_review', 'finalization_failed') then raise exception using errcode = 'PT409', message = 'This Staff draft cannot be finalized in its current state.'; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then raise exception using errcode = 'PT400', message = 'At least one finalized Staff reference is required.'; end if;
  if not exists (select 1 from public.client_brain_v2_asset_ingestion_temp_files where client_id = p_client_id and draft_id = p_draft_id and cleanup_state = 'active') then raise exception using errcode = 'PT400', message = 'The Staff ingestion draft has no recoverable source references.'; end if;
  if p_metadata ? 'approved_for_generation' then
    if jsonb_typeof(p_metadata->'approved_for_generation') <> 'boolean' then raise exception using errcode = 'PT400', message = 'Approved for Generation must be true or false.'; end if;
    v_requested_approval := (p_metadata->>'approved_for_generation')::boolean;
  end if;
  if p_metadata ? 'staff_active' then
    if jsonb_typeof(p_metadata->'staff_active') <> 'boolean' then raise exception using errcode = 'PT400', message = 'Active Staff Member must be true or false.'; end if;
    v_staff_active := (p_metadata->>'staff_active')::boolean;
  end if;
  v_title := coalesce(v_title, nullif(trim(p_files->0->>'file_name'), ''));
  if v_title is null then raise exception using errcode = 'PT400', message = 'Final Staff file metadata is invalid.'; end if;
  insert into public.client_brain_v2_records (id, client_id, stable_key, top_section, subsection, record_type, title, knowledge_class, status, priority, source_type, provenance, metadata)
  values (v_asset_id, p_client_id, 'asset:staff:' || v_asset_id::text, 'assets', 'people', 'asset', v_title, 'asset', case when v_requested_approval then 'approved' else 'current' end, 3, 'client_provided',
    jsonb_build_object('ingestion_draft_id', p_draft_id, 'ingestion_mode', 'staff_identity_reference', 'raw_reference_count', jsonb_array_length(p_files), 'finalized_at', now()),
    v_metadata || jsonb_build_object('asset_category', 'staff', 'asset_category_source', 'human_confirmed', 'asset_category_confirmed_at', now(), 'asset_category_confirmed_by', 'Asset Ingestion', 'asset_role', case when v_requested_approval then 'truth_reference' else 'raw_asset' end, 'identity_type', 'staff')
      || case when v_staff_active is null then '{}'::jsonb else jsonb_build_object('staff_active', v_staff_active) end
      || case when v_requested_approval is null then '{}'::jsonb else jsonb_build_object('approved_for_generation', v_requested_approval) end);
  for v_file in select value from jsonb_array_elements(p_files) loop
    if nullif(trim(coalesce(v_file->>'storage_bucket', '')), '') is null or nullif(trim(coalesce(v_file->>'storage_path', '')), '') is null or nullif(trim(coalesce(v_file->>'file_name', '')), '') is null or nullif(trim(coalesce(v_file->>'file_type', '')), '') is null or coalesce((v_file->>'file_size_bytes')::bigint, 0) <= 0 then raise exception using errcode = 'PT400', message = 'Final Staff file metadata is invalid.'; end if;
    v_file_id := gen_random_uuid();
    insert into public.client_brain_file_objects (id, storage_bucket, storage_path, file_name, file_type, file_size_bytes, metadata)
    values (v_file_id, v_file->>'storage_bucket', v_file->>'storage_path', v_file->>'file_name', v_file->>'file_type', (v_file->>'file_size_bytes')::bigint, coalesce(v_file->'metadata', '{}'::jsonb));
    insert into public.client_brain_v2_record_files (client_id, record_id, file_object_id, semantic_role, approval_status, sort_order, metadata)
    values (p_client_id, v_asset_id, v_file_id, case when v_requested_approval then 'truth_reference' else 'raw_asset' end, case when v_requested_approval then 'approved' else 'needs_review' end, v_file_count,
      jsonb_build_object('ingested_via', 'asset_ingestion_v1', 'staff_identity_reference', true) || case when v_requested_approval is null then '{}'::jsonb else jsonb_build_object('approved_for_generation', v_requested_approval) end);
    v_file_count := v_file_count + 1;
  end loop;
  update public.client_brain_v2_asset_ingestion_drafts set state = 'finalized', final_asset_id = v_asset_id, cleanup_error = null where id = p_draft_id and client_id = p_client_id;
  return jsonb_build_object('asset_id', v_asset_id, 'file_count', v_file_count, 'draft_id', p_draft_id);
end;
$$;

revoke all on function public.apply_client_brain_v2_asset_edit(uuid, uuid, timestamptz, jsonb, text, timestamptz, text, text, uuid[], uuid[], uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_asset_edit(uuid, uuid, timestamptz, jsonb, text, timestamptz, text, text, uuid[], uuid[], uuid[], jsonb) to service_role;
revoke all on function public.apply_client_brain_v2_asset_classification(uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_asset_classification(uuid, uuid, timestamptz, text) to service_role;
revoke all on function public.finalize_client_brain_v2_staff_ingestion(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_client_brain_v2_staff_ingestion(uuid, uuid, text, jsonb, jsonb) to service_role;

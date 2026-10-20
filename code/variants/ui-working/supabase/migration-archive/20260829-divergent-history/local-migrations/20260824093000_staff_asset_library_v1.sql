-- Client-scoped staff identity references extend the canonical Client Brain
-- Asset Library. They are not an HR, payroll, or guest-data system.

alter table public.client_brain_v2_asset_ingestion_drafts
  drop constraint if exists client_brain_v2_asset_ingestion_drafts_asset_category_check;

alter table public.client_brain_v2_asset_ingestion_drafts
  add constraint client_brain_v2_asset_ingestion_drafts_asset_category_check
  check (asset_category in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'staff'));

create or replace function public.finalize_client_brain_v2_staff_ingestion(
  p_client_id uuid,
  p_draft_id uuid,
  p_title text,
  p_metadata jsonb,
  p_files jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.client_brain_v2_asset_ingestion_drafts%rowtype;
  v_asset_id uuid := gen_random_uuid();
  v_requested_approval boolean := coalesce((p_metadata->>'approved_for_generation')::boolean, false);
  v_staff_active boolean := coalesce((p_metadata->>'staff_active')::boolean, true);
  v_file jsonb;
  v_file_id uuid;
  v_file_count integer := 0;
  v_title text := nullif(trim(p_title), '');
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id and brain_architecture_version = 'hospitality_restaurant_v2'
  ) then
    raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.';
  end if;

  select * into v_draft
  from public.client_brain_v2_asset_ingestion_drafts
  where id = p_draft_id and client_id = p_client_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'Staff ingestion draft not found.';
  end if;
  if v_draft.asset_category <> 'staff' then
    raise exception using errcode = 'PT400', message = 'This finalizer only accepts Staff drafts.';
  end if;
  if v_draft.state not in ('draft', 'ready_for_review', 'finalization_failed') then
    raise exception using errcode = 'PT409', message = 'This Staff draft cannot be finalized in its current state.';
  end if;
  if v_title is null or nullif(trim(coalesce(p_metadata->>'staff_name', '')), '') is null then
    raise exception using errcode = 'PT400', message = 'Staff name is required.';
  end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then
    raise exception using errcode = 'PT400', message = 'At least one finalized Staff reference is required.';
  end if;
  if not exists (
    select 1 from public.client_brain_v2_asset_ingestion_temp_files
    where client_id = p_client_id and draft_id = p_draft_id and cleanup_state = 'active'
  ) then
    raise exception using errcode = 'PT400', message = 'The Staff ingestion draft has no recoverable source references.';
  end if;

  insert into public.client_brain_v2_records (
    id, client_id, stable_key, top_section, subsection, record_type, title,
    knowledge_class, status, priority, source_type, provenance, metadata
  ) values (
    v_asset_id, p_client_id, 'asset:staff:' || v_asset_id::text,
    'assets', 'people', 'asset', v_title,
    'asset', case when v_requested_approval then 'approved' else 'needs_review' end, 3, 'client_provided',
    jsonb_build_object(
      'ingestion_draft_id', p_draft_id,
      'ingestion_mode', 'staff_identity_reference',
      'raw_reference_count', jsonb_array_length(p_files),
      'finalized_at', now()
    ),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'asset_category', 'staff',
      'asset_category_source', 'human_confirmed',
      'asset_category_confirmed_at', now(),
      'asset_category_confirmed_by', 'Asset Ingestion',
      'asset_role', 'identity_truth',
      'identity_type', 'staff',
      'staff_active', v_staff_active,
      'approved_for_generation', v_requested_approval,
      'review_state', case when v_requested_approval then 'approved' else 'needs_review' end
    )
  );

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    if nullif(trim(coalesce(v_file->>'storage_bucket', '')), '') is null
      or nullif(trim(coalesce(v_file->>'storage_path', '')), '') is null
      or nullif(trim(coalesce(v_file->>'file_name', '')), '') is null
      or nullif(trim(coalesce(v_file->>'file_type', '')), '') is null
      or coalesce((v_file->>'file_size_bytes')::bigint, 0) <= 0 then
      raise exception using errcode = 'PT400', message = 'Final Staff file metadata is invalid.';
    end if;
    v_file_id := gen_random_uuid();
    insert into public.client_brain_file_objects (
      id, storage_bucket, storage_path, file_name, file_type, file_size_bytes, metadata
    ) values (
      v_file_id,
      v_file->>'storage_bucket', v_file->>'storage_path', v_file->>'file_name', v_file->>'file_type',
      (v_file->>'file_size_bytes')::bigint, coalesce(v_file->'metadata', '{}'::jsonb)
    );
    insert into public.client_brain_v2_record_files (
      client_id, record_id, file_object_id, semantic_role, approval_status, sort_order, metadata
    ) values (
      p_client_id, v_asset_id, v_file_id, 'truth_reference',
      case when v_requested_approval then 'approved' else 'needs_review' end, v_file_count,
      jsonb_build_object('ingested_via', 'asset_ingestion_v1', 'staff_identity_reference', true, 'approved_for_generation', v_requested_approval)
    );
    v_file_count := v_file_count + 1;
  end loop;

  update public.client_brain_v2_asset_ingestion_drafts
  set state = 'finalized', final_asset_id = v_asset_id, cleanup_error = null
  where id = p_draft_id and client_id = p_client_id;

  return jsonb_build_object('asset_id', v_asset_id, 'file_count', v_file_count, 'draft_id', p_draft_id);
end;
$$;

revoke all on function public.finalize_client_brain_v2_staff_ingestion(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_client_brain_v2_staff_ingestion(uuid, uuid, text, jsonb, jsonb) to service_role;

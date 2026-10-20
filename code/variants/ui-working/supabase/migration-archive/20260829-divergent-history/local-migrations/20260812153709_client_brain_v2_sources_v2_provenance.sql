-- Sources V2 keeps evidence in the existing Client Brain record/link/file model.
-- It deliberately does not create a parallel Source subsystem.

create index if not exists client_brain_v2_sources_client_status_idx
  on public.client_brain_v2_records (client_id, status, updated_at desc)
  where top_section = 'sources';

create index if not exists client_brain_v2_sources_client_type_idx
  on public.client_brain_v2_records (client_id, source_type)
  where top_section = 'sources';

create or replace function public.apply_client_brain_v2_source_v2_edit(
  p_client_id uuid,
  p_change jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.client_brain_v2_records%rowtype;
  replacement public.client_brain_v2_records%rowtype;
  source_v2 jsonb := coalesce(p_change->'metadata'->'source_v2', '{}'::jsonb);
  requested_superseded_by uuid := nullif(p_change->>'superseded_by_id', '')::uuid;
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  if p_change->>'source_type' not in (
    'official_document', 'client_provided', 'official_website', 'official_social',
    'activation_creative', 'review_public_feedback', 'research_web',
    'competitor_source', 'internal_working', 'other'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Source type.';
  end if;
  if p_change->>'status' not in ('current', 'needs_review', 'historical', 'superseded') then
    raise exception using errcode = 'PT400', message = 'Invalid Source status.';
  end if;
  if source_v2->>'kind' not in ('file', 'url', 'manual') then
    raise exception using errcode = 'PT400', message = 'Invalid Source kind.';
  end if;
  if source_v2->>'trust' not in ('high', 'medium', 'low', 'unknown') then
    raise exception using errcode = 'PT400', message = 'Invalid Source trust.';
  end if;
  if jsonb_typeof(source_v2->'authority_scopes') <> 'array'
     or exists (
       select 1 from jsonb_array_elements_text(source_v2->'authority_scopes') scope
       where scope not in ('brand', 'menu', 'activation_offer', 'operations', 'visual', 'customer_sentiment', 'market_intelligence', 'competitor_intelligence', 'other')
     ) then
    raise exception using errcode = 'PT400', message = 'Invalid Source authority scope.';
  end if;
  if source_v2->>'kind' = 'url' and nullif(source_v2->>'url', '') is null then
    raise exception using errcode = 'PT400', message = 'A URL Source requires a URL.';
  end if;
  if nullif(source_v2->>'url', '') is not null and source_v2->>'url' !~* '^https?://[^[:space:]]+$' then
    raise exception using errcode = 'PT400', message = 'Source URL must use http or https.';
  end if;

  select * into existing
  from public.client_brain_v2_records
  where id = (p_change->>'record_id')::uuid and client_id = p_client_id and top_section = 'sources'
  for update;
  if not found then
    raise exception using errcode = 'PT403', message = 'The Source record does not belong to this client.';
  end if;
  if nullif(p_change->>'expected_updated_at', '') is null
     or existing.updated_at <> (p_change->>'expected_updated_at')::timestamptz then
    raise exception using errcode = 'PT409', message = 'This Source changed after editing began. Refresh and review the newer values.';
  end if;
  if requested_superseded_by = existing.id then
    raise exception using errcode = 'PT400', message = 'A Source cannot supersede itself.';
  end if;
  if requested_superseded_by is not null then
    select * into replacement from public.client_brain_v2_records
    where id = requested_superseded_by and client_id = p_client_id and top_section = 'sources';
    if not found then
      raise exception using errcode = 'PT403', message = 'Superseded by Source must belong to this client.';
    end if;
    if replacement.superseded_by_id = existing.id then
      raise exception using errcode = 'PT400', message = 'This would create a circular Source supersession.';
    end if;
  end if;

  update public.client_brain_v2_records set
    title = p_change->>'title',
    content = nullif(p_change->>'content', ''),
    knowledge_class = 'source',
    status = p_change->>'status',
    confidence = nullif(p_change->>'confidence', '')::numeric,
    last_verified_at = nullif(p_change->>'last_verified_at', '')::timestamptz,
    source_type = p_change->>'source_type',
    superseded_by_id = requested_superseded_by,
    provenance = coalesce(p_change->'provenance', '{}'::jsonb),
    metadata = coalesce(p_change->'metadata', '{}'::jsonb)
  where id = existing.id;

  return jsonb_build_object('saved_record_id', existing.id);
end;
$$;

revoke all on function public.apply_client_brain_v2_source_v2_edit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_source_v2_edit(uuid, jsonb) to service_role;

create or replace function public.create_client_brain_v2_source_v2(
  p_client_id uuid,
  p_source jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_v2 jsonb := jsonb_build_object(
    'type', p_source->>'source_type',
    'kind', p_source->>'source_kind',
    'trust', p_source->>'trust',
    'authority_scopes', coalesce(p_source->'authority_scopes', '[]'::jsonb)
  ) || case when nullif(p_source->>'external_url', '') is null then '{}'::jsonb else jsonb_build_object('url', p_source->>'external_url') end;
  v_record_id uuid := gen_random_uuid();
  v_file jsonb := p_source->'file';
  v_file_id uuid;
  v_target_id uuid;
  v_superseded_by uuid := nullif(p_source->>'superseded_by_id', '')::uuid;
  v_status text := p_source->>'status';
begin
  if not exists (select 1 from public.clients where id = p_client_id and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;
  if p_source->>'source_type' not in ('official_document', 'client_provided', 'official_website', 'official_social', 'activation_creative', 'review_public_feedback', 'research_web', 'competitor_source', 'internal_working', 'other')
     or v_status not in ('current', 'needs_review', 'historical', 'superseded')
     or p_source->>'source_kind' not in ('file', 'url', 'manual')
     or p_source->>'trust' not in ('high', 'medium', 'low', 'unknown') then
    raise exception using errcode = 'PT400', message = 'Source values are invalid.';
  end if;
  if jsonb_typeof(p_source->'authority_scopes') <> 'array'
     or exists (select 1 from jsonb_array_elements_text(p_source->'authority_scopes') scope where scope not in ('brand', 'menu', 'activation_offer', 'operations', 'visual', 'customer_sentiment', 'market_intelligence', 'competitor_intelligence', 'other')) then
    raise exception using errcode = 'PT400', message = 'Invalid Source authority scope.';
  end if;
  if p_source->>'source_kind' = 'url' and nullif(p_source->>'external_url', '') is null then
    raise exception using errcode = 'PT400', message = 'A URL Source requires a URL.';
  end if;
  if nullif(p_source->>'external_url', '') is not null and p_source->>'external_url' !~* '^https?://[^[:space:]]+$' then
    raise exception using errcode = 'PT400', message = 'Source URL must use http or https.';
  end if;
  if nullif(p_source->>'external_url', '') is not null and exists (
    select 1 from public.client_brain_v2_records
    where client_id = p_client_id and top_section = 'sources' and metadata->'source_v2'->>'url' = p_source->>'external_url'
  ) then
    raise exception using errcode = 'PT409', message = 'This URL is already registered as a Source.';
  end if;
  if v_superseded_by is not null and not exists (
    select 1 from public.client_brain_v2_records where id = v_superseded_by and client_id = p_client_id and top_section = 'sources'
  ) then
    raise exception using errcode = 'PT403', message = 'Superseded by Source must belong to this client.';
  end if;
  if p_source->>'source_kind' = 'file' and (v_file is null or jsonb_typeof(v_file) <> 'object') then
    raise exception using errcode = 'PT400', message = 'A file Source requires an uploaded file.';
  end if;

  insert into public.client_brain_v2_records (
    id, client_id, stable_key, top_section, subsection, record_type, title, content,
    knowledge_class, status, confidence, priority, last_verified_at, source_type, superseded_by_id, provenance, metadata
  ) values (
    v_record_id, p_client_id, 'source:v2:' || v_record_id::text, 'sources', 'library', 'source',
    p_source->>'title', nullif(p_source->>'content', ''), 'source', v_status,
    case p_source->>'trust' when 'high' then .9 when 'medium' then .65 when 'low' then .35 else null end,
    3, nullif(p_source->>'last_verified_at', '')::date, p_source->>'source_type', v_superseded_by,
    jsonb_build_object('source_label', 'Sources V2', 'created_via', 'sources_v2'),
    jsonb_build_object('source_v2', v_source_v2)
  );

  if p_source->>'source_kind' = 'file' then
    insert into public.client_brain_file_objects (storage_bucket, storage_path, file_name, file_type, file_size_bytes, metadata)
    values (
      v_file->>'storageBucket', v_file->>'storagePath', v_file->>'fileName', nullif(v_file->>'fileType', ''),
      nullif(v_file->>'fileSizeBytes', '')::bigint, jsonb_build_object('sha256', v_file->>'sha256', 'uploaded_via', 'sources_v2')
    ) returning id into v_file_id;
    insert into public.client_brain_v2_record_files (client_id, record_id, file_object_id, semantic_role, approval_status)
    values (p_client_id, v_record_id, v_file_id, 'source_document', 'approved');
  end if;

  for v_target_id in select jsonb_array_elements_text(coalesce(p_source->'relationship_target_ids', '[]'::jsonb))::uuid loop
    if not exists (select 1 from public.client_brain_v2_records where id = v_target_id and client_id = p_client_id) then
      raise exception using errcode = 'PT403', message = 'A Source relationship target does not belong to this client.';
    end if;
    insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type)
    values (p_client_id, v_target_id, v_record_id, 'documented_by')
    on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;
  end loop;
  return jsonb_build_object('created_record_id', v_record_id);
end;
$$;

revoke all on function public.create_client_brain_v2_source_v2(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_client_brain_v2_source_v2(uuid, jsonb) to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


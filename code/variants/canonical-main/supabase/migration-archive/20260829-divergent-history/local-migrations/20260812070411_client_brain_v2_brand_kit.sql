-- Minimal Brand Kit V2. Existing long-form guideline records remain historical
-- evidence; this function accepts only the four visual-kit subsections.

create or replace function public.apply_client_brain_v2_brand_guideline_edit(
  p_client_id uuid,
  p_change jsonb,
  p_links jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.client_brain_v2_records%rowtype;
  saved_id uuid;
  link_item jsonb;
  target_record public.client_brain_v2_records%rowtype;
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  if p_change->>'subsection' not in ('logos', 'colours', 'typography', 'graphics_icons') then
    raise exception using errcode = 'PT400', message = 'Invalid Brand Kit section.';
  end if;
  if p_change->>'status' <> 'approved' then
    raise exception using errcode = 'PT400', message = 'Brand Kit sections are canonical only when saved as approved.';
  end if;

  if nullif(p_change->>'record_id', '') is not null then
    select * into existing
    from public.client_brain_v2_records
    where id = (p_change->>'record_id')::uuid
      and client_id = p_client_id
      and top_section = 'brand_guidelines'
    for update;

    if not found then
      raise exception using errcode = 'PT403', message = 'The Brand Kit record does not belong to this client.';
    end if;
    if existing.subsection not in ('logos', 'colours', 'typography', 'graphics_icons') then
      raise exception using errcode = 'PT403', message = 'Historical guideline records cannot be overwritten by Brand Kit V2.';
    end if;
    if nullif(p_change->>'expected_updated_at', '') is not null
       and existing.updated_at <> (p_change->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'This Brand Kit section changed after editing began. Refresh and review the newer values.';
    end if;

    update public.client_brain_v2_records set
      stable_key = p_change->>'stable_key',
      subsection = p_change->>'subsection',
      record_type = 'brand_guideline',
      title = p_change->>'title',
      summary = nullif(p_change->>'summary', ''),
      content = nullif(p_change->>'content', ''),
      knowledge_class = 'brand_guideline',
      status = 'approved',
      confidence = 1,
      priority = (p_change->>'priority')::smallint,
      last_verified_at = now(),
      source_type = nullif(p_change->>'source_type', ''),
      provenance = coalesce(p_change->'provenance', '{}'::jsonb),
      metadata = coalesce(p_change->'metadata', '{}'::jsonb)
    where id = existing.id
    returning id into saved_id;
  else
    insert into public.client_brain_v2_records (
      client_id, stable_key, top_section, subsection, record_type, title, summary, content,
      knowledge_class, status, confidence, priority, last_verified_at, source_type, provenance, metadata
    ) values (
      p_client_id, p_change->>'stable_key', 'brand_guidelines', p_change->>'subsection',
      'brand_guideline', p_change->>'title', nullif(p_change->>'summary', ''), nullif(p_change->>'content', ''),
      'brand_guideline', 'approved', 1, (p_change->>'priority')::smallint, now(), nullif(p_change->>'source_type', ''),
      coalesce(p_change->'provenance', '{}'::jsonb), coalesce(p_change->'metadata', '{}'::jsonb)
    )
    on conflict (client_id, stable_key) do update set
      subsection = excluded.subsection,
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      status = 'approved',
      confidence = 1,
      priority = excluded.priority,
      last_verified_at = now(),
      source_type = excluded.source_type,
      provenance = excluded.provenance,
      metadata = excluded.metadata
    returning id into saved_id;
  end if;

  for link_item in select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    select * into target_record
    from public.client_brain_v2_records
    where id = (link_item->>'to_record_id')::uuid
      and client_id = p_client_id
      and status <> 'archived';
    if not found or link_item->>'relation_type' <> 'references_asset'
       or target_record.top_section <> 'assets' or target_record.subsection <> 'brand_files' then
      raise exception using errcode = 'PT403', message = 'Brand Kit files must be current Brand File assets for this client.';
    end if;
  end loop;

  delete from public.client_brain_v2_links
  where client_id = p_client_id
    and from_record_id = saved_id
    and relation_type = 'references_asset';

  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, saved_id, (item->>'to_record_id')::uuid, 'references_asset', coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) item
  on conflict (client_id, from_record_id, to_record_id, relation_type) do update
    set metadata = excluded.metadata;

  return jsonb_build_object('saved_record_id', saved_id, 'relationship_count', jsonb_array_length(coalesce(p_links, '[]'::jsonb)));
end;
$$;

revoke all on function public.apply_client_brain_v2_brand_guideline_edit(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_brand_guideline_edit(uuid, jsonb, jsonb) to service_role;

create or replace function public.create_client_brain_v2_brand_file(
  p_client_id uuid,
  p_title text,
  p_brand_file_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_file_type text,
  p_file_size_bytes bigint,
  p_file_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid := gen_random_uuid();
  v_file_id uuid := gen_random_uuid();
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;
  if p_brand_file_type not in ('wordmark', 'brand_mark', 'primary_font', 'body_font', 'graphic_element', 'icon', 'pattern', 'illustration', 'texture', 'other')
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_storage_bucket), '') is null
     or nullif(trim(p_storage_path), '') is null
     or nullif(trim(p_file_name), '') is null
     or p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception using errcode = 'PT400', message = 'Brand File payload is invalid.';
  end if;

  insert into public.client_brain_file_objects (id, storage_bucket, storage_path, file_name, file_type, file_size_bytes, metadata)
  values (v_file_id, p_storage_bucket, p_storage_path, p_file_name, nullif(p_file_type, ''), p_file_size_bytes, coalesce(p_file_metadata, '{}'::jsonb));

  insert into public.client_brain_v2_records (
    id, client_id, stable_key, top_section, subsection, record_type, title,
    knowledge_class, status, confidence, priority, source_type, provenance, metadata
  ) values (
    v_asset_id, p_client_id, 'asset:brand-file:' || v_asset_id::text, 'assets', 'brand_files', 'asset', trim(p_title),
    'asset', 'approved', 1, 4, 'client_provided',
    jsonb_build_object('uploaded_via', 'brand_kit_v2', 'uploaded_at', now()),
    jsonb_build_object('brand_file_type', p_brand_file_type, 'asset_role', 'truth_reference', 'approved_for_generation', true, 'review_state', 'approved')
  );

  insert into public.client_brain_v2_record_files (client_id, record_id, file_object_id, semantic_role, approval_status, sort_order, metadata)
  values (p_client_id, v_asset_id, v_file_id, 'truth_reference', 'approved', 0, jsonb_build_object('uploaded_via', 'brand_kit_v2', 'brand_file_type', p_brand_file_type));

  return jsonb_build_object('asset_id', v_asset_id, 'file_object_id', v_file_id);
end;
$$;

revoke all on function public.create_client_brain_v2_brand_file(uuid, text, text, text, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.create_client_brain_v2_brand_file(uuid, text, text, text, text, text, text, bigint, jsonb) to service_role;

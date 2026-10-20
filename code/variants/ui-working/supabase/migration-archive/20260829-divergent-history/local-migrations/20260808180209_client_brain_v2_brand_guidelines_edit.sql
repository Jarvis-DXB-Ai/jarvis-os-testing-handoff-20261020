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

  if p_change->>'subsection' not in (
    'logo_system', 'colour_system', 'typography', 'graphic_language',
    'layout_composition', 'copy_language_system', 'brand_applications'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Brand Guidelines subsection.';
  end if;

  if p_change->>'status' not in ('approved', 'needs_review', 'historical', 'superseded') then
    raise exception using errcode = 'PT400', message = 'Invalid Brand Guideline status.';
  end if;

  if nullif(p_change->>'record_id', '') is not null then
    select * into existing
    from public.client_brain_v2_records
    where id = (p_change->>'record_id')::uuid
      and client_id = p_client_id
      and top_section = 'brand_guidelines'
    for update;

    if not found then
      raise exception using errcode = 'PT403', message = 'The Brand Guideline record does not belong to this client.';
    end if;

    if nullif(p_change->>'expected_updated_at', '') is not null
       and existing.updated_at <> (p_change->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'This Brand Guideline changed after editing began. Refresh and review the newer values.';
    end if;

    update public.client_brain_v2_records set
      stable_key = p_change->>'stable_key',
      subsection = p_change->>'subsection',
      record_type = 'brand_guideline',
      title = p_change->>'title',
      summary = nullif(p_change->>'summary', ''),
      content = nullif(p_change->>'content', ''),
      knowledge_class = 'brand_guideline',
      status = p_change->>'status',
      confidence = (p_change->>'confidence')::numeric,
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
      'brand_guideline', p_change->>'status', (p_change->>'confidence')::numeric,
      (p_change->>'priority')::smallint, now(), nullif(p_change->>'source_type', ''),
      coalesce(p_change->'provenance', '{}'::jsonb), coalesce(p_change->'metadata', '{}'::jsonb)
    )
    on conflict (client_id, stable_key) do update set
      subsection = excluded.subsection,
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      status = excluded.status,
      confidence = excluded.confidence,
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

    if not found then
      raise exception using errcode = 'PT403', message = 'A Brand Guideline relationship target does not belong to this client.';
    end if;

    if link_item->>'relation_type' = 'references_asset'
       and not (target_record.top_section = 'assets' and target_record.subsection = 'brand_files') then
      raise exception using errcode = 'PT403', message = 'Brand Guidelines may reference only canonical Brand File assets.';
    end if;
    if link_item->>'relation_type' = 'documented_by'
       and target_record.top_section <> 'sources' then
      raise exception using errcode = 'PT403', message = 'Brand Guideline provenance must reference a Source record.';
    end if;
  end loop;

  delete from public.client_brain_v2_links
  where client_id = p_client_id
    and from_record_id = saved_id
    and relation_type in ('references_asset', 'documented_by');

  insert into public.client_brain_v2_links (
    client_id, from_record_id, to_record_id, relation_type, metadata
  )
  select p_client_id, saved_id, (item->>'to_record_id')::uuid, item->>'relation_type', coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) item
  on conflict (client_id, from_record_id, to_record_id, relation_type) do update
    set metadata = excluded.metadata;

  return jsonb_build_object('saved_record_id', saved_id, 'relationship_count', jsonb_array_length(coalesce(p_links, '[]'::jsonb)));
end;
$$;

revoke all on function public.apply_client_brain_v2_brand_guideline_edit(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_brand_guideline_edit(uuid, jsonb, jsonb) to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


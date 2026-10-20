create or replace function public.apply_client_brain_v2_source_edit(
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
  expected_subsection text;
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  if nullif(p_change->>'record_id', '') is null then
    raise exception using errcode = 'PT400', message = 'Source record ID is required.';
  end if;

  if p_change->>'source_type' not in (
    'client_provided', 'document', 'official_digital', 'internal_mc_studios',
    'external_research', 'system_derived'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Source type.';
  end if;

  expected_subsection := case p_change->>'source_type'
    when 'client_provided' then 'client_provided'
    when 'document' then 'documents'
    when 'official_digital' then 'official_digital'
    when 'internal_mc_studios' then 'internal_mc_studios'
    when 'external_research' then 'external_research'
    when 'system_derived' then 'system_derived'
  end;

  if p_change->>'subsection' <> expected_subsection then
    raise exception using errcode = 'PT400', message = 'Source type and subsection do not match.';
  end if;

  if p_change->>'status' not in (
    'current', 'needs_review', 'superseded', 'historical', 'unverified', 'conflicting'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Source status.';
  end if;

  if nullif(p_change #>> '{metadata,editor_data,external_url}', '') is not null
     and (p_change #>> '{metadata,editor_data,external_url}') !~* '^https?://[^[:space:]]+$' then
    raise exception using errcode = 'PT400', message = 'External URL must use http or https.';
  end if;

  select * into existing
  from public.client_brain_v2_records
  where id = (p_change->>'record_id')::uuid
    and client_id = p_client_id
    and top_section = 'sources'
  for update;

  if not found then
    raise exception using errcode = 'PT403', message = 'The Source record does not belong to this client.';
  end if;

  if nullif(p_change->>'expected_updated_at', '') is null
     or existing.updated_at <> (p_change->>'expected_updated_at')::timestamptz then
    raise exception using errcode = 'PT409', message = 'This Source changed after editing began. Refresh and review the newer values.';
  end if;

  if exists (
    select 1
    from public.client_brain_v2_links link
    join public.client_brain_v2_records source_record on source_record.id = link.from_record_id
    join public.client_brain_v2_records target_record on target_record.id = link.to_record_id
    where (link.from_record_id = existing.id or link.to_record_id = existing.id)
      and (
        link.client_id <> p_client_id
        or source_record.client_id <> p_client_id
        or target_record.client_id <> p_client_id
      )
  ) then
    raise exception using errcode = 'PT403', message = 'A Source relationship points outside this client.';
  end if;

  update public.client_brain_v2_records set
    subsection = expected_subsection,
    title = p_change->>'title',
    summary = nullif(p_change->>'summary', ''),
    content = nullif(p_change->>'content', ''),
    knowledge_class = 'source',
    status = p_change->>'status',
    confidence = (p_change->>'confidence')::numeric,
    effective_date = nullif(p_change->>'effective_date', '')::date,
    last_verified_at = nullif(p_change->>'last_verified_at', '')::timestamptz,
    valid_until = nullif(p_change->>'valid_until', '')::date,
    review_at = nullif(p_change->>'review_at', '')::date,
    source_type = p_change->>'source_type',
    provenance = coalesce(p_change->'provenance', '{}'::jsonb),
    metadata = coalesce(p_change->'metadata', '{}'::jsonb)
  where id = existing.id;

  return jsonb_build_object(
    'saved_record_id', existing.id,
    'relationship_count', (
      select count(*)
      from public.client_brain_v2_links
      where client_id = p_client_id
        and (from_record_id = existing.id or to_record_id = existing.id)
    )
  );
end;
$$;

revoke all on function public.apply_client_brain_v2_source_edit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_source_edit(uuid, jsonb) to service_role;

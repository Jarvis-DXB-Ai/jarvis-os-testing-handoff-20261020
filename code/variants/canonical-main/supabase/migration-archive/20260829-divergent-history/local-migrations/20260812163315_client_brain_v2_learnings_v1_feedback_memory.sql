-- Align the existing Learnings record type with the V1 execution-feedback contract.
-- No records are moved or rewritten; existing legacy values remain readable in the app.

alter table public.client_brain_v2_records
  drop constraint if exists client_brain_v2_records_status_check;

alter table public.client_brain_v2_records
  add constraint client_brain_v2_records_status_check check (status in (
    'draft', 'needs_review', 'approved', 'active', 'resolved', 'current',
    'unverified', 'conflicting', 'contradicted', 'superseded', 'historical',
    'restricted', 'archived', 'rejected'
  ));

create or replace function public.apply_client_brain_v2_learning_mutation(
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
  saved_id uuid;
  related_source_id uuid;
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  if p_change->>'action' not in ('create', 'update') then
    raise exception using errcode = 'PT400', message = 'Invalid Learning action.';
  end if;
  if p_change->>'subsection' not in (
    'creative_preference', 'copy_preference', 'visual_preference', 'brand_rule',
    'audience_insight', 'content_performance', 'campaign_performance',
    'offer_performance', 'operational_learning', 'customer_feedback',
    'workflow_learning', 'other'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Learning type.';
  end if;
  if p_change->>'status' not in ('active', 'needs_review', 'historical', 'rejected') then
    raise exception using errcode = 'PT400', message = 'Invalid Learning status.';
  end if;
  if p_change->>'source_type' not in (
    'explicit_user_feedback', 'client_feedback', 'approval_rejection_pattern',
    'performance_data', 'repeated_workflow_observation', 'inferred_pattern',
    'internal_mc_studios_observation'
  ) then
    raise exception using errcode = 'PT400', message = 'Invalid Learning origin.';
  end if;
  if nullif(btrim(p_change->>'title'), '') is null then
    raise exception using errcode = 'PT400', message = 'Learning title is required.';
  end if;
  if nullif(btrim(p_change->'metadata'->'editor_data'->>'learning'), '') is null then
    raise exception using errcode = 'PT400', message = 'Learning insight is required.';
  end if;
  if (p_change->>'confidence')::numeric < 0 or (p_change->>'confidence')::numeric > 1 then
    raise exception using errcode = 'PT400', message = 'Invalid Learning confidence.';
  end if;

  if nullif(p_change->>'related_source_id', '') is not null then
    related_source_id := (p_change->>'related_source_id')::uuid;
    if not exists (
      select 1 from public.client_brain_v2_records
      where id = related_source_id
        and client_id = p_client_id
        and top_section = 'sources'
    ) then
      raise exception using errcode = 'PT403', message = 'The related Source does not belong to this client.';
    end if;
  end if;

  if p_change->>'action' = 'create' then
    if nullif(p_change->>'stable_key', '') is null then
      raise exception using errcode = 'PT400', message = 'Learning stable key is required.';
    end if;
    insert into public.client_brain_v2_records (
      client_id, stable_key, top_section, subsection, record_type, title, content,
      knowledge_class, status, confidence, priority, effective_date,
      last_verified_at, review_at, source_type, provenance, metadata
    ) values (
      p_client_id, p_change->>'stable_key', 'learnings', p_change->>'subsection',
      'learning', btrim(p_change->>'title'), nullif(p_change->>'content', ''),
      'learning', p_change->>'status', (p_change->>'confidence')::numeric, 3,
      nullif(p_change->>'effective_date', '')::date,
      nullif(p_change->>'last_verified_at', '')::timestamptz,
      nullif(p_change->>'review_at', '')::date,
      p_change->>'source_type', coalesce(p_change->'provenance', '{}'::jsonb),
      coalesce(p_change->'metadata', '{}'::jsonb)
    ) returning id into saved_id;
  else
    if nullif(p_change->>'record_id', '') is null then
      raise exception using errcode = 'PT400', message = 'Learning record ID is required.';
    end if;
    select * into existing
    from public.client_brain_v2_records
    where id = (p_change->>'record_id')::uuid
      and client_id = p_client_id
      and top_section = 'learnings'
    for update;
    if not found then
      raise exception using errcode = 'PT403', message = 'The Learning record does not belong to this client.';
    end if;
    if nullif(p_change->>'expected_updated_at', '') is null
       or existing.updated_at <> (p_change->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'This Learning changed after editing began. Refresh and review the newer values.';
    end if;
    if exists (
      select 1
      from public.client_brain_v2_links link
      join public.client_brain_v2_records source_record on source_record.id = link.from_record_id
      join public.client_brain_v2_records target_record on target_record.id = link.to_record_id
      where (link.from_record_id = existing.id or link.to_record_id = existing.id)
        and (link.client_id <> p_client_id or source_record.client_id <> p_client_id or target_record.client_id <> p_client_id)
    ) then
      raise exception using errcode = 'PT403', message = 'A Learning relationship points outside this client.';
    end if;
    update public.client_brain_v2_records set
      subsection = p_change->>'subsection', record_type = 'learning', title = btrim(p_change->>'title'),
      content = nullif(p_change->>'content', ''), knowledge_class = 'learning', status = p_change->>'status',
      confidence = (p_change->>'confidence')::numeric, effective_date = nullif(p_change->>'effective_date', '')::date,
      last_verified_at = nullif(p_change->>'last_verified_at', '')::timestamptz,
      review_at = nullif(p_change->>'review_at', '')::date, source_type = p_change->>'source_type',
      provenance = coalesce(p_change->'provenance', '{}'::jsonb), metadata = coalesce(p_change->'metadata', '{}'::jsonb)
    where id = existing.id;
    saved_id := existing.id;
    delete from public.client_brain_v2_links
    where client_id = p_client_id
      and from_record_id = saved_id
      and relation_type = 'evidenced_by'
      and metadata->>'added_via' = 'manual_learning_workspace';
  end if;

  if related_source_id is not null then
    insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
    values (p_client_id, saved_id, related_source_id, 'evidenced_by', jsonb_build_object('added_via', 'manual_learning_workspace'))
    on conflict (client_id, from_record_id, to_record_id, relation_type) do update
      set metadata = excluded.metadata;
  end if;

  return jsonb_build_object(
    'saved_record_id', saved_id,
    'action', p_change->>'action',
    'relationship_count', (select count(*) from public.client_brain_v2_links where client_id = p_client_id and (from_record_id = saved_id or to_record_id = saved_id))
  );
end;
$$;

revoke all on function public.apply_client_brain_v2_learning_mutation(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_learning_mutation(uuid, jsonb) to service_role;

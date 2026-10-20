create or replace function public.apply_client_brain_v2_intelligence_edit(
  p_client_id uuid,
  p_changes jsonb,
  p_archives jsonb default '[]'::jsonb,
  p_resolve_gap_keys jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  existing public.client_brain_v2_records%rowtype;
  saved_ids uuid[] := '{}';
  affected integer := 0;
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id and brain_architecture_version = 'hospitality_v2'
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    existing := null;
    if nullif(item->>'record_id', '') is not null then
      select * into existing from public.client_brain_v2_records
      where id = (item->>'record_id')::uuid and client_id = p_client_id for update;
      if not found then
        raise exception using errcode = 'PT404', message = 'Editable record not found for this client.';
      end if;
      if nullif(item->>'expected_updated_at', '') is not null
         and existing.updated_at <> (item->>'expected_updated_at')::timestamptz then
        raise exception using errcode = 'PT409', message = 'This Client Brain section changed after editing began. Refresh and review the newer values.';
      end if;
      update public.client_brain_v2_records set
        stable_key = item->>'stable_key',
        subsection = item->>'subsection',
        record_type = item->>'record_type',
        title = item->>'title',
        summary = nullif(item->>'summary', ''),
        content = nullif(item->>'content', ''),
        knowledge_class = item->>'knowledge_class',
        status = item->>'status',
        confidence = (item->>'confidence')::numeric,
        priority = (item->>'priority')::smallint,
        effective_date = nullif(item->>'effective_date', '')::date,
        last_verified_at = now(),
        review_at = nullif(item->>'review_at', '')::date,
        source_type = 'client_provided',
        provenance = coalesce(existing.provenance, '{}'::jsonb) || coalesce(item->'provenance', '{}'::jsonb),
        metadata = coalesce(existing.metadata, '{}'::jsonb) || coalesce(item->'metadata', '{}'::jsonb)
      where id = existing.id
      returning id into existing.id;
      saved_ids := array_append(saved_ids, existing.id);
    else
      insert into public.client_brain_v2_records (
        client_id, stable_key, top_section, subsection, record_type, title, summary, content,
        knowledge_class, status, confidence, priority, effective_date, last_verified_at,
        review_at, source_type, provenance, metadata
      ) values (
        p_client_id, item->>'stable_key', 'intelligence', item->>'subsection', item->>'record_type',
        item->>'title', nullif(item->>'summary', ''), nullif(item->>'content', ''),
        item->>'knowledge_class', item->>'status', (item->>'confidence')::numeric,
        (item->>'priority')::smallint, nullif(item->>'effective_date', '')::date, now(),
        nullif(item->>'review_at', '')::date, 'client_provided',
        coalesce(item->'provenance', '{}'::jsonb), coalesce(item->'metadata', '{}'::jsonb)
      )
      on conflict (client_id, stable_key) do update set
        title = excluded.title,
        summary = excluded.summary,
        content = excluded.content,
        knowledge_class = excluded.knowledge_class,
        status = excluded.status,
        confidence = excluded.confidence,
        priority = excluded.priority,
        effective_date = excluded.effective_date,
        last_verified_at = now(),
        review_at = excluded.review_at,
        source_type = excluded.source_type,
        provenance = client_brain_v2_records.provenance || excluded.provenance,
        metadata = client_brain_v2_records.metadata || excluded.metadata
      returning id into existing.id;
      saved_ids := array_append(saved_ids, existing.id);
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_archives, '[]'::jsonb)) loop
    select * into existing from public.client_brain_v2_records
    where id = (item->>'record_id')::uuid and client_id = p_client_id for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'Record selected for removal was not found for this client.';
    end if;
    if nullif(item->>'expected_updated_at', '') is not null
       and existing.updated_at <> (item->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'This Client Brain section changed after editing began. Refresh and review the newer values.';
    end if;
    update public.client_brain_v2_records
    set status = 'archived', provenance = provenance || jsonb_build_object('archived_by', 'Manual Client Brain Edit', 'archived_at', now())
    where id = existing.id;
    affected := affected + 1;
  end loop;

  update public.client_brain_v2_records
  set status = 'resolved', last_verified_at = now(),
      provenance = provenance || jsonb_build_object('resolved_by', 'Manual Client Brain Edit', 'resolved_at', now())
  where client_id = p_client_id
    and stable_key in (select jsonb_array_elements_text(coalesce(p_resolve_gap_keys, '[]'::jsonb)))
    and record_type = 'knowledge_gap'
    and status not in ('resolved', 'superseded', 'archived');
  get diagnostics affected = row_count;

  return jsonb_build_object('saved_record_ids', to_jsonb(saved_ids), 'resolved_gap_count', affected);
end;
$$;

revoke all on function public.apply_client_brain_v2_intelligence_edit(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_intelligence_edit(uuid, jsonb, jsonb, jsonb) to service_role;

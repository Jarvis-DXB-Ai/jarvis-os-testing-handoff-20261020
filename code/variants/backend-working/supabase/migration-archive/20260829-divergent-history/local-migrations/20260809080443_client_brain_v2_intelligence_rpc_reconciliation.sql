-- Reconciles the local Intelligence editor with the deployed V2 migration ledger.
-- This replaces the temporary direct-write fallback with one service-only transaction.

create or replace function public.apply_client_brain_v2_intelligence_edit(
  p_client_id uuid,
  p_changes jsonb,
  p_archives jsonb default '[]'::jsonb,
  p_resolve_gap_keys jsonb default '[]'::jsonb,
  p_commercial_details jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  existing public.client_brain_v2_records%rowtype;
  target public.client_brain_v2_records%rowtype;
  saved_id uuid;
  saved_record_ids uuid[] := '{}'::uuid[];
  saved_ids jsonb := '[]'::jsonb;
  resolved_gap_count integer := 0;
  archived_count integer := 0;
  commercial_detail_count integer := 0;
  metadata_value jsonb;
  schedule_value jsonb;
  ingredient_values text[];
  selling_point_values text[];
begin
  if not exists (
    select 1
    from public.clients
    where id = p_client_id
      and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;

  if jsonb_typeof(coalesce(p_changes, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_archives, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_resolve_gap_keys, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_commercial_details, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = 'PT400', message = 'Intelligence mutation payloads must be arrays.';
  end if;

  for item in select value from jsonb_array_elements(p_changes)
  loop
    if jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'stable_key'), '') is null
       or nullif(btrim(item->>'title'), '') is null then
      raise exception using errcode = 'PT400', message = 'Each Intelligence change requires a stable key and title.';
    end if;

    if item->>'subsection' not in (
      'overview', 'brand_identity', 'audience', 'visual_dna', 'commercial_strategy',
      'menus', 'activations', 'operations', 'market_intelligence', 'knowledge_gaps'
    ) then
      raise exception using errcode = 'PT400', message = 'Invalid Intelligence subsection.';
    end if;

    if item->>'record_type' not in ('intelligence_field', 'audience_segment', 'menu', 'activation', 'knowledge_gap') then
      raise exception using errcode = 'PT400', message = 'Invalid Intelligence record type.';
    end if;

    if item->>'knowledge_class' not in ('stable', 'dynamic', 'operational', 'temporal', 'commercial', 'knowledge_gap')
       or item->>'status' not in ('draft', 'needs_review', 'approved', 'active', 'resolved', 'current', 'unverified', 'conflicting', 'contradicted', 'superseded', 'historical', 'restricted', 'archived')
       or coalesce((item->>'confidence')::numeric, -1) not between 0 and 1
       or coalesce((item->>'priority')::smallint, 0) not between 1 and 5 then
      raise exception using errcode = 'PT400', message = 'Invalid Intelligence status, confidence, or priority.';
    end if;

    if jsonb_typeof(coalesce(item->'metadata', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(item->'provenance', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = 'PT400', message = 'Intelligence metadata and provenance must be objects.';
    end if;

    if (item->>'record_type' = 'intelligence_field' and (
          item->>'subsection' in ('menus', 'activations', 'knowledge_gaps')
          or item->>'stable_key' not like 'intelligence:%'
        ))
       or (item->>'record_type' = 'audience_segment' and (
          item->>'subsection' <> 'audience'
          or item->>'stable_key' not like 'intelligence:audience:segment:%'
        ))
       or (item->>'record_type' = 'menu' and (
          item->>'subsection' <> 'menus'
          or item->>'stable_key' not like 'menu:%'
        ))
       or (item->>'record_type' = 'activation' and (
          item->>'subsection' <> 'activations'
          or item->>'stable_key' not like 'activation:%'
        ))
       or (item->>'record_type' = 'knowledge_gap' and item->>'subsection' <> 'knowledge_gaps') then
      raise exception using errcode = 'PT400', message = 'The Intelligence record type does not match its canonical section or key.';
    end if;

    if nullif(item->>'record_id', '') is not null then
      if item->>'record_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode = 'PT400', message = 'Invalid Intelligence record ID.';
      end if;

      select * into existing
      from public.client_brain_v2_records
      where id = (item->>'record_id')::uuid
        and client_id = p_client_id
        and top_section = 'intelligence'
      for update;

      if not found then
        raise exception using errcode = 'PT403', message = 'An Intelligence record does not belong to this client.';
      end if;
      if existing.stable_key <> item->>'stable_key' then
        raise exception using errcode = 'PT400', message = 'An Intelligence record stable key cannot be changed.';
      end if;
      if nullif(item->>'expected_updated_at', '') is null
         or existing.updated_at <> (item->>'expected_updated_at')::timestamptz then
        raise exception using errcode = 'PT409', message = 'This Client Brain section changed after editing began. Refresh and review the newer values.';
      end if;

      update public.client_brain_v2_records set
        subsection = item->>'subsection',
        record_type = item->>'record_type',
        title = btrim(item->>'title'),
        summary = nullif(item->>'summary', ''),
        content = nullif(item->>'content', ''),
        knowledge_class = item->>'knowledge_class',
        status = item->>'status',
        confidence = (item->>'confidence')::numeric,
        priority = (item->>'priority')::smallint,
        effective_date = nullif(item->>'effective_date', '')::date,
        last_verified_at = case when item ? 'last_verified_at' then nullif(item->>'last_verified_at', '')::timestamptz else existing.last_verified_at end,
        valid_until = case when item ? 'valid_until' then nullif(item->>'valid_until', '')::date else existing.valid_until end,
        review_at = case when item ? 'review_at' then nullif(item->>'review_at', '')::date else existing.review_at end,
        source_type = case when item ? 'source_type' then nullif(item->>'source_type', '') else existing.source_type end,
        provenance = coalesce(item->'provenance', '{}'::jsonb),
        metadata = coalesce(item->'metadata', '{}'::jsonb)
      where id = existing.id
      returning id into saved_id;
    else
      if item->>'record_type' = 'knowledge_gap' then
        raise exception using errcode = 'PT400', message = 'Knowledge Gaps must be updated from their existing record.';
      end if;

      select * into existing
      from public.client_brain_v2_records
      where client_id = p_client_id
        and stable_key = item->>'stable_key'
      for update;

      if found then
        raise exception using errcode = 'PT409', message = 'This Intelligence field was created after editing began. Refresh and review the newer values.';
      end if;

      insert into public.client_brain_v2_records (
        client_id, stable_key, top_section, subsection, record_type, title, summary, content,
        knowledge_class, status, confidence, priority, effective_date, last_verified_at,
        valid_until, review_at, source_type, provenance, metadata
      ) values (
        p_client_id, item->>'stable_key', 'intelligence', item->>'subsection', item->>'record_type',
        btrim(item->>'title'), nullif(item->>'summary', ''), nullif(item->>'content', ''),
        item->>'knowledge_class', item->>'status', (item->>'confidence')::numeric,
        (item->>'priority')::smallint, nullif(item->>'effective_date', '')::date,
        nullif(item->>'last_verified_at', '')::timestamptz, nullif(item->>'valid_until', '')::date,
        nullif(item->>'review_at', '')::date, nullif(item->>'source_type', ''),
        coalesce(item->'provenance', '{}'::jsonb), coalesce(item->'metadata', '{}'::jsonb)
      ) returning id into saved_id;
    end if;

    saved_record_ids := array_append(saved_record_ids, saved_id);
    saved_ids := saved_ids || jsonb_build_array(saved_id);
  end loop;

  for item in select value from jsonb_array_elements(p_archives)
  loop
    if jsonb_typeof(item) <> 'object'
       or item->>'record_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = 'PT400', message = 'Invalid archive request.';
    end if;

    select * into existing
    from public.client_brain_v2_records
    where id = (item->>'record_id')::uuid
      and client_id = p_client_id
      and top_section = 'intelligence'
      and record_type = 'audience_segment'
    for update;

    if not found then
      raise exception using errcode = 'PT403', message = 'The archived Audience segment does not belong to this client.';
    end if;
    if nullif(item->>'expected_updated_at', '') is null
       or existing.updated_at <> (item->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'This Audience segment changed after editing began. Refresh and review the newer values.';
    end if;

    update public.client_brain_v2_records set
      status = 'archived',
      provenance = existing.provenance || jsonb_build_object(
        'manual_edit', true,
        'archived_by', 'Manual Client Brain Edit',
        'archived_at', now()
      )
    where id = existing.id;
    archived_count := archived_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(p_resolve_gap_keys)
  loop
    if jsonb_typeof(item) <> 'string' or nullif(btrim(item #>> '{}'), '') is null then
      raise exception using errcode = 'PT400', message = 'Invalid Knowledge Gap resolution key.';
    end if;

    update public.client_brain_v2_records set
      status = 'resolved',
      last_verified_at = now(),
      provenance = provenance || jsonb_build_object(
        'manual_edit', true,
        'resolved_by', 'Manual Client Brain Edit',
        'resolved_at', now()
      ),
      metadata = metadata || jsonb_build_object('resolution_status', 'resolved')
    where client_id = p_client_id
      and top_section = 'intelligence'
      and record_type = 'knowledge_gap'
      and stable_key = item #>> '{}';
    resolved_gap_count := resolved_gap_count + found::int;
  end loop;

  for item in select value from jsonb_array_elements(p_commercial_details)
  loop
    if jsonb_typeof(item) <> 'object'
       or item->>'record_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or item->>'object_type' not in ('collection', 'offer', 'experience_event') then
      raise exception using errcode = 'PT400', message = 'Invalid commercial detail payload.';
    end if;

    select * into target
    from public.client_brain_v2_records
    where id = (item->>'record_id')::uuid
      and client_id = p_client_id
      and top_section = 'intelligence'
      and subsection in ('menus', 'activations')
      and record_type in ('menu', 'activation');

    if not found or not (target.id = any(saved_record_ids)) then
      raise exception using errcode = 'PT403', message = 'A commercial detail does not belong to a saved client Intelligence record.';
    end if;
    if jsonb_typeof(coalesce(item->'schedule', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(item->'metadata', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(item->'ingredients', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(item->'key_selling_points', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = 'PT400', message = 'Commercial detail metadata has an invalid shape.';
    end if;

    schedule_value := coalesce(item->'schedule', '{}'::jsonb);
    metadata_value := coalesce(item->'metadata', '{}'::jsonb);
    select coalesce(array_agg(value), '{}'::text[]) into ingredient_values
    from jsonb_array_elements_text(coalesce(item->'ingredients', '[]'::jsonb)) value;
    select coalesce(array_agg(value), '{}'::text[]) into selling_point_values
    from jsonb_array_elements_text(coalesce(item->'key_selling_points', '[]'::jsonb)) value;

    insert into public.client_brain_v2_commercial_details (
      record_id, client_id, object_type, price_amount, currency, pricing_mechanism,
      availability, schedule, restrictions, booking_requirements, ingredients, allergens,
      key_selling_points, metadata
    ) values (
      target.id, p_client_id, item->>'object_type', nullif(item->>'price_amount', '')::numeric,
      nullif(item->>'currency', ''), nullif(item->>'pricing_mechanism', ''),
      nullif(item->>'availability', ''), schedule_value, nullif(item->>'restrictions', ''),
      nullif(item->>'booking_requirements', ''), ingredient_values, '{}'::text[],
      selling_point_values, metadata_value
    )
    on conflict (record_id) do update set
      client_id = excluded.client_id,
      object_type = excluded.object_type,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      pricing_mechanism = excluded.pricing_mechanism,
      availability = excluded.availability,
      schedule = excluded.schedule,
      restrictions = excluded.restrictions,
      booking_requirements = excluded.booking_requirements,
      ingredients = excluded.ingredients,
      allergens = excluded.allergens,
      key_selling_points = excluded.key_selling_points,
      metadata = excluded.metadata;
    commercial_detail_count := commercial_detail_count + 1;
  end loop;

  return jsonb_build_object(
    'saved_record_ids', saved_ids,
    'archived_record_count', archived_count,
    'resolved_gap_count', resolved_gap_count,
    'commercial_detail_count', commercial_detail_count,
    'mode', 'rpc'
  );
end;
$$;

revoke all on function public.apply_client_brain_v2_intelligence_edit(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_intelligence_edit(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activate_jarvis_finance_upcoming_revenue"("p_id" "uuid", "p_expected_updated_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  future_record public.jarvis_finance_upcoming_revenue%rowtype;
  created_income_id uuid;
begin
  update public.jarvis_finance_upcoming_revenue
  set status = 'activated'
  where id = p_id
    and updated_at = p_expected_updated_at
    and status = 'upcoming'
  returning * into future_record;

  if not found then
    raise exception 'Upcoming revenue changed elsewhere or is not available for activation.' using errcode = 'P0001';
  end if;

  insert into public.jarvis_finance_income_records (
    source_key, client_id, counterparty_name, description, income_type,
    net_amount, currency, vat_rate, vat_amount, gross_amount, vat_applicable,
    billing_cycle, start_date, payment_status, active, notes
  ) values (
    'activated:' || coalesce(future_record.source_key, future_record.id::text),
    future_record.client_id, future_record.counterparty_name, future_record.description,
    'recurring_service_revenue', future_record.net_amount, future_record.currency,
    future_record.vat_rate, future_record.vat_amount, future_record.gross_amount,
    future_record.vat_applicable, future_record.billing_cycle, current_date,
    'expected', true, future_record.notes
  ) returning id into created_income_id;

  update public.jarvis_finance_upcoming_revenue
  set activated_income_id = created_income_id
  where id = future_record.id;

  return created_income_id;
end;
$$;


ALTER FUNCTION "public"."activate_jarvis_finance_upcoming_revenue"("p_id" "uuid", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_organization_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."agent_organization_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_runtime_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."agent_runtime_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_asset_classification"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_category" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."apply_client_brain_v2_asset_classification"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_asset_edit"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_metadata" "jsonb", "p_record_status" "text", "p_last_verified_at" timestamp with time zone, "p_semantic_role" "text", "p_assignment_approval_status" "text", "p_menu_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_activation_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_source_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_provenance" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."apply_client_brain_v2_asset_edit"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_metadata" "jsonb", "p_record_status" "text", "p_last_verified_at" timestamp with time zone, "p_semantic_role" "text", "p_assignment_approval_status" "text", "p_menu_ids" "uuid"[], "p_activation_ids" "uuid"[], "p_source_ids" "uuid"[], "p_provenance" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_brand_guideline_edit"("p_client_id" "uuid", "p_change" "jsonb", "p_links" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."apply_client_brain_v2_brand_guideline_edit"("p_client_id" "uuid", "p_change" "jsonb", "p_links" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_intelligence_edit"("p_client_id" "uuid", "p_changes" "jsonb", "p_archives" "jsonb" DEFAULT '[]'::"jsonb", "p_resolve_gap_keys" "jsonb" DEFAULT '[]'::"jsonb", "p_commercial_details" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."apply_client_brain_v2_intelligence_edit"("p_client_id" "uuid", "p_changes" "jsonb", "p_archives" "jsonb", "p_resolve_gap_keys" "jsonb", "p_commercial_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_learning_mutation"("p_client_id" "uuid", "p_change" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."apply_client_brain_v2_learning_mutation"("p_client_id" "uuid", "p_change" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_source_edit"("p_client_id" "uuid", "p_change" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."apply_client_brain_v2_source_edit"("p_client_id" "uuid", "p_change" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_client_brain_v2_source_v2_edit"("p_client_id" "uuid", "p_change" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."apply_client_brain_v2_source_v2_edit"("p_client_id" "uuid", "p_change" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_social_monthly_plan_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_target_count integer;
  v_item jsonb;
  v_plan_id uuid;
begin
  if p_action_type not in ('plan_generated', 'plan_regenerated') then
    raise exception using errcode = 'PT400', message = 'Unsupported AI plan apply action.';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'AI Feed items must be an array.';
  end if;

  select target_feed_count
    into v_target_count
  from public.social_monthly_content_plans
  where id = p_plan_id
    and client_id = p_client_id
    and updated_at = p_expected_updated_at
  for update;

  if not found then
    raise exception using errcode = 'PT409', message = 'This Monthly Plan changed after AI planning began. Refresh and review the latest version.';
  end if;

  if jsonb_array_length(p_items) <> v_target_count then
    raise exception using errcode = 'PT400', message = 'AI output does not contain the exact target Feed count.';
  end if;

  update public.social_monthly_content_plans
  set strategy = coalesce(p_strategy, '{}'::jsonb),
      visual_direction = coalesce(p_visual_direction, ''),
      grid_notes = coalesce(p_grid_notes, ''),
      client_brain_snapshot = coalesce(p_client_brain_snapshot, '{}'::jsonb),
      snapshot_at = now(),
      ai_provenance = coalesce(p_ai_provenance, '{}'::jsonb),
      status = 'plan_ready',
      approved_at = null
  where id = p_plan_id
    and client_id = p_client_id
  returning id into v_plan_id;

  delete from public.social_monthly_content_plan_items
  where client_id = p_client_id
    and monthly_plan_id = p_plan_id;

  for v_item in select value from jsonb_array_elements(p_items) as value loop
    insert into public.social_monthly_content_plan_items (
      client_id, monthly_plan_id, position, planned_date, date_fixed,
      pillar, objective, subject, creative_concept, production_method,
      required_assets, missing_asset_note, visual_direction, grid_role,
      activation_record_id, commercial_rationale, caption_brief, status, metadata
    ) values (
      p_client_id,
      p_plan_id,
      (v_item ->> 'position')::integer,
      nullif(v_item ->> 'planned_date', '')::date,
      coalesce((v_item ->> 'date_fixed')::boolean, false),
      v_item ->> 'pillar',
      coalesce(v_item ->> 'objective', ''),
      coalesce(v_item ->> 'subject', ''),
      coalesce(v_item ->> 'creative_concept', ''),
      v_item ->> 'production_method',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'required_assets', '[]'::jsonb))), '{}'::text[]),
      coalesce(v_item ->> 'missing_asset_note', ''),
      coalesce(v_item ->> 'visual_direction', ''),
      v_item ->> 'grid_role',
      nullif(v_item ->> 'activation_record_id', '')::uuid,
      coalesce(v_item ->> 'commercial_rationale', ''),
      coalesce(v_item ->> 'caption_brief', ''),
      coalesce(v_item ->> 'status', 'draft'),
      coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  insert into public.social_monthly_plan_activity (
    client_id, monthly_plan_id, action_type, summary, metadata
  ) values (
    p_client_id, p_plan_id, p_action_type, p_summary,
    jsonb_build_object('execution', coalesce(p_ai_provenance, '{}'::jsonb))
  );

  return v_plan_id;
end;
$$;


ALTER FUNCTION "public"."apply_social_monthly_plan_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_social_monthly_plan_visual_direction"("p_client_id" "uuid", "p_plan_id" "uuid", "p_execution_id" "uuid", "p_prompt_version" "text", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text", "p_correction" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan_count integer;
  v_payload_count integer;
  v_row record;
  v_entry jsonb;
  v_ref text;
  v_expected_updated_at timestamptz;
  v_shot_scale text;
  v_camera_angle text;
  v_composition text;
  v_human_presence text;
  v_interaction text;
  v_motion text;
  v_visual_direction text;
begin
  if p_action_type not in ('visual_direction_generated', 'visual_direction_regenerated') then
    raise exception 'Unsupported Visual Direction activity type.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Visual Direction payload must be an array.' using errcode = '22023';
  end if;

  select count(*) into v_plan_count
  from public.social_monthly_content_plan_items
  where client_id = p_client_id and monthly_plan_id = p_plan_id;
  v_payload_count := jsonb_array_length(p_items);
  if v_plan_count = 0 or v_payload_count <> v_plan_count then
    raise exception 'Visual Direction must include every saved Feed concept.' using errcode = '22023';
  end if;
  if (select count(distinct entry ->> 'plan_item_ref') from jsonb_array_elements(p_items) entry) <> v_plan_count then
    raise exception 'Visual Direction contains duplicate or missing plan item references.' using errcode = '22023';
  end if;

  for v_row in
    select id, position, updated_at
    from public.social_monthly_content_plan_items
    where client_id = p_client_id and monthly_plan_id = p_plan_id
    order by position
  loop
    v_ref := 'P' || lpad(v_row.position::text, 2, '0');
    select entry into v_entry from jsonb_array_elements(p_items) entry where entry ->> 'plan_item_ref' = v_ref;
    if v_entry is null then
      raise exception 'Visual Direction is missing %.', v_ref using errcode = '22023';
    end if;
    begin
      v_expected_updated_at := (v_entry ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Visual Direction baseline is invalid for %.', v_ref using errcode = '22023';
    end;
    if v_expected_updated_at <> v_row.updated_at then
      raise exception 'Feed concept % changed while Visual Direction was being prepared. Refresh and try again.', v_ref using errcode = '40001';
    end if;

    v_shot_scale := v_entry ->> 'shot_scale';
    v_camera_angle := v_entry ->> 'camera_angle';
    v_composition := v_entry ->> 'composition';
    v_human_presence := v_entry ->> 'human_presence';
    v_interaction := v_entry ->> 'interaction';
    v_motion := v_entry ->> 'motion';
    v_visual_direction := btrim(coalesce(v_entry ->> 'visual_direction', ''));
    if v_shot_scale not in ('extreme_macro', 'macro', 'close', 'medium', 'wide', 'environmental_wide', 'detail', 'graphic', 'not_applicable', 'other')
      or v_camera_angle not in ('birds_eye', 'high_angle', 'eye_level', 'table_level', 'low_angle', 'three_quarter', 'pov', 'over_the_shoulder', 'architectural_straight_on', 'not_applicable', 'other')
      or v_composition not in ('centered_hero', 'asymmetrical', 'rule_of_thirds', 'negative_space', 'layered_foreground', 'frame_within_frame', 'diagonal', 'symmetrical', 'edge_crop', 'immersive_crop', 'editorial_still_life', 'environmental', 'graphic', 'other')
      or v_human_presence not in ('none', 'hands_only', 'partial_figure', 'single_person', 'couple', 'small_group', 'background_guests', 'staff_service', 'mixed_foreground_background', 'not_applicable', 'other')
      or v_interaction not in ('none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting', 'picking_up', 'taking_a_bite', 'cooking', 'plating', 'garnishing', 'utensil_interaction', 'carrying', 'toasting_raising_glasses', 'conversation', 'walking_through_frame', 'pet_interaction', 'staff_interaction', 'not_applicable', 'other')
      or v_motion not in ('static', 'subtle', 'active', 'dynamic', 'not_applicable', 'other')
      or length(v_visual_direction) < 25 or length(v_visual_direction) > 600 then
      raise exception 'Visual Direction values are invalid for %.', v_ref using errcode = '22023';
    end if;
  end loop;

  for v_row in
    select id, position from public.social_monthly_content_plan_items
    where client_id = p_client_id and monthly_plan_id = p_plan_id
    order by position
  loop
    v_ref := 'P' || lpad(v_row.position::text, 2, '0');
    select entry into v_entry from jsonb_array_elements(p_items) entry where entry ->> 'plan_item_ref' = v_ref;
    update public.social_monthly_content_plan_items
    set shot_scale = v_entry ->> 'shot_scale',
        camera_angle = v_entry ->> 'camera_angle',
        composition = v_entry ->> 'composition',
        human_presence = v_entry ->> 'human_presence',
        interaction = v_entry ->> 'interaction',
        motion = v_entry ->> 'motion',
        visual_direction = btrim(v_entry ->> 'visual_direction'),
        production_aspect_ratio = '4:5',
        grid_crop_behavior = case when v_entry ->> 'composition' in ('edge_crop', 'immersive_crop') then 'edge_aware' else 'safe' end,
        visual_direction_source = 'ai',
        visual_direction_prompt_version = p_prompt_version,
        visual_direction_execution_id = p_execution_id,
        visual_direction_generated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visual_direction', jsonb_build_object(
          'source', 'ai', 'prompt_version', p_prompt_version, 'execution_id', p_execution_id,
          'generated_at', now(), 'correction', p_correction
        ))
    where id = v_row.id and client_id = p_client_id and monthly_plan_id = p_plan_id;
  end loop;

  insert into public.social_monthly_plan_activity (client_id, monthly_plan_id, action_type, summary, metadata)
  values (p_client_id, p_plan_id, p_action_type, p_summary, jsonb_build_object(
    'execution_id', p_execution_id, 'prompt_version', p_prompt_version, 'correction', p_correction
  ));
end;
$$;


ALTER FUNCTION "public"."apply_social_monthly_plan_visual_direction"("p_client_id" "uuid", "p_plan_id" "uuid", "p_execution_id" "uuid", "p_prompt_version" "text", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text", "p_correction" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_client_brain_v2_record_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if current_setting('jarvis.skip_client_brain_v2_record_version', true) = 'on' then
    return new;
  end if;
  insert into public.client_brain_v2_record_versions (
    client_id,
    record_id,
    version_snapshot
  ) values (
    old.client_id,
    old.id,
    to_jsonb(old)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."capture_client_brain_v2_record_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commercial_catalog_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."commercial_catalog_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_client_brain_v2_brand_file"("p_client_id" "uuid", "p_title" "text", "p_brand_file_type" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_file_name" "text", "p_file_type" "text", "p_file_size_bytes" bigint, "p_file_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  if p_brand_file_type not in ('light_wordmark', 'dark_wordmark', 'brand_mark', 'primary_font', 'body_font', 'graphic_element', 'icon', 'pattern', 'illustration', 'texture', 'other')
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


ALTER FUNCTION "public"."create_client_brain_v2_brand_file"("p_client_id" "uuid", "p_title" "text", "p_brand_file_type" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_file_name" "text", "p_file_type" "text", "p_file_size_bytes" bigint, "p_file_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_client_brain_v2_source_v2"("p_client_id" "uuid", "p_source" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_client_brain_v2_source_v2"("p_client_id" "uuid", "p_source" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_social_monthly_plan_version_from_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_source public.social_monthly_content_plans%rowtype;
  v_new_plan_id uuid;
  v_next_plan_version integer;
  v_item jsonb;
begin
  if p_action_type <> 'plan_generated' then
    raise exception using errcode = 'PT400', message = 'An immutable version must be created by a complete plan generation.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'AI Feed items must be an array.';
  end if;

  select * into v_source
  from public.social_monthly_content_plans
  where id = p_plan_id
    and client_id = p_client_id
    and is_current = true
    and updated_at = p_expected_updated_at
  for update;

  if not found then
    raise exception using errcode = 'PT409', message = 'This Monthly Plan changed after AI planning began. Refresh and review the latest version.';
  end if;
  if jsonb_array_length(p_items) <> v_source.target_feed_count then
    raise exception using errcode = 'PT400', message = 'AI output does not contain the exact target Feed count.';
  end if;

  select coalesce(max(plan_version), 0) + 1 into v_next_plan_version
  from public.social_monthly_content_plans
  where client_id = p_client_id
    and platform = v_source.platform
    and plan_month = v_source.plan_month;

  update public.social_monthly_content_plans
  set is_current = false,
      superseded_at = now()
  where id = v_source.id
    and client_id = p_client_id;

  insert into public.social_monthly_content_plans (
    client_id, platform, plan_month, target_feed_count, status,
    owner_client_notes, priority_offers, items_to_avoid, products_to_push,
    temporary_availability_notes, commercial_priorities, other_month_notes,
    research_context, strategy, content_pillars, visual_direction, grid_notes,
    facebook_mirror, client_brain_snapshot, snapshot_at, approved_at,
    ai_provenance, plan_version, is_current, supersedes_plan_id, superseded_at
  ) values (
    v_source.client_id, v_source.platform, v_source.plan_month, v_source.target_feed_count, 'plan_ready',
    v_source.owner_client_notes, v_source.priority_offers, v_source.items_to_avoid, v_source.products_to_push,
    v_source.temporary_availability_notes, v_source.commercial_priorities, v_source.other_month_notes,
    v_source.research_context, coalesce(p_strategy, '{}'::jsonb), v_source.content_pillars,
    coalesce(p_visual_direction, ''), coalesce(p_grid_notes, ''), v_source.facebook_mirror,
    coalesce(p_client_brain_snapshot, '{}'::jsonb), now(), null,
    coalesce(p_ai_provenance, '{}'::jsonb), v_next_plan_version, true, v_source.id, null
  ) returning id into v_new_plan_id;

  for v_item in select value from jsonb_array_elements(p_items) as value loop
    insert into public.social_monthly_content_plan_items (
      client_id, monthly_plan_id, position, planned_date, date_fixed,
      pillar, objective, subject, creative_concept, production_method,
      required_assets, missing_asset_note, visual_direction, grid_role,
      activation_record_id, commercial_rationale, caption_brief, status, metadata
    ) values (
      p_client_id, v_new_plan_id, (v_item ->> 'position')::integer,
      nullif(v_item ->> 'planned_date', '')::date, coalesce((v_item ->> 'date_fixed')::boolean, false),
      v_item ->> 'pillar', coalesce(v_item ->> 'objective', ''), coalesce(v_item ->> 'subject', ''),
      coalesce(v_item ->> 'creative_concept', ''), v_item ->> 'production_method',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'required_assets', '[]'::jsonb))), '{}'::text[]),
      coalesce(v_item ->> 'missing_asset_note', ''), coalesce(v_item ->> 'visual_direction', ''),
      v_item ->> 'grid_role', nullif(v_item ->> 'activation_record_id', '')::uuid,
      coalesce(v_item ->> 'commercial_rationale', ''), coalesce(v_item ->> 'caption_brief', ''),
      coalesce(v_item ->> 'status', 'draft'), coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  insert into public.social_monthly_plan_activity (client_id, monthly_plan_id, action_type, summary, metadata)
  values
    (p_client_id, v_source.id, 'plan_version_superseded', 'Preserved this Monthly Plan as a historical version.', jsonb_build_object('new_plan_id', v_new_plan_id, 'new_plan_version', v_next_plan_version)),
    (p_client_id, v_new_plan_id, 'plan_version_created', 'Created a new immutable Monthly Plan version from validated AI output.', jsonb_build_object('supersedes_plan_id', v_source.id, 'plan_version', v_next_plan_version, 'execution', coalesce(p_ai_provenance, '{}'::jsonb))),
    (p_client_id, v_new_plan_id, 'plan_generated', p_summary, jsonb_build_object('execution', coalesce(p_ai_provenance, '{}'::jsonb)));

  return v_new_plan_id;
end;
$$;


ALTER FUNCTION "public"."create_social_monthly_plan_version_from_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_client_brain_pinterest_inspiration"("p_client_id" "uuid", "p_inspiration_id" "uuid", "p_expected_updated_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  existing public.client_brain_pinterest_inspirations%rowtype;
  file_row public.client_brain_file_objects%rowtype;
  file_is_shared boolean;
  file_has_asset_reference boolean;
  storage_objects_to_delete jsonb := '[]'::jsonb;
begin
  if p_expected_updated_at is null then
    raise exception using errcode = 'PT400', message = 'Delete baseline is required.';
  end if;
  if not exists (
    select 1 from public.clients
    where id = p_client_id and brain_architecture_version in ('hospitality_v2', 'hospitality_restaurant_v2')
  ) then
    raise exception using errcode = 'PT404', message = 'Hospitality Client Brain v2 is not enabled for this client.';
  end if;
  select * into existing from public.client_brain_pinterest_inspirations where id = p_inspiration_id and client_id = p_client_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Pinterest Inspiration not found.'; end if;
  if existing.updated_at <> p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This inspiration changed after it was opened. Refresh before deleting it.';
  end if;
  select * into file_row from public.client_brain_file_objects where id = existing.file_object_id for update;
  select exists (select 1 from public.client_brain_pinterest_inspirations other where other.file_object_id = existing.file_object_id and other.id <> existing.id) into file_is_shared;
  select exists (
    select 1 from public.client_brain_v2_record_files assignment where assignment.file_object_id = existing.file_object_id
    union all
    select 1 from public.asset_uploads upload
    where coalesce(upload.original_file_path, upload.file_path) = file_row.storage_path
       or coalesce(upload.optimized_file_path, '') = file_row.storage_path
       or coalesce(upload.ai_preview_path, '') = file_row.storage_path
  ) into file_has_asset_reference;
  delete from public.client_brain_pinterest_inspirations where id = existing.id and client_id = p_client_id;
  if not file_is_shared and not file_has_asset_reference then
    delete from public.client_brain_file_objects where id = file_row.id;
    storage_objects_to_delete := jsonb_build_array(jsonb_build_object('bucket', file_row.storage_bucket, 'storage_path', file_row.storage_path));
  end if;
  return jsonb_build_object('inspiration_id', p_inspiration_id, 'storage_objects_to_delete', storage_objects_to_delete, 'file_preserved', file_is_shared or file_has_asset_reference);
end;
$$;


ALTER FUNCTION "public"."delete_client_brain_pinterest_inspiration"("p_client_id" "uuid", "p_inspiration_id" "uuid", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_client_brain_v2_asset"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  existing public.client_brain_v2_records%rowtype;
  file_row record;
  file_is_shared boolean;
  file_has_legacy_reference boolean;
  asset_has_source_link boolean;
  link_count integer := 0;
  assignment_count integer := 0;
  version_count integer := 0;
  deleted_file_object_count integer := 0;
  deletable_file_object_ids uuid[] := '{}';
  storage_objects_to_delete jsonb := '[]'::jsonb;
  preserved_file_objects jsonb := '[]'::jsonb;
begin
  if p_expected_updated_at is null then
    raise exception using errcode = 'PT400', message = 'Delete baseline is required.';
  end if;

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
      and brain_architecture_version = 'hospitality_restaurant_v2'
  ) then
    raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.';
  end if;

  select * into existing
  from public.client_brain_v2_records
  where id = p_asset_id
    and client_id = p_client_id
    and top_section = 'assets'
    and status <> 'archived'
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'Asset not found for this client.';
  end if;

  if existing.updated_at <> p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This Asset changed after it was opened. Refresh before deleting it.';
  end if;

  select count(*) into link_count
  from public.client_brain_v2_links
  where client_id = p_client_id
    and (from_record_id = p_asset_id or to_record_id = p_asset_id);

  select count(*) into assignment_count
  from public.client_brain_v2_record_files
  where client_id = p_client_id
    and record_id = p_asset_id;

  select count(*) into version_count
  from public.client_brain_v2_record_versions
  where client_id = p_client_id
    and record_id = p_asset_id;

  select exists (
    select 1
    from public.client_brain_v2_links link
    join public.client_brain_v2_records source_record
      on source_record.id = case
        when link.from_record_id = p_asset_id then link.to_record_id
        else link.from_record_id
      end
     and source_record.client_id = p_client_id
    where link.client_id = p_client_id
      and (link.from_record_id = p_asset_id or link.to_record_id = p_asset_id)
      and source_record.top_section = 'sources'
  ) into asset_has_source_link;

  for file_row in
    select
      assignment.id as assignment_id,
      file_object.id as file_object_id,
      file_object.storage_bucket,
      file_object.storage_path,
      file_object.preview_path,
      file_object.optimized_path,
      file_object.metadata as file_metadata
    from public.client_brain_v2_record_files assignment
    join public.client_brain_file_objects file_object
      on file_object.id = assignment.file_object_id
    where assignment.client_id = p_client_id
      and assignment.record_id = p_asset_id
    for update of file_object
  loop
    select exists (
      select 1
      from public.client_brain_v2_record_files other_assignment
      where other_assignment.file_object_id = file_row.file_object_id
        and other_assignment.id <> file_row.assignment_id
    ) into file_is_shared;

    select (
      existing.legacy_asset_upload_id is not null
      or coalesce(file_row.file_metadata, '{}'::jsonb) ? 'source_asset_upload_id'
      or exists (
        select 1
        from public.asset_uploads upload
        where coalesce(upload.original_file_path, upload.file_path) = any (
          array_remove(array[file_row.storage_path, file_row.preview_path, file_row.optimized_path], null)
        )
           or coalesce(upload.optimized_file_path, '') = any (
             array_remove(array[file_row.storage_path, file_row.preview_path, file_row.optimized_path], null)
           )
           or coalesce(upload.ai_preview_path, '') = any (
             array_remove(array[file_row.storage_path, file_row.preview_path, file_row.optimized_path], null)
           )
      )
    ) into file_has_legacy_reference;

    if not file_is_shared and not file_has_legacy_reference and not asset_has_source_link then
      deletable_file_object_ids := array_append(deletable_file_object_ids, file_row.file_object_id);
      storage_objects_to_delete := storage_objects_to_delete || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'file_object_id', file_row.file_object_id,
          'bucket', file_row.storage_bucket,
          'storage_path', file_row.storage_path,
          'preview_path', file_row.preview_path,
          'optimized_path', file_row.optimized_path
        ))
      );
    else
      preserved_file_objects := preserved_file_objects || jsonb_build_array(
        jsonb_build_object(
          'file_object_id', file_row.file_object_id,
          'reason', case
            when file_is_shared then 'shared_by_another_client_brain_record'
            when file_has_legacy_reference then 'backed_by_legacy_asset_or_shared_storage'
            else 'linked_to_a_source_record'
          end
        )
      );
    end if;
  end loop;

  delete from public.client_brain_v2_links
  where client_id = p_client_id
    and (from_record_id = p_asset_id or to_record_id = p_asset_id);

  delete from public.client_brain_v2_record_files
  where client_id = p_client_id
    and record_id = p_asset_id;

  delete from public.client_brain_v2_records
  where id = p_asset_id
    and client_id = p_client_id
    and top_section = 'assets';

  if cardinality(deletable_file_object_ids) > 0 then
    delete from public.client_brain_file_objects
    where id = any (deletable_file_object_ids);
    get diagnostics deleted_file_object_count = row_count;
  end if;

  return jsonb_build_object(
    'asset_id', p_asset_id,
    'deleted_link_count', link_count,
    'deleted_assignment_count', assignment_count,
    'deleted_version_count', version_count,
    'deleted_file_object_count', deleted_file_object_count,
    'storage_objects_to_delete', storage_objects_to_delete,
    'preserved_file_objects', preserved_file_objects
  );
end;
$$;


ALTER FUNCTION "public"."delete_client_brain_v2_asset"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_client_brain_v2_asset_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_output_bucket" "text", "p_output_path" "text", "p_output_file_name" "text", "p_output_file_type" "text", "p_output_file_size_bytes" bigint, "p_output_file_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_draft public.client_brain_v2_asset_ingestion_drafts%rowtype;
  v_menu_item public.client_brain_v2_menu_items%rowtype;
  v_asset_id uuid := gen_random_uuid();
  v_file_id uuid := gen_random_uuid();
  v_source_record_id uuid;
  v_activation_record_id uuid;
  v_role text := 'truth_reference';
  v_required_files integer := 1;
  v_requested_approval boolean := coalesce((p_metadata->>'approved_for_generation')::boolean, false);
  v_title text := nullif(trim(p_title), '');
  v_is_product boolean;
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
    raise exception using errcode = 'PT404', message = 'Asset ingestion draft not found.';
  end if;
  if v_draft.state not in ('draft', 'ready_for_review', 'finalization_failed') then
    raise exception using errcode = 'PT409', message = 'This ingestion draft cannot be finalized in its current state.';
  end if;

  v_is_product := v_draft.asset_category in ('food', 'drinks');
  if v_title is null then
    if v_draft.asset_category = 'food' then
      v_title := 'Unidentified food reference';
    elsif v_draft.asset_category = 'drinks' then
      v_title := 'Unidentified drink reference';
    else
      raise exception using errcode = 'PT400', message = 'A title and final file are required.';
    end if;
  end if;
  if nullif(trim(p_output_path), '') is null
    or nullif(trim(p_output_bucket), '') is null
    or nullif(trim(p_output_file_name), '') is null
    or nullif(trim(p_output_file_type), '') is null then
    raise exception using errcode = 'PT400', message = 'A title and final file are required.';
  end if;
  if p_output_file_size_bytes is null or p_output_file_size_bytes <= 0 then
    raise exception using errcode = 'PT400', message = 'Final file metadata is invalid.';
  end if;
  if (select count(*) from public.client_brain_v2_asset_ingestion_temp_files
      where client_id = p_client_id and draft_id = p_draft_id and cleanup_state = 'active') < v_required_files then
    raise exception using errcode = 'PT400', message = 'The ingestion draft has no recoverable source reference.';
  end if;

  -- A partial menu selection is never a valid identity. Fast Capture has neither.
  if (v_draft.menu_record_id is null) is distinct from (v_draft.menu_item_id is null) then
    raise exception using errcode = 'PT400', message = 'Menu identity is incomplete. Select an official menu item or clear the menu selection.';
  end if;
  -- Unidentified Food/Drink may persist, but never as generation-eligible.
  if v_is_product and v_requested_approval and v_draft.menu_item_id is null then
    raise exception using errcode = 'PT400', message = 'Select an official menu item before approving a Food or Drink Asset for generation.';
  end if;

  if v_draft.menu_item_id is not null then
    select * into v_menu_item
    from public.client_brain_v2_menu_items
    where id = v_draft.menu_item_id
      and client_id = p_client_id
      and source_status = 'current';
    if not found or v_menu_item.menu_record_id is distinct from v_draft.menu_record_id then
      raise exception using errcode = 'PT409', message = 'The selected official menu item is no longer current.';
    end if;
    v_source_record_id := v_menu_item.source_record_id;
    v_activation_record_id := v_menu_item.activation_record_id;
  end if;

  insert into public.client_brain_file_objects (
    id, storage_bucket, storage_path, file_name, file_type, file_size_bytes, metadata
  ) values (
    v_file_id, p_output_bucket, p_output_path, p_output_file_name, p_output_file_type, p_output_file_size_bytes,
    coalesce(p_output_file_metadata, '{}'::jsonb)
  );

  insert into public.client_brain_v2_records (
    id, client_id, stable_key, top_section, subsection, record_type, title, summary, content,
    knowledge_class, status, priority, source_type, provenance, metadata
  ) values (
    v_asset_id, p_client_id, 'asset:ingestion:' || v_asset_id::text,
    'assets', 'images', 'asset', v_title, null, null,
    'asset', case when v_requested_approval then 'approved' else 'needs_review' end, 3, 'client_provided',
    jsonb_build_object(
      'ingestion_draft_id', p_draft_id,
      'ingestion_mode', case when v_is_product then 'studio_truth_reference' else 'venue_truth_reference' end,
      'raw_reference_count', (select count(*) from public.client_brain_v2_asset_ingestion_temp_files where client_id = p_client_id and draft_id = p_draft_id),
      'finalized_at', now(),
      'provider_execution', coalesce(v_draft.execution, '{}'::jsonb)
    ),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'asset_category', v_draft.asset_category,
        'asset_category_source', 'human_confirmed',
        'asset_category_confirmed_at', now(),
        'asset_category_confirmed_by', 'Asset Ingestion',
        'asset_role', v_role,
        'identity_status', case when v_is_product and v_draft.menu_item_id is null then 'unidentified' else 'menu_linked' end,
        'approved_for_generation', v_requested_approval,
        'review_state', case when v_requested_approval then 'approved' else 'needs_review' end
      )
  );

  insert into public.client_brain_v2_record_files (
    client_id, record_id, file_object_id, semantic_role, approval_status, sort_order, metadata
  ) values (
    p_client_id, v_asset_id, v_file_id, v_role,
    case when v_requested_approval then 'approved' else 'needs_review' end, 0,
    jsonb_build_object('ingested_via', 'asset_ingestion_v1', 'approved_for_generation', v_requested_approval)
  );

  if v_draft.menu_record_id is not null then
    insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
    values (p_client_id, v_asset_id, v_draft.menu_record_id, 'belongs_to_menu', jsonb_build_object('linked_by', 'Asset Ingestion'))
    on conflict do nothing;
  end if;
  if v_activation_record_id is not null then
    insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
    values (p_client_id, v_asset_id, v_activation_record_id, 'supports_activation', jsonb_build_object('linked_by', 'Asset Ingestion'))
    on conflict do nothing;
  end if;
  if v_source_record_id is not null then
    insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
    values (p_client_id, v_asset_id, v_source_record_id, 'derived_from', jsonb_build_object('linked_by', 'Asset Ingestion', 'source_kind', 'official_menu'))
    on conflict do nothing;
  end if;

  update public.client_brain_v2_asset_ingestion_drafts
  set state = 'finalized', final_asset_id = v_asset_id, cleanup_error = null
  where id = p_draft_id and client_id = p_client_id;

  return jsonb_build_object('asset_id', v_asset_id, 'file_object_id', v_file_id, 'draft_id', p_draft_id);
end;
$$;


ALTER FUNCTION "public"."finalize_client_brain_v2_asset_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_output_bucket" "text", "p_output_path" "text", "p_output_file_name" "text", "p_output_file_type" "text", "p_output_file_size_bytes" bigint, "p_output_file_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_client_brain_v2_staff_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_files" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."finalize_client_brain_v2_staff_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_files" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jarvis_finance_guard_bank_allocation_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  bank_total numeric(14,2);
  allocated_total numeric(14,2);
begin
  select abs(signed_amount) into bank_total
  from public.jarvis_finance_bank_transactions
  where id = new.bank_transaction_id
  for update;
  if bank_total is null then
    raise exception 'Bank transaction does not exist';
  end if;
  select coalesce(sum(allocated_amount), 0) into allocated_total
  from public.jarvis_finance_bank_allocations
  where bank_transaction_id = new.bank_transaction_id
    and id is distinct from new.id;
  if allocated_total + new.allocated_amount > bank_total + 0.000001 then
    raise exception 'Allocation total exceeds immutable bank transaction amount';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."jarvis_finance_guard_bank_allocation_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jarvis_finance_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."jarvis_finance_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jarvis_tools_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."jarvis_tools_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_id uuid := coalesce(new.client_id, old.client_id);
  v_plan_id uuid := coalesce(new.monthly_plan_id, old.monthly_plan_id);
begin
  update public.social_monthly_plan_concept_grids
  set status = 'stale', is_selected = false
  where client_id = v_client_id
    and monthly_plan_id = v_plan_id
    and status in ('generated', 'accepted');
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.strategy is not distinct from new.strategy
    and old.visual_direction is not distinct from new.visual_direction
    and old.grid_notes is not distinct from new.grid_notes
    and old.client_brain_snapshot is not distinct from new.client_brain_snapshot
    and old.ai_provenance is not distinct from new.ai_provenance then
    return new;
  end if;

  update public.social_monthly_plan_concept_grids
  set status = 'stale', is_selected = false
  where client_id = new.client_id
    and monthly_plan_id = new.id
    and status in ('generated', 'accepted');
  return new;
end;
$$;


ALTER FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_social_monthly_production_artifacts_stale_from_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.social_monthly_plan_production_artifacts
  set status = 'stale', is_selected = false
  where client_id = coalesce(new.client_id, old.client_id)
    and monthly_plan_id = coalesce(new.monthly_plan_id, old.monthly_plan_id)
    and monthly_plan_item_id = coalesce(new.id, old.id)
    and status in ('ready', 'generated', 'selected');
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."mark_social_monthly_production_artifacts_stale_from_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_crm_contact"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  new.display_name := nullif(btrim(new.display_name), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone_country_code := nullif(btrim(new.phone_country_code), '');
  new.company := nullif(btrim(new.company), '');
  new.job_title := nullif(btrim(new.job_title), '');
  new.nationality := nullif(btrim(new.nationality), '');
  new.preferred_language := nullif(btrim(new.preferred_language), '');
  new.notes := nullif(btrim(new.notes), '');

  if new.phone is not null then
    new.phone := regexp_replace(btrim(new.phone), '[^0-9+]', '', 'g');
    if new.phone like '00%' then
      new.phone := '+' || substring(new.phone from 3);
    end if;
    new.phone := nullif(new.phone, '');
  end if;

  if new.display_name is null then
    new.display_name := nullif(btrim(concat_ws(' ', new.first_name, new.last_name)), '');
  end if;

  new.tags := coalesce(
    (select array_agg(distinct btrim(tag) order by btrim(tag))
      from unnest(coalesce(new.tags, '{}'::text[])) as tag
      where nullif(btrim(tag), '') is not null),
    '{}'::text[]
  );
  new.external_ids := coalesce(new.external_ids, '{}'::jsonb);
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_crm_contact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pitch_deck_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."pitch_deck_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "manual_order" numeric, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actual_task_ids uuid[];
  expected_count integer := coalesce(array_length(p_expected_task_ids, 1), 0);
  ordered_count integer := coalesce(array_length(p_ordered_task_ids, 1), 0);
begin
  if p_status not in ('not_started', 'in_progress', 'completed', 'reviewed', 'archived') then
    raise exception 'TASK_STATUS_INVALID';
  end if;

  if expected_count = 0 or expected_count <> ordered_count or expected_count > 200 then
    raise exception 'TASK_REORDER_INPUT_INVALID';
  end if;

  if (select count(distinct task_id) from unnest(p_expected_task_ids) as task_id) <> expected_count
    or (select count(distinct task_id) from unnest(p_ordered_task_ids) as task_id) <> ordered_count then
    raise exception 'TASK_REORDER_DUPLICATE_ID';
  end if;

  -- The lock covers only the target status column. A lifecycle transition is
  -- performed first through the existing task action, then this function can
  -- reorder the task in its new column.
  perform 1
  from public.jarvis_tasks
  where status = p_status
  order by manual_order asc, created_at asc, id asc
  for update;

  select array_agg(id order by manual_order asc, created_at asc, id asc)
  into actual_task_ids
  from public.jarvis_tasks
  where status = p_status;

  if actual_task_ids is distinct from p_expected_task_ids then
    raise exception 'TASK_REORDER_CONFLICT';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_task_ids) as requested(task_id)
    where not (requested.task_id = any(actual_task_ids))
  ) then
    raise exception 'TASK_REORDER_COLUMN_MISMATCH';
  end if;

  with positions as (
    select requested.task_id, requested.position
    from unnest(p_ordered_task_ids) with ordinality as requested(task_id, position)
  ), updated as (
    update public.jarvis_tasks as task
    set manual_order = positions.position * 1000
    from positions
    where task.id = positions.task_id
      and task.status = p_status
    returning task.id, task.manual_order, task.updated_at
  )
  select updated.id, updated.manual_order, updated.updated_at
  from updated
  order by updated.manual_order asc, updated.id asc;
end;
$$;


ALTER FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."roadmap_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "depends_on_item_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_dependencies_check" CHECK (("item_id" <> "depends_on_item_id"))
);


ALTER TABLE "public"."roadmap_dependencies" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_add_dependency"("p_item_id" "uuid", "p_depends_on_item_id" "uuid") RETURNS "public"."roadmap_dependencies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_item public.roadmap_items;
  dependency_item public.roadmap_items;
  result public.roadmap_dependencies;
begin
  select * into current_item from public.roadmap_items where id = p_item_id for update;
  select * into dependency_item from public.roadmap_items where id = p_depends_on_item_id;
  if not found or current_item.id is null then raise exception 'ROADMAP_ITEM_NOT_FOUND'; end if;
  if current_item.id = dependency_item.id then raise exception 'ROADMAP_SELF_DEPENDENCY'; end if;
  if current_item.project_id <> dependency_item.project_id then raise exception 'ROADMAP_CROSS_PROJECT_DEPENDENCY'; end if;
  if exists (
    with recursive dependency_path as (
      select item_id, depends_on_item_id from public.roadmap_dependencies where item_id = p_depends_on_item_id
      union all
      select dependency.item_id, dependency.depends_on_item_id
      from public.roadmap_dependencies dependency
      join dependency_path path on dependency.item_id = path.depends_on_item_id
    ) select 1 from dependency_path where depends_on_item_id = p_item_id
  ) then raise exception 'ROADMAP_CIRCULAR_DEPENDENCY'; end if;

  insert into public.roadmap_dependencies(item_id, depends_on_item_id)
  values (p_item_id, p_depends_on_item_id)
  returning * into result;
  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (current_item.project_id, current_item.id, 'dependency_added',
    'Added dependency for ' || current_item.title,
    jsonb_build_object('depends_on_item_id', dependency_item.id, 'depends_on_title', dependency_item.title));
  return result;
exception when unique_violation then
  raise exception 'ROADMAP_DUPLICATE_DEPENDENCY';
end;
$$;


ALTER FUNCTION "public"."roadmap_add_dependency"("p_item_id" "uuid", "p_depends_on_item_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "potential_phase_id" "uuid",
    "potential_value" "text" DEFAULT 'medium'::"text" NOT NULL,
    "complexity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "dependency_notes" "text",
    "notes" "text",
    "promoted_roadmap_item_id" "uuid",
    "promotion_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_ideas_category_check" CHECK (("category" = ANY (ARRAY['content'::"text", 'social_growth'::"text", 'video'::"text", 'intelligence'::"text", 'competitor_research'::"text", 'creator_influencer'::"text", 'customer_support'::"text", 'crm'::"text", 'retention'::"text", 'email'::"text", 'whatsapp'::"text", 'paid_media'::"text", 'landing_pages'::"text", 'conversion'::"text", 'customer_intelligence'::"text", 'menu_intelligence'::"text", 'hospitality_operations'::"text", 'analytics'::"text", 'automation'::"text", 'other'::"text"]))),
    CONSTRAINT "roadmap_ideas_complexity_check" CHECK (("complexity" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "roadmap_ideas_potential_value_check" CHECK (("potential_value" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "roadmap_ideas_promoted_link_check" CHECK ((("status" <> 'promoted_to_roadmap'::"text") OR ("promoted_roadmap_item_id" IS NOT NULL))),
    CONSTRAINT "roadmap_ideas_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'researching'::"text", 'shortlisted'::"text", 'promoted_to_roadmap'::"text", 'parked'::"text", 'rejected'::"text"]))),
    CONSTRAINT "roadmap_ideas_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."roadmap_ideas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_create_idea"("p_project_id" "uuid", "p_payload" "jsonb") RETURNS "public"."roadmap_ideas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  created public.roadmap_ideas;
begin
  if not exists (select 1 from public.roadmap_projects where id = p_project_id) then raise exception 'ROADMAP_PROJECT_NOT_FOUND'; end if;
  insert into public.roadmap_ideas(
    project_id, title, description, category, potential_phase_id, potential_value, complexity, status, dependency_notes, notes, metadata
  ) values (
    p_project_id,
    nullif(trim(p_payload->>'title'), ''),
    nullif(trim(p_payload->>'description'), ''),
    coalesce(nullif(p_payload->>'category', ''), 'other'),
    nullif(p_payload->>'potential_phase_id', '')::uuid,
    coalesce(nullif(p_payload->>'potential_value', ''), 'medium'),
    coalesce(nullif(p_payload->>'complexity', ''), 'medium'),
    coalesce(nullif(p_payload->>'status', ''), 'idea'),
    nullif(trim(p_payload->>'dependency_notes'), ''),
    nullif(trim(p_payload->>'notes'), ''),
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into created;
  if created.potential_phase_id is not null and not exists (select 1 from public.roadmap_phases where id = created.potential_phase_id and project_id = p_project_id) then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata) values (created.id, 'created', 'Captured ' || created.title || ' in the Idea Vault.', '{}'::jsonb);
  return created;
exception when check_violation then raise exception 'ROADMAP_IDEA_VALUE_INVALID';
when unique_violation then raise exception 'ROADMAP_IDEA_DUPLICATE';
end;
$$;


ALTER FUNCTION "public"."roadmap_create_idea"("p_project_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_ideas_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."roadmap_ideas_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_promote_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_phase_id" "uuid", "p_parent_item_id" "uuid", "p_item_type" "text", "p_priority" "text", "p_title" "text", "p_description" "text", "p_dependency_ids" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_idea public.roadmap_ideas;
  target_phase public.roadmap_phases;
  parent_capability public.roadmap_items;
  created_item public.roadmap_items;
  dependency_id uuid;
  next_slug text;
begin
  select * into current_idea from public.roadmap_ideas where id = p_idea_id for update;
  if not found then raise exception 'ROADMAP_IDEA_NOT_FOUND'; end if;
  if current_idea.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_IDEA_STALE'; end if;
  if current_idea.status in ('promoted_to_roadmap', 'rejected') then raise exception 'ROADMAP_IDEA_NOT_PROMOTABLE'; end if;
  select * into target_phase from public.roadmap_phases where id = p_phase_id and project_id = current_idea.project_id;
  if not found or target_phase.release_status in ('archived', 'legacy') then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  if p_item_type not in ('capability', 'implementation') then raise exception 'ROADMAP_IDEA_PROMOTION_TYPE_INVALID'; end if;
  if p_priority not in ('critical', 'high', 'medium', 'low') then raise exception 'ROADMAP_PRIORITY_INVALID'; end if;
  if p_item_type = 'implementation' then
    select * into parent_capability from public.roadmap_items where id = p_parent_item_id and project_id = current_idea.project_id and phase_id = p_phase_id and item_type = 'capability';
    if not found then raise exception 'ROADMAP_IDEA_PARENT_REQUIRED'; end if;
  end if;
  next_slug := substring(regexp_replace(lower(coalesce(nullif(trim(p_title), ''), current_idea.title)), '[^a-z0-9]+', '-', 'g') from 1 for 42) || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);
  insert into public.roadmap_items(project_id, phase_id, parent_item_id, slug, title, description, item_type, status, priority, weight, progress, metadata)
  values (
    current_idea.project_id, p_phase_id, case when p_item_type = 'capability' then null else p_parent_item_id end,
    next_slug, coalesce(nullif(trim(p_title), ''), current_idea.title), coalesce(nullif(trim(p_description), ''), current_idea.description),
    p_item_type, 'planned', p_priority, case when p_item_type = 'capability' then 3 else 2 end, 0,
    jsonb_build_object('idea_vault_origin_id', current_idea.id, 'origin', 'idea_vault', 'idea_category', current_idea.category, 'why_it_matters', current_idea.description)
  ) returning * into created_item;
  for dependency_id in select value::text::uuid from jsonb_array_elements_text(coalesce(p_dependency_ids, '[]'::jsonb)) loop
    if dependency_id = created_item.id or not exists (select 1 from public.roadmap_items where id = dependency_id and project_id = current_idea.project_id) then raise exception 'ROADMAP_IDEA_DEPENDENCY_INVALID'; end if;
    insert into public.roadmap_dependencies(item_id, depends_on_item_id) values (created_item.id, dependency_id) on conflict do nothing;
  end loop;
  update public.roadmap_ideas set status = 'promoted_to_roadmap', promoted_roadmap_item_id = created_item.id,
    promotion_metadata = jsonb_build_object('promoted_at', now(), 'item_type', p_item_type, 'phase_id', p_phase_id)
  where id = current_idea.id returning * into current_idea;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata)
  values (current_idea.id, 'promoted', 'Promoted ' || current_idea.title || ' to the Roadmap.', jsonb_build_object('roadmap_item_id', created_item.id));
  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (created_item.project_id, created_item.id, 'idea_promoted', 'Promoted from Idea Vault: ' || current_idea.title, jsonb_build_object('idea_id', current_idea.id));
  return jsonb_build_object('idea_id', current_idea.id, 'roadmap_item_id', created_item.id);
end;
$$;


ALTER FUNCTION "public"."roadmap_promote_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_phase_id" "uuid", "p_parent_item_id" "uuid", "p_item_type" "text", "p_priority" "text", "p_title" "text", "p_description" "text", "p_dependency_ids" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."roadmap_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_update_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_payload" "jsonb") RETURNS "public"."roadmap_ideas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_idea public.roadmap_ideas;
  next_status text;
begin
  select * into current_idea from public.roadmap_ideas where id = p_idea_id for update;
  if not found then raise exception 'ROADMAP_IDEA_NOT_FOUND'; end if;
  if current_idea.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_IDEA_STALE'; end if;
  next_status := coalesce(nullif(p_payload->>'status', ''), current_idea.status);
  if next_status not in ('idea', 'researching', 'shortlisted', 'promoted_to_roadmap', 'parked', 'rejected') then raise exception 'ROADMAP_IDEA_STATUS_INVALID'; end if;
  if next_status = 'promoted_to_roadmap' and current_idea.promoted_roadmap_item_id is null then raise exception 'ROADMAP_IDEA_PROMOTION_REQUIRED'; end if;
  update public.roadmap_ideas set
    title = coalesce(nullif(trim(p_payload->>'title'), ''), title),
    description = case when p_payload ? 'description' then nullif(trim(p_payload->>'description'), '') else description end,
    category = coalesce(nullif(p_payload->>'category', ''), category),
    potential_phase_id = case when p_payload ? 'potential_phase_id' then nullif(p_payload->>'potential_phase_id', '')::uuid else potential_phase_id end,
    potential_value = coalesce(nullif(p_payload->>'potential_value', ''), potential_value),
    complexity = coalesce(nullif(p_payload->>'complexity', ''), complexity),
    status = next_status,
    dependency_notes = case when p_payload ? 'dependency_notes' then nullif(trim(p_payload->>'dependency_notes'), '') else dependency_notes end,
    notes = case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else notes end,
    metadata = coalesce(p_payload->'metadata', metadata)
  where id = p_idea_id returning * into current_idea;
  if current_idea.potential_phase_id is not null and not exists (select 1 from public.roadmap_phases where id = current_idea.potential_phase_id and project_id = current_idea.project_id) then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata)
  values (current_idea.id, case next_status when 'parked' then 'parked' when 'rejected' then 'rejected' else 'updated' end,
    case next_status when 'parked' then 'Parked ' || current_idea.title when 'rejected' then 'Rejected ' || current_idea.title else 'Updated ' || current_idea.title end,
    jsonb_build_object('status', current_idea.status));
  return current_idea;
exception when check_violation then raise exception 'ROADMAP_IDEA_VALUE_INVALID';
when unique_violation then raise exception 'ROADMAP_IDEA_DUPLICATE';
end;
$$;


ALTER FUNCTION "public"."roadmap_update_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_payload" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_id" "uuid",
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "item_type" "text" DEFAULT 'feature'::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "weight" smallint DEFAULT 2 NOT NULL,
    "progress" smallint DEFAULT 0 NOT NULL,
    "is_focus" boolean DEFAULT false NOT NULL,
    "blocker_type" "text",
    "blocker_reason" "text",
    "related_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_date" "date",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_item_id" "uuid",
    CONSTRAINT "roadmap_items_blocker_type_check" CHECK (("blocker_type" = ANY (ARRAY['internal'::"text", 'external'::"text", 'waiting'::"text"]))),
    CONSTRAINT "roadmap_items_check" CHECK ((("status" <> 'blocked'::"text") OR ("blocker_reason" IS NOT NULL))),
    CONSTRAINT "roadmap_items_check1" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "roadmap_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['milestone'::"text", 'feature'::"text", 'task'::"text", 'idea'::"text", 'technical_debt'::"text", 'capability'::"text", 'implementation'::"text"]))),
    CONSTRAINT "roadmap_items_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "roadmap_items_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "roadmap_items_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "roadmap_items_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'planned'::"text", 'in_progress'::"text", 'blocked'::"text", 'needs_review'::"text", 'completed'::"text", 'deferred'::"text", 'idea'::"text"]))),
    CONSTRAINT "roadmap_items_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 240))),
    CONSTRAINT "roadmap_items_weight_check" CHECK ((("weight" >= 1) AND ("weight" <= 10)))
);


ALTER TABLE "public"."roadmap_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roadmap_update_item"("p_item_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_patch" "jsonb") RETURNS "public"."roadmap_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_item public.roadmap_items;
  parent_item public.roadmap_items;
  next_status text;
  next_progress smallint;
  next_completed_at timestamptz;
  next_started_at timestamptz;
  next_phase_id uuid;
  next_parent_item_id uuid;
  action_name text := 'updated';
begin
  select * into current_item from public.roadmap_items where id = p_item_id for update;
  if not found then raise exception 'ROADMAP_ITEM_NOT_FOUND'; end if;
  if current_item.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_ITEM_STALE'; end if;

  next_phase_id := coalesce(nullif(p_patch->>'phase_id', '')::uuid, current_item.phase_id);
  if next_phase_id is not null and not exists (
    select 1 from public.roadmap_phases where id = next_phase_id and project_id = current_item.project_id
  ) then raise exception 'ROADMAP_PHASE_MISMATCH'; end if;

  next_parent_item_id := case
    when p_patch ? 'parent_item_id' then nullif(p_patch->>'parent_item_id', '')::uuid
    else current_item.parent_item_id
  end;
  if next_parent_item_id is not null then
    select * into parent_item from public.roadmap_items where id = next_parent_item_id;
    if not found then raise exception 'ROADMAP_PARENT_NOT_FOUND'; end if;
    if parent_item.id = current_item.id then raise exception 'ROADMAP_PARENT_SELF'; end if;
    if parent_item.project_id <> current_item.project_id then raise exception 'ROADMAP_PARENT_PROJECT_MISMATCH'; end if;
    if parent_item.item_type <> 'capability' then raise exception 'ROADMAP_PARENT_MUST_BE_CAPABILITY'; end if;
    if parent_item.phase_id is distinct from next_phase_id then raise exception 'ROADMAP_PARENT_PHASE_MISMATCH'; end if;
  end if;

  next_status := coalesce(nullif(p_patch->>'status', ''), current_item.status);
  if next_status not in ('not_started', 'planned', 'in_progress', 'blocked', 'needs_review', 'completed', 'deferred', 'idea') then
    raise exception 'ROADMAP_STATUS_INVALID';
  end if;
  if next_status = 'blocked' and coalesce(nullif(p_patch->>'blocker_reason', ''), current_item.blocker_reason) is null then
    raise exception 'ROADMAP_BLOCKER_REASON_REQUIRED';
  end if;
  next_progress := coalesce(nullif(p_patch->>'progress', '')::smallint, current_item.progress);
  if next_status = 'completed' then next_progress := 100; end if;
  next_completed_at := case when next_status = 'completed' then coalesce(current_item.completed_at, now()) else null end;
  next_started_at := case when next_status = 'in_progress' then coalesce(current_item.started_at, now()) else current_item.started_at end;

  if next_status = 'completed' and current_item.status <> 'completed' then action_name := 'completed';
  elsif next_status = 'blocked' and current_item.status <> 'blocked' then action_name := 'blocked';
  elsif coalesce((p_patch->>'is_focus')::boolean, current_item.is_focus) and not current_item.is_focus then action_name := 'focus_set';
  elsif next_status = 'in_progress' and current_item.status <> 'in_progress' then action_name := 'started';
  end if;

  update public.roadmap_items
  set title = coalesce(nullif(p_patch->>'title', ''), title),
      description = case when p_patch ? 'description' then nullif(p_patch->>'description', '') else description end,
      phase_id = next_phase_id,
      parent_item_id = next_parent_item_id,
      item_type = coalesce(nullif(p_patch->>'item_type', ''), item_type),
      status = next_status,
      priority = coalesce(nullif(p_patch->>'priority', ''), priority),
      weight = coalesce(nullif(p_patch->>'weight', '')::smallint, weight),
      progress = next_progress,
      is_focus = coalesce((p_patch->>'is_focus')::boolean, is_focus),
      blocker_type = case when p_patch ? 'blocker_type' then nullif(p_patch->>'blocker_type', '') else blocker_type end,
      blocker_reason = case when p_patch ? 'blocker_reason' then nullif(p_patch->>'blocker_reason', '') else blocker_reason end,
      related_links = coalesce(p_patch->'related_links', related_links),
      metadata = coalesce(p_patch->'metadata', metadata),
      target_date = case when p_patch ? 'target_date' then nullif(p_patch->>'target_date', '')::date else target_date end,
      started_at = next_started_at,
      completed_at = next_completed_at
  where id = p_item_id
  returning * into current_item;

  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (current_item.project_id, current_item.id, action_name,
    case action_name
      when 'completed' then 'Completed ' || current_item.title
      when 'blocked' then 'Blocked ' || current_item.title
      when 'started' then 'Started ' || current_item.title
      when 'focus_set' then 'Set current focus: ' || current_item.title
      else 'Updated ' || current_item.title
    end,
    jsonb_build_object('status', current_item.status, 'progress', current_item.progress));
  return current_item;
end;
$$;


ALTER FUNCTION "public"."roadmap_update_item"("p_item_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_ai_model_library_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_ai_model_library_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_guest_model_relationships_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_guest_model_relationships_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_guest_models_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_guest_models_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tool_registry_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tool_registry_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_ai_content_studio_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at := now(); return new; end;
$$;


ALTER FUNCTION "public"."touch_ai_content_studio_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_client_brain_v2_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_client_brain_v2_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_social_monthly_content_plan_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_social_monthly_content_plan_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_social_monthly_plan_concept_grid_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_social_monthly_plan_concept_grid_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_social_monthly_plan_production_artifact_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_social_monthly_plan_production_artifact_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_social_publishing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_social_publishing_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_brand_playbooks_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_brand_playbooks_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_capability_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "roadmap_item_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'supports'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_capability_links_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['owns'::"text", 'supports'::"text", 'candidate_for'::"text"])))
);


ALTER TABLE "public"."agent_capability_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_future" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_departments_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120))),
    CONSTRAINT "agent_departments_purpose_check" CHECK ((("char_length"("purpose") >= 1) AND ("char_length"("purpose") <= 420))),
    CONSTRAINT "agent_departments_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."agent_departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "agent_name" "text",
    "skill_name" "text",
    "lesson" "text" NOT NULL,
    "importance" integer DEFAULT 3,
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."agent_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_organization_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_organization_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['seeded'::"text", 'created'::"text", 'updated'::"text", 'status_changed'::"text", 'organization_changed'::"text"]))),
    CONSTRAINT "agent_organization_activity_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 360)))
);


ALTER TABLE "public"."agent_organization_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_organization_profiles" (
    "agent_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "manager_agent_id" "uuid",
    "role_title" "text" NOT NULL,
    "operational_status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "purpose" "text" NOT NULL,
    "responsibilities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "boundaries" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "input_requirements" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "output_responsibilities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "context_access" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "approval_requirements" "text",
    "escalation_path" "text",
    "os_release_overrides" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_executive" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_organization_profiles_operational_status_check" CHECK (("operational_status" = ANY (ARRAY['active'::"text", 'experimental'::"text", 'planned'::"text", 'blocked'::"text", 'deprecated'::"text"]))),
    CONSTRAINT "agent_organization_profiles_os_release_overrides_check" CHECK (("os_release_overrides" <@ ARRAY['os1-create'::"text", 'os2-distribute'::"text", 'os3-grow'::"text", 'os4-operate'::"text"])),
    CONSTRAINT "agent_organization_profiles_purpose_check" CHECK ((("char_length"("purpose") >= 1) AND ("char_length"("purpose") <= 720))),
    CONSTRAINT "agent_organization_profiles_role_title_check" CHECK ((("char_length"("role_title") >= 1) AND ("char_length"("role_title") <= 160)))
);


ALTER TABLE "public"."agent_organization_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_run_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "proposed_action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_run_approvals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."agent_run_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_run_model_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "latency_ms" integer,
    "provider_request_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_run_model_calls_cost_usd_check" CHECK (("cost_usd" >= (0)::numeric)),
    CONSTRAINT "agent_run_model_calls_input_tokens_check" CHECK (("input_tokens" >= 0)),
    CONSTRAINT "agent_run_model_calls_latency_ms_check" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "agent_run_model_calls_output_tokens_check" CHECK (("output_tokens" >= 0))
);


ALTER TABLE "public"."agent_run_model_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_run_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "sequence_no" integer NOT NULL,
    "stage" "text" NOT NULL,
    "action_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "outcome" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "diagnostic" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_run_steps_action_key_check" CHECK (("action_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "agent_run_steps_sequence_no_check" CHECK (("sequence_no" > 0)),
    CONSTRAINT "agent_run_steps_stage_check" CHECK (("stage" = ANY (ARRAY['observe'::"text", 'think'::"text", 'act'::"text", 'observe_result'::"text", 'approval'::"text", 'recovery'::"text"]))),
    CONSTRAINT "agent_run_steps_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'completed'::"text", 'waiting'::"text", 'failed'::"text", 'blocked'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."agent_run_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_runtime_definition_id" "uuid" NOT NULL,
    "legacy_execution_queue_id" "uuid",
    "parent_run_id" "uuid",
    "client_id" "uuid",
    "trigger_type" "text" NOT NULL,
    "trigger_reference" "text",
    "idempotency_key" "text" NOT NULL,
    "resource_key" "text" NOT NULL,
    "goal" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "current_stage" "text" DEFAULT 'queued'::"text" NOT NULL,
    "approval_state" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "workflow_instance_id" "text",
    "context_manifest" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "decision_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result_reference" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "retry_state" "jsonb" DEFAULT '{"attempt": 0, "max_attempts": 1}'::"jsonb" NOT NULL,
    "cost_limit_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "cost_actual_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "error_diagnostic" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runs_approval_state_check" CHECK (("approval_state" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "agent_runs_cost_actual_usd_check" CHECK (("cost_actual_usd" >= (0)::numeric)),
    CONSTRAINT "agent_runs_cost_limit_usd_check" CHECK (("cost_limit_usd" >= (0)::numeric)),
    CONSTRAINT "agent_runs_current_stage_check" CHECK (("current_stage" = ANY (ARRAY['queued'::"text", 'observe'::"text", 'think'::"text", 'act'::"text", 'observe_result'::"text", 'waiting_for_approval'::"text", 'waiting_for_external'::"text", 'recovery'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "agent_runs_goal_check" CHECK ((("char_length"("goal") >= 1) AND ("char_length"("goal") <= 2000))),
    CONSTRAINT "agent_runs_idempotency_key_check" CHECK ((("char_length"("idempotency_key") >= 8) AND ("char_length"("idempotency_key") <= 200))),
    CONSTRAINT "agent_runs_resource_key_check" CHECK ((("char_length"("resource_key") >= 1) AND ("char_length"("resource_key") <= 240))),
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'observing'::"text", 'running'::"text", 'waiting_for_approval'::"text", 'waiting_for_external'::"text", 'recovery_required'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "agent_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text", 'event'::"text", 'delegated'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runtime_definition_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_runtime_definition_id" "uuid" NOT NULL,
    "agent_skill_id" "uuid" NOT NULL,
    "access_type" "text" DEFAULT 'allowed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runtime_definition_skills_access_type_check" CHECK (("access_type" = ANY (ARRAY['allowed'::"text", 'required'::"text"])))
);


ALTER TABLE "public"."agent_runtime_definition_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runtime_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "agent_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "definition_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "operational_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "allowed_triggers" "text"[] DEFAULT '{manual}'::"text"[] NOT NULL,
    "allowed_tool_keys" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allowed_data_scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "client_scope_requirement" "text" DEFAULT 'optional'::"text" NOT NULL,
    "model_policy" "jsonb" DEFAULT '{"mode": "deterministic_only", "allowed_models": []}'::"jsonb" NOT NULL,
    "cost_policy" "jsonb" DEFAULT '{"ai_allowed": false, "max_run_cost_usd": 0}'::"jsonb" NOT NULL,
    "mutation_policy" "jsonb" DEFAULT '{"read": true, "internal_write": false, "external_mutation": false}'::"jsonb" NOT NULL,
    "approval_policy" "jsonb" DEFAULT '{"required_before_act": false, "approval_timeout_hours": 168}'::"jsonb" NOT NULL,
    "retry_policy" "jsonb" DEFAULT '{"max_attempts": 1, "provider_uncertainty": "recovery_required"}'::"jsonb" NOT NULL,
    "output_contract" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "memory_policy" "jsonb" DEFAULT '{"promotion_requires_approval": true}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runtime_definitions_agent_key_check" CHECK (("agent_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "agent_runtime_definitions_allowed_triggers_check" CHECK (("allowed_triggers" <@ ARRAY['manual'::"text", 'scheduled'::"text", 'event'::"text", 'delegated'::"text"])),
    CONSTRAINT "agent_runtime_definitions_client_scope_requirement_check" CHECK (("client_scope_requirement" = ANY (ARRAY['none'::"text", 'optional'::"text", 'required'::"text"]))),
    CONSTRAINT "agent_runtime_definitions_display_name_check" CHECK ((("char_length"("display_name") >= 1) AND ("char_length"("display_name") <= 120))),
    CONSTRAINT "agent_runtime_definitions_operational_status_check" CHECK (("operational_status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'blocked'::"text", 'deprecated'::"text"]))),
    CONSTRAINT "agent_runtime_definitions_purpose_check" CHECK ((("char_length"("purpose") >= 1) AND ("char_length"("purpose") <= 1000)))
);


ALTER TABLE "public"."agent_runtime_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runtime_settings" (
    "singleton" boolean DEFAULT true NOT NULL,
    "autonomous_execution_enabled" boolean DEFAULT true NOT NULL,
    "external_mutations_enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by_note" "text" DEFAULT 'Agent Runtime V1 bootstrap'::"text" NOT NULL,
    CONSTRAINT "agent_runtime_settings_singleton_check" CHECK ("singleton")
);


ALTER TABLE "public"."agent_runtime_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text",
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "model_recommendation" "text",
    "instructions" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."agent_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_task_outputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_id" "uuid",
    "output_type" "text",
    "title" "text",
    "content" "text",
    "url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."agent_task_outputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "command_id" "uuid",
    "plan_id" "uuid",
    "deliverable_id" "uuid",
    "assigned_agent" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "priority" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."agent_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_tool_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "tool_id" "uuid" NOT NULL,
    "access_type" "text" DEFAULT 'allowed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_tool_links_access_type_check" CHECK (("access_type" = ANY (ARRAY['allowed'::"text", 'required'::"text"])))
);


ALTER TABLE "public"."agent_tool_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "agent_name" "text" NOT NULL,
    "agent_type" "text",
    "status" "text" DEFAULT 'active'::"text",
    "description" "text",
    "capabilities" "text"[],
    "default_model" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" NOT NULL,
    "execution_mode" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "provider" "text" DEFAULT 'google-gemini'::"text" NOT NULL,
    "model" "text" DEFAULT 'gemini-3-pro-image-preview'::"text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "aspect_ratio" "text" NOT NULL,
    "output_resolution" "text" DEFAULT '4K'::"text" NOT NULL,
    "prompt_text" "text" DEFAULT ''::"text" NOT NULL,
    "reference_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "file_object_id" "uuid",
    "failure_reason" "text",
    "generated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prompt_version_id" "uuid",
    CONSTRAINT "ai_content_generations_aspect_ratio_check" CHECK (("aspect_ratio" = ANY (ARRAY['1:1'::"text", '4:5'::"text", '3:2'::"text", '2:3'::"text", '16:9'::"text", '9:16'::"text"]))),
    CONSTRAINT "ai_content_generations_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['dry_run'::"text", 'live'::"text"]))),
    CONSTRAINT "ai_content_generations_output_resolution_check" CHECK (("output_resolution" = '4K'::"text")),
    CONSTRAINT "ai_content_generations_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'generating'::"text", 'generated'::"text", 'failed'::"text"]))),
    CONSTRAINT "ai_content_generations_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."ai_content_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_prompt_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "execution_mode" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "provider" "text" DEFAULT 'anthropic'::"text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "user_brief" "text" DEFAULT ''::"text" NOT NULL,
    "correction" "text",
    "generated_prompt" "text" NOT NULL,
    "provider_prompt" "text" NOT NULL,
    "structured_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_content_prompt_versions_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['dry_run'::"text", 'live'::"text"]))),
    CONSTRAINT "ai_content_prompt_versions_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'superseded'::"text", 'failed'::"text"]))),
    CONSTRAINT "ai_content_prompt_versions_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."ai_content_prompt_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_provider_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "provider" "text" DEFAULT 'anthropic'::"text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "prompt_version_id" "uuid",
    "raw_response" "text",
    "failure_diagnostic" "text",
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_content_provider_requests_action_type_check" CHECK (("action_type" = 'creative_director_prompt'::"text")),
    CONSTRAINT "ai_content_provider_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_content_provider_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_session_references" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "uuid",
    "file_object_id" "uuid",
    "display_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "reference_order" integer NOT NULL,
    "inheritance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_content_session_references_reference_order_check" CHECK ((("reference_order" >= 1) AND ("reference_order" <= 10))),
    CONSTRAINT "ai_content_session_references_role_check" CHECK (("role" = ANY (ARRAY['composition_inspiration'::"text", 'food_truth'::"text", 'drink_truth'::"text", 'venue_truth'::"text", 'person_identity_truth'::"text", 'product_truth'::"text", 'wardrobe_styling'::"text", 'lighting_mood'::"text", 'pose_action'::"text", 'other_truth'::"text", 'general_reference'::"text"]))),
    CONSTRAINT "ai_content_session_references_source_type_check" CHECK (("source_type" = ANY (ARRAY['client_brain_asset'::"text", 'pinterest_inspiration'::"text", 'session_upload'::"text", 'generated_version'::"text", 'content_library'::"text"])))
);


ALTER TABLE "public"."ai_content_session_references" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Untitled generation'::"text" NOT NULL,
    "creative_request" "text" DEFAULT ''::"text" NOT NULL,
    "aspect_ratio" "text" DEFAULT '4:5'::"text" NOT NULL,
    "output_resolution" "text" DEFAULT '4K'::"text" NOT NULL,
    "correction_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_generation_id" "uuid",
    CONSTRAINT "ai_content_sessions_aspect_ratio_check" CHECK (("aspect_ratio" = ANY (ARRAY['1:1'::"text", '4:5'::"text", '3:2'::"text", '2:3'::"text", '16:9'::"text", '9:16'::"text"]))),
    CONSTRAINT "ai_content_sessions_output_resolution_check" CHECK (("output_resolution" = '4K'::"text")),
    CONSTRAINT "ai_content_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_content_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "generation_type" "text",
    "tool_used" "text",
    "prompt" "text",
    "output_url" "text",
    "status" "text" DEFAULT 'completed'::"text"
);


ALTER TABLE "public"."ai_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_accessories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "model_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "prompt_fragment" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_model_accessories_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_model_accessories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "asset_type" "text" NOT NULL,
    "image_url" "text",
    "storage_path" "text",
    "prompt_used" "text",
    "negative_prompt_used" "text",
    "generation_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version_number" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_model_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['front_face'::"text", 'forty_five_face'::"text", 'full_body_front'::"text", 'full_body_side'::"text", 'outfit'::"text", 'lifestyle'::"text", 'test_generation'::"text"]))),
    CONSTRAINT "ai_model_assets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'needs_regeneration'::"text"])))
);


ALTER TABLE "public"."ai_model_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_outfits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "outfit_name" "text" NOT NULL,
    "occasion" "text",
    "outfit_description" "text",
    "styling_notes" "text",
    "jewelry_notes" "text",
    "hair_notes" "text",
    "makeup_notes" "text",
    "shoes_notes" "text",
    "prompt_fragment" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "collection_style" "text",
    "mood" "text",
    "climate" "text",
    "garments" "text",
    "colour_palette" "text",
    "footwear" "text",
    "fashion_dna" "text",
    "allowed_silhouettes" "text",
    "allowed_materials" "text",
    "allowed_colour_families" "text",
    "footwear_direction" "text",
    CONSTRAINT "ai_model_outfits_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'generating'::"text", 'review'::"text", 'approved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_model_outfits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "prompt_type" "text" NOT NULL,
    "reference_slot" "text",
    "outfit_id" "uuid",
    "occasion" "text",
    "scene" "text",
    "camera_angle" "text",
    "lighting_style" "text",
    "format" "text",
    "realism_level" "text",
    "final_prompt" "text" NOT NULL,
    "negative_prompt" "text",
    "generation_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'saved'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_model_prompts_prompt_type_check" CHECK (("prompt_type" = ANY (ARRAY['base_reference'::"text", 'outfit_generation'::"text", 'lifestyle_scene'::"text", 'restaurant_campaign'::"text"]))),
    CONSTRAINT "ai_model_prompts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'saved'::"text", 'used'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_model_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "model_id" "uuid" NOT NULL,
    "related_model_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "relationship_label" "text",
    "future_use" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_model_relationships_not_self" CHECK (("model_id" <> "related_model_id")),
    CONSTRAINT "ai_model_relationships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_model_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "model_name" "text" NOT NULL,
    "model_role" "text",
    "age" integer,
    "gender" "text",
    "nationality" "text",
    "ethnicity_appearance_notes" "text",
    "hair_description" "text",
    "eye_description" "text",
    "skin_tone" "text",
    "body_type" "text",
    "personality" "text",
    "brand_role" "text",
    "approved_usage" "text",
    "restricted_usage" "text",
    "base_prompt" "text",
    "negative_prompt" "text",
    "realism_prompt" "text",
    "quality_prompt" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "height" "text",
    CONSTRAINT "ai_models_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'generating'::"text", 'review'::"text", 'approved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_photography" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "module_key" "text" DEFAULT 'ai_photography'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "purpose" "text",
    "standards" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "prompt_frameworks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_photography" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model" "text" NOT NULL,
    "route" "text" NOT NULL,
    "feature" "text",
    "client_id" "uuid",
    "request_id" "text",
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "cache_write_tokens" integer DEFAULT 0 NOT NULL,
    "cache_read_tokens" integer DEFAULT 0 NOT NULL,
    "images_count" integer DEFAULT 0 NOT NULL,
    "cost_usd_actual" numeric(12,8) DEFAULT 0 NOT NULL,
    "cost_usd_estimated" numeric(12,8),
    "estimated_vs_actual_delta" numeric(12,8),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "workspace_id" "uuid",
    "deliverable_id" "uuid",
    "name" "text" NOT NULL,
    "asset_type" "text",
    "storage_url" "text",
    "tags" "text"[],
    "notes" "text"
);


ALTER TABLE "public"."asset_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text",
    "file_type" "text",
    "asset_category" "text" NOT NULL,
    "file_size" integer,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extracted_summary" "text",
    "extraction_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "proposals_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "original_size_bytes" integer,
    "optimized_size_bytes" integer,
    "ai_preview_size_bytes" integer,
    "compression_ratio" double precision,
    "original_width" integer,
    "original_height" integer,
    "optimized_width" integer,
    "optimized_height" integer,
    "ai_preview_width" integer,
    "ai_preview_height" integer,
    "original_file_path" "text",
    "optimized_file_path" "text",
    "ai_preview_path" "text",
    "optimization_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "extraction_method" "text",
    "pages_processed" integer,
    "cost_usd" double precision,
    "source_quality" "text" DEFAULT 'original'::"text" NOT NULL,
    "superseded" boolean DEFAULT false NOT NULL,
    "superseded_by" "uuid",
    "metadata" "jsonb",
    "metadata_status" "text",
    "has_metadata" boolean DEFAULT false,
    "metadata_success_count" integer DEFAULT 0,
    "metadata_fail_count" integer DEFAULT 0
);


ALTER TABLE "public"."asset_uploads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asset_uploads"."source_quality" IS 'original = full-res file upload; compressed_preview = Telegram photo (auto-compressed)';



COMMENT ON COLUMN "public"."asset_uploads"."superseded" IS 'true when a higher-quality version of this asset has been uploaded';



COMMENT ON COLUMN "public"."asset_uploads"."superseded_by" IS 'references the upload record that supersedes this one';



COMMENT ON COLUMN "public"."asset_uploads"."metadata" IS 'Stores: tags[], mood, colors[], orientation, notes, content_pillar, confidence (1-5)';



CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "project_id" "uuid",
    "asset_type" "text",
    "file_url" "text",
    "tags" "text"[],
    "ai_ready" boolean DEFAULT false,
    "metadata" "jsonb"
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "audit_session_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "source_ref" "text",
    "confidence" integer DEFAULT 3 NOT NULL,
    "target_table" "text" DEFAULT 'client_knowledge'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb",
    "original_payload" "jsonb",
    "corrected_payload" "jsonb",
    "final_payload" "jsonb",
    "correction_note" "text",
    "promoted_record_id" "uuid",
    "review_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "audit_findings_confidence_check" CHECK ((("confidence" >= 1) AND ("confidence" <= 5)))
);


ALTER TABLE "public"."audit_findings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "uuid",
    "title" "text" NOT NULL,
    "audit_type" "text" DEFAULT 'external_research'::"text" NOT NULL,
    "mode" "text" DEFAULT 'lean'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "raw_content" "text",
    "source_file" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blueprint_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blueprint_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "industry" "text" NOT NULL,
    "section_index" integer NOT NULL,
    "section_title" "text" NOT NULL,
    "question_key" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "category" "text",
    "answer_raw" "text",
    "answer_corrected" "text",
    "answer_final" "text",
    "summary" "text",
    "essence" "text",
    "source" "text",
    "source_type" "text",
    "confidence" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'missing'::"text" NOT NULL,
    "is_client_facing" boolean DEFAULT true NOT NULL,
    "is_memory_eligible" boolean DEFAULT true NOT NULL,
    "promoted_to_table" "text",
    "promoted_record_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "notes" "text",
    "answer_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb",
    CONSTRAINT "blueprint_answers_confidence_check" CHECK ((("confidence" >= 1) AND ("confidence" <= 5)))
);


ALTER TABLE "public"."blueprint_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blueprint_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "industry" "text" NOT NULL,
    "section_index" integer NOT NULL,
    "section_title" "text" NOT NULL,
    "question_key" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "description" "text",
    "example_answer" "text",
    "is_required" boolean DEFAULT false NOT NULL,
    "is_client_facing" boolean DEFAULT true NOT NULL,
    "is_memory_eligible" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."blueprint_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brain_update_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_brain_id" "uuid",
    "asset_upload_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "question_key" "text" NOT NULL,
    "proposed_answer" "text" NOT NULL,
    "current_answer_snapshot" "text",
    "reasoning" "text",
    "confidence" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "brain_update_proposals_confidence_check" CHECK ((("confidence" >= 1) AND ("confidence" <= 5)))
);


ALTER TABLE "public"."brain_update_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_playbooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid",
    "client_id" "uuid",
    "section" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_full" "text" NOT NULL,
    "content_summary" "text",
    "content_essence" "text",
    "importance" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb",
    "applicable_platforms" "text"[] DEFAULT '{}'::"text"[],
    "applicable_deliverables" "text"[] DEFAULT '{}'::"text"[],
    "applicable_skills" "text"[] DEFAULT '{}'::"text"[],
    "applicable_agents" "uuid"[] DEFAULT '{}'::"uuid"[],
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "priority_weight" double precision DEFAULT 1.0
);


ALTER TABLE "public"."brand_playbooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_blueprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "industry" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "completion_pct" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."client_blueprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "question_key" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "answer" "text",
    "source" "text",
    "confidence" integer DEFAULT 3 NOT NULL,
    "calvin_notes" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    CONSTRAINT "client_brain_confidence_check" CHECK ((("confidence" >= 1) AND ("confidence" <= 5)))
);


ALTER TABLE "public"."client_brain" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_file_objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "preview_path" "text",
    "optimized_path" "text",
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "file_size_bytes" bigint,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_brain_file_objects" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_brain_file_objects" IS 'Reusable storage objects. A single binary may support multiple client-scoped Asset or Source records without copying the file.';



CREATE TABLE IF NOT EXISTS "public"."client_brain_pinterest_inspirations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "file_object_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "source_type" "text" DEFAULT 'pinterest'::"text" NOT NULL,
    "source_url" "text",
    "source_board" "text",
    "external_source_id" "text",
    "original_source_note" "text",
    "status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "creative_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "shot_scale" "text",
    "camera_angle" "text",
    "composition" "text",
    "human_presence" "text",
    "interaction" "text",
    "motion" "text",
    "lighting_style" "text",
    "background_style" "text",
    "creative_techniques" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "visual_summary" "text",
    "best_for" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "analysis_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "analysis_provider" "text",
    "analysis_model" "text",
    "analyzed_at" timestamp with time zone,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_individual_pin_upload" boolean DEFAULT false NOT NULL,
    "analysis_error" "text",
    CONSTRAINT "client_brain_pinterest_inspirations_analysis_state_check" CHECK (("analysis_state" = ANY (ARRAY['pending'::"text", 'analyzed'::"text", 'failed'::"text"]))),
    CONSTRAINT "client_brain_pinterest_inspirations_analyzed_metadata_complete_" CHECK ((("analysis_state" <> 'analyzed'::"text") OR (("cardinality"("creative_categories") > 0) AND ("shot_scale" IS NOT NULL) AND ("camera_angle" IS NOT NULL) AND ("composition" IS NOT NULL) AND ("human_presence" IS NOT NULL) AND ("interaction" IS NOT NULL) AND ("motion" IS NOT NULL) AND ("lighting_style" IS NOT NULL) AND ("cardinality"("creative_techniques") > 0) AND (NULLIF("btrim"(COALESCE("visual_summary", ''::"text")), ''::"text") IS NOT NULL) AND ("cardinality"("best_for") > 0)))),
    CONSTRAINT "client_brain_pinterest_inspirations_source_type_check" CHECK (("source_type" = ANY (ARRAY['pinterest'::"text", 'manual_external'::"text"]))),
    CONSTRAINT "client_brain_pinterest_inspirations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'needs_review'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."client_brain_pinterest_inspirations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_asset_ingestion_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "asset_category" "text" NOT NULL,
    "state" "text" DEFAULT 'draft'::"text" NOT NULL,
    "display_name" "text",
    "menu_record_id" "uuid",
    "menu_item_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_output" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "final_asset_id" "uuid",
    "cleanup_attempts" integer DEFAULT 0 NOT NULL,
    "cleanup_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_asset_ingestion_drafts_asset_category_check" CHECK (("asset_category" = ANY (ARRAY['food'::"text", 'drinks'::"text", 'interiors'::"text", 'exteriors'::"text", 'venue_items'::"text", 'staff'::"text"]))),
    CONSTRAINT "client_brain_v2_asset_ingestion_drafts_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'ready_for_review'::"text", 'finalization_failed'::"text", 'finalized'::"text", 'cleanup_pending'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_asset_ingestion_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_asset_ingestion_temp_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "draft_id" "uuid" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "width" integer,
    "height" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "file_kind" "text" NOT NULL,
    "cleanup_state" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_asset_ingestion_temp_file_file_size_bytes_check" CHECK (("file_size_bytes" > 0)),
    CONSTRAINT "client_brain_v2_asset_ingestion_temp_files_cleanup_state_check" CHECK (("cleanup_state" = ANY (ARRAY['active'::"text", 'cleanup_pending'::"text", 'cleaned'::"text"]))),
    CONSTRAINT "client_brain_v2_asset_ingestion_temp_files_file_kind_check" CHECK (("file_kind" = ANY (ARRAY['raw_reference'::"text", 'original_venue'::"text", 'generated_preview'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_asset_ingestion_temp_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_commercial_details" (
    "record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "object_type" "text" NOT NULL,
    "price_amount" numeric(12,2),
    "currency" "text",
    "pricing_mechanism" "text",
    "availability" "text",
    "schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "restrictions" "text",
    "capacity" integer,
    "booking_requirements" "text",
    "ingredients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allergens" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "key_selling_points" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_commercial_details_object_type_check" CHECK (("object_type" = ANY (ARRAY['product'::"text", 'collection'::"text", 'offer'::"text", 'experience_event'::"text", 'package'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_commercial_details" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_brain_v2_commercial_details" IS 'Structured commercial details for Product, Collection, Offer, Experience/Event, and Package records.';



CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "from_record_id" "uuid" NOT NULL,
    "to_record_id" "uuid" NOT NULL,
    "relation_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_links_check" CHECK (("from_record_id" <> "to_record_id"))
);


ALTER TABLE "public"."client_brain_v2_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_brain_v2_links" IS 'Normalized same-client relationships between v2 records, including provenance and commercial relationships.';



CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "menu_record_id" "uuid" NOT NULL,
    "source_record_id" "uuid" NOT NULL,
    "source_file_object_id" "uuid",
    "item_kind" "text" DEFAULT 'item'::"text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "menu_section" "text",
    "description" "text",
    "price" numeric(12,2),
    "currency" "text",
    "listed_ingredients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allergens" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "dietary_markers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "raw_source_text" "text",
    "source_page" smallint,
    "source_document_version" "text" NOT NULL,
    "source_status" "text" DEFAULT 'current'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activation_record_id" "uuid",
    CONSTRAINT "client_brain_v2_menu_items_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['item'::"text", 'offer_component'::"text", 'service_rule'::"text"]))),
    CONSTRAINT "client_brain_v2_menu_items_source_status_check" CHECK (("source_status" = ANY (ARRAY['current'::"text", 'historical'::"text", 'superseded'::"text", 'conflicting'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_record_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "file_object_id" "uuid" NOT NULL,
    "semantic_role" "text" NOT NULL,
    "approval_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_record_files_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['draft'::"text", 'needs_review'::"text", 'approved'::"text", 'restricted'::"text", 'archived'::"text"]))),
    CONSTRAINT "client_brain_v2_record_files_semantic_role_check" CHECK (("semantic_role" = ANY (ARRAY['truth_reference'::"text", 'creative_reference'::"text", 'approved_marketing_asset'::"text", 'generated_asset'::"text", 'raw_asset'::"text", 'archived_asset'::"text", 'source_document'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_record_files" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_brain_v2_record_files" IS 'Client-scoped semantic assignment of reusable file objects to Client Brain records.';



CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_record_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "version_snapshot" "jsonb" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_brain_v2_record_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_brain_v2_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "stable_key" "text" NOT NULL,
    "top_section" "text" NOT NULL,
    "subsection" "text" NOT NULL,
    "record_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "content" "text",
    "knowledge_class" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "confidence" numeric(4,3),
    "priority" smallint DEFAULT 3 NOT NULL,
    "effective_date" "date",
    "last_verified_at" timestamp with time zone,
    "valid_until" "date",
    "review_at" "date",
    "source_type" "text",
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "superseded_by_id" "uuid",
    "legacy_client_knowledge_id" "uuid",
    "legacy_client_brain_id" "uuid",
    "legacy_asset_upload_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_brain_v2_records_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "client_brain_v2_records_knowledge_class_check" CHECK (("knowledge_class" = ANY (ARRAY['stable'::"text", 'dynamic'::"text", 'operational'::"text", 'temporal'::"text", 'commercial'::"text", 'asset'::"text", 'brand_guideline'::"text", 'source'::"text", 'learning'::"text", 'knowledge_gap'::"text"]))),
    CONSTRAINT "client_brain_v2_records_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 5))),
    CONSTRAINT "client_brain_v2_records_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'needs_review'::"text", 'approved'::"text", 'active'::"text", 'resolved'::"text", 'current'::"text", 'unverified'::"text", 'conflicting'::"text", 'contradicted'::"text", 'superseded'::"text", 'historical'::"text", 'restricted'::"text", 'archived'::"text", 'rejected'::"text"]))),
    CONSTRAINT "client_brain_v2_records_top_section_check" CHECK (("top_section" = ANY (ARRAY['intelligence'::"text", 'products_offers'::"text", 'assets'::"text", 'brand_guidelines'::"text", 'sources'::"text", 'learnings'::"text"])))
);


ALTER TABLE "public"."client_brain_v2_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_brain_v2_records" IS 'Canonical, client-scoped Hospitality Client Brain v2 records across Intelligence, Products & Offers, Assets, Brand Guidelines, Sources, and Learnings.';



CREATE TABLE IF NOT EXISTS "public"."client_content_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "client_content_month_id" "uuid" NOT NULL,
    "content_type" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "source_reference" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" bigint,
    "width" integer,
    "height" integer,
    "final_state" "text" DEFAULT 'final'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_session_id" "uuid",
    "source_generation_id" "uuid",
    "source_file_object_id" "uuid",
    CONSTRAINT "client_content_items_check" CHECK (((("storage_bucket" IS NULL) AND ("storage_path" IS NULL)) OR (("storage_bucket" IS NOT NULL) AND ("storage_path" IS NOT NULL)))),
    CONSTRAINT "client_content_items_content_type_check" CHECK (("content_type" = ANY (ARRAY['feed'::"text", 'carousel'::"text", 'reel'::"text", 'story'::"text", 'graphic'::"text", 'ai_photography'::"text", 'video'::"text", 'other'::"text"]))),
    CONSTRAINT "client_content_items_final_state_check" CHECK (("final_state" = ANY (ARRAY['draft'::"text", 'final'::"text", 'archived'::"text"]))),
    CONSTRAINT "client_content_items_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'document'::"text", 'other'::"text"]))),
    CONSTRAINT "client_content_items_source_check" CHECK (("source" = ANY (ARRAY['historical_upload'::"text", 'ai_content'::"text", 'social_publishing'::"text", 'external_reference'::"text"])))
);


ALTER TABLE "public"."client_content_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_content_months" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "month_start" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_content_months_month_start_check" CHECK ((("date_trunc"('month'::"text", ("month_start")::timestamp without time zone))::"date" = "month_start"))
);


ALTER TABLE "public"."client_content_months" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_claim_evidence" (
    "claim_id" "uuid" NOT NULL,
    "evidence_id" "uuid" NOT NULL
);


ALTER TABLE "public"."client_intelligence_claim_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "claim" "text" NOT NULL,
    "interpretation" "text",
    "confidence" "text" NOT NULL,
    "confidence_reason" "text" NOT NULL,
    "truth_status" "text" NOT NULL,
    "change_status" "text" DEFAULT 'new'::"text" NOT NULL,
    "conflict_record_id" "uuid",
    "last_checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_at" timestamp with time zone,
    "promotion_record_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_claims_category_check" CHECK (("category" = ANY (ARRAY['brand'::"text", 'reputation'::"text", 'audience'::"text", 'competitor'::"text", 'market'::"text", 'social'::"text", 'opportunity'::"text"]))),
    CONSTRAINT "client_intelligence_claims_change_status_check" CHECK (("change_status" = ANY (ARRAY['new'::"text", 'changed'::"text", 'unchanged'::"text", 'conflict'::"text", 'stale'::"text"]))),
    CONSTRAINT "client_intelligence_claims_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "client_intelligence_claims_truth_status_check" CHECK (("truth_status" = ANY (ARRAY['verified'::"text", 'user_confirmed'::"text", 'strong_external_evidence'::"text", 'hypothesis'::"text", 'needs_confirmation'::"text"])))
);


ALTER TABLE "public"."client_intelligence_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_competitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "website_url" "text",
    "location_text" "text",
    "relationship" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "latest_scan_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_competitors_relationship_check" CHECK (("relationship" = ANY (ARRAY['proposed'::"text", 'tracked'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."client_intelligence_competitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_discoveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "research_source_id" "uuid",
    "area" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text",
    "excerpt" "text",
    "classification" "text" NOT NULL,
    "admitted" boolean DEFAULT false NOT NULL,
    "rejection_reason" "text",
    "source_type" "text" NOT NULL,
    "source_quality" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_discoveries_classification_check" CHECK (("classification" = ANY (ARRAY['CLIENT_OFFICIAL'::"text", 'CLIENT_CONFIRMED_EXTERNAL'::"text", 'REVIEW_PLATFORM_CLIENT_MATCH'::"text", 'COMPETITOR'::"text", 'MARKET'::"text", 'RELATED_ENTITY_MISMATCH'::"text", 'AMBIGUOUS'::"text", 'UNRELATED'::"text"]))),
    CONSTRAINT "client_intelligence_discoveries_source_quality_check" CHECK (("source_quality" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text", 'tier_4'::"text"])))
);


ALTER TABLE "public"."client_intelligence_discoveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "research_source_id" "uuid",
    "source_type" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text",
    "excerpt" "text",
    "normalized_evidence" "text",
    "source_quality" "text" NOT NULL,
    "published_at" timestamp with time zone,
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "freshness" "text" DEFAULT 'current'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_evidence_freshness_check" CHECK (("freshness" = ANY (ARRAY['current'::"text", 'aging'::"text", 'stale'::"text", 'unknown'::"text"]))),
    CONSTRAINT "client_intelligence_evidence_source_quality_check" CHECK (("source_quality" = ANY (ARRAY['official'::"text", 'government'::"text", 'reputable'::"text", 'review_platform'::"text", 'competitor'::"text", 'directory'::"text", 'low'::"text", 'tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text", 'tier_4'::"text"]))),
    CONSTRAINT "client_intelligence_evidence_source_type_check" CHECK (("source_type" = ANY (ARRAY['official_website'::"text", 'official_social'::"text", 'reviews'::"text", 'market'::"text", 'competitor'::"text", 'press'::"text", 'directory'::"text", 'other'::"text", 'official_client'::"text", 'official_competitor'::"text", 'government'::"text", 'market_research'::"text", 'review_platform'::"text", 'social'::"text"])))
);


ALTER TABLE "public"."client_intelligence_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "observation" "text" NOT NULL,
    "why_it_matters" "text",
    "hypothesis" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "recommended_action" "text",
    "metric_to_watch" "text",
    "data_needed" "text",
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_opportunities_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "client_intelligence_opportunities_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'tracking'::"text", 'dismissed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."client_intelligence_opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_opportunity_evidence" (
    "opportunity_id" "uuid" NOT NULL,
    "evidence_id" "uuid" NOT NULL
);


ALTER TABLE "public"."client_intelligence_opportunity_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_public_discrepancies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "evidence_id" "uuid",
    "category" "text" NOT NULL,
    "public_value" "text" NOT NULL,
    "verified_value" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "status" "text" DEFAULT 'needs_attention'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_public_discrepancies_category_check" CHECK (("category" = ANY (ARRAY['contact'::"text", 'address'::"text", 'opening_hours'::"text", 'menu'::"text", 'offer'::"text", 'service'::"text", 'booking_link'::"text", 'social_handle'::"text", 'other'::"text"]))),
    CONSTRAINT "client_intelligence_public_discrepancies_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "client_intelligence_public_discrepancies_status_check" CHECK (("status" = ANY (ARRAY['needs_attention'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."client_intelligence_public_discrepancies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_scan_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scan_id" "uuid" NOT NULL,
    "step_key" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempt_count" smallint DEFAULT 0 NOT NULL,
    "provider_run_id" "uuid",
    "input_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_intelligence_scan_steps_attempt_count_check" CHECK (("attempt_count" <= 1)),
    CONSTRAINT "client_intelligence_scan_steps_provider_check" CHECK (("provider" = ANY (ARRAY['tavily'::"text", 'anthropic'::"text"]))),
    CONSTRAINT "client_intelligence_scan_steps_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."client_intelligence_scan_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intelligence_scans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "source_inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_budget_usd" numeric(10,4) DEFAULT 2 NOT NULL,
    "max_provider_calls" smallint DEFAULT 5 NOT NULL,
    "provider_calls_used" smallint DEFAULT 0 NOT NULL,
    "estimated_cost_usd" numeric(10,4) DEFAULT 0 NOT NULL,
    "actual_cost_usd" numeric(10,4),
    "blocked_reason" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_id" "uuid",
    "max_tavily_calls" smallint DEFAULT 8 NOT NULL,
    "max_sonnet_calls" smallint DEFAULT 3 NOT NULL,
    "tavily_calls_used" smallint DEFAULT 0 NOT NULL,
    "sonnet_calls_used" smallint DEFAULT 0 NOT NULL,
    "max_research_depth" smallint DEFAULT 1 NOT NULL,
    "max_sources" smallint DEFAULT 32 NOT NULL,
    "cancellation_requested_at" timestamp with time zone,
    "discovered_result_count" integer DEFAULT 0 NOT NULL,
    "admitted_evidence_count" integer DEFAULT 0 NOT NULL,
    "rejected_result_count" integer DEFAULT 0 NOT NULL,
    "ambiguous_result_count" integer DEFAULT 0 NOT NULL,
    "duplicate_result_count" integer DEFAULT 0 NOT NULL,
    "entity_resolution_version" "text",
    CONSTRAINT "client_intelligence_scans_check" CHECK (("provider_calls_used" <= "max_provider_calls")),
    CONSTRAINT "client_intelligence_scans_estimated_cost_usd_check" CHECK (("estimated_cost_usd" >= (0)::numeric)),
    CONSTRAINT "client_intelligence_scans_max_provider_calls_check" CHECK ((("max_provider_calls" >= 0) AND ("max_provider_calls" <= 12))),
    CONSTRAINT "client_intelligence_scans_max_research_depth_check" CHECK ((("max_research_depth" >= 1) AND ("max_research_depth" <= 2))),
    CONSTRAINT "client_intelligence_scans_max_sonnet_calls_check" CHECK ((("max_sonnet_calls" >= 0) AND ("max_sonnet_calls" <= 3))),
    CONSTRAINT "client_intelligence_scans_max_sources_check" CHECK ((("max_sources" >= 1) AND ("max_sources" <= 60))),
    CONSTRAINT "client_intelligence_scans_max_tavily_calls_check" CHECK ((("max_tavily_calls" >= 0) AND ("max_tavily_calls" <= 12))),
    CONSTRAINT "client_intelligence_scans_provider_calls_used_check" CHECK (("provider_calls_used" >= 0)),
    CONSTRAINT "client_intelligence_scans_request_budget_usd_check" CHECK ((("request_budget_usd" >= (0)::numeric) AND ("request_budget_usd" <= (25)::numeric))),
    CONSTRAINT "client_intelligence_scans_sonnet_calls_used_check" CHECK (("sonnet_calls_used" >= 0)),
    CONSTRAINT "client_intelligence_scans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'planned'::"text", 'authorized'::"text", 'researching'::"text", 'synthesizing'::"text", 'completed'::"text", 'partial'::"text", 'failed'::"text", 'cancelled'::"text", 'blocked'::"text"]))),
    CONSTRAINT "client_intelligence_scans_tavily_calls_used_check" CHECK (("tavily_calls_used" >= 0))
);


ALTER TABLE "public"."client_intelligence_scans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_knowledge" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "importance" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."client_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_secure_credential_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "credential_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_secure_credential_audit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'revealed'::"text", 'copied'::"text", 'archived'::"text", 'deleted'::"text", 'verified'::"text"])))
);


ALTER TABLE "public"."client_secure_credential_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_secure_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "custom_service_name" "text",
    "login_url" "text",
    "username" "text",
    "email" "text",
    "secret_ciphertext" "text",
    "account_id" "text",
    "two_factor_enabled" boolean DEFAULT false NOT NULL,
    "recovery_note" "text",
    "owner_name" "text",
    "notes" "text",
    "last_verified_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_secure_credentials_service_name_check" CHECK (("length"(TRIM(BOTH FROM "service_name")) > 0)),
    CONSTRAINT "client_secure_credentials_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'needs_review'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."client_secure_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "industry" "text",
    "status" "text" DEFAULT 'active'::"text",
    "primary_contact" "text",
    "instagram" "text",
    "website" "text",
    "notes" "text",
    "brain_architecture_version" "text" DEFAULT 'legacy_v1'::"text" NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."command_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "command_id" "uuid",
    "assigned_agent" "text",
    "plan_title" "text",
    "plan_summary" "text",
    "steps" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."command_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_product_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "related_product_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_product_relationships_check" CHECK (("product_id" <> "related_product_id")),
    CONSTRAINT "commercial_product_relationships_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['requires'::"text", 'enhances'::"text", 'replaces'::"text", 'excludes'::"text"])))
);


ALTER TABLE "public"."commercial_product_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_product_roadmap_phases" (
    "product_id" "uuid" NOT NULL,
    "roadmap_phase_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'supports'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_product_roadmap_phases_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['supports'::"text", 'candidate_for'::"text"])))
);


ALTER TABLE "public"."commercial_product_roadmap_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "catalog_type" "text" NOT NULL,
    "family" "text",
    "summary" "text" NOT NULL,
    "price_amount" numeric(12,2),
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "billing_unit" "text" DEFAULT 'month'::"text" NOT NULL,
    "pricing_model" "text" NOT NULL,
    "minimum_commitment_months" integer,
    "requires_standard" boolean DEFAULT false NOT NULL,
    "max_eligible" boolean DEFAULT false NOT NULL,
    "service_state" "text" NOT NULL,
    "availability_note" "text",
    "scope_notes" "text",
    "includes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "requirements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "exclusions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_products_billing_unit_check" CHECK (("billing_unit" = ANY (ARRAY['month'::"text", 'video'::"text", 'custom'::"text"]))),
    CONSTRAINT "commercial_products_catalog_type_check" CHECK (("catalog_type" = ANY (ARRAY['package'::"text", 'addon'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "commercial_products_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "commercial_products_exclusions_check" CHECK (("jsonb_typeof"("exclusions") = 'array'::"text")),
    CONSTRAINT "commercial_products_includes_check" CHECK (("jsonb_typeof"("includes") = 'array'::"text")),
    CONSTRAINT "commercial_products_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "commercial_products_minimum_commitment_months_check" CHECK ((("minimum_commitment_months" IS NULL) OR ("minimum_commitment_months" >= 0))),
    CONSTRAINT "commercial_products_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 160))),
    CONSTRAINT "commercial_products_price_amount_check" CHECK ((("price_amount" IS NULL) OR ("price_amount" >= (0)::numeric))),
    CONSTRAINT "commercial_products_pricing_model_check" CHECK (("pricing_model" = ANY (ARRAY['fixed'::"text", 'working'::"text", 'calculated'::"text", 'custom'::"text"]))),
    CONSTRAINT "commercial_products_requirements_check" CHECK (("jsonb_typeof"("requirements") = 'array'::"text")),
    CONSTRAINT "commercial_products_service_state_check" CHECK (("service_state" = ANY (ARRAY['available'::"text", 'hybrid'::"text", 'planned'::"text"]))),
    CONSTRAINT "commercial_products_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "commercial_products_summary_check" CHECK ((("char_length"("summary") >= 8) AND ("char_length"("summary") <= 1000)))
);


ALTER TABLE "public"."commercial_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_recommended_combination_items" (
    "combination_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."commercial_recommended_combination_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_recommended_combinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_recommended_combinations_description_check" CHECK ((("char_length"("description") >= 8) AND ("char_length"("description") <= 1000))),
    CONSTRAINT "commercial_recommended_combinations_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 160))),
    CONSTRAINT "commercial_recommended_combinations_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."commercial_recommended_combinations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."context_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_run_id" "uuid",
    "sandbox_run_id" "uuid",
    "agent_id" "uuid",
    "client_id" "uuid",
    "monthly_cycle_id" "uuid",
    "sections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_tokens_used" integer,
    "total_budget" integer,
    "budget_utilization" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("total_budget" > 0) THEN "round"(((("total_tokens_used")::numeric / ("total_budget")::numeric) * (100)::numeric), 1)
    ELSE NULL::numeric
END) STORED,
    "context_score" integer,
    "outcome" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."context_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."copy_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "workspace_id" "uuid",
    "deliverable_id" "uuid",
    "copy_type" "text" NOT NULL,
    "prompt" "text",
    "output" "text",
    "status" "text" DEFAULT 'not_started'::"text"
);


ALTER TABLE "public"."copy_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "display_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "phone_country_code" "text",
    "company" "text",
    "job_title" "text",
    "date_of_birth" "date",
    "nationality" "text",
    "preferred_language" "text",
    "notes" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "external_ids" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "marketing_consent_email" boolean,
    "marketing_consent_sms" boolean,
    "marketing_consent_whatsapp" boolean,
    "consent_updated_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "crm_contacts_email_shape" CHECK ((("email" IS NULL) OR ("email" ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::"text"))),
    CONSTRAINT "crm_contacts_name_required" CHECK (((NULLIF("btrim"("display_name"), ''::"text") IS NOT NULL) OR (NULLIF("btrim"("first_name"), ''::"text") IS NOT NULL))),
    CONSTRAINT "crm_contacts_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'reservation'::"text", 'event'::"text", 'website'::"text", 'instagram'::"text", 'walk_in'::"text", 'sevenrooms'::"text", 'other'::"text"]))),
    CONSTRAINT "crm_contacts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."crm_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."crm_contacts" IS 'Client-scoped hospitality CRM contacts. Reservations, visits, orders, preferences, tags, and sync history belong in separate relational tables.';



COMMENT ON COLUMN "public"."crm_contacts"."external_ids" IS 'Provider identifiers keyed by provider, reserved for future integrations such as SevenRooms.';



COMMENT ON COLUMN "public"."crm_contacts"."metadata" IS 'Non-core integration metadata only; never use for reservation, visit, order, or spend history.';



CREATE OR REPLACE VIEW "public"."crm_contact_data_quality" WITH ("security_invoker"='true') AS
 WITH "active_contacts" AS (
         SELECT "crm_contacts"."client_id",
            "crm_contacts"."email",
            "crm_contacts"."phone"
           FROM "public"."crm_contacts"
          WHERE ("crm_contacts"."deleted_at" IS NULL)
        ), "duplicate_groups" AS (
         SELECT "groups"."client_id",
            "count"(*) AS "duplicate_group_count"
           FROM ( SELECT "active_contacts"."client_id",
                    'email'::"text" AS "match_type",
                    "active_contacts"."email" AS "match_value"
                   FROM "active_contacts"
                  WHERE ("active_contacts"."email" IS NOT NULL)
                  GROUP BY "active_contacts"."client_id", "active_contacts"."email"
                 HAVING ("count"(*) > 1)
                UNION ALL
                 SELECT "active_contacts"."client_id",
                    'phone'::"text" AS "match_type",
                    "active_contacts"."phone" AS "match_value"
                   FROM "active_contacts"
                  WHERE ("active_contacts"."phone" IS NOT NULL)
                  GROUP BY "active_contacts"."client_id", "active_contacts"."phone"
                 HAVING ("count"(*) > 1)) "groups"
          GROUP BY "groups"."client_id"
        )
 SELECT "contacts"."client_id",
    "count"(*) AS "total_guests",
    "count"(*) FILTER (WHERE ("contacts"."email" IS NOT NULL)) AS "guests_with_email",
    "count"(*) FILTER (WHERE ("contacts"."phone" IS NOT NULL)) AS "guests_with_phone",
    "count"(*) FILTER (WHERE (("contacts"."email" IS NULL) OR ("contacts"."phone" IS NULL))) AS "incomplete_profiles",
    "count"(*) FILTER (WHERE ("contacts"."email" IS NULL)) AS "missing_email",
    "count"(*) FILTER (WHERE ("contacts"."phone" IS NULL)) AS "missing_phone",
    "count"(*) FILTER (WHERE (("contacts"."email" IS NULL) AND ("contacts"."phone" IS NULL))) AS "missing_both",
    COALESCE("max"("duplicate_groups"."duplicate_group_count"), (0)::bigint) AS "possible_duplicate_groups"
   FROM ("active_contacts" "contacts"
     LEFT JOIN "duplicate_groups" ON (("duplicate_groups"."client_id" = "contacts"."client_id")))
  GROUP BY "contacts"."client_id";


ALTER VIEW "public"."crm_contact_data_quality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliverable_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deliverable_id" "uuid",
    "actor" "text" NOT NULL,
    "action" "text" NOT NULL,
    "summary" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."deliverable_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliverable_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deliverable_id" "uuid",
    "name" "text" NOT NULL,
    "asset_type" "text",
    "file_url" "text",
    "thumbnail_url" "text",
    "prompt" "text",
    "model_used" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."deliverable_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliverable_copy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deliverable_id" "uuid",
    "copy_type" "text" NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "tone" "text",
    "platform" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."deliverable_copy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliverable_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deliverable_id" "uuid",
    "revision_type" "text",
    "requested_by" "text",
    "note" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."deliverable_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliverables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "workspace_id" "uuid",
    "monthly_cycle_id" "uuid",
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "platform" "text",
    "status" "text" DEFAULT 'not_started'::"text",
    "approval_status" "text" DEFAULT 'not_started'::"text",
    "description" "text",
    "content_type" "text",
    "priority" "text",
    "due_date" "date",
    "assigned_agent" "text",
    "position" integer DEFAULT 0
);


ALTER TABLE "public"."deliverables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_id" "uuid",
    "sandbox_run_id" "uuid",
    "agent_id" "uuid",
    "skill_id" "uuid",
    "model_pricing_id" "uuid",
    "queue_type" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "prompt_snapshot" "text",
    "output_snapshot" "text",
    "error_message" "text",
    "estimated_input_tokens" integer,
    "estimated_output_tokens" integer,
    "estimated_cost" numeric,
    "metadata" "jsonb",
    "command_id" "uuid",
    "via_sandbox" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "execution_queue_sandbox_required" CHECK ((("via_sandbox" = false) OR ("sandbox_run_id" IS NOT NULL)))
);


ALTER TABLE "public"."execution_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_queue_id" "uuid" NOT NULL,
    "reviewer_agent_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "score" integer,
    "strengths" "text",
    "weaknesses" "text",
    "revision_notes" "text",
    "approval_notes" "text",
    "approved" boolean DEFAULT false NOT NULL,
    "requires_revision" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."execution_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_queue_id" "uuid",
    "sandbox_run_id" "uuid",
    "agent_id" "uuid",
    "model_pricing_id" "uuid",
    "provider" "text",
    "model" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "prompt_used" "text",
    "raw_response" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "total_cost" numeric,
    "duration_ms" integer,
    "error_message" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."execution_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_model_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "model_id" "uuid" NOT NULL,
    "related_model_id" "uuid" NOT NULL,
    "relationship_type" "text",
    "relationship_strength" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "guest_model_relationships_not_self" CHECK (("model_id" <> "related_model_id"))
);


ALTER TABLE "public"."guest_model_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text",
    "ethnicity" "text",
    "age_range" "text",
    "profession" "text",
    "personality" "text",
    "relationship_type" "text",
    "status" "text",
    "do_not_modify" boolean DEFAULT false,
    "model_references" "jsonb" DEFAULT '{}'::"jsonb",
    "outfit_sets" "jsonb" DEFAULT '{}'::"jsonb",
    "accessories" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guest_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_cost_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor" "text" NOT NULL,
    "plan_name" "text",
    "category" "text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "billing_cycle" "text" NOT NULL,
    "start_date" "date",
    "next_renewal_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "allocation_scope" "text" DEFAULT 'agency_wide'::"text" NOT NULL,
    "client_id" "uuid",
    "notes" "text",
    "documentation_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_key" "text",
    "source_provenance" "text",
    "billing_day" smallint,
    "billing_date_known" boolean DEFAULT true NOT NULL,
    "base_amount" numeric(12,2),
    "discount_percent" numeric(6,3),
    "discount_temporary" boolean DEFAULT false NOT NULL,
    "discount_end_date" "date",
    "fx_snapshot" "jsonb",
    CONSTRAINT "jarvis_cost_subscriptions_allocation_scope_check" CHECK (("allocation_scope" = ANY (ARRAY['agency_wide'::"text", 'client_specific'::"text"]))),
    CONSTRAINT "jarvis_cost_subscriptions_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_cost_subscriptions_base_amount_check" CHECK ((("base_amount" IS NULL) OR ("base_amount" >= (0)::numeric))),
    CONSTRAINT "jarvis_cost_subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"]))),
    CONSTRAINT "jarvis_cost_subscriptions_billing_day_check" CHECK ((("billing_day" >= 1) AND ("billing_day" <= 31))),
    CONSTRAINT "jarvis_cost_subscriptions_category_check" CHECK (("category" = ANY (ARRAY['ai'::"text", 'infrastructure'::"text", 'development'::"text", 'research'::"text", 'creative'::"text", 'social'::"text", 'analytics'::"text", 'communication'::"text", 'other'::"text"]))),
    CONSTRAINT "jarvis_cost_subscriptions_check" CHECK (((("allocation_scope" = 'agency_wide'::"text") AND ("client_id" IS NULL)) OR (("allocation_scope" = 'client_specific'::"text") AND ("client_id" IS NOT NULL)))),
    CONSTRAINT "jarvis_cost_subscriptions_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_cost_subscriptions_discount_percent_check" CHECK ((("discount_percent" IS NULL) OR (("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric)))),
    CONSTRAINT "jarvis_cost_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "jarvis_cost_subscriptions_vendor_check" CHECK ((("char_length"("vendor") >= 1) AND ("char_length"("vendor") <= 160)))
);


ALTER TABLE "public"."jarvis_cost_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_type" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_activity_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'deleted'::"text", 'activated'::"text", 'won'::"text", 'lost'::"text", 'sent'::"text", 'paid'::"text", 'attachment_added'::"text", 'attachment_removed'::"text", 'allocated'::"text", 'imported'::"text", 'confirmed'::"text", 'matched'::"text", 'reconciled'::"text"]))),
    CONSTRAINT "jarvis_finance_activity_record_type_check" CHECK (("record_type" = ANY (ARRAY['income'::"text", 'expense'::"text", 'subscription'::"text", 'settings'::"text", 'upcoming_revenue'::"text", 'pipeline'::"text", 'owner_draw'::"text", 'personal_expense'::"text", 'invoice'::"text", 'invoice_attachment'::"text", 'investment'::"text", 'capital_policy'::"text", 'bank_statement'::"text", 'bank_transaction'::"text", 'vendor_rule'::"text", 'bank_allocation'::"text"])))
);


ALTER TABLE "public"."jarvis_finance_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_bank_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bank_transaction_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "allocated_amount" numeric(14,2) NOT NULL,
    "currency" "text" NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmation_source" "text" DEFAULT 'user_confirmed'::"text" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actual_native_amount" numeric(14,2),
    "variance_amount" numeric(14,2),
    CONSTRAINT "jarvis_finance_bank_allocations_allocated_amount_check" CHECK (("allocated_amount" > (0)::numeric)),
    CONSTRAINT "jarvis_finance_bank_allocations_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_bank_allocations_target_type_check" CHECK (("target_type" = ANY (ARRAY['invoice'::"text", 'expense'::"text", 'owner_draw'::"text", 'personal_expense'::"text", 'transfer'::"text"])))
);


ALTER TABLE "public"."jarvis_finance_bank_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_bank_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "account_label" "text" NOT NULL,
    "statement_start_date" "date",
    "statement_end_date" "date",
    "original_filename" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'finance-statements'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "currency" "text",
    "opening_balance" numeric(14,2),
    "closing_balance" numeric(14,2),
    "parser" "text" NOT NULL,
    "status" "text" DEFAULT 'review'::"text" NOT NULL,
    "parser_diagnostics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_bank_statements_account_label_check" CHECK ((("char_length"("account_label") >= 1) AND ("char_length"("account_label") <= 180))),
    CONSTRAINT "jarvis_finance_bank_statements_byte_size_check" CHECK ((("byte_size" > 0) AND ("byte_size" <= 20971520))),
    CONSTRAINT "jarvis_finance_bank_statements_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['text/csv'::"text", 'application/pdf'::"text", 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::"text"]))),
    CONSTRAINT "jarvis_finance_bank_statements_original_filename_check" CHECK ((("char_length"("original_filename") >= 1) AND ("char_length"("original_filename") <= 255))),
    CONSTRAINT "jarvis_finance_bank_statements_status_check" CHECK (("status" = ANY (ARRAY['parsing'::"text", 'review'::"text", 'reconciled'::"text", 'failed'::"text"]))),
    CONSTRAINT "jarvis_finance_bank_statements_storage_bucket_check" CHECK (("storage_bucket" = 'finance-statements'::"text"))
);


ALTER TABLE "public"."jarvis_finance_bank_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "statement_id" "uuid" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "posting_date" "date",
    "description" "text" NOT NULL,
    "merchant" "text",
    "debit" numeric(14,2) DEFAULT 0 NOT NULL,
    "credit" numeric(14,2) DEFAULT 0 NOT NULL,
    "signed_amount" numeric(14,2) NOT NULL,
    "currency" "text" NOT NULL,
    "reference" "text",
    "account_label" "text" NOT NULL,
    "identity_fingerprint" "text" NOT NULL,
    "raw_source" "text" NOT NULL,
    "scope" "text" DEFAULT 'unresolved'::"text" NOT NULL,
    "category" "text",
    "classification_status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "confidence" "text" DEFAULT 'low'::"text" NOT NULL,
    "classification_source" "text" DEFAULT 'parser'::"text" NOT NULL,
    "classification_reason" "text",
    "matched_record_type" "text",
    "matched_record_id" "uuid",
    "confirmed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_bank_transactions_check" CHECK ((("debit" = (0)::numeric) <> ("credit" = (0)::numeric))),
    CONSTRAINT "jarvis_finance_bank_transactions_check1" CHECK ((("signed_amount" < (0)::numeric) = ("debit" > (0)::numeric))),
    CONSTRAINT "jarvis_finance_bank_transactions_classification_status_check" CHECK (("classification_status" = ANY (ARRAY['needs_review'::"text", 'suggested'::"text", 'confirmed'::"text", 'reconciled'::"text", 'excluded'::"text", 'duplicate'::"text"]))),
    CONSTRAINT "jarvis_finance_bank_transactions_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "jarvis_finance_bank_transactions_credit_check" CHECK (("credit" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_bank_transactions_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_bank_transactions_debit_check" CHECK (("debit" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_bank_transactions_scope_check" CHECK (("scope" = ANY (ARRAY['business'::"text", 'personal'::"text", 'transfer'::"text", 'unresolved'::"text", 'excluded'::"text"]))),
    CONSTRAINT "jarvis_finance_bank_transactions_signed_amount_check" CHECK (("signed_amount" <> (0)::numeric))
);


ALTER TABLE "public"."jarvis_finance_bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_capital_policy" (
    "id" "text" DEFAULT 'mc-studios'::"text" NOT NULL,
    "reserve_target_months" numeric(4,2) DEFAULT 1 NOT NULL,
    "custom_reserve_aed" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_capital_policy_custom_reserve_aed_check" CHECK ((("custom_reserve_aed" IS NULL) OR ("custom_reserve_aed" >= (0)::numeric))),
    CONSTRAINT "jarvis_finance_capital_policy_id_check" CHECK (("id" = 'mc-studios'::"text")),
    CONSTRAINT "jarvis_finance_capital_policy_reserve_target_months_check" CHECK ((("reserve_target_months" >= (0)::numeric) AND ("reserve_target_months" <= (24)::numeric)))
);


ALTER TABLE "public"."jarvis_finance_capital_policy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "client_id" "uuid",
    "vendor" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "net_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "vat_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) NOT NULL,
    "billing_cycle" "text" DEFAULT 'one_off'::"text" NOT NULL,
    "expense_date" "date",
    "start_date" "date",
    "end_date" "date",
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_allocation_name" "text",
    "payment_status" "text" DEFAULT 'committed'::"text" NOT NULL,
    "payment_date" "date",
    "billing_day" smallint,
    "next_deduction_date" "date",
    "source_provenance" "text",
    "source_reference" "text",
    "fx_snapshot" "jsonb",
    CONSTRAINT "jarvis_finance_expenses_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"]))),
    CONSTRAINT "jarvis_finance_expenses_billing_day_check" CHECK ((("billing_day" >= 1) AND ("billing_day" <= 31))),
    CONSTRAINT "jarvis_finance_expenses_category_check" CHECK (("category" = ANY (ARRAY['operating'::"text", 'contractors'::"text", 'software'::"text", 'office'::"text", 'advertising'::"text", 'equipment'::"text", 'professional_services'::"text", 'travel'::"text", 'other'::"text"]))),
    CONSTRAINT "jarvis_finance_expenses_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "jarvis_finance_expenses_check1" CHECK (("gross_amount" = "round"(("net_amount" + "vat_amount"), 2))),
    CONSTRAINT "jarvis_finance_expenses_check2" CHECK (("vat_amount" = "round"((("net_amount" * "vat_rate") / (100)::numeric), 2))),
    CONSTRAINT "jarvis_finance_expenses_client_allocation_name_check" CHECK ((("client_allocation_name" IS NULL) OR (("char_length"("client_allocation_name") >= 1) AND ("char_length"("client_allocation_name") <= 180)))),
    CONSTRAINT "jarvis_finance_expenses_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_expenses_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 300))),
    CONSTRAINT "jarvis_finance_expenses_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_expenses_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_expenses_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['planned'::"text", 'committed'::"text", 'paid'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "jarvis_finance_expenses_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_expenses_vat_rate_check" CHECK ((("vat_rate" >= (0)::numeric) AND ("vat_rate" <= (100)::numeric))),
    CONSTRAINT "jarvis_finance_expenses_vendor_check" CHECK ((("char_length"("vendor") >= 1) AND ("char_length"("vendor") <= 160)))
);


ALTER TABLE "public"."jarvis_finance_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_fx_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rate_date" "date" NOT NULL,
    "base_currency" "text" NOT NULL,
    "quote_currency" "text" NOT NULL,
    "rate" numeric(20,10) NOT NULL,
    "source" "text" NOT NULL,
    "source_url" "text",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_fx_rates_base_currency_check" CHECK (("base_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_fx_rates_quote_currency_check" CHECK (("quote_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_fx_rates_rate_check" CHECK (("rate" > (0)::numeric)),
    CONSTRAINT "jarvis_finance_fx_rates_source_check" CHECK ((("char_length"("source") >= 1) AND ("char_length"("source") <= 160)))
);


ALTER TABLE "public"."jarvis_finance_fx_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_income_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "client_id" "uuid",
    "counterparty_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "income_type" "text" NOT NULL,
    "net_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "vat_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) NOT NULL,
    "billing_cycle" "text" DEFAULT 'one_off'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "next_billing_date" "date",
    "due_date" "date",
    "payment_date" "date",
    "payment_status" "text" DEFAULT 'not_set'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vat_applicable" boolean DEFAULT true NOT NULL,
    CONSTRAINT "jarvis_finance_income_records_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"]))),
    CONSTRAINT "jarvis_finance_income_records_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "jarvis_finance_income_records_check1" CHECK (("gross_amount" = "round"(("net_amount" + "vat_amount"), 2))),
    CONSTRAINT "jarvis_finance_income_records_check2" CHECK (("vat_amount" = "round"((("net_amount" * "vat_rate") / (100)::numeric), 2))),
    CONSTRAINT "jarvis_finance_income_records_counterparty_name_check" CHECK ((("char_length"("counterparty_name") >= 1) AND ("char_length"("counterparty_name") <= 180))),
    CONSTRAINT "jarvis_finance_income_records_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_income_records_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 300))),
    CONSTRAINT "jarvis_finance_income_records_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_income_records_income_type_check" CHECK (("income_type" = ANY (ARRAY['recurring_service_revenue'::"text", 'one_off_revenue'::"text", 'other_revenue'::"text"]))),
    CONSTRAINT "jarvis_finance_income_records_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_income_records_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_set'::"text", 'expected'::"text", 'invoiced'::"text", 'paid'::"text", 'overdue'::"text"]))),
    CONSTRAINT "jarvis_finance_income_records_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_income_records_vat_rate_check" CHECK ((("vat_rate" >= (0)::numeric) AND ("vat_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."jarvis_finance_income_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_investments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "estimated_amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "classification" "text" DEFAULT 'business'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "desired_purchase_date" "date",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "allocated_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "source_provenance" "text" DEFAULT 'Finance planned purchase'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_investments_category_check" CHECK ((("char_length"("category") >= 1) AND ("char_length"("category") <= 180))),
    CONSTRAINT "jarvis_finance_investments_check" CHECK ((("allocated_amount" >= (0)::numeric) AND ("allocated_amount" <= "estimated_amount"))),
    CONSTRAINT "jarvis_finance_investments_classification_check" CHECK (("classification" = ANY (ARRAY['business'::"text", 'personal'::"text"]))),
    CONSTRAINT "jarvis_finance_investments_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_investments_estimated_amount_check" CHECK (("estimated_amount" > (0)::numeric)),
    CONSTRAINT "jarvis_finance_investments_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 180))),
    CONSTRAINT "jarvis_finance_investments_priority_check" CHECK (("priority" = ANY (ARRAY['high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "jarvis_finance_investments_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'saving'::"text", 'affordable'::"text", 'purchased'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."jarvis_finance_investments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_invoice_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "storage_bucket" "text" DEFAULT 'finance-documents'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_invoice_attachments_byte_size_check" CHECK ((("byte_size" > 0) AND ("byte_size" <= 10485760))),
    CONSTRAINT "jarvis_finance_invoice_attachments_file_name_check" CHECK ((("char_length"("file_name") >= 1) AND ("char_length"("file_name") <= 255))),
    CONSTRAINT "jarvis_finance_invoice_attachments_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['application/pdf'::"text", 'image/jpeg'::"text", 'image/png'::"text"]))),
    CONSTRAINT "jarvis_finance_invoice_attachments_storage_bucket_check" CHECK (("storage_bucket" = 'finance-documents'::"text")),
    CONSTRAINT "jarvis_finance_invoice_attachments_storage_path_check" CHECK ((("char_length"("storage_path") >= 1) AND ("char_length"("storage_path") <= 1024)))
);


ALTER TABLE "public"."jarvis_finance_invoice_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "income_record_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "counterparty_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "invoice_number" "text",
    "invoice_month" "date" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "invoice_available_date" "date",
    "sent_at" "date",
    "paid_at" "date",
    "paid_amount" numeric(12,2),
    "payment_reference" "text",
    "notes" "text",
    "provenance" "text" DEFAULT 'Finance invoice record'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_at" "date" GENERATED ALWAYS AS (
CASE
    WHEN ("sent_at" IS NULL) THEN NULL::"date"
    ELSE ("sent_at" + 7)
END) STORED,
    CONSTRAINT "jarvis_finance_invoices_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "jarvis_finance_invoices_check" CHECK ((("paid_amount" IS NULL) OR (("paid_amount" > (0)::numeric) AND ("paid_amount" <= "amount")))),
    CONSTRAINT "jarvis_finance_invoices_check1" CHECK (((("paid_at" IS NULL) AND ("paid_amount" IS NULL)) OR (("paid_at" IS NOT NULL) AND ("paid_amount" IS NOT NULL)))),
    CONSTRAINT "jarvis_finance_invoices_counterparty_name_check" CHECK ((("char_length"("counterparty_name") >= 1) AND ("char_length"("counterparty_name") <= 180))),
    CONSTRAINT "jarvis_finance_invoices_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_invoices_invoice_month_check" CHECK (("invoice_month" = ("date_trunc"('month'::"text", ("invoice_month")::timestamp with time zone))::"date")),
    CONSTRAINT "jarvis_finance_invoices_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 300)))
);


ALTER TABLE "public"."jarvis_finance_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_owner_draws" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "business_period_start" "date" NOT NULL,
    "paid_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_owner_draws_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "jarvis_finance_owner_draws_check" CHECK ((("status" = 'paid'::"text") = ("paid_at" IS NOT NULL))),
    CONSTRAINT "jarvis_finance_owner_draws_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_owner_draws_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."jarvis_finance_owner_draws" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_pipeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "client_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "stage" "text" DEFAULT 'not_contacted'::"text" NOT NULL,
    "stage_detail" "text",
    "net_amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "vat_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) NOT NULL,
    "vat_applicable" boolean DEFAULT true NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "expected_start_date" "date",
    "probability" numeric(5,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_pipeline_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"]))),
    CONSTRAINT "jarvis_finance_pipeline_check" CHECK (("gross_amount" = "round"(("net_amount" + "vat_amount"), 2))),
    CONSTRAINT "jarvis_finance_pipeline_check1" CHECK (("vat_amount" = "round"((("net_amount" * "vat_rate") / (100)::numeric), 2))),
    CONSTRAINT "jarvis_finance_pipeline_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_pipeline_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_pipeline_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 180))),
    CONSTRAINT "jarvis_finance_pipeline_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_pipeline_probability_check" CHECK ((("probability" IS NULL) OR (("probability" >= (0)::numeric) AND ("probability" <= (100)::numeric)))),
    CONSTRAINT "jarvis_finance_pipeline_stage_check" CHECK (("stage" = ANY (ARRAY['not_contacted'::"text", 'referred'::"text", 'contacted'::"text", 'talks_pending'::"text", 'proposal'::"text", 'negotiation'::"text", 'verbal_agreement'::"text", 'won'::"text", 'lost'::"text"]))),
    CONSTRAINT "jarvis_finance_pipeline_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_pipeline_vat_rate_check" CHECK ((("vat_rate" >= (0)::numeric) AND ("vat_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."jarvis_finance_pipeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_settings" (
    "id" "text" DEFAULT 'mc-studios'::"text" NOT NULL,
    "source_currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "display_currency" "text" DEFAULT 'both'::"text" NOT NULL,
    "aed_eur_rate" numeric(16,8),
    "rate_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "rate_effective_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_settings_aed_eur_rate_check" CHECK ((("aed_eur_rate" IS NULL) OR ("aed_eur_rate" > (0)::numeric))),
    CONSTRAINT "jarvis_finance_settings_display_currency_check" CHECK (("display_currency" = ANY (ARRAY['aed'::"text", 'eur'::"text", 'usd'::"text", 'both'::"text"]))),
    CONSTRAINT "jarvis_finance_settings_id_check" CHECK (("id" = 'mc-studios'::"text")),
    CONSTRAINT "jarvis_finance_settings_rate_source_check" CHECK (("rate_source" = 'manual'::"text")),
    CONSTRAINT "jarvis_finance_settings_source_currency_check" CHECK (("source_currency" = 'AED'::"text"))
);


ALTER TABLE "public"."jarvis_finance_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_upcoming_revenue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_key" "text",
    "client_id" "uuid",
    "counterparty_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "net_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "vat_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) NOT NULL,
    "vat_applicable" boolean DEFAULT true NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "expected_start_date" "date" NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "notes" "text",
    "activated_income_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_upcoming_revenue_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"]))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_check" CHECK (("gross_amount" = "round"(("net_amount" + "vat_amount"), 2))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_check1" CHECK (("vat_amount" = "round"((("net_amount" * "vat_rate") / (100)::numeric), 2))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_counterparty_name_check" CHECK ((("char_length"("counterparty_name") >= 1) AND ("char_length"("counterparty_name") <= 180))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_finance_upcoming_revenue_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 300))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_upcoming_revenue_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_upcoming_revenue_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'activated'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "jarvis_finance_upcoming_revenue_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_finance_upcoming_revenue_vat_rate_check" CHECK ((("vat_rate" >= (0)::numeric) AND ("vat_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."jarvis_finance_upcoming_revenue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_finance_vendor_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "normalized_pattern" "text" NOT NULL,
    "category" "text",
    "scope" "text" NOT NULL,
    "confidence" "text" DEFAULT 'high'::"text" NOT NULL,
    "source" "text" DEFAULT 'user_confirmed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_finance_vendor_rules_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "jarvis_finance_vendor_rules_normalized_pattern_check" CHECK ((("char_length"("normalized_pattern") >= 3) AND ("char_length"("normalized_pattern") <= 160))),
    CONSTRAINT "jarvis_finance_vendor_rules_scope_check" CHECK (("scope" = ANY (ARRAY['business'::"text", 'personal'::"text", 'transfer'::"text"])))
);


ALTER TABLE "public"."jarvis_finance_vendor_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_personal_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'AED'::"text" NOT NULL,
    "recurrence" "text" DEFAULT 'one_off'::"text" NOT NULL,
    "expense_date" "date",
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_personal_expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "jarvis_personal_expenses_category_check" CHECK (("category" = ANY (ARRAY['rent'::"text", 'subscriptions'::"text", 'food'::"text", 'transport'::"text", 'travel'::"text", 'investing'::"text", 'savings'::"text", 'other'::"text"]))),
    CONSTRAINT "jarvis_personal_expenses_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "jarvis_personal_expenses_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 160))),
    CONSTRAINT "jarvis_personal_expenses_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'quarterly'::"text", 'one_off'::"text"])))
);


ALTER TABLE "public"."jarvis_personal_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_personal_income_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_draw_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "received_at" "date" NOT NULL,
    "category" "text" DEFAULT 'owner_draw'::"text" NOT NULL,
    "source_reference" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_personal_income_events_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "jarvis_personal_income_events_category_check" CHECK (("category" = 'owner_draw'::"text")),
    CONSTRAINT "jarvis_personal_income_events_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text"))
);


ALTER TABLE "public"."jarvis_personal_income_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_research_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "feature" "text" DEFAULT 'tools_research'::"text" NOT NULL,
    "provider" "text" DEFAULT 'tavily'::"text" NOT NULL,
    "operation" "text" NOT NULL,
    "objective" "text" NOT NULL,
    "query" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "source_count" integer DEFAULT 0 NOT NULL,
    "credits_used" numeric(12,3),
    "cost_usd_estimated" numeric(12,6),
    "cost_usd_actual" numeric(12,6),
    "latency_ms" integer,
    "summary" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_research_runs_feature_check" CHECK ((("char_length"("feature") >= 1) AND ("char_length"("feature") <= 120))),
    CONSTRAINT "jarvis_research_runs_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "jarvis_research_runs_objective_check" CHECK ((("char_length"("objective") >= 3) AND ("char_length"("objective") <= 1600))),
    CONSTRAINT "jarvis_research_runs_operation_check" CHECK (("operation" = ANY (ARRAY['search'::"text", 'research'::"text", 'extract_url'::"text", 'crawl_site'::"text", 'map_site'::"text"]))),
    CONSTRAINT "jarvis_research_runs_provider_check" CHECK (("provider" = 'tavily'::"text")),
    CONSTRAINT "jarvis_research_runs_query_check" CHECK ((("char_length"("query") >= 3) AND ("char_length"("query") <= 2000))),
    CONSTRAINT "jarvis_research_runs_source_count_check" CHECK (("source_count" >= 0)),
    CONSTRAINT "jarvis_research_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."jarvis_research_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_research_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text",
    "excerpt" "text",
    "published_at" timestamp with time zone,
    "relevance_score" numeric(6,5),
    "source_type" "text" DEFAULT 'web'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_research_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['web'::"text", 'document'::"text", 'api'::"text"]))),
    CONSTRAINT "jarvis_research_sources_source_url_check" CHECK ((("char_length"("source_url") >= 8) AND ("char_length"("source_url") <= 4000)))
);


ALTER TABLE "public"."jarvis_research_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_task_suggestion_suppressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dedupe_identity" "text" NOT NULL,
    "evidence_hash" "text" NOT NULL,
    "reason" "text" DEFAULT 'dismissed'::"text" NOT NULL,
    "source" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_task_suggestion_suppressions_dedupe_identity_check" CHECK ((("char_length"("dedupe_identity") >= 1) AND ("char_length"("dedupe_identity") <= 280))),
    CONSTRAINT "jarvis_task_suggestion_suppressions_evidence_hash_check" CHECK (("evidence_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "jarvis_task_suggestion_suppressions_reason_check" CHECK (("reason" = ANY (ARRAY['dismissed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."jarvis_task_suggestion_suppressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jarvis_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "priority" "text" DEFAULT 'p3'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "client_id" "uuid",
    "linked_object_type" "text",
    "linked_object_id" "text",
    "origin" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_evidence_hash" "text",
    "dedupe_identity" "text",
    "manual_order" numeric(20,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jarvis_tasks_dedupe_identity_check" CHECK ((("dedupe_identity" IS NULL) OR ("char_length"("dedupe_identity") <= 280))),
    CONSTRAINT "jarvis_tasks_linked_object_id_check" CHECK ((("linked_object_id" IS NULL) OR ("char_length"("linked_object_id") <= 160))),
    CONSTRAINT "jarvis_tasks_linked_object_type_check" CHECK ((("linked_object_type" IS NULL) OR ("char_length"("linked_object_type") <= 80))),
    CONSTRAINT "jarvis_tasks_origin_check" CHECK (("origin" = ANY (ARRAY['manual'::"text", 'suggested'::"text"]))),
    CONSTRAINT "jarvis_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['p1'::"text", 'p2'::"text", 'p3'::"text"]))),
    CONSTRAINT "jarvis_tasks_source_evidence_hash_check" CHECK ((("source_evidence_hash" IS NULL) OR ("source_evidence_hash" ~ '^[a-f0-9]{64}$'::"text"))),
    CONSTRAINT "jarvis_tasks_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'reviewed'::"text", 'archived'::"text"]))),
    CONSTRAINT "jarvis_tasks_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 240)))
);


ALTER TABLE "public"."jarvis_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" NOT NULL,
    "source_type" "text",
    "source_ref" "text",
    "client_id" "uuid",
    "agent_id" "uuid",
    "skill_id" "uuid",
    "summary" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."learning_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text" NOT NULL,
    "model_name" "text" NOT NULL,
    "display_name" "text",
    "input_price_per_million" numeric,
    "output_price_per_million" numeric,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."model_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "workspace_id" "uuid",
    "month" "text" NOT NULL,
    "year" integer NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text",
    "title" "text",
    "description" "text",
    "start_date" "date",
    "end_date" "date",
    "metadata" "jsonb"
);


ALTER TABLE "public"."monthly_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pitch_deck_profiles" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "hero_headline" "text" NOT NULL,
    "hero_thesis" "text" NOT NULL,
    "closing_headline" "text" NOT NULL,
    "founder_name" "text" NOT NULL,
    "founder_bio" "text" NOT NULL,
    "founder_claimed_operating_revenue_eur" numeric(14,2) NOT NULL,
    "proposed_pre_money_valuation_eur" numeric(14,2) NOT NULL,
    "target_dilution_percent" numeric(6,3) NOT NULL,
    "target_clients_12m" integer NOT NULL,
    "target_ai_infrastructure_eur" numeric(14,2) NOT NULL,
    "projection_scenarios" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "market_assumptions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "use_of_funds" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "risk_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "section_status" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pitch_deck_profiles_closing_headline_check" CHECK ((("char_length"("closing_headline") >= 8) AND ("char_length"("closing_headline") <= 240))),
    CONSTRAINT "pitch_deck_profiles_founder_bio_check" CHECK ((("char_length"("founder_bio") >= 8) AND ("char_length"("founder_bio") <= 2400))),
    CONSTRAINT "pitch_deck_profiles_founder_claimed_operating_revenue_eur_check" CHECK (("founder_claimed_operating_revenue_eur" >= (0)::numeric)),
    CONSTRAINT "pitch_deck_profiles_founder_name_check" CHECK ((("char_length"("founder_name") >= 2) AND ("char_length"("founder_name") <= 120))),
    CONSTRAINT "pitch_deck_profiles_hero_headline_check" CHECK ((("char_length"("hero_headline") >= 8) AND ("char_length"("hero_headline") <= 240))),
    CONSTRAINT "pitch_deck_profiles_hero_thesis_check" CHECK ((("char_length"("hero_thesis") >= 8) AND ("char_length"("hero_thesis") <= 600))),
    CONSTRAINT "pitch_deck_profiles_id_check" CHECK (("id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "pitch_deck_profiles_market_assumptions_check" CHECK (("jsonb_typeof"("market_assumptions") = 'object'::"text")),
    CONSTRAINT "pitch_deck_profiles_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 120))),
    CONSTRAINT "pitch_deck_profiles_projection_scenarios_check" CHECK (("jsonb_typeof"("projection_scenarios") = 'object'::"text")),
    CONSTRAINT "pitch_deck_profiles_proposed_pre_money_valuation_eur_check" CHECK (("proposed_pre_money_valuation_eur" > (0)::numeric)),
    CONSTRAINT "pitch_deck_profiles_risk_items_check" CHECK (("jsonb_typeof"("risk_items") = 'array'::"text")),
    CONSTRAINT "pitch_deck_profiles_section_status_check" CHECK (("jsonb_typeof"("section_status") = 'object'::"text")),
    CONSTRAINT "pitch_deck_profiles_target_ai_infrastructure_eur_check" CHECK (("target_ai_infrastructure_eur" >= (0)::numeric)),
    CONSTRAINT "pitch_deck_profiles_target_clients_12m_check" CHECK ((("target_clients_12m" >= 0) AND ("target_clients_12m" <= 1000000))),
    CONSTRAINT "pitch_deck_profiles_target_dilution_percent_check" CHECK ((("target_dilution_percent" >= (0)::numeric) AND ("target_dilution_percent" <= (100)::numeric))),
    CONSTRAINT "pitch_deck_profiles_use_of_funds_check" CHECK (("jsonb_typeof"("use_of_funds") = 'array'::"text"))
);


ALTER TABLE "public"."pitch_deck_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pitch_deck_research_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "publisher" "text" NOT NULL,
    "publication_date" "date",
    "source_url" "text" NOT NULL,
    "claim_supported" "text" NOT NULL,
    "methodology_note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pitch_deck_research_sources_claim_supported_check" CHECK ((("char_length"("claim_supported") >= 8) AND ("char_length"("claim_supported") <= 1200))),
    CONSTRAINT "pitch_deck_research_sources_publisher_check" CHECK ((("char_length"("publisher") >= 2) AND ("char_length"("publisher") <= 160))),
    CONSTRAINT "pitch_deck_research_sources_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "pitch_deck_research_sources_source_url_check" CHECK (("source_url" ~ '^https://'::"text")),
    CONSTRAINT "pitch_deck_research_sources_title_check" CHECK ((("char_length"("title") >= 4) AND ("char_length"("title") <= 300)))
);


ALTER TABLE "public"."pitch_deck_research_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform" "text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_full" "text" NOT NULL,
    "content_summary" "text",
    "content_essence" "text",
    "importance" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."platform_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "project_name" "text" NOT NULL,
    "status" "text" DEFAULT 'pre-production'::"text",
    "shoot_date" timestamp with time zone,
    "deliverables" "text",
    "notes" "text"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rejection_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_run_id" "uuid",
    "execution_review_id" "uuid",
    "client_id" "uuid",
    "agent_id" "uuid",
    "skill_id" "uuid",
    "issue_type" "text",
    "description" "text" NOT NULL,
    "correction" "text",
    "severity" integer DEFAULT 3 NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."rejection_patterns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "category" "text",
    "source_type" "text",
    "source_name" "text",
    "url" "text",
    "summary" "text",
    "key_insights" "text",
    "tags" "text"[],
    "importance" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."research_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "research_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "skill_id" "uuid",
    "agent_id" "uuid",
    "monthly_cycle_id" "uuid",
    "link_type" "text",
    "notes" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."research_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "topic" "text" NOT NULL,
    "source_type" "text",
    "source_url" "text",
    "summary" "text",
    "insights" "text",
    "status" "text" DEFAULT 'not_started'::"text"
);


ALTER TABLE "public"."research_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "action_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'started'::"text", 'completed'::"text", 'blocked'::"text", 'focus_set'::"text", 'dependency_added'::"text", 'dependency_removed'::"text", 'idea_promoted'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."roadmap_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_idea_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_idea_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'promoted'::"text", 'parked'::"text", 'rejected'::"text", 'restored'::"text"]))),
    CONSTRAINT "roadmap_idea_activity_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 360)))
);


ALTER TABLE "public"."roadmap_idea_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_idea_agent_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'candidate_for'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_idea_agent_links_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['owner'::"text", 'candidate_for'::"text", 'research_support'::"text"])))
);


ALTER TABLE "public"."roadmap_idea_agent_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_idea_capability_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "roadmap_item_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_idea_capability_links_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['related'::"text", 'dependency'::"text", 'candidate_for'::"text"])))
);


ALTER TABLE "public"."roadmap_idea_capability_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_idea_skill_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "agent_skill_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roadmap_idea_skill_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_idea_tool_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "tool_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'candidate_for'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_idea_tool_links_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['dependency'::"text", 'candidate_for'::"text", 'research_source'::"text"])))
);


ALTER TABLE "public"."roadmap_idea_tool_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "weight" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "release_status" "text" DEFAULT 'legacy'::"text" NOT NULL,
    "goal" "text",
    "completion_condition" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "roadmap_phases_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120))),
    CONSTRAINT "roadmap_phases_release_status_check" CHECK (("release_status" = ANY (ARRAY['active'::"text", 'upcoming'::"text", 'complete'::"text", 'future'::"text", 'archived'::"text", 'legacy'::"text"]))),
    CONSTRAINT "roadmap_phases_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "roadmap_phases_weight_check" CHECK ((("weight" >= 1) AND ("weight" <= 10)))
);


ALTER TABLE "public"."roadmap_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_projects_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 180))),
    CONSTRAINT "roadmap_projects_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "roadmap_projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."roadmap_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sandbox_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_id" "uuid",
    "agent_id" "uuid",
    "skill_id" "uuid",
    "run_type" "text",
    "model" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "prompt_preview" "text",
    "response_preview" "text",
    "notes" "text",
    "estimated_input_tokens" integer,
    "estimated_output_tokens" integer,
    "estimated_cost" numeric,
    "metadata" "jsonb",
    "command_id" "uuid"
);


ALTER TABLE "public"."sandbox_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skill_id" "uuid",
    "agent_id" "uuid",
    "source_type" "text",
    "source_ref" "text",
    "lesson" "text" NOT NULL,
    "importance" integer DEFAULT 3 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "promoted" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."skill_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_audience_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_account_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "views" bigint,
    "reach" bigint,
    "accounts_engaged" bigint,
    "total_interactions" bigint,
    "data_delay" "text",
    "timeframe" "text",
    "top_cities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_countries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "age_distribution" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gender_distribution" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fetched_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "native_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "social_audience_snapshots_check" CHECK (("period_start" <= "period_end")),
    CONSTRAINT "social_audience_snapshots_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_audience_snapshots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."social_audience_snapshots"."native_metrics" IS 'Provider-native account metrics retained by Jarvis; never used as post aggregates.';



CREATE TABLE IF NOT EXISTS "public"."social_caption_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "request_contract" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cost" numeric,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creative_quality" "text",
    "raw_candidate" "jsonb",
    "validation_status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "validation_diagnostics" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "social_caption_generations_validation_status_check" CHECK (("validation_status" = ANY (ARRAY['ready'::"text", 'needs_review'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."social_caption_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_caption_intervention_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "generation_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_caption_intervention_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['generated_without_edit'::"text", 'selected_generated_option'::"text", 'edited_generated_option'::"text", 'fully_manual_caption'::"text", 'regenerated_options'::"text", 'quality_reviewed'::"text"])))
);


ALTER TABLE "public"."social_caption_intervention_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_caption_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "tone_of_voice" "text" DEFAULT ''::"text" NOT NULL,
    "caption_instructions" "text" DEFAULT ''::"text" NOT NULL,
    "footer" "text" DEFAULT ''::"text" NOT NULL,
    "fixed_hashtags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "dynamic_hashtag_count" integer DEFAULT 3 NOT NULL,
    "approved_phrases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "avoid_phrases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "client_brain_reference_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caption_guidelines" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "style_examples" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "golden_caption_examples" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "social_caption_profiles_dynamic_hashtag_count_check" CHECK ((("dynamic_hashtag_count" >= 0) AND ("dynamic_hashtag_count" <= 5)))
);


ALTER TABLE "public"."social_caption_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_caption_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "option_number" integer NOT NULL,
    "body" "text" NOT NULL,
    "source" "text" DEFAULT 'mock'::"text" NOT NULL,
    "selected_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dynamic_hashtags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "rendered_caption" "text",
    "generation_id" "uuid",
    "is_current" boolean DEFAULT true NOT NULL,
    "validation_status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "validation_diagnostics" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "social_content_caption_options_option_number_check" CHECK ((("option_number" >= 1) AND ("option_number" <= 5))),
    CONSTRAINT "social_content_caption_options_source_check" CHECK (("source" = ANY (ARRAY['mock'::"text", 'ai'::"text", 'manual'::"text"]))),
    CONSTRAINT "social_content_caption_options_validation_status_check" CHECK (("validation_status" = ANY (ARRAY['ready'::"text", 'needs_review'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."social_content_caption_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_month_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual_upload'::"text" NOT NULL,
    "content_kind" "text" NOT NULL,
    "format" "text" NOT NULL,
    "title" "text",
    "schedule_label" "text",
    "notes" "text",
    "sequence" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "scheduled_date" "date",
    "scheduled_time" time without time zone,
    "scheduled_at" timestamp with time zone,
    "date_locked" boolean DEFAULT false NOT NULL,
    "time_selection_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "time_recommendation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "story_schedule_slot_id" "uuid",
    "selected_caption_option_id" "uuid",
    "final_caption" "text",
    "caption_selected_at" timestamp with time zone,
    "caption_edited_at" timestamp with time zone,
    "publishing_payload_version" integer DEFAULT 1 NOT NULL,
    "scheduled_payload_version" integer,
    "scheduled_payload_stale" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planner_synced_payload_version" integer,
    "planner_synced_at" timestamp with time zone,
    "caption_approved_at" timestamp with time zone,
    "content_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "social_content_items_content_kind_check" CHECK (("content_kind" = ANY (ARRAY['feed'::"text", 'reel'::"text", 'story'::"text"]))),
    CONSTRAINT "social_content_items_format_check" CHECK (("format" = ANY (ARRAY['feed'::"text", 'carousel'::"text", 'reel'::"text", 'story'::"text"]))),
    CONSTRAINT "social_content_items_sequence_check" CHECK (("sequence" > 0)),
    CONSTRAINT "social_content_items_source_check" CHECK (("source" = ANY (ARRAY['manual_upload'::"text", 'monthly_plan'::"text", 'ai_content'::"text", 'existing_asset'::"text"]))),
    CONSTRAINT "social_content_items_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Needs Caption'::"text", 'Ready for Review'::"text", 'Approved'::"text", 'Scheduled'::"text", 'Publishing'::"text", 'Published'::"text", 'Failed'::"text"]))),
    CONSTRAINT "social_content_items_time_selection_source_check" CHECK (("time_selection_source" = ANY (ARRAY['manual'::"text", 'client_default'::"text", 'insight'::"text", 'historical'::"text", 'unavailable'::"text"])))
);


ALTER TABLE "public"."social_content_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "storage_bucket" "text" DEFAULT 'social-content'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "width" integer,
    "height" integer,
    "duration_seconds" numeric,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "crop_x" numeric DEFAULT 50 NOT NULL,
    "crop_y" numeric DEFAULT 50 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_sha256" "text",
    CONSTRAINT "social_content_media_byte_size_check" CHECK (("byte_size" > 0)),
    CONSTRAINT "social_content_media_crop_x_check" CHECK ((("crop_x" >= (0)::numeric) AND ("crop_x" <= (100)::numeric))),
    CONSTRAINT "social_content_media_crop_y_check" CHECK ((("crop_y" >= (0)::numeric) AND ("crop_y" <= (100)::numeric))),
    CONSTRAINT "social_content_media_sort_order_check" CHECK (("sort_order" > 0))
);


ALTER TABLE "public"."social_content_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_months" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "month_start" "date" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Dubai'::"text" NOT NULL,
    "feed_start_date" "date",
    "feed_interval_days" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_content_months_feed_interval_days_check" CHECK ((("feed_interval_days" >= 1) AND ("feed_interval_days" <= 31))),
    CONSTRAINT "social_content_months_month_start_check" CHECK ((("date_trunc"('month'::"text", ("month_start")::timestamp without time zone))::"date" = "month_start"))
);


ALTER TABLE "public"."social_content_months" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_platform_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "selected" boolean DEFAULT true NOT NULL,
    "caption_override" "text",
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "external_post_id" "text",
    "external_post_url" "text",
    "provider_response_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_content_platform_targets_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'linkedin'::"text"]))),
    CONSTRAINT "social_content_platform_targets_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Ready for Review'::"text", 'Approved'::"text", 'Scheduled'::"text", 'Publishing'::"text", 'Published'::"text", 'Failed'::"text"])))
);


ALTER TABLE "public"."social_content_platform_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_content_understanding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "social_content_media_id" "uuid" NOT NULL,
    "content_sha256" "text" NOT NULL,
    "status" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "inferred_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "match_candidates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "requires_confirmation" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provider" "text",
    "model" "text",
    "provider_request_count" integer DEFAULT 0 NOT NULL,
    "review_status" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "latency_ms" integer,
    "cost" numeric,
    "diagnostics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "social_content_understanding_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'review'::"text", 'unknown'::"text"]))),
    CONSTRAINT "social_content_understanding_provider_request_count_check" CHECK (("provider_request_count" >= 0)),
    CONSTRAINT "social_content_understanding_review_status_check" CHECK (("review_status" = ANY (ARRAY['unreviewed'::"text", 'confirmed'::"text", 'corrected'::"text"]))),
    CONSTRAINT "social_content_understanding_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'fixture'::"text", 'analyzed'::"text", 'needs_review'::"text", 'confirmed'::"text", 'corrected'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."social_content_understanding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_follower_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_account_id" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "observation_date" "date" NOT NULL,
    "followers" bigint NOT NULL,
    "followers_gained" bigint,
    "followers_lost" bigint,
    "observed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_follower_observations_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text"]))),
    CONSTRAINT "social_follower_observations_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_follower_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_intelligence_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "agent_run_id" "uuid",
    "artifact_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "data_revision" "text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "deterministic" boolean DEFAULT true NOT NULL,
    "model_provider" "text",
    "model_name" "text",
    "model_cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "executive_summary" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "working" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "needs_attention" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommended_next_moves" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "experiments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "data_gaps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_manifest" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_intelligence_artifacts_data_revision_check" CHECK (("data_revision" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "social_intelligence_artifacts_model_cost_usd_check" CHECK (("model_cost_usd" >= (0)::numeric))
);


ALTER TABLE "public"."social_intelligence_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_content_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "monthly_plan_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "planned_date" "date",
    "date_fixed" boolean DEFAULT false NOT NULL,
    "pillar" "text" DEFAULT 'lifestyle'::"text" NOT NULL,
    "objective" "text" DEFAULT ''::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "creative_concept" "text" DEFAULT ''::"text" NOT NULL,
    "production_method" "text" DEFAULT 'ai_photography'::"text" NOT NULL,
    "required_assets" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "missing_asset_note" "text" DEFAULT ''::"text" NOT NULL,
    "visual_direction" "text" DEFAULT ''::"text" NOT NULL,
    "grid_role" "text" DEFAULT 'other'::"text" NOT NULL,
    "activation_record_id" "uuid",
    "commercial_rationale" "text" DEFAULT ''::"text" NOT NULL,
    "caption_brief" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shot_scale" "text" DEFAULT 'other'::"text" NOT NULL,
    "camera_angle" "text" DEFAULT 'other'::"text" NOT NULL,
    "composition" "text" DEFAULT 'other'::"text" NOT NULL,
    "human_presence" "text" DEFAULT 'none'::"text" NOT NULL,
    "interaction" "text" DEFAULT 'none'::"text" NOT NULL,
    "motion" "text" DEFAULT 'static'::"text" NOT NULL,
    "production_aspect_ratio" "text" DEFAULT '4:5'::"text" NOT NULL,
    "grid_crop_behavior" "text" DEFAULT 'safe'::"text" NOT NULL,
    "visual_direction_source" "text" DEFAULT 'unassigned'::"text" NOT NULL,
    "visual_direction_prompt_version" "text",
    "visual_direction_execution_id" "uuid",
    "visual_direction_generated_at" timestamp with time zone,
    CONSTRAINT "social_monthly_content_plan_items_camera_angle_check" CHECK (("camera_angle" = ANY (ARRAY['birds_eye'::"text", 'high_angle'::"text", 'eye_level'::"text", 'table_level'::"text", 'low_angle'::"text", 'three_quarter'::"text", 'pov'::"text", 'over_the_shoulder'::"text", 'architectural_straight_on'::"text", 'not_applicable'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_composition_check" CHECK (("composition" = ANY (ARRAY['centered_hero'::"text", 'asymmetrical'::"text", 'rule_of_thirds'::"text", 'negative_space'::"text", 'layered_foreground'::"text", 'frame_within_frame'::"text", 'diagonal'::"text", 'symmetrical'::"text", 'edge_crop'::"text", 'immersive_crop'::"text", 'editorial_still_life'::"text", 'environmental'::"text", 'graphic'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_grid_crop_behavior_check" CHECK (("grid_crop_behavior" = ANY (ARRAY['safe'::"text", 'edge_aware'::"text", 'intentional_crop'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_grid_role_check" CHECK (("grid_role" = ANY (ARRAY['hero_food'::"text", 'lifestyle_break'::"text", 'graphic_accent'::"text", 'venue_breather'::"text", 'human_moment'::"text", 'product_detail'::"text", 'event_commercial'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_human_presence_check" CHECK (("human_presence" = ANY (ARRAY['none'::"text", 'hands_only'::"text", 'partial_figure'::"text", 'single_person'::"text", 'couple'::"text", 'small_group'::"text", 'background_guests'::"text", 'staff_service'::"text", 'mixed_foreground_background'::"text", 'not_applicable'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_interaction_check" CHECK (("interaction" = ANY (ARRAY['none'::"text", 'passing_food'::"text", 'sharing_dish'::"text", 'serving'::"text", 'pouring'::"text", 'cutting'::"text", 'picking_up'::"text", 'taking_a_bite'::"text", 'cooking'::"text", 'plating'::"text", 'garnishing'::"text", 'utensil_interaction'::"text", 'carrying'::"text", 'toasting_raising_glasses'::"text", 'conversation'::"text", 'walking_through_frame'::"text", 'pet_interaction'::"text", 'staff_interaction'::"text", 'not_applicable'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_motion_check" CHECK (("motion" = ANY (ARRAY['static'::"text", 'subtle'::"text", 'active'::"text", 'dynamic'::"text", 'not_applicable'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_pillar_check" CHECK (("pillar" = ANY (ARRAY['lifestyle'::"text", 'food'::"text", 'drinks'::"text", 'interiors'::"text", 'events'::"text", 'bts_service'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_position_check" CHECK ((("position" >= 1) AND ("position" <= 120))),
    CONSTRAINT "social_monthly_content_plan_items_production_aspect_ratio_check" CHECK (("production_aspect_ratio" = '4:5'::"text")),
    CONSTRAINT "social_monthly_content_plan_items_production_method_check" CHECK (("production_method" = ANY (ARRAY['ai_photography'::"text", 'graphic_design'::"text", 'photo_graphic_overlay'::"text", 'existing_asset'::"text", 'carousel'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_shot_scale_check" CHECK (("shot_scale" = ANY (ARRAY['extreme_macro'::"text", 'macro'::"text", 'close'::"text", 'medium'::"text", 'wide'::"text", 'environmental_wide'::"text", 'detail'::"text", 'graphic'::"text", 'not_applicable'::"text", 'other'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'approved_for_plan'::"text", 'blocked'::"text"]))),
    CONSTRAINT "social_monthly_content_plan_items_version_check" CHECK (("version" > 0)),
    CONSTRAINT "social_monthly_content_plan_items_visual_direction_source_check" CHECK (("visual_direction_source" = ANY (ARRAY['unassigned'::"text", 'ai'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."social_monthly_content_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_content_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "platform" "text" DEFAULT 'instagram'::"text" NOT NULL,
    "plan_month" "date" NOT NULL,
    "target_feed_count" integer DEFAULT 15 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "owner_client_notes" "text" DEFAULT ''::"text" NOT NULL,
    "priority_offers" "text" DEFAULT ''::"text" NOT NULL,
    "items_to_avoid" "text" DEFAULT ''::"text" NOT NULL,
    "products_to_push" "text" DEFAULT ''::"text" NOT NULL,
    "temporary_availability_notes" "text" DEFAULT ''::"text" NOT NULL,
    "commercial_priorities" "text" DEFAULT ''::"text" NOT NULL,
    "other_month_notes" "text" DEFAULT ''::"text" NOT NULL,
    "research_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "strategy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "content_pillars" "jsonb" DEFAULT '["lifestyle", "food", "drinks", "interiors", "events", "bts_service"]'::"jsonb" NOT NULL,
    "visual_direction" "text" DEFAULT ''::"text" NOT NULL,
    "grid_notes" "text" DEFAULT ''::"text" NOT NULL,
    "facebook_mirror" boolean DEFAULT true NOT NULL,
    "client_brain_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "monthly_context" "text" DEFAULT ''::"text" NOT NULL,
    "ai_provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plan_version" integer DEFAULT 1 NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "supersedes_plan_id" "uuid",
    "superseded_at" timestamp with time zone,
    CONSTRAINT "social_monthly_content_plans_plan_month_check" CHECK (("plan_month" = ("date_trunc"('month'::"text", ("plan_month")::timestamp with time zone))::"date")),
    CONSTRAINT "social_monthly_content_plans_plan_version_check" CHECK (("plan_version" > 0)),
    CONSTRAINT "social_monthly_content_plans_platform_check" CHECK (("platform" = 'instagram'::"text")),
    CONSTRAINT "social_monthly_content_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'strategy_ready'::"text", 'plan_ready'::"text", 'approved'::"text"]))),
    CONSTRAINT "social_monthly_content_plans_target_feed_count_check" CHECK ((("target_feed_count" >= 1) AND ("target_feed_count" <= 60))),
    CONSTRAINT "social_monthly_content_plans_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."social_monthly_content_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_plan_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "monthly_plan_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "action_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_monthly_plan_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['plan_created'::"text", 'context_saved'::"text", 'strategy_saved'::"text", 'item_created'::"text", 'item_updated'::"text", 'item_deleted'::"text", 'item_reordered'::"text", 'plan_ready'::"text", 'plan_approved'::"text", 'plan_reopened'::"text", 'snapshot_refreshed'::"text", 'plan_generated'::"text", 'plan_regenerated'::"text", 'strategy_regenerated'::"text", 'concept_regenerated'::"text", 'concept_grid_generated'::"text", 'concept_grid_failed'::"text", 'concept_grid_selected'::"text", 'concept_grid_accepted'::"text", 'visual_direction_generated'::"text", 'visual_direction_regenerated'::"text", 'plan_version_created'::"text", 'plan_version_superseded'::"text"])))
);


ALTER TABLE "public"."social_monthly_plan_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_plan_ai_executions" (
    "id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "monthly_plan_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "latency_ms" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer,
    "cache_write_tokens" integer,
    "cost_usd_actual" numeric,
    "finish_reason" "text",
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "structured_output_requested" boolean DEFAULT true NOT NULL,
    "structured_tool_name" "text",
    "structured_tool_invoked" boolean DEFAULT false NOT NULL,
    "output_character_count" integer,
    "output_byte_count" integer,
    "validation_stage" "text" DEFAULT 'provider_request'::"text" NOT NULL,
    "validation_errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "failing_slot" integer,
    "failing_field" "text",
    "failing_value" "text",
    "execution_outcome" "text" DEFAULT 'running'::"text" NOT NULL,
    "sanitized_debug_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "debug_payload_truncated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "failing_reference" "text",
    CONSTRAINT "social_monthly_plan_ai_executions_action_type_check" CHECK (("action_type" = ANY (ARRAY['full_plan'::"text", 'strategy_only'::"text", 'feed_plan'::"text", 'single_concept'::"text", 'visual_direction'::"text"]))),
    CONSTRAINT "social_monthly_plan_ai_executions_attempt_count_check" CHECK (("attempt_count" >= 1)),
    CONSTRAINT "social_monthly_plan_ai_executions_execution_outcome_check" CHECK (("execution_outcome" = ANY (ARRAY['running'::"text", 'provider_failed'::"text", 'provider_succeeded'::"text", 'structured_output_missing'::"text", 'schema_failed'::"text", 'count_failed'::"text", 'enum_failed'::"text", 'reference_failed'::"text", 'date_failed'::"text", 'business_rule_failed'::"text", 'atomic_apply_failed'::"text", 'succeeded'::"text"]))),
    CONSTRAINT "social_monthly_plan_ai_executions_validation_errors_check" CHECK (("jsonb_typeof"("validation_errors") = 'array'::"text")),
    CONSTRAINT "social_monthly_plan_ai_executions_validation_stage_check" CHECK (("validation_stage" = ANY (ARRAY['provider_request'::"text", 'provider_response'::"text", 'tool_output_extracted'::"text", 'schema_validation'::"text", 'item_count_validation'::"text", 'enum_validation'::"text", 'asset_reference_validation'::"text", 'activation_reference_validation'::"text", 'production_capability_validation'::"text", 'date_validation'::"text", 'business_rule_validation'::"text", 'atomic_apply'::"text", 'succeeded'::"text"])))
);


ALTER TABLE "public"."social_monthly_plan_ai_executions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_plan_concept_grids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "monthly_plan_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'generating'::"text" NOT NULL,
    "is_selected" boolean DEFAULT false NOT NULL,
    "plan_snapshot_hash" "text" NOT NULL,
    "plan_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "correction_text" "text" DEFAULT ''::"text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "provider" "text",
    "model" "text",
    "reference_count" integer DEFAULT 0 NOT NULL,
    "reference_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "file_object_id" "uuid",
    "failure_reason" "text",
    "generated_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_monthly_plan_concept_grids_reference_count_check" CHECK (("reference_count" >= 0)),
    CONSTRAINT "social_monthly_plan_concept_grids_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'generated'::"text", 'failed'::"text", 'stale'::"text", 'accepted'::"text"]))),
    CONSTRAINT "social_monthly_plan_concept_grids_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."social_monthly_plan_concept_grids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_monthly_plan_production_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "monthly_plan_id" "uuid" NOT NULL,
    "monthly_plan_item_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" NOT NULL,
    "execution_mode" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "is_selected" boolean DEFAULT false NOT NULL,
    "correction_text" "text" DEFAULT ''::"text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "provider" "text",
    "model" "text",
    "aspect_ratio" "text" DEFAULT '4:5'::"text" NOT NULL,
    "output_resolution" "text" DEFAULT '4K'::"text" NOT NULL,
    "package_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "package_hash" "text" NOT NULL,
    "reference_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "prompt_text" "text" DEFAULT ''::"text" NOT NULL,
    "execution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "file_object_id" "uuid",
    "failure_reason" "text",
    "generated_at" timestamp with time zone,
    "selected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_monthly_plan_production_artifacts_aspect_ratio_check" CHECK (("aspect_ratio" = '4:5'::"text")),
    CONSTRAINT "social_monthly_plan_production_artifacts_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['dry_run'::"text", 'live'::"text"]))),
    CONSTRAINT "social_monthly_plan_production_artifacts_status_check" CHECK (("status" = ANY (ARRAY['blocked'::"text", 'ready'::"text", 'generating'::"text", 'generated'::"text", 'selected'::"text", 'failed'::"text", 'stale'::"text"]))),
    CONSTRAINT "social_monthly_plan_production_artifacts_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."social_monthly_plan_production_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_performance_post_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "provider_post_id" "text" NOT NULL,
    "published_at" timestamp with time zone,
    "post_type" "text" NOT NULL,
    "title" "text",
    "caption_excerpt" "text",
    "thumbnail_path" "text",
    "post_url" "text",
    "likes" bigint,
    "comments" bigint,
    "shares" bigint,
    "saves" bigint,
    "clicks" bigint,
    "views" bigint,
    "impressions" bigint,
    "reach" bigint,
    "interactions" bigint,
    "engagement_rate" numeric,
    "observed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "native_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "social_provider_execution_id" "uuid",
    "social_provider_execution_target_id" "uuid",
    CONSTRAINT "social_performance_post_observations_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text"]))),
    CONSTRAINT "social_performance_post_observations_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_performance_post_observations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."social_performance_post_observations"."native_metrics" IS 'Provider-native post metrics retained by Jarvis; never assumed cross-platform comparable.';



CREATE TABLE IF NOT EXISTS "public"."social_performance_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "provider_account_id" "text" NOT NULL,
    "period_key" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "followers" integer,
    "post_reach" bigint,
    "impressions" bigint,
    "views" bigint,
    "engagements" bigint,
    "engagement_rate" numeric,
    "link_clicks" bigint,
    "posts_count" integer DEFAULT 0 NOT NULL,
    "top_posts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provider_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metric_provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "social_performance_snapshots_check" CHECK (("period_start" <= "period_end")),
    CONSTRAINT "social_performance_snapshots_period_key_check" CHECK (("period_key" = ANY (ARRAY['current_30d'::"text", 'previous_30d'::"text"]))),
    CONSTRAINT "social_performance_snapshots_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text"]))),
    CONSTRAINT "social_performance_snapshots_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_performance_snapshots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."social_performance_snapshots"."metric_provenance" IS 'Source field and scope map for this immutable provider snapshot. No credentials or raw provider payloads.';



CREATE TABLE IF NOT EXISTS "public"."social_posting_frequency_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "posts_per_week" integer NOT NULL,
    "average_engagement_rate" numeric,
    "average_engagement" numeric,
    "weeks_count" integer NOT NULL,
    "observed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_posting_frequency_snapshots_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text"]))),
    CONSTRAINT "social_posting_frequency_snapshots_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_posting_frequency_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_provider_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_profile_id" "text",
    "provider_connection_id" "text",
    "platform" "text" NOT NULL,
    "platform_account_id" "text" NOT NULL,
    "account_name" "text",
    "handle" "text",
    "status" "text" NOT NULL,
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "provider_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_provider_connections_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'meta_ads'::"text"]))),
    CONSTRAINT "social_provider_connections_provider_check" CHECK (("provider" = 'zernio'::"text")),
    CONSTRAINT "social_provider_connections_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'needs_attention'::"text", 'expired'::"text", 'disconnected'::"text", 'not_mapped'::"text", 'not_connected'::"text", 'unsupported'::"text"])))
);


ALTER TABLE "public"."social_provider_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_provider_execution_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "social_provider_execution_id" "uuid" NOT NULL,
    "social_content_platform_target_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider_connection_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "provider_account_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "raw_provider_status" "text",
    "external_post_id" "text",
    "external_post_url" "text",
    "provider_response_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_provider_execution_targets_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text"]))),
    CONSTRAINT "social_provider_execution_targets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'requesting'::"text", 'recovery_required'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."social_provider_execution_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_provider_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "publishing_payload_version" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_for_local" timestamp without time zone NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Dubai'::"text" NOT NULL,
    "final_caption_snapshot" "text" NOT NULL,
    "media_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "target_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provider_post_id" "text",
    "raw_provider_status" "text",
    "provider_response_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "failure_diagnostic" "text",
    "requested_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_for_utc" timestamp with time zone,
    "provider_request_id" "text",
    "dispatch_attempt_count" integer DEFAULT 0 NOT NULL,
    "recovery_poll_count" integer DEFAULT 0 NOT NULL,
    "last_recovery_polled_at" timestamp with time zone,
    CONSTRAINT "social_provider_executions_dispatch_attempt_count_check" CHECK (("dispatch_attempt_count" >= 0)),
    CONSTRAINT "social_provider_executions_provider_check" CHECK (("provider" = 'zernio'::"text")),
    CONSTRAINT "social_provider_executions_publishing_payload_version_check" CHECK (("publishing_payload_version" > 0)),
    CONSTRAINT "social_provider_executions_recovery_poll_count_check" CHECK (("recovery_poll_count" >= 0)),
    CONSTRAINT "social_provider_executions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'requesting'::"text", 'recovery_required'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'partial'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."social_provider_executions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_provider_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "social_provider_execution_id" "uuid",
    "processed_at" timestamp with time zone,
    "processing_error" "text",
    CONSTRAINT "social_provider_webhook_events_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_provider_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_refresh_diagnostics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "stage" "text" NOT NULL,
    "diagnostic" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_refresh_diagnostics_provider_check" CHECK (("provider" = 'zernio'::"text"))
);


ALTER TABLE "public"."social_refresh_diagnostics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_story_placements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "social_content_month_id" "uuid" NOT NULL,
    "social_content_item_id" "uuid" NOT NULL,
    "social_story_schedule_slot_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "scheduled_time" time without time zone NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "sequence" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'Ready for Review'::"text" NOT NULL,
    "planner_synced_payload_version" integer,
    "planner_synced_at" timestamp with time zone,
    "scheduled_payload_stale" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_story_placements_sequence_check" CHECK (("sequence" > 0)),
    CONSTRAINT "social_story_placements_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Ready for Review'::"text", 'Approved'::"text", 'Scheduled'::"text", 'Publishing'::"text", 'Published'::"text", 'Failed'::"text"])))
);


ALTER TABLE "public"."social_story_placements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_story_schedule_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "local_time" time without time zone NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_story_schedule_slots_sort_order_check" CHECK (("sort_order" > 0)),
    CONSTRAINT "social_story_schedule_slots_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."social_story_schedule_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."successful_outputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execution_run_id" "uuid",
    "execution_review_id" "uuid",
    "client_id" "uuid",
    "agent_id" "uuid",
    "skill_id" "uuid",
    "output_type" "text",
    "title" "text",
    "content" "text" NOT NULL,
    "why_successful" "text",
    "reusable_pattern" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."successful_outputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."telegram_commands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'telegram'::"text" NOT NULL,
    "sender" "text",
    "raw_message" "text" NOT NULL,
    "interpreted_intent" "text",
    "client_id" "uuid",
    "monthly_cycle_id" "uuid",
    "deliverable_id" "uuid",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "priority" "text",
    "assigned_agent" "text",
    "result_summary" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."telegram_commands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."token_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" "uuid",
    "task_type" "text",
    "total_budget" integer DEFAULT 4000 NOT NULL,
    "allocation" "jsonb" DEFAULT '{"lessons": 200, "patterns": 150, "exemplars": 0, "brand_voice": 350, "client_rules": 150, "cycle_context": 300, "platform_rules": 150, "agent_philosophy": 250, "client_knowledge": 450}'::"jsonb" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."token_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tool_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tool_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tool_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'seeded'::"text", 'status_changed'::"text", 'connection_verified'::"text", 'connection_failed'::"text", 'promoted'::"text", 'rejected'::"text", 'deprecated'::"text"]))),
    CONSTRAINT "tool_activity_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 360)))
);


ALTER TABLE "public"."tool_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tool_capability_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tool_id" "uuid" NOT NULL,
    "roadmap_item_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tool_capability_links_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['used_by'::"text", 'required_for'::"text", 'candidate_for'::"text"])))
);


ALTER TABLE "public"."tool_capability_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tool_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "provider" "text",
    "category" "text" NOT NULL,
    "tool_type" "text" DEFAULT 'runtime_integration'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "jarvis_usage" "text",
    "why_we_use" "text",
    "usage_status" "text" DEFAULT 'explore'::"text" NOT NULL,
    "connection_status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "health_status" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "potential_value" "text",
    "decision_status" "text",
    "logo_key" "text",
    "official_website" "text",
    "documentation_url" "text",
    "developer_docs_url" "text",
    "configuration_summary" "text",
    "alternatives" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "os_release_overrides" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_core" boolean DEFAULT false NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tool_registry_alternatives_check" CHECK (("jsonb_typeof"("alternatives") = 'array'::"text")),
    CONSTRAINT "tool_registry_category_check" CHECK (("category" = ANY (ARRAY['ai_agents'::"text", 'development'::"text", 'infrastructure_data'::"text", 'research_scraping'::"text", 'creative_ai'::"text", 'social_publishing'::"text", 'advertising'::"text", 'google_ecosystem'::"text", 'communication'::"text", 'crm_reservations'::"text", 'automation_connectivity'::"text", 'analytics_monitoring'::"text", 'other'::"text"]))),
    CONSTRAINT "tool_registry_connection_status_check" CHECK (("connection_status" = ANY (ARRAY['connected'::"text", 'configured'::"text", 'partial'::"text", 'not_connected'::"text", 'not_required'::"text", 'unknown'::"text", 'error'::"text"]))),
    CONSTRAINT "tool_registry_decision_status_check" CHECK (("decision_status" = ANY (ARRAY['not_evaluated'::"text", 'researching'::"text", 'shortlisted'::"text", 'rejected'::"text", 'promoted_to_planned'::"text"]))),
    CONSTRAINT "tool_registry_description_check" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 420))),
    CONSTRAINT "tool_registry_health_status_check" CHECK (("health_status" = ANY (ARRAY['healthy'::"text", 'needs_attention'::"text", 'not_checked'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "tool_registry_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120))),
    CONSTRAINT "tool_registry_os_release_overrides_check" CHECK (("os_release_overrides" <@ ARRAY['os1-create'::"text", 'os2-distribute'::"text", 'os3-grow'::"text", 'os4-operate'::"text"])),
    CONSTRAINT "tool_registry_potential_value_check" CHECK (("potential_value" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "tool_registry_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "tool_registry_tool_type_check" CHECK (("tool_type" = ANY (ARRAY['runtime_integration'::"text", 'development_tool'::"text", 'manual_external_tool'::"text", 'infrastructure'::"text", 'candidate'::"text"]))),
    CONSTRAINT "tool_registry_usage_status_check" CHECK (("usage_status" = ANY (ARRAY['active'::"text", 'experimental'::"text", 'planned'::"text", 'explore'::"text", 'deprecated'::"text"])))
);


ALTER TABLE "public"."tool_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_capability_links"
    ADD CONSTRAINT "agent_capability_links_agent_id_roadmap_item_id_relationshi_key" UNIQUE ("agent_id", "roadmap_item_id", "relationship_type");



ALTER TABLE ONLY "public"."agent_capability_links"
    ADD CONSTRAINT "agent_capability_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_departments"
    ADD CONSTRAINT "agent_departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_departments"
    ADD CONSTRAINT "agent_departments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."agent_lessons"
    ADD CONSTRAINT "agent_lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_organization_activity"
    ADD CONSTRAINT "agent_organization_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_organization_profiles"
    ADD CONSTRAINT "agent_organization_profiles_pkey" PRIMARY KEY ("agent_id");



ALTER TABLE ONLY "public"."agent_run_approvals"
    ADD CONSTRAINT "agent_run_approvals_agent_run_id_key" UNIQUE ("agent_run_id");



ALTER TABLE ONLY "public"."agent_run_approvals"
    ADD CONSTRAINT "agent_run_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_run_model_calls"
    ADD CONSTRAINT "agent_run_model_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_agent_run_id_action_key_key" UNIQUE ("agent_run_id", "action_key");



ALTER TABLE ONLY "public"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_agent_run_id_sequence_no_key" UNIQUE ("agent_run_id", "sequence_no");



ALTER TABLE ONLY "public"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_agent_runtime_definition_id_idempotency_key_key" UNIQUE ("agent_runtime_definition_id", "idempotency_key");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_workflow_instance_id_key" UNIQUE ("workflow_instance_id");



ALTER TABLE ONLY "public"."agent_runtime_definition_skills"
    ADD CONSTRAINT "agent_runtime_definition_skil_agent_runtime_definition_id_a_key" UNIQUE ("agent_runtime_definition_id", "agent_skill_id");



ALTER TABLE ONLY "public"."agent_runtime_definition_skills"
    ADD CONSTRAINT "agent_runtime_definition_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runtime_definitions"
    ADD CONSTRAINT "agent_runtime_definitions_agent_key_key" UNIQUE ("agent_key");



ALTER TABLE ONLY "public"."agent_runtime_definitions"
    ADD CONSTRAINT "agent_runtime_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runtime_settings"
    ADD CONSTRAINT "agent_runtime_settings_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_task_outputs"
    ADD CONSTRAINT "agent_task_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_tool_links"
    ADD CONSTRAINT "agent_tool_links_agent_id_tool_id_access_type_key" UNIQUE ("agent_id", "tool_id", "access_type");



ALTER TABLE ONLY "public"."agent_tool_links"
    ADD CONSTRAINT "agent_tool_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_session_id_version_key" UNIQUE ("session_id", "version");



ALTER TABLE ONLY "public"."ai_content_prompt_versions"
    ADD CONSTRAINT "ai_content_prompt_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_prompt_versions"
    ADD CONSTRAINT "ai_content_prompt_versions_session_id_version_key" UNIQUE ("session_id", "version");



ALTER TABLE ONLY "public"."ai_content_provider_requests"
    ADD CONSTRAINT "ai_content_provider_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_provider_requests"
    ADD CONSTRAINT "ai_content_provider_requests_session_id_action_type_request_key" UNIQUE ("session_id", "action_type", "request_id");



ALTER TABLE ONLY "public"."ai_content_session_references"
    ADD CONSTRAINT "ai_content_session_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_sessions"
    ADD CONSTRAINT "ai_content_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_accessories"
    ADD CONSTRAINT "ai_model_accessories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_assets"
    ADD CONSTRAINT "ai_model_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_outfits"
    ADD CONSTRAINT "ai_model_outfits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_prompts"
    ADD CONSTRAINT "ai_model_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_relationships"
    ADD CONSTRAINT "ai_model_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_relationships"
    ADD CONSTRAINT "ai_model_relationships_unique" UNIQUE ("client_id", "model_id", "related_model_id", "relationship_type");



ALTER TABLE ONLY "public"."ai_models"
    ADD CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_photography"
    ADD CONSTRAINT "ai_photography_client_id_module_key_key" UNIQUE ("client_id", "module_key");



ALTER TABLE ONLY "public"."ai_photography"
    ADD CONSTRAINT "ai_photography_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_library"
    ADD CONSTRAINT "asset_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_uploads"
    ADD CONSTRAINT "asset_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_findings"
    ADD CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_sessions"
    ADD CONSTRAINT "audit_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blueprint_answers"
    ADD CONSTRAINT "blueprint_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blueprint_templates"
    ADD CONSTRAINT "blueprint_templates_industry_question_key_key" UNIQUE ("industry", "question_key");



ALTER TABLE ONLY "public"."blueprint_templates"
    ADD CONSTRAINT "blueprint_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brain_update_proposals"
    ADD CONSTRAINT "brain_update_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_playbooks"
    ADD CONSTRAINT "brand_playbooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_blueprints"
    ADD CONSTRAINT "client_blueprints_client_id_industry_key" UNIQUE ("client_id", "industry");



ALTER TABLE ONLY "public"."client_blueprints"
    ADD CONSTRAINT "client_blueprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain"
    ADD CONSTRAINT "client_brain_client_id_question_key_key" UNIQUE ("client_id", "question_key");



ALTER TABLE ONLY "public"."client_brain_file_objects"
    ADD CONSTRAINT "client_brain_file_objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_file_objects"
    ADD CONSTRAINT "client_brain_file_objects_storage_bucket_storage_path_key" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."client_brain_pinterest_inspirations"
    ADD CONSTRAINT "client_brain_pinterest_inspiration_client_id_file_object_id_key" UNIQUE ("client_id", "file_object_id");



ALTER TABLE ONLY "public"."client_brain_pinterest_inspirations"
    ADD CONSTRAINT "client_brain_pinterest_inspirations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain"
    ADD CONSTRAINT "client_brain_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_drafts"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_drafts_client_id_id_key" UNIQUE ("client_id", "id");



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_drafts"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_temp_files"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_storage_bucket_storage_path_key" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_temp_files"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_temp_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_commercial_details"
    ADD CONSTRAINT "client_brain_v2_commercial_details_pkey" PRIMARY KEY ("record_id");



ALTER TABLE ONLY "public"."client_brain_v2_links"
    ADD CONSTRAINT "client_brain_v2_links_client_id_from_record_id_to_record_id_key" UNIQUE ("client_id", "from_record_id", "to_record_id", "relation_type");



ALTER TABLE ONLY "public"."client_brain_v2_links"
    ADD CONSTRAINT "client_brain_v2_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_client_id_source_record_id_canon_key" UNIQUE ("client_id", "source_record_id", "canonical_name", "source_page");



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_record_files"
    ADD CONSTRAINT "client_brain_v2_record_files_client_id_record_id_file_objec_key" UNIQUE ("client_id", "record_id", "file_object_id");



ALTER TABLE ONLY "public"."client_brain_v2_record_files"
    ADD CONSTRAINT "client_brain_v2_record_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_record_versions"
    ADD CONSTRAINT "client_brain_v2_record_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_client_id_id_key" UNIQUE ("client_id", "id");



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_client_id_stable_key_key" UNIQUE ("client_id", "stable_key");



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_content_months"
    ADD CONSTRAINT "client_content_months_client_id_month_start_key" UNIQUE ("client_id", "month_start");



ALTER TABLE ONLY "public"."client_content_months"
    ADD CONSTRAINT "client_content_months_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_claim_evidence"
    ADD CONSTRAINT "client_intelligence_claim_evidence_pkey" PRIMARY KEY ("claim_id", "evidence_id");



ALTER TABLE ONLY "public"."client_intelligence_claims"
    ADD CONSTRAINT "client_intelligence_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_competitors"
    ADD CONSTRAINT "client_intelligence_competitors_client_id_name_key" UNIQUE ("client_id", "name");



ALTER TABLE ONLY "public"."client_intelligence_competitors"
    ADD CONSTRAINT "client_intelligence_competitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_discoveries"
    ADD CONSTRAINT "client_intelligence_discoveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_discoveries"
    ADD CONSTRAINT "client_intelligence_discoveries_scan_id_source_url_key" UNIQUE ("scan_id", "source_url");



ALTER TABLE ONLY "public"."client_intelligence_evidence"
    ADD CONSTRAINT "client_intelligence_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_evidence"
    ADD CONSTRAINT "client_intelligence_evidence_scan_id_source_url_key" UNIQUE ("scan_id", "source_url");



ALTER TABLE ONLY "public"."client_intelligence_opportunities"
    ADD CONSTRAINT "client_intelligence_opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_opportunity_evidence"
    ADD CONSTRAINT "client_intelligence_opportunity_evidence_pkey" PRIMARY KEY ("opportunity_id", "evidence_id");



ALTER TABLE ONLY "public"."client_intelligence_public_discrepancies"
    ADD CONSTRAINT "client_intelligence_public_discrepancies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_scan_steps"
    ADD CONSTRAINT "client_intelligence_scan_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intelligence_scan_steps"
    ADD CONSTRAINT "client_intelligence_scan_steps_scan_id_step_key_key" UNIQUE ("scan_id", "step_key");



ALTER TABLE ONLY "public"."client_intelligence_scans"
    ADD CONSTRAINT "client_intelligence_scans_execution_id_key" UNIQUE ("execution_id");



ALTER TABLE ONLY "public"."client_intelligence_scans"
    ADD CONSTRAINT "client_intelligence_scans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_knowledge"
    ADD CONSTRAINT "client_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_secure_credential_audit_events"
    ADD CONSTRAINT "client_secure_credential_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_secure_credentials"
    ADD CONSTRAINT "client_secure_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."command_plans"
    ADD CONSTRAINT "command_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_product_relationships"
    ADD CONSTRAINT "commercial_product_relationsh_product_id_related_product_id_key" UNIQUE ("product_id", "related_product_id", "relationship_type");



ALTER TABLE ONLY "public"."commercial_product_relationships"
    ADD CONSTRAINT "commercial_product_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_product_roadmap_phases"
    ADD CONSTRAINT "commercial_product_roadmap_phases_pkey" PRIMARY KEY ("product_id", "roadmap_phase_id", "relationship_type");



ALTER TABLE ONLY "public"."commercial_products"
    ADD CONSTRAINT "commercial_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_products"
    ADD CONSTRAINT "commercial_products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."commercial_recommended_combination_items"
    ADD CONSTRAINT "commercial_recommended_combination_items_pkey" PRIMARY KEY ("combination_id", "product_id");



ALTER TABLE ONLY "public"."commercial_recommended_combinations"
    ADD CONSTRAINT "commercial_recommended_combinations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_recommended_combinations"
    ADD CONSTRAINT "commercial_recommended_combinations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."copy_requests"
    ADD CONSTRAINT "copy_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliverable_activity"
    ADD CONSTRAINT "deliverable_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliverable_assets"
    ADD CONSTRAINT "deliverable_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliverable_copy"
    ADD CONSTRAINT "deliverable_copy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliverable_revisions"
    ADD CONSTRAINT "deliverable_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."execution_reviews"
    ADD CONSTRAINT "execution_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."execution_runs"
    ADD CONSTRAINT "execution_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_model_relationships"
    ADD CONSTRAINT "guest_model_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_models"
    ADD CONSTRAINT "guest_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_cost_subscriptions"
    ADD CONSTRAINT "jarvis_cost_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_cost_subscriptions"
    ADD CONSTRAINT "jarvis_cost_subscriptions_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_activity"
    ADD CONSTRAINT "jarvis_finance_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_bank_allocations"
    ADD CONSTRAINT "jarvis_finance_bank_allocatio_bank_transaction_id_target_ty_key" UNIQUE ("bank_transaction_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."jarvis_finance_bank_allocations"
    ADD CONSTRAINT "jarvis_finance_bank_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_bank_statements"
    ADD CONSTRAINT "jarvis_finance_bank_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_bank_statements"
    ADD CONSTRAINT "jarvis_finance_bank_statements_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."jarvis_finance_bank_transactions"
    ADD CONSTRAINT "jarvis_finance_bank_transactions_identity_fingerprint_key" UNIQUE ("identity_fingerprint");



ALTER TABLE ONLY "public"."jarvis_finance_bank_transactions"
    ADD CONSTRAINT "jarvis_finance_bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_capital_policy"
    ADD CONSTRAINT "jarvis_finance_capital_policy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_expenses"
    ADD CONSTRAINT "jarvis_finance_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_expenses"
    ADD CONSTRAINT "jarvis_finance_expenses_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_fx_rates"
    ADD CONSTRAINT "jarvis_finance_fx_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_fx_rates"
    ADD CONSTRAINT "jarvis_finance_fx_rates_rate_date_base_currency_quote_curre_key" UNIQUE ("rate_date", "base_currency", "quote_currency", "source");



ALTER TABLE ONLY "public"."jarvis_finance_income_records"
    ADD CONSTRAINT "jarvis_finance_income_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_income_records"
    ADD CONSTRAINT "jarvis_finance_income_records_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_investments"
    ADD CONSTRAINT "jarvis_finance_investments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_investments"
    ADD CONSTRAINT "jarvis_finance_investments_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_invoice_attachments"
    ADD CONSTRAINT "jarvis_finance_invoice_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_invoice_attachments"
    ADD CONSTRAINT "jarvis_finance_invoice_attachments_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."jarvis_finance_invoices"
    ADD CONSTRAINT "jarvis_finance_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_invoices"
    ADD CONSTRAINT "jarvis_finance_invoices_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_owner_draws"
    ADD CONSTRAINT "jarvis_finance_owner_draws_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_pipeline"
    ADD CONSTRAINT "jarvis_finance_pipeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_pipeline"
    ADD CONSTRAINT "jarvis_finance_pipeline_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_settings"
    ADD CONSTRAINT "jarvis_finance_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_upcoming_revenue"
    ADD CONSTRAINT "jarvis_finance_upcoming_revenue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_finance_upcoming_revenue"
    ADD CONSTRAINT "jarvis_finance_upcoming_revenue_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."jarvis_finance_vendor_rules"
    ADD CONSTRAINT "jarvis_finance_vendor_rules_normalized_pattern_scope_catego_key" UNIQUE ("normalized_pattern", "scope", "category");



ALTER TABLE ONLY "public"."jarvis_finance_vendor_rules"
    ADD CONSTRAINT "jarvis_finance_vendor_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_personal_expenses"
    ADD CONSTRAINT "jarvis_personal_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_personal_income_events"
    ADD CONSTRAINT "jarvis_personal_income_events_owner_draw_id_key" UNIQUE ("owner_draw_id");



ALTER TABLE ONLY "public"."jarvis_personal_income_events"
    ADD CONSTRAINT "jarvis_personal_income_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_research_runs"
    ADD CONSTRAINT "jarvis_research_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_research_sources"
    ADD CONSTRAINT "jarvis_research_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_research_sources"
    ADD CONSTRAINT "jarvis_research_sources_run_id_source_url_key" UNIQUE ("run_id", "source_url");



ALTER TABLE ONLY "public"."jarvis_task_suggestion_suppressions"
    ADD CONSTRAINT "jarvis_task_suggestion_suppre_dedupe_identity_evidence_hash_key" UNIQUE ("dedupe_identity", "evidence_hash");



ALTER TABLE ONLY "public"."jarvis_task_suggestion_suppressions"
    ADD CONSTRAINT "jarvis_task_suggestion_suppressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jarvis_tasks"
    ADD CONSTRAINT "jarvis_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_events"
    ADD CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_pricing"
    ADD CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_cycles"
    ADD CONSTRAINT "monthly_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pitch_deck_profiles"
    ADD CONSTRAINT "pitch_deck_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pitch_deck_research_sources"
    ADD CONSTRAINT "pitch_deck_research_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pitch_deck_research_sources"
    ADD CONSTRAINT "pitch_deck_research_sources_profile_id_slug_key" UNIQUE ("profile_id", "slug");



ALTER TABLE ONLY "public"."platform_rules"
    ADD CONSTRAINT "platform_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_library"
    ADD CONSTRAINT "research_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_tasks"
    ADD CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_activity"
    ADD CONSTRAINT "roadmap_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_dependencies"
    ADD CONSTRAINT "roadmap_dependencies_item_id_depends_on_item_id_key" UNIQUE ("item_id", "depends_on_item_id");



ALTER TABLE ONLY "public"."roadmap_dependencies"
    ADD CONSTRAINT "roadmap_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_idea_activity"
    ADD CONSTRAINT "roadmap_idea_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_idea_agent_links"
    ADD CONSTRAINT "roadmap_idea_agent_links_idea_id_agent_id_relationship_type_key" UNIQUE ("idea_id", "agent_id", "relationship_type");



ALTER TABLE ONLY "public"."roadmap_idea_agent_links"
    ADD CONSTRAINT "roadmap_idea_agent_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_idea_capability_links"
    ADD CONSTRAINT "roadmap_idea_capability_links_idea_id_roadmap_item_id_relat_key" UNIQUE ("idea_id", "roadmap_item_id", "relationship_type");



ALTER TABLE ONLY "public"."roadmap_idea_capability_links"
    ADD CONSTRAINT "roadmap_idea_capability_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_idea_skill_links"
    ADD CONSTRAINT "roadmap_idea_skill_links_idea_id_agent_skill_id_key" UNIQUE ("idea_id", "agent_skill_id");



ALTER TABLE ONLY "public"."roadmap_idea_skill_links"
    ADD CONSTRAINT "roadmap_idea_skill_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_idea_tool_links"
    ADD CONSTRAINT "roadmap_idea_tool_links_idea_id_tool_id_relationship_type_key" UNIQUE ("idea_id", "tool_id", "relationship_type");



ALTER TABLE ONLY "public"."roadmap_idea_tool_links"
    ADD CONSTRAINT "roadmap_idea_tool_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_ideas"
    ADD CONSTRAINT "roadmap_ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_project_id_slug_key" UNIQUE ("project_id", "slug");



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_project_id_slug_key" UNIQUE ("project_id", "slug");



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_project_id_sort_order_key" UNIQUE ("project_id", "sort_order");



ALTER TABLE ONLY "public"."roadmap_projects"
    ADD CONSTRAINT "roadmap_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_projects"
    ADD CONSTRAINT "roadmap_projects_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."sandbox_runs"
    ADD CONSTRAINT "sandbox_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_lessons"
    ADD CONSTRAINT "skill_lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_audience_snapshots"
    ADD CONSTRAINT "social_audience_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_caption_generations"
    ADD CONSTRAINT "social_caption_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_caption_intervention_events"
    ADD CONSTRAINT "social_caption_intervention_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_caption_profiles"
    ADD CONSTRAINT "social_caption_profiles_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."social_caption_profiles"
    ADD CONSTRAINT "social_caption_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_caption_options"
    ADD CONSTRAINT "social_content_caption_options_item_generation_option_key" UNIQUE ("social_content_item_id", "generation_id", "option_number");



ALTER TABLE ONLY "public"."social_content_caption_options"
    ADD CONSTRAINT "social_content_caption_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_items"
    ADD CONSTRAINT "social_content_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_media"
    ADD CONSTRAINT "social_content_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_media"
    ADD CONSTRAINT "social_content_media_social_content_item_id_sort_order_key" UNIQUE ("social_content_item_id", "sort_order");



ALTER TABLE ONLY "public"."social_content_months"
    ADD CONSTRAINT "social_content_months_client_id_month_start_key" UNIQUE ("client_id", "month_start");



ALTER TABLE ONLY "public"."social_content_months"
    ADD CONSTRAINT "social_content_months_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_platform_targets"
    ADD CONSTRAINT "social_content_platform_targe_social_content_item_id_platfo_key" UNIQUE ("social_content_item_id", "platform");



ALTER TABLE ONLY "public"."social_content_platform_targets"
    ADD CONSTRAINT "social_content_platform_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_understanding"
    ADD CONSTRAINT "social_content_understanding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_content_understanding"
    ADD CONSTRAINT "social_content_understanding_social_content_media_id_key" UNIQUE ("social_content_media_id");



ALTER TABLE ONLY "public"."social_follower_observations"
    ADD CONSTRAINT "social_follower_observations_client_id_provider_provider_ac_key" UNIQUE ("client_id", "provider", "provider_account_id", "observation_date");



ALTER TABLE ONLY "public"."social_follower_observations"
    ADD CONSTRAINT "social_follower_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_intelligence_artifacts"
    ADD CONSTRAINT "social_intelligence_artifacts_client_id_artifact_version_da_key" UNIQUE ("client_id", "artifact_version", "data_revision");



ALTER TABLE ONLY "public"."social_intelligence_artifacts"
    ADD CONSTRAINT "social_intelligence_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_items_client_id_id_key" UNIQUE ("client_id", "id");



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_items_monthly_plan_id_position_key" UNIQUE ("monthly_plan_id", "position");



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_content_plans"
    ADD CONSTRAINT "social_monthly_content_plans_client_id_id_key" UNIQUE ("client_id", "id");



ALTER TABLE ONLY "public"."social_monthly_content_plans"
    ADD CONSTRAINT "social_monthly_content_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_plan_activity"
    ADD CONSTRAINT "social_monthly_plan_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_plan_ai_executions"
    ADD CONSTRAINT "social_monthly_plan_ai_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_plan_concept_grids"
    ADD CONSTRAINT "social_monthly_plan_concept_grids_monthly_plan_id_version_key" UNIQUE ("monthly_plan_id", "version");



ALTER TABLE ONLY "public"."social_monthly_plan_concept_grids"
    ADD CONSTRAINT "social_monthly_plan_concept_grids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_production_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_production_monthly_plan_item_id_version_key" UNIQUE ("monthly_plan_item_id", "version");



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_observ_snapshot_id_provider_post_id_key" UNIQUE ("snapshot_id", "provider_post_id");



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_performance_snapshots"
    ADD CONSTRAINT "social_performance_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_posting_frequency_snapshots"
    ADD CONSTRAINT "social_posting_frequency_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_provider_connections"
    ADD CONSTRAINT "social_provider_connections_client_id_provider_platform_pla_key" UNIQUE ("client_id", "provider", "platform", "platform_account_id");



ALTER TABLE ONLY "public"."social_provider_connections"
    ADD CONSTRAINT "social_provider_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_provider_connections"
    ADD CONSTRAINT "social_provider_connections_provider_platform_platform_acco_key" UNIQUE ("provider", "platform", "platform_account_id");



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_tar_social_provider_execution_id__key" UNIQUE ("social_provider_execution_id", "social_content_platform_target_id");



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_tar_social_provider_execution_id_key1" UNIQUE ("social_provider_execution_id", "provider_connection_id");



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_provider_executions"
    ADD CONSTRAINT "social_provider_executions_client_id_idempotency_key_key" UNIQUE ("client_id", "idempotency_key");



ALTER TABLE ONLY "public"."social_provider_executions"
    ADD CONSTRAINT "social_provider_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_provider_executions"
    ADD CONSTRAINT "social_provider_executions_social_content_item_id_provider__key" UNIQUE ("social_content_item_id", "provider", "publishing_payload_version");



ALTER TABLE ONLY "public"."social_provider_webhook_events"
    ADD CONSTRAINT "social_provider_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_provider_webhook_events"
    ADD CONSTRAINT "social_provider_webhook_events_provider_provider_event_id_key" UNIQUE ("provider", "provider_event_id");



ALTER TABLE ONLY "public"."social_refresh_diagnostics"
    ADD CONSTRAINT "social_refresh_diagnostics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_social_content_item_id_scheduled_da_key" UNIQUE ("social_content_item_id", "scheduled_date", "scheduled_time");



ALTER TABLE ONLY "public"."social_story_schedule_slots"
    ADD CONSTRAINT "social_story_schedule_slots_client_id_weekday_local_time_la_key" UNIQUE ("client_id", "weekday", "local_time", "label");



ALTER TABLE ONLY "public"."social_story_schedule_slots"
    ADD CONSTRAINT "social_story_schedule_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_commands"
    ADD CONSTRAINT "telegram_commands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."token_budgets"
    ADD CONSTRAINT "token_budgets_agent_id_task_type_key" UNIQUE ("agent_id", "task_type");



ALTER TABLE ONLY "public"."token_budgets"
    ADD CONSTRAINT "token_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tool_activity"
    ADD CONSTRAINT "tool_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tool_capability_links"
    ADD CONSTRAINT "tool_capability_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tool_capability_links"
    ADD CONSTRAINT "tool_capability_links_tool_id_roadmap_item_id_relationship__key" UNIQUE ("tool_id", "roadmap_item_id", "relationship_type");



ALTER TABLE ONLY "public"."tool_registry"
    ADD CONSTRAINT "tool_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tool_registry"
    ADD CONSTRAINT "tool_registry_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_capability_links_agent_idx" ON "public"."agent_capability_links" USING "btree" ("agent_id");



CREATE INDEX "agent_capability_links_capability_idx" ON "public"."agent_capability_links" USING "btree" ("roadmap_item_id");



CREATE INDEX "agent_organization_activity_agent_created_idx" ON "public"."agent_organization_activity" USING "btree" ("agent_id", "created_at" DESC);



CREATE INDEX "agent_organization_profiles_department_idx" ON "public"."agent_organization_profiles" USING "btree" ("department_id", "operational_status", "sort_order");



CREATE INDEX "agent_organization_profiles_manager_idx" ON "public"."agent_organization_profiles" USING "btree" ("manager_agent_id");



CREATE INDEX "agent_runs_client_created_idx" ON "public"."agent_runs" USING "btree" ("client_id", "created_at" DESC) WHERE ("client_id" IS NOT NULL);



CREATE INDEX "agent_runs_definition_created_idx" ON "public"."agent_runs" USING "btree" ("agent_runtime_definition_id", "created_at" DESC);



CREATE INDEX "agent_runs_parent_created_idx" ON "public"."agent_runs" USING "btree" ("parent_run_id", "created_at") WHERE ("parent_run_id" IS NOT NULL);



CREATE UNIQUE INDEX "agent_runtime_active_resource_lock" ON "public"."agent_runs" USING "btree" ("agent_runtime_definition_id", "resource_key") WHERE ("status" = ANY (ARRAY['queued'::"text", 'observing'::"text", 'running'::"text", 'waiting_for_approval'::"text", 'waiting_for_external'::"text", 'recovery_required'::"text"]));



CREATE INDEX "agent_tool_links_agent_idx" ON "public"."agent_tool_links" USING "btree" ("agent_id");



CREATE INDEX "agent_tool_links_tool_idx" ON "public"."agent_tool_links" USING "btree" ("tool_id");



CREATE INDEX "ai_content_generations_session_version_idx" ON "public"."ai_content_generations" USING "btree" ("session_id", "version" DESC);



CREATE INDEX "ai_content_prompt_versions_session_version_idx" ON "public"."ai_content_prompt_versions" USING "btree" ("session_id", "version" DESC);



CREATE INDEX "ai_content_provider_requests_session_created_idx" ON "public"."ai_content_provider_requests" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "ai_content_session_references_session_order_idx" ON "public"."ai_content_session_references" USING "btree" ("session_id", "reference_order");



CREATE INDEX "ai_content_sessions_active_generation_idx" ON "public"."ai_content_sessions" USING "btree" ("active_generation_id") WHERE ("active_generation_id" IS NOT NULL);



CREATE INDEX "ai_content_sessions_client_updated_idx" ON "public"."ai_content_sessions" USING "btree" ("client_id", "updated_at" DESC);



CREATE INDEX "ai_model_accessories_client_id_idx" ON "public"."ai_model_accessories" USING "btree" ("client_id");



CREATE INDEX "ai_model_accessories_model_category_idx" ON "public"."ai_model_accessories" USING "btree" ("model_id", "category");



CREATE INDEX "ai_model_assets_client_id_idx" ON "public"."ai_model_assets" USING "btree" ("client_id");



CREATE INDEX "ai_model_assets_model_slot_idx" ON "public"."ai_model_assets" USING "btree" ("model_id", "asset_type", "status");



CREATE INDEX "ai_model_outfits_client_id_idx" ON "public"."ai_model_outfits" USING "btree" ("client_id");



CREATE INDEX "ai_model_outfits_model_status_idx" ON "public"."ai_model_outfits" USING "btree" ("model_id", "status");



CREATE INDEX "ai_model_prompts_client_id_idx" ON "public"."ai_model_prompts" USING "btree" ("client_id");



CREATE INDEX "ai_model_prompts_model_created_idx" ON "public"."ai_model_prompts" USING "btree" ("model_id", "created_at" DESC);



CREATE INDEX "ai_model_relationships_client_model_idx" ON "public"."ai_model_relationships" USING "btree" ("client_id", "model_id");



CREATE INDEX "ai_model_relationships_related_model_idx" ON "public"."ai_model_relationships" USING "btree" ("client_id", "related_model_id");



CREATE INDEX "ai_models_client_id_idx" ON "public"."ai_models" USING "btree" ("client_id");



CREATE INDEX "ai_models_client_status_idx" ON "public"."ai_models" USING "btree" ("client_id", "status");



CREATE INDEX "ai_photography_client_id_idx" ON "public"."ai_photography" USING "btree" ("client_id");



CREATE INDEX "ai_usage_logs_client_id_idx" ON "public"."ai_usage_logs" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "ai_usage_logs_created_at_idx" ON "public"."ai_usage_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "ai_usage_logs_feature_idx" ON "public"."ai_usage_logs" USING "btree" ("feature") WHERE ("feature" IS NOT NULL);



CREATE INDEX "ai_usage_logs_route_idx" ON "public"."ai_usage_logs" USING "btree" ("route");



CREATE INDEX "asset_uploads_client_idx" ON "public"."asset_uploads" USING "btree" ("client_id", "uploaded_at" DESC);



CREATE INDEX "audit_findings_session_idx" ON "public"."audit_findings" USING "btree" ("audit_session_id");



CREATE INDEX "audit_findings_status_idx" ON "public"."audit_findings" USING "btree" ("status");



CREATE INDEX "audit_findings_target_idx" ON "public"."audit_findings" USING "btree" ("target_table");



CREATE INDEX "blueprint_answers_blueprint_idx" ON "public"."blueprint_answers" USING "btree" ("blueprint_id", "section_index", "question_key");



CREATE INDEX "blueprint_answers_memory_idx" ON "public"."blueprint_answers" USING "btree" ("client_id", "is_memory_eligible", "status");



CREATE INDEX "blueprint_answers_status_idx" ON "public"."blueprint_answers" USING "btree" ("client_id", "status");



CREATE INDEX "blueprint_templates_industry_idx" ON "public"."blueprint_templates" USING "btree" ("industry", "section_index", "question_key");



CREATE INDEX "brain_proposals_brain_idx" ON "public"."brain_update_proposals" USING "btree" ("client_brain_id", "status");



CREATE INDEX "brain_proposals_client_idx" ON "public"."brain_update_proposals" USING "btree" ("client_id", "status", "created_at" DESC);



CREATE INDEX "brain_proposals_upload_idx" ON "public"."brain_update_proposals" USING "btree" ("asset_upload_id");



CREATE INDEX "brand_playbooks_client_idx" ON "public"."brand_playbooks" USING "btree" ("client_id", "status", "importance" DESC);



CREATE INDEX "brand_playbooks_deliverables_idx" ON "public"."brand_playbooks" USING "gin" ("applicable_deliverables");



CREATE INDEX "brand_playbooks_platforms_idx" ON "public"."brand_playbooks" USING "gin" ("applicable_platforms");



CREATE INDEX "brand_playbooks_section_idx" ON "public"."brand_playbooks" USING "btree" ("section", "status");



CREATE INDEX "brand_playbooks_tags_idx" ON "public"."brand_playbooks" USING "gin" ("tags");



CREATE INDEX "brand_playbooks_workspace_idx" ON "public"."brand_playbooks" USING "btree" ("workspace_id", "status", "importance" DESC);



CREATE INDEX "client_brain_client_idx" ON "public"."client_brain" USING "btree" ("client_id", "question_key");



CREATE INDEX "client_brain_pinterest_inspirations_best_for_idx" ON "public"."client_brain_pinterest_inspirations" USING "gin" ("best_for");



CREATE INDEX "client_brain_pinterest_inspirations_categories_idx" ON "public"."client_brain_pinterest_inspirations" USING "gin" ("creative_categories");



CREATE INDEX "client_brain_pinterest_inspirations_client_status_idx" ON "public"."client_brain_pinterest_inspirations" USING "btree" ("client_id", "status", "updated_at" DESC);



CREATE INDEX "client_brain_pinterest_inspirations_techniques_idx" ON "public"."client_brain_pinterest_inspirations" USING "gin" ("creative_techniques");



CREATE INDEX "client_brain_status_idx" ON "public"."client_brain" USING "btree" ("client_id", "status");



CREATE INDEX "client_brain_v2_asset_ingestion_drafts_client_state_idx" ON "public"."client_brain_v2_asset_ingestion_drafts" USING "btree" ("client_id", "state", "updated_at" DESC);



CREATE INDEX "client_brain_v2_asset_ingestion_temp_files_draft_idx" ON "public"."client_brain_v2_asset_ingestion_temp_files" USING "btree" ("client_id", "draft_id", "sort_order");



CREATE INDEX "client_brain_v2_commercial_client_type_idx" ON "public"."client_brain_v2_commercial_details" USING "btree" ("client_id", "object_type");



CREATE INDEX "client_brain_v2_commercial_record_client_idx" ON "public"."client_brain_v2_commercial_details" USING "btree" ("client_id", "record_id");



CREATE INDEX "client_brain_v2_links_from_idx" ON "public"."client_brain_v2_links" USING "btree" ("client_id", "from_record_id", "relation_type");



CREATE INDEX "client_brain_v2_links_to_idx" ON "public"."client_brain_v2_links" USING "btree" ("client_id", "to_record_id", "relation_type");



CREATE INDEX "client_brain_v2_menu_items_activation_idx" ON "public"."client_brain_v2_menu_items" USING "btree" ("client_id", "activation_record_id") WHERE ("activation_record_id" IS NOT NULL);



CREATE INDEX "client_brain_v2_menu_items_aliases_idx" ON "public"."client_brain_v2_menu_items" USING "gin" ("aliases");



CREATE INDEX "client_brain_v2_menu_items_lookup_idx" ON "public"."client_brain_v2_menu_items" USING "btree" ("client_id", "menu_record_id", "normalized_name") WHERE ("source_status" = 'current'::"text");



CREATE INDEX "client_brain_v2_menu_items_source_idx" ON "public"."client_brain_v2_menu_items" USING "btree" ("client_id", "source_record_id", "source_status");



CREATE INDEX "client_brain_v2_record_files_file_idx" ON "public"."client_brain_v2_record_files" USING "btree" ("file_object_id");



CREATE INDEX "client_brain_v2_record_files_record_idx" ON "public"."client_brain_v2_record_files" USING "btree" ("client_id", "record_id", "approval_status");



CREATE INDEX "client_brain_v2_records_client_section_idx" ON "public"."client_brain_v2_records" USING "btree" ("client_id", "top_section", "subsection", "status");



CREATE INDEX "client_brain_v2_records_client_type_idx" ON "public"."client_brain_v2_records" USING "btree" ("client_id", "record_type", "status");



CREATE INDEX "client_brain_v2_records_legacy_asset_idx" ON "public"."client_brain_v2_records" USING "btree" ("legacy_asset_upload_id") WHERE ("legacy_asset_upload_id" IS NOT NULL);



CREATE INDEX "client_brain_v2_records_legacy_brain_idx" ON "public"."client_brain_v2_records" USING "btree" ("legacy_client_brain_id") WHERE ("legacy_client_brain_id" IS NOT NULL);



CREATE INDEX "client_brain_v2_records_legacy_knowledge_idx" ON "public"."client_brain_v2_records" USING "btree" ("legacy_client_knowledge_id") WHERE ("legacy_client_knowledge_id" IS NOT NULL);



CREATE INDEX "client_brain_v2_records_review_idx" ON "public"."client_brain_v2_records" USING "btree" ("client_id", "review_at") WHERE (("review_at" IS NOT NULL) AND ("status" <> ALL (ARRAY['archived'::"text", 'superseded'::"text"])));



CREATE INDEX "client_brain_v2_records_superseded_by_idx" ON "public"."client_brain_v2_records" USING "btree" ("superseded_by_id") WHERE ("superseded_by_id" IS NOT NULL);



CREATE INDEX "client_brain_v2_sources_client_status_idx" ON "public"."client_brain_v2_records" USING "btree" ("client_id", "status", "updated_at" DESC) WHERE ("top_section" = 'sources'::"text");



CREATE INDEX "client_brain_v2_sources_client_type_idx" ON "public"."client_brain_v2_records" USING "btree" ("client_id", "source_type") WHERE ("top_section" = 'sources'::"text");



CREATE INDEX "client_brain_v2_versions_record_idx" ON "public"."client_brain_v2_record_versions" USING "btree" ("client_id", "record_id", "changed_at" DESC);



CREATE UNIQUE INDEX "client_content_items_ai_final_unique" ON "public"."client_content_items" USING "btree" ("client_id", "client_content_month_id", "source_generation_id", "content_type") WHERE (("source" = 'ai_content'::"text") AND ("final_state" <> 'archived'::"text") AND ("source_generation_id" IS NOT NULL));



CREATE INDEX "client_content_items_ai_generation_idx" ON "public"."client_content_items" USING "btree" ("client_id", "source_generation_id") WHERE ("source_generation_id" IS NOT NULL);



CREATE INDEX "client_content_items_client_source_idx" ON "public"."client_content_items" USING "btree" ("client_id", "source", "final_state");



CREATE INDEX "client_content_items_month_idx" ON "public"."client_content_items" USING "btree" ("client_content_month_id", "final_state", "created_at" DESC);



CREATE INDEX "client_content_months_client_month_idx" ON "public"."client_content_months" USING "btree" ("client_id", "month_start" DESC);



CREATE INDEX "client_intelligence_claims_client_idx" ON "public"."client_intelligence_claims" USING "btree" ("client_id", "category", "created_at" DESC);



CREATE INDEX "client_intelligence_discoveries_scan_idx" ON "public"."client_intelligence_discoveries" USING "btree" ("scan_id", "created_at" DESC);



CREATE INDEX "client_intelligence_evidence_scan_idx" ON "public"."client_intelligence_evidence" USING "btree" ("scan_id", "retrieved_at" DESC);



CREATE INDEX "client_intelligence_opportunity_evidence_evidence_idx" ON "public"."client_intelligence_opportunity_evidence" USING "btree" ("evidence_id");



CREATE UNIQUE INDEX "client_intelligence_public_discrepancy_once_idx" ON "public"."client_intelligence_public_discrepancies" USING "btree" ("scan_id", "evidence_id", "category") WHERE ("evidence_id" IS NOT NULL);



CREATE INDEX "client_intelligence_scans_client_idx" ON "public"."client_intelligence_scans" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "client_intelligence_steps_scan_idx" ON "public"."client_intelligence_scan_steps" USING "btree" ("scan_id", "created_at");



CREATE INDEX "client_secure_credential_audit_client_idx" ON "public"."client_secure_credential_audit_events" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "client_secure_credentials_client_idx" ON "public"."client_secure_credentials" USING "btree" ("client_id", "status", "updated_at" DESC);



CREATE INDEX "commercial_product_relationships_product_idx" ON "public"."commercial_product_relationships" USING "btree" ("product_id");



CREATE INDEX "commercial_product_relationships_related_idx" ON "public"."commercial_product_relationships" USING "btree" ("related_product_id");



CREATE INDEX "commercial_product_roadmap_phases_phase_idx" ON "public"."commercial_product_roadmap_phases" USING "btree" ("roadmap_phase_id");



CREATE INDEX "commercial_products_browse_idx" ON "public"."commercial_products" USING "btree" ("active", "catalog_type", "family", "position", "name");



CREATE INDEX "context_logs_agent_idx" ON "public"."context_logs" USING "btree" ("agent_id", "created_at" DESC);



CREATE INDEX "context_logs_client_idx" ON "public"."context_logs" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "context_logs_execution_run_idx" ON "public"."context_logs" USING "btree" ("execution_run_id");



CREATE INDEX "context_logs_outcome_idx" ON "public"."context_logs" USING "btree" ("outcome", "created_at" DESC);



CREATE INDEX "context_logs_sandbox_run_idx" ON "public"."context_logs" USING "btree" ("sandbox_run_id");



CREATE INDEX "crm_contacts_client_active_updated_idx" ON "public"."crm_contacts" USING "btree" ("client_id", "updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "crm_contacts_client_created_idx" ON "public"."crm_contacts" USING "btree" ("client_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "crm_contacts_client_display_name_idx" ON "public"."crm_contacts" USING "btree" ("client_id", "lower"("display_name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "crm_contacts_client_email_idx" ON "public"."crm_contacts" USING "btree" ("client_id", "lower"("email")) WHERE (("deleted_at" IS NULL) AND ("email" IS NOT NULL));



CREATE INDEX "crm_contacts_client_phone_idx" ON "public"."crm_contacts" USING "btree" ("client_id", "phone") WHERE (("deleted_at" IS NULL) AND ("phone" IS NOT NULL));



CREATE INDEX "execution_queue_command_id_idx" ON "public"."execution_queue" USING "btree" ("command_id");



CREATE INDEX "execution_queue_poll_idx" ON "public"."execution_queue" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "execution_reviews_queue_id_idx" ON "public"."execution_reviews" USING "btree" ("execution_queue_id");



CREATE INDEX "execution_reviews_status_idx" ON "public"."execution_reviews" USING "btree" ("status");



CREATE INDEX "execution_runs_queue_id_idx" ON "public"."execution_runs" USING "btree" ("execution_queue_id");



CREATE INDEX "execution_runs_status_idx" ON "public"."execution_runs" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "guest_model_relationships_client_model_idx" ON "public"."guest_model_relationships" USING "btree" ("client_id", "model_id");



CREATE INDEX "guest_model_relationships_related_model_idx" ON "public"."guest_model_relationships" USING "btree" ("related_model_id");



CREATE INDEX "guest_models_client_id_idx" ON "public"."guest_models" USING "btree" ("client_id");



CREATE INDEX "jarvis_cost_subscriptions_client_idx" ON "public"."jarvis_cost_subscriptions" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "jarvis_cost_subscriptions_renewal_idx" ON "public"."jarvis_cost_subscriptions" USING "btree" ("status", "next_renewal_date") WHERE ("status" = 'active'::"text");



CREATE INDEX "jarvis_finance_activity_record_idx" ON "public"."jarvis_finance_activity" USING "btree" ("record_type", "record_id", "created_at" DESC);



CREATE INDEX "jarvis_finance_bank_allocations_target_idx" ON "public"."jarvis_finance_bank_allocations" USING "btree" ("target_type", "target_id");



CREATE INDEX "jarvis_finance_bank_allocations_transaction_idx" ON "public"."jarvis_finance_bank_allocations" USING "btree" ("bank_transaction_id");



CREATE INDEX "jarvis_finance_bank_statements_period_idx" ON "public"."jarvis_finance_bank_statements" USING "btree" ("statement_end_date" DESC);



CREATE INDEX "jarvis_finance_bank_transactions_review_idx" ON "public"."jarvis_finance_bank_transactions" USING "btree" ("classification_status", "scope", "transaction_date" DESC);



CREATE INDEX "jarvis_finance_bank_transactions_statement_idx" ON "public"."jarvis_finance_bank_transactions" USING "btree" ("statement_id", "transaction_date");



CREATE INDEX "jarvis_finance_bank_transactions_statement_resolution_idx" ON "public"."jarvis_finance_bank_transactions" USING "btree" ("statement_id", "classification_status");



CREATE INDEX "jarvis_finance_expenses_active_idx" ON "public"."jarvis_finance_expenses" USING "btree" ("active", "expense_date" DESC);



CREATE INDEX "jarvis_finance_expenses_allocation_idx" ON "public"."jarvis_finance_expenses" USING "btree" ("client_allocation_name") WHERE ("client_allocation_name" IS NOT NULL);



CREATE INDEX "jarvis_finance_expenses_client_idx" ON "public"."jarvis_finance_expenses" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "jarvis_finance_fx_rates_date_idx" ON "public"."jarvis_finance_fx_rates" USING "btree" ("rate_date" DESC);



CREATE INDEX "jarvis_finance_income_active_idx" ON "public"."jarvis_finance_income_records" USING "btree" ("active", "billing_cycle", "start_date");



CREATE INDEX "jarvis_finance_income_client_idx" ON "public"."jarvis_finance_income_records" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "jarvis_finance_investments_active_idx" ON "public"."jarvis_finance_investments" USING "btree" ("classification", "status", "priority", "desired_purchase_date");



CREATE INDEX "jarvis_finance_invoice_attachments_invoice_idx" ON "public"."jarvis_finance_invoice_attachments" USING "btree" ("invoice_id", "created_at" DESC);



CREATE INDEX "jarvis_finance_invoices_client_idx" ON "public"."jarvis_finance_invoices" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE UNIQUE INDEX "jarvis_finance_invoices_income_month_idx" ON "public"."jarvis_finance_invoices" USING "btree" ("income_record_id", "invoice_month");



CREATE INDEX "jarvis_finance_invoices_month_idx" ON "public"."jarvis_finance_invoices" USING "btree" ("invoice_month", "sent_at", "due_at");



CREATE INDEX "jarvis_finance_owner_draws_period_idx" ON "public"."jarvis_finance_owner_draws" USING "btree" ("business_period_start", "status");



CREATE INDEX "jarvis_finance_pipeline_stage_start_idx" ON "public"."jarvis_finance_pipeline" USING "btree" ("stage", "expected_start_date");



CREATE INDEX "jarvis_finance_upcoming_status_start_idx" ON "public"."jarvis_finance_upcoming_revenue" USING "btree" ("status", "expected_start_date");



CREATE INDEX "jarvis_personal_expenses_active_idx" ON "public"."jarvis_personal_expenses" USING "btree" ("active", "expense_date" DESC);



CREATE INDEX "jarvis_research_runs_client_idx" ON "public"."jarvis_research_runs" USING "btree" ("client_id", "created_at" DESC) WHERE ("client_id" IS NOT NULL);



CREATE INDEX "jarvis_research_runs_created_idx" ON "public"."jarvis_research_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "jarvis_research_sources_run_idx" ON "public"."jarvis_research_sources" USING "btree" ("run_id", "created_at");



CREATE INDEX "jarvis_task_suggestion_suppressions_lookup_idx" ON "public"."jarvis_task_suggestion_suppressions" USING "btree" ("dedupe_identity", "evidence_hash");



CREATE INDEX "jarvis_tasks_client_idx" ON "public"."jarvis_tasks" USING "btree" ("client_id", "status") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "jarvis_tasks_dedupe_evidence_idx" ON "public"."jarvis_tasks" USING "btree" ("dedupe_identity", "source_evidence_hash") WHERE (("dedupe_identity" IS NOT NULL) AND ("source_evidence_hash" IS NOT NULL));



CREATE INDEX "jarvis_tasks_queue_idx" ON "public"."jarvis_tasks" USING "btree" ("status", "due_at", "priority", "manual_order", "created_at");



CREATE INDEX "learning_events_agent_idx" ON "public"."learning_events" USING "btree" ("agent_id", "created_at" DESC);



CREATE INDEX "learning_events_client_idx" ON "public"."learning_events" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "learning_events_created_idx" ON "public"."learning_events" USING "btree" ("created_at" DESC);



CREATE INDEX "learning_events_status_idx" ON "public"."learning_events" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "learning_events_type_idx" ON "public"."learning_events" USING "btree" ("event_type", "status");



CREATE UNIQUE INDEX "model_pricing_provider_model_key" ON "public"."model_pricing" USING "btree" ("provider", "model_name");



CREATE INDEX "pitch_deck_research_profile_idx" ON "public"."pitch_deck_research_sources" USING "btree" ("profile_id", "active", "sort_order");



CREATE INDEX "platform_rules_platform_idx" ON "public"."platform_rules" USING "btree" ("platform", "status", "importance" DESC);



CREATE INDEX "rejection_patterns_agent_idx" ON "public"."rejection_patterns" USING "btree" ("agent_id", "status");



CREATE INDEX "rejection_patterns_client_idx" ON "public"."rejection_patterns" USING "btree" ("client_id", "status", "created_at" DESC);



CREATE INDEX "rejection_patterns_issue_idx" ON "public"."rejection_patterns" USING "btree" ("issue_type", "status");



CREATE INDEX "rejection_patterns_severity_idx" ON "public"."rejection_patterns" USING "btree" ("severity" DESC, "recurrence_count" DESC);



CREATE INDEX "roadmap_activity_project_created_idx" ON "public"."roadmap_activity" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "roadmap_dependencies_dependency_idx" ON "public"."roadmap_dependencies" USING "btree" ("depends_on_item_id");



CREATE INDEX "roadmap_dependencies_item_idx" ON "public"."roadmap_dependencies" USING "btree" ("item_id");



CREATE INDEX "roadmap_idea_activity_idea_created_idx" ON "public"."roadmap_idea_activity" USING "btree" ("idea_id", "created_at" DESC);



CREATE INDEX "roadmap_idea_agent_links_idea_idx" ON "public"."roadmap_idea_agent_links" USING "btree" ("idea_id");



CREATE INDEX "roadmap_idea_capability_links_idea_idx" ON "public"."roadmap_idea_capability_links" USING "btree" ("idea_id");



CREATE INDEX "roadmap_idea_skill_links_idea_idx" ON "public"."roadmap_idea_skill_links" USING "btree" ("idea_id");



CREATE INDEX "roadmap_idea_tool_links_idea_idx" ON "public"."roadmap_idea_tool_links" USING "btree" ("idea_id");



CREATE INDEX "roadmap_ideas_project_phase_idx" ON "public"."roadmap_ideas" USING "btree" ("project_id", "potential_phase_id", "category");



CREATE INDEX "roadmap_ideas_project_status_idx" ON "public"."roadmap_ideas" USING "btree" ("project_id", "status", "updated_at" DESC);



CREATE UNIQUE INDEX "roadmap_ideas_project_title_unique_idx" ON "public"."roadmap_ideas" USING "btree" ("project_id", "lower"("title"));



CREATE INDEX "roadmap_items_focus_idx" ON "public"."roadmap_items" USING "btree" ("project_id", "is_focus") WHERE "is_focus";



CREATE INDEX "roadmap_items_parent_idx" ON "public"."roadmap_items" USING "btree" ("parent_item_id");



CREATE INDEX "roadmap_items_phase_status_idx" ON "public"."roadmap_items" USING "btree" ("phase_id", "status");



CREATE INDEX "roadmap_items_priority_idx" ON "public"."roadmap_items" USING "btree" ("project_id", "priority", "target_date");



CREATE INDEX "roadmap_items_project_status_idx" ON "public"."roadmap_items" USING "btree" ("project_id", "status");



CREATE INDEX "roadmap_phases_project_sort_idx" ON "public"."roadmap_phases" USING "btree" ("project_id", "sort_order");



CREATE INDEX "sandbox_runs_command_id_idx" ON "public"."sandbox_runs" USING "btree" ("command_id");



CREATE INDEX "social_audience_snapshots_latest_idx" ON "public"."social_audience_snapshots" USING "btree" ("client_id", "provider", "fetched_at" DESC);



CREATE INDEX "social_content_items_client_schedule_idx" ON "public"."social_content_items" USING "btree" ("client_id", "scheduled_at");



CREATE INDEX "social_content_items_context_gin_idx" ON "public"."social_content_items" USING "gin" ("content_context");



CREATE INDEX "social_content_items_month_kind_sequence_idx" ON "public"."social_content_items" USING "btree" ("social_content_month_id", "content_kind", "sequence");



CREATE INDEX "social_content_media_item_order_idx" ON "public"."social_content_media" USING "btree" ("social_content_item_id", "sort_order");



CREATE INDEX "social_content_months_client_month_idx" ON "public"."social_content_months" USING "btree" ("client_id", "month_start" DESC);



CREATE INDEX "social_content_targets_item_idx" ON "public"."social_content_platform_targets" USING "btree" ("social_content_item_id");



CREATE INDEX "social_content_understanding_client_item_idx" ON "public"."social_content_understanding" USING "btree" ("client_id", "social_content_item_id");



CREATE INDEX "social_content_understanding_hash_idx" ON "public"."social_content_understanding" USING "btree" ("client_id", "content_sha256");



CREATE INDEX "social_follower_observations_client_date_idx" ON "public"."social_follower_observations" USING "btree" ("client_id", "platform", "observation_date");



CREATE INDEX "social_intelligence_artifacts_client_created_idx" ON "public"."social_intelligence_artifacts" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "social_intelligence_artifacts_run_idx" ON "public"."social_intelligence_artifacts" USING "btree" ("agent_run_id") WHERE ("agent_run_id" IS NOT NULL);



CREATE INDEX "social_monthly_content_plan_items_plan_position_idx" ON "public"."social_monthly_content_plan_items" USING "btree" ("monthly_plan_id", "position");



CREATE INDEX "social_monthly_content_plans_client_month_idx" ON "public"."social_monthly_content_plans" USING "btree" ("client_id", "plan_month" DESC, "updated_at" DESC);



CREATE UNIQUE INDEX "social_monthly_content_plans_current_month_idx" ON "public"."social_monthly_content_plans" USING "btree" ("client_id", "platform", "plan_month") WHERE "is_current";



CREATE UNIQUE INDEX "social_monthly_content_plans_month_version_idx" ON "public"."social_monthly_content_plans" USING "btree" ("client_id", "platform", "plan_month", "plan_version");



CREATE INDEX "social_monthly_content_plans_supersedes_idx" ON "public"."social_monthly_content_plans" USING "btree" ("supersedes_plan_id") WHERE ("supersedes_plan_id" IS NOT NULL);



CREATE INDEX "social_monthly_plan_activity_plan_created_idx" ON "public"."social_monthly_plan_activity" USING "btree" ("monthly_plan_id", "created_at" DESC);



CREATE INDEX "social_monthly_plan_ai_executions_client_plan_started_idx" ON "public"."social_monthly_plan_ai_executions" USING "btree" ("client_id", "monthly_plan_id", "started_at" DESC);



CREATE INDEX "social_monthly_plan_concept_grids_client_plan_created_idx" ON "public"."social_monthly_plan_concept_grids" USING "btree" ("client_id", "monthly_plan_id", "created_at" DESC);



CREATE UNIQUE INDEX "social_monthly_plan_concept_grids_selected_idx" ON "public"."social_monthly_plan_concept_grids" USING "btree" ("monthly_plan_id") WHERE "is_selected";



CREATE INDEX "social_monthly_plan_items_visual_direction_idx" ON "public"."social_monthly_content_plan_items" USING "btree" ("monthly_plan_id", "shot_scale", "camera_angle", "composition");



CREATE INDEX "social_monthly_production_artifacts_item_created_idx" ON "public"."social_monthly_plan_production_artifacts" USING "btree" ("client_id", "monthly_plan_id", "monthly_plan_item_id", "created_at" DESC);



CREATE UNIQUE INDEX "social_monthly_production_artifacts_selected_idx" ON "public"."social_monthly_plan_production_artifacts" USING "btree" ("monthly_plan_item_id") WHERE "is_selected";



CREATE INDEX "social_performance_post_observations_client_date_idx" ON "public"."social_performance_post_observations" USING "btree" ("client_id", "platform", "published_at" DESC);



CREATE INDEX "social_performance_post_observations_execution_idx" ON "public"."social_performance_post_observations" USING "btree" ("social_provider_execution_id") WHERE ("social_provider_execution_id" IS NOT NULL);



CREATE INDEX "social_performance_snapshots_latest_idx" ON "public"."social_performance_snapshots" USING "btree" ("client_id", "platform", "period_key", "synced_at" DESC);



CREATE INDEX "social_posting_frequency_latest_idx" ON "public"."social_posting_frequency_snapshots" USING "btree" ("client_id", "provider", "observed_at" DESC);



CREATE INDEX "social_provider_connections_client_idx" ON "public"."social_provider_connections" USING "btree" ("client_id", "provider", "status");



CREATE INDEX "social_provider_execution_targets_target_idx" ON "public"."social_provider_execution_targets" USING "btree" ("social_content_platform_target_id");



CREATE INDEX "social_provider_executions_client_status_idx" ON "public"."social_provider_executions" USING "btree" ("client_id", "status", "created_at" DESC);



CREATE INDEX "social_provider_executions_item_idx" ON "public"."social_provider_executions" USING "btree" ("social_content_item_id", "created_at" DESC);



CREATE INDEX "social_provider_executions_recovery_idx" ON "public"."social_provider_executions" USING "btree" ("status", "updated_at") WHERE ("status" = 'recovery_required'::"text");



CREATE INDEX "social_provider_webhook_events_execution_idx" ON "public"."social_provider_webhook_events" USING "btree" ("social_provider_execution_id", "received_at" DESC);



CREATE INDEX "social_refresh_diagnostics_client_created_idx" ON "public"."social_refresh_diagnostics" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "social_story_placements_client_item_idx" ON "public"."social_story_placements" USING "btree" ("client_id", "social_content_item_id");



CREATE INDEX "social_story_placements_month_schedule_idx" ON "public"."social_story_placements" USING "btree" ("social_content_month_id", "scheduled_date", "scheduled_time");



CREATE INDEX "social_story_schedule_slots_client_idx" ON "public"."social_story_schedule_slots" USING "btree" ("client_id", "weekday", "local_time");



CREATE INDEX "successful_outputs_agent_idx" ON "public"."successful_outputs" USING "btree" ("agent_id", "status");



CREATE INDEX "successful_outputs_client_idx" ON "public"."successful_outputs" USING "btree" ("client_id", "status", "created_at" DESC);



CREATE INDEX "successful_outputs_skill_idx" ON "public"."successful_outputs" USING "btree" ("skill_id", "status");



CREATE INDEX "successful_outputs_type_idx" ON "public"."successful_outputs" USING "btree" ("output_type", "status");



CREATE INDEX "token_budgets_agent_idx" ON "public"."token_budgets" USING "btree" ("agent_id", "task_type");



CREATE INDEX "tool_activity_tool_created_idx" ON "public"."tool_activity" USING "btree" ("tool_id", "created_at" DESC);



CREATE INDEX "tool_capability_links_capability_idx" ON "public"."tool_capability_links" USING "btree" ("roadmap_item_id");



CREATE INDEX "tool_capability_links_tool_idx" ON "public"."tool_capability_links" USING "btree" ("tool_id");



CREATE INDEX "tool_registry_connection_idx" ON "public"."tool_registry" USING "btree" ("connection_status") WHERE ("connection_status" = ANY (ARRAY['connected'::"text", 'configured'::"text", 'partial'::"text", 'error'::"text"]));



CREATE INDEX "tool_registry_usage_category_idx" ON "public"."tool_registry" USING "btree" ("usage_status", "category", "name");



CREATE OR REPLACE TRIGGER "agent_departments_set_updated_at" BEFORE UPDATE ON "public"."agent_departments" FOR EACH ROW EXECUTE FUNCTION "public"."agent_organization_set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_organization_profiles_set_updated_at" BEFORE UPDATE ON "public"."agent_organization_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."agent_organization_set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_run_approvals_set_updated_at" BEFORE UPDATE ON "public"."agent_run_approvals" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_runs_set_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_runtime_definitions_set_updated_at" BEFORE UPDATE ON "public"."agent_runtime_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_runtime_settings_set_updated_at" BEFORE UPDATE ON "public"."agent_runtime_settings" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "brand_playbooks_updated_at" BEFORE UPDATE ON "public"."brand_playbooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_brand_playbooks_updated_at"();



CREATE OR REPLACE TRIGGER "commercial_products_set_updated_at" BEFORE UPDATE ON "public"."commercial_products" FOR EACH ROW EXECUTE FUNCTION "public"."commercial_catalog_set_updated_at"();



CREATE OR REPLACE TRIGGER "commercial_recommended_combinations_set_updated_at" BEFORE UPDATE ON "public"."commercial_recommended_combinations" FOR EACH ROW EXECUTE FUNCTION "public"."commercial_catalog_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_cost_subscriptions_set_updated_at" BEFORE UPDATE ON "public"."jarvis_cost_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_tools_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_bank_allocation_total_guard" BEFORE INSERT OR UPDATE OF "bank_transaction_id", "allocated_amount" ON "public"."jarvis_finance_bank_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_guard_bank_allocation_total"();



CREATE OR REPLACE TRIGGER "jarvis_finance_bank_statements_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_bank_statements" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_bank_transactions_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_capital_policy_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_capital_policy" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_expenses_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_income_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_income_records" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_investments_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_investments" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_invoices_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_owner_draws_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_owner_draws" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_pipeline_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_pipeline" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_settings_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_settings" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_finance_upcoming_revenue_set_updated_at" BEFORE UPDATE ON "public"."jarvis_finance_upcoming_revenue" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_personal_expenses_set_updated_at" BEFORE UPDATE ON "public"."jarvis_personal_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_finance_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_research_runs_set_updated_at" BEFORE UPDATE ON "public"."jarvis_research_runs" FOR EACH ROW EXECUTE FUNCTION "public"."jarvis_tools_set_updated_at"();



CREATE OR REPLACE TRIGGER "jarvis_tasks_set_updated_at" BEFORE UPDATE ON "public"."jarvis_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "normalize_crm_contact_before_write" BEFORE INSERT OR UPDATE ON "public"."crm_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_crm_contact"();



CREATE OR REPLACE TRIGGER "pitch_deck_profiles_set_updated_at" BEFORE UPDATE ON "public"."pitch_deck_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."pitch_deck_set_updated_at"();



CREATE OR REPLACE TRIGGER "pitch_deck_research_set_updated_at" BEFORE UPDATE ON "public"."pitch_deck_research_sources" FOR EACH ROW EXECUTE FUNCTION "public"."pitch_deck_set_updated_at"();



CREATE OR REPLACE TRIGGER "roadmap_ideas_set_updated_at" BEFORE UPDATE ON "public"."roadmap_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."roadmap_ideas_set_updated_at"();



CREATE OR REPLACE TRIGGER "roadmap_items_set_updated_at" BEFORE UPDATE ON "public"."roadmap_items" FOR EACH ROW EXECUTE FUNCTION "public"."roadmap_set_updated_at"();



CREATE OR REPLACE TRIGGER "roadmap_phases_set_updated_at" BEFORE UPDATE ON "public"."roadmap_phases" FOR EACH ROW EXECUTE FUNCTION "public"."roadmap_set_updated_at"();



CREATE OR REPLACE TRIGGER "roadmap_projects_set_updated_at" BEFORE UPDATE ON "public"."roadmap_projects" FOR EACH ROW EXECUTE FUNCTION "public"."roadmap_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_ai_model_accessories_updated_at" BEFORE UPDATE ON "public"."ai_model_accessories" FOR EACH ROW EXECUTE FUNCTION "public"."set_ai_model_library_updated_at"();



CREATE OR REPLACE TRIGGER "set_ai_model_outfits_updated_at" BEFORE UPDATE ON "public"."ai_model_outfits" FOR EACH ROW EXECUTE FUNCTION "public"."set_ai_model_library_updated_at"();



CREATE OR REPLACE TRIGGER "set_ai_model_relationships_updated_at" BEFORE UPDATE ON "public"."ai_model_relationships" FOR EACH ROW EXECUTE FUNCTION "public"."set_ai_model_library_updated_at"();



CREATE OR REPLACE TRIGGER "set_ai_models_updated_at" BEFORE UPDATE ON "public"."ai_models" FOR EACH ROW EXECUTE FUNCTION "public"."set_ai_model_library_updated_at"();



CREATE OR REPLACE TRIGGER "set_guest_model_relationships_updated_at" BEFORE UPDATE ON "public"."guest_model_relationships" FOR EACH ROW EXECUTE FUNCTION "public"."set_guest_model_relationships_updated_at"();



CREATE OR REPLACE TRIGGER "set_guest_models_updated_at" BEFORE UPDATE ON "public"."guest_models" FOR EACH ROW EXECUTE FUNCTION "public"."set_guest_models_updated_at"();



CREATE OR REPLACE TRIGGER "social_intelligence_artifacts_set_updated_at" BEFORE UPDATE ON "public"."social_intelligence_artifacts" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runtime_set_updated_at"();



CREATE OR REPLACE TRIGGER "stale_concept_grids_after_item_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."social_monthly_content_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_item"();



CREATE OR REPLACE TRIGGER "stale_concept_grids_after_plan_change" AFTER UPDATE ON "public"."social_monthly_content_plans" FOR EACH ROW EXECUTE FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_plan"();



CREATE OR REPLACE TRIGGER "stale_production_artifacts_after_item_change" AFTER DELETE OR UPDATE ON "public"."social_monthly_content_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."mark_social_monthly_production_artifacts_stale_from_item"();



CREATE OR REPLACE TRIGGER "tool_registry_set_updated_at" BEFORE UPDATE ON "public"."tool_registry" FOR EACH ROW EXECUTE FUNCTION "public"."tool_registry_set_updated_at"();



CREATE OR REPLACE TRIGGER "touch_ai_content_generations_updated_at" BEFORE UPDATE ON "public"."ai_content_generations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_content_studio_updated_at"();



CREATE OR REPLACE TRIGGER "touch_ai_content_prompt_versions_updated_at" BEFORE UPDATE ON "public"."ai_content_prompt_versions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_content_studio_updated_at"();



CREATE OR REPLACE TRIGGER "touch_ai_content_provider_requests_updated_at" BEFORE UPDATE ON "public"."ai_content_provider_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_content_studio_updated_at"();



CREATE OR REPLACE TRIGGER "touch_ai_content_sessions_updated_at" BEFORE UPDATE ON "public"."ai_content_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_content_studio_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_file_objects" BEFORE UPDATE ON "public"."client_brain_file_objects" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_pinterest_inspirations" BEFORE UPDATE ON "public"."client_brain_pinterest_inspirations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_v2_asset_ingestion_drafts" BEFORE UPDATE ON "public"."client_brain_v2_asset_ingestion_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_v2_commercial_details" BEFORE UPDATE ON "public"."client_brain_v2_commercial_details" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_v2_menu_items" BEFORE UPDATE ON "public"."client_brain_v2_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_brain_v2_records" BEFORE UPDATE ON "public"."client_brain_v2_records" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_brain_v2_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_content_items_updated_at" BEFORE UPDATE ON "public"."client_content_items" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_content_months_updated_at" BEFORE UPDATE ON "public"."client_content_months" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_client_secure_credentials_updated_at" BEFORE UPDATE ON "public"."client_secure_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_caption_options_updated_at" BEFORE UPDATE ON "public"."social_content_caption_options" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_items_updated_at" BEFORE UPDATE ON "public"."social_content_items" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_media_updated_at" BEFORE UPDATE ON "public"."social_content_media" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_months_updated_at" BEFORE UPDATE ON "public"."social_content_months" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_platform_targets_updated_at" BEFORE UPDATE ON "public"."social_content_platform_targets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_content_understanding_updated_at" BEFORE UPDATE ON "public"."social_content_understanding" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_monthly_content_plan_item_updated_at" BEFORE UPDATE ON "public"."social_monthly_content_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_monthly_content_plan_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_monthly_content_plan_updated_at" BEFORE UPDATE ON "public"."social_monthly_content_plans" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_monthly_content_plan_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_monthly_plan_concept_grid_updated_at" BEFORE UPDATE ON "public"."social_monthly_plan_concept_grids" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_monthly_plan_concept_grid_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_monthly_plan_production_artifact_updated_at" BEFORE UPDATE ON "public"."social_monthly_plan_production_artifacts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_monthly_plan_production_artifact_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_provider_connections_updated_at" BEFORE UPDATE ON "public"."social_provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_provider_execution_targets_updated_at" BEFORE UPDATE ON "public"."social_provider_execution_targets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_provider_executions_updated_at" BEFORE UPDATE ON "public"."social_provider_executions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_story_placements_updated_at" BEFORE UPDATE ON "public"."social_story_placements" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "touch_social_story_schedule_slots_updated_at" BEFORE UPDATE ON "public"."social_story_schedule_slots" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_publishing_updated_at"();



CREATE OR REPLACE TRIGGER "version_client_brain_v2_records" BEFORE UPDATE ON "public"."client_brain_v2_records" FOR EACH ROW EXECUTE FUNCTION "public"."capture_client_brain_v2_record_version"();



ALTER TABLE ONLY "public"."agent_capability_links"
    ADD CONSTRAINT "agent_capability_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_capability_links"
    ADD CONSTRAINT "agent_capability_links_roadmap_item_id_fkey" FOREIGN KEY ("roadmap_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_lessons"
    ADD CONSTRAINT "agent_lessons_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_organization_activity"
    ADD CONSTRAINT "agent_organization_activity_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_organization_profiles"
    ADD CONSTRAINT "agent_organization_profiles_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_organization_profiles"
    ADD CONSTRAINT "agent_organization_profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."agent_departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_organization_profiles"
    ADD CONSTRAINT "agent_organization_profiles_manager_agent_id_fkey" FOREIGN KEY ("manager_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_run_approvals"
    ADD CONSTRAINT "agent_run_approvals_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_run_model_calls"
    ADD CONSTRAINT "agent_run_model_calls_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_agent_runtime_definition_id_fkey" FOREIGN KEY ("agent_runtime_definition_id") REFERENCES "public"."agent_runtime_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_legacy_execution_queue_id_fkey" FOREIGN KEY ("legacy_execution_queue_id") REFERENCES "public"."execution_queue"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runtime_definition_skills"
    ADD CONSTRAINT "agent_runtime_definition_skill_agent_runtime_definition_id_fkey" FOREIGN KEY ("agent_runtime_definition_id") REFERENCES "public"."agent_runtime_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runtime_definition_skills"
    ADD CONSTRAINT "agent_runtime_definition_skills_agent_skill_id_fkey" FOREIGN KEY ("agent_skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_runtime_definitions"
    ADD CONSTRAINT "agent_runtime_definitions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_task_outputs"
    ADD CONSTRAINT "agent_task_outputs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "public"."telegram_commands"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."command_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tool_links"
    ADD CONSTRAINT "agent_tool_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tool_links"
    ADD CONSTRAINT "agent_tool_links_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_content_prompt_versions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_content_generations"
    ADD CONSTRAINT "ai_content_generations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_content_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_prompt_versions"
    ADD CONSTRAINT "ai_content_prompt_versions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_prompt_versions"
    ADD CONSTRAINT "ai_content_prompt_versions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_content_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_provider_requests"
    ADD CONSTRAINT "ai_content_provider_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_provider_requests"
    ADD CONSTRAINT "ai_content_provider_requests_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_content_prompt_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_content_provider_requests"
    ADD CONSTRAINT "ai_content_provider_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_content_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_session_references"
    ADD CONSTRAINT "ai_content_session_references_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_session_references"
    ADD CONSTRAINT "ai_content_session_references_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_content_session_references"
    ADD CONSTRAINT "ai_content_session_references_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_content_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_content_sessions"
    ADD CONSTRAINT "ai_content_sessions_active_generation_id_fkey" FOREIGN KEY ("active_generation_id") REFERENCES "public"."ai_content_generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_content_sessions"
    ADD CONSTRAINT "ai_content_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_accessories"
    ADD CONSTRAINT "ai_model_accessories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_accessories"
    ADD CONSTRAINT "ai_model_accessories_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_assets"
    ADD CONSTRAINT "ai_model_assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_assets"
    ADD CONSTRAINT "ai_model_assets_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_outfits"
    ADD CONSTRAINT "ai_model_outfits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_outfits"
    ADD CONSTRAINT "ai_model_outfits_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_prompts"
    ADD CONSTRAINT "ai_model_prompts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_prompts"
    ADD CONSTRAINT "ai_model_prompts_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_prompts"
    ADD CONSTRAINT "ai_model_prompts_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "public"."ai_model_outfits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_model_relationships"
    ADD CONSTRAINT "ai_model_relationships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_relationships"
    ADD CONSTRAINT "ai_model_relationships_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_relationships"
    ADD CONSTRAINT "ai_model_relationships_related_model_id_fkey" FOREIGN KEY ("related_model_id") REFERENCES "public"."ai_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_models"
    ADD CONSTRAINT "ai_models_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_photography"
    ADD CONSTRAINT "ai_photography_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_library"
    ADD CONSTRAINT "asset_library_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_library"
    ADD CONSTRAINT "asset_library_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_library"
    ADD CONSTRAINT "asset_library_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_uploads"
    ADD CONSTRAINT "asset_uploads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_uploads"
    ADD CONSTRAINT "asset_uploads_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "public"."asset_uploads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_findings"
    ADD CONSTRAINT "audit_findings_audit_session_id_fkey" FOREIGN KEY ("audit_session_id") REFERENCES "public"."audit_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_findings"
    ADD CONSTRAINT "audit_findings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_sessions"
    ADD CONSTRAINT "audit_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blueprint_answers"
    ADD CONSTRAINT "blueprint_answers_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "public"."client_blueprints"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blueprint_answers"
    ADD CONSTRAINT "blueprint_answers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blueprint_answers"
    ADD CONSTRAINT "blueprint_answers_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."blueprint_templates"("id");



ALTER TABLE ONLY "public"."brain_update_proposals"
    ADD CONSTRAINT "brain_update_proposals_asset_upload_id_fkey" FOREIGN KEY ("asset_upload_id") REFERENCES "public"."asset_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brain_update_proposals"
    ADD CONSTRAINT "brain_update_proposals_client_brain_id_fkey" FOREIGN KEY ("client_brain_id") REFERENCES "public"."client_brain"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brain_update_proposals"
    ADD CONSTRAINT "brain_update_proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brand_playbooks"
    ADD CONSTRAINT "brand_playbooks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brand_playbooks"
    ADD CONSTRAINT "brand_playbooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_blueprints"
    ADD CONSTRAINT "client_blueprints_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain"
    ADD CONSTRAINT "client_brain_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_pinterest_inspirations"
    ADD CONSTRAINT "client_brain_pinterest_inspirations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_pinterest_inspirations"
    ADD CONSTRAINT "client_brain_pinterest_inspirations_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_drafts"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_d_client_id_final_asset_id_fkey" FOREIGN KEY ("client_id", "final_asset_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_drafts"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_d_client_id_menu_record_id_fkey" FOREIGN KEY ("client_id", "menu_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_drafts"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_drafts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_temp_files"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_temp_fi_client_id_draft_id_fkey" FOREIGN KEY ("client_id", "draft_id") REFERENCES "public"."client_brain_v2_asset_ingestion_drafts"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_asset_ingestion_temp_files"
    ADD CONSTRAINT "client_brain_v2_asset_ingestion_temp_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_commercial_details"
    ADD CONSTRAINT "client_brain_v2_commercial_details_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_commercial_details"
    ADD CONSTRAINT "client_brain_v2_commercial_details_client_id_record_id_fkey" FOREIGN KEY ("client_id", "record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_links"
    ADD CONSTRAINT "client_brain_v2_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_links"
    ADD CONSTRAINT "client_brain_v2_links_client_id_from_record_id_fkey" FOREIGN KEY ("client_id", "from_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_links"
    ADD CONSTRAINT "client_brain_v2_links_client_id_to_record_id_fkey" FOREIGN KEY ("client_id", "to_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_client_id_activation_record_id_fkey" FOREIGN KEY ("client_id", "activation_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_client_id_menu_record_id_fkey" FOREIGN KEY ("client_id", "menu_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_client_id_source_record_id_fkey" FOREIGN KEY ("client_id", "source_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_menu_items"
    ADD CONSTRAINT "client_brain_v2_menu_items_source_file_object_id_fkey" FOREIGN KEY ("source_file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_record_files"
    ADD CONSTRAINT "client_brain_v2_record_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_record_files"
    ADD CONSTRAINT "client_brain_v2_record_files_client_id_record_id_fkey" FOREIGN KEY ("client_id", "record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_record_files"
    ADD CONSTRAINT "client_brain_v2_record_files_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_brain_v2_record_versions"
    ADD CONSTRAINT "client_brain_v2_record_versions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_record_versions"
    ADD CONSTRAINT "client_brain_v2_record_versions_client_id_record_id_fkey" FOREIGN KEY ("client_id", "record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_legacy_asset_upload_id_fkey" FOREIGN KEY ("legacy_asset_upload_id") REFERENCES "public"."asset_uploads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_legacy_client_brain_id_fkey" FOREIGN KEY ("legacy_client_brain_id") REFERENCES "public"."client_brain"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_legacy_client_knowledge_id_fkey" FOREIGN KEY ("legacy_client_knowledge_id") REFERENCES "public"."client_knowledge"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_brain_v2_records"
    ADD CONSTRAINT "client_brain_v2_records_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."client_brain_v2_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_client_content_month_id_fkey" FOREIGN KEY ("client_content_month_id") REFERENCES "public"."client_content_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_source_file_object_id_fkey" FOREIGN KEY ("source_file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_source_generation_id_fkey" FOREIGN KEY ("source_generation_id") REFERENCES "public"."ai_content_generations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_content_items"
    ADD CONSTRAINT "client_content_items_source_session_id_fkey" FOREIGN KEY ("source_session_id") REFERENCES "public"."ai_content_sessions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_content_months"
    ADD CONSTRAINT "client_content_months_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_claim_evidence"
    ADD CONSTRAINT "client_intelligence_claim_evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."client_intelligence_claims"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_claim_evidence"
    ADD CONSTRAINT "client_intelligence_claim_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."client_intelligence_evidence"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_claims"
    ADD CONSTRAINT "client_intelligence_claims_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_claims"
    ADD CONSTRAINT "client_intelligence_claims_conflict_record_id_fkey" FOREIGN KEY ("conflict_record_id") REFERENCES "public"."client_brain_v2_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_claims"
    ADD CONSTRAINT "client_intelligence_claims_promotion_record_id_fkey" FOREIGN KEY ("promotion_record_id") REFERENCES "public"."client_brain_v2_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_claims"
    ADD CONSTRAINT "client_intelligence_claims_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_competitors"
    ADD CONSTRAINT "client_intelligence_competitors_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_competitors"
    ADD CONSTRAINT "client_intelligence_competitors_latest_scan_id_fkey" FOREIGN KEY ("latest_scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_discoveries"
    ADD CONSTRAINT "client_intelligence_discoveries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_discoveries"
    ADD CONSTRAINT "client_intelligence_discoveries_research_source_id_fkey" FOREIGN KEY ("research_source_id") REFERENCES "public"."jarvis_research_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_discoveries"
    ADD CONSTRAINT "client_intelligence_discoveries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_evidence"
    ADD CONSTRAINT "client_intelligence_evidence_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_evidence"
    ADD CONSTRAINT "client_intelligence_evidence_research_source_id_fkey" FOREIGN KEY ("research_source_id") REFERENCES "public"."jarvis_research_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_evidence"
    ADD CONSTRAINT "client_intelligence_evidence_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_opportunities"
    ADD CONSTRAINT "client_intelligence_opportunities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_opportunities"
    ADD CONSTRAINT "client_intelligence_opportunities_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_opportunity_evidence"
    ADD CONSTRAINT "client_intelligence_opportunity_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."client_intelligence_evidence"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_opportunity_evidence"
    ADD CONSTRAINT "client_intelligence_opportunity_evidence_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."client_intelligence_opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_public_discrepancies"
    ADD CONSTRAINT "client_intelligence_public_discrepancies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_public_discrepancies"
    ADD CONSTRAINT "client_intelligence_public_discrepancies_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."client_intelligence_evidence"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_public_discrepancies"
    ADD CONSTRAINT "client_intelligence_public_discrepancies_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_scan_steps"
    ADD CONSTRAINT "client_intelligence_scan_steps_provider_run_id_fkey" FOREIGN KEY ("provider_run_id") REFERENCES "public"."jarvis_research_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_intelligence_scan_steps"
    ADD CONSTRAINT "client_intelligence_scan_steps_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."client_intelligence_scans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intelligence_scans"
    ADD CONSTRAINT "client_intelligence_scans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_knowledge"
    ADD CONSTRAINT "client_knowledge_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_secure_credential_audit_events"
    ADD CONSTRAINT "client_secure_credential_audit_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_secure_credential_audit_events"
    ADD CONSTRAINT "client_secure_credential_audit_events_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."client_secure_credentials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_secure_credentials"
    ADD CONSTRAINT "client_secure_credentials_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."command_plans"
    ADD CONSTRAINT "command_plans_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "public"."telegram_commands"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_product_relationships"
    ADD CONSTRAINT "commercial_product_relationships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."commercial_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_product_relationships"
    ADD CONSTRAINT "commercial_product_relationships_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "public"."commercial_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_product_roadmap_phases"
    ADD CONSTRAINT "commercial_product_roadmap_phases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."commercial_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_product_roadmap_phases"
    ADD CONSTRAINT "commercial_product_roadmap_phases_roadmap_phase_id_fkey" FOREIGN KEY ("roadmap_phase_id") REFERENCES "public"."roadmap_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_recommended_combination_items"
    ADD CONSTRAINT "commercial_recommended_combination_items_combination_id_fkey" FOREIGN KEY ("combination_id") REFERENCES "public"."commercial_recommended_combinations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_recommended_combination_items"
    ADD CONSTRAINT "commercial_recommended_combination_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."commercial_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_execution_run_id_fkey" FOREIGN KEY ("execution_run_id") REFERENCES "public"."execution_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_monthly_cycle_id_fkey" FOREIGN KEY ("monthly_cycle_id") REFERENCES "public"."monthly_cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."context_logs"
    ADD CONSTRAINT "context_logs_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "public"."sandbox_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."copy_requests"
    ADD CONSTRAINT "copy_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."copy_requests"
    ADD CONSTRAINT "copy_requests_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."copy_requests"
    ADD CONSTRAINT "copy_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverable_activity"
    ADD CONSTRAINT "deliverable_activity_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverable_assets"
    ADD CONSTRAINT "deliverable_assets_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverable_copy"
    ADD CONSTRAINT "deliverable_copy_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverable_revisions"
    ADD CONSTRAINT "deliverable_revisions_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_monthly_cycle_id_fkey" FOREIGN KEY ("monthly_cycle_id") REFERENCES "public"."monthly_cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "public"."telegram_commands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_model_pricing_id_fkey" FOREIGN KEY ("model_pricing_id") REFERENCES "public"."model_pricing"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "public"."sandbox_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_queue"
    ADD CONSTRAINT "execution_queue_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_reviews"
    ADD CONSTRAINT "execution_reviews_execution_queue_id_fkey" FOREIGN KEY ("execution_queue_id") REFERENCES "public"."execution_queue"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."execution_reviews"
    ADD CONSTRAINT "execution_reviews_reviewer_agent_id_fkey" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_runs"
    ADD CONSTRAINT "execution_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_runs"
    ADD CONSTRAINT "execution_runs_execution_queue_id_fkey" FOREIGN KEY ("execution_queue_id") REFERENCES "public"."execution_queue"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."execution_runs"
    ADD CONSTRAINT "execution_runs_model_pricing_id_fkey" FOREIGN KEY ("model_pricing_id") REFERENCES "public"."model_pricing"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."execution_runs"
    ADD CONSTRAINT "execution_runs_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "public"."sandbox_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_model_relationships"
    ADD CONSTRAINT "guest_model_relationships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_model_relationships"
    ADD CONSTRAINT "guest_model_relationships_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."guest_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_model_relationships"
    ADD CONSTRAINT "guest_model_relationships_related_model_id_fkey" FOREIGN KEY ("related_model_id") REFERENCES "public"."guest_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_models"
    ADD CONSTRAINT "guest_models_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jarvis_cost_subscriptions"
    ADD CONSTRAINT "jarvis_cost_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_bank_allocations"
    ADD CONSTRAINT "jarvis_finance_bank_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."jarvis_finance_bank_transactions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jarvis_finance_bank_statements"
    ADD CONSTRAINT "jarvis_finance_bank_statements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_bank_transactions"
    ADD CONSTRAINT "jarvis_finance_bank_transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "public"."jarvis_finance_bank_statements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jarvis_finance_expenses"
    ADD CONSTRAINT "jarvis_finance_expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_income_records"
    ADD CONSTRAINT "jarvis_finance_income_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_invoice_attachments"
    ADD CONSTRAINT "jarvis_finance_invoice_attachments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_invoice_attachments"
    ADD CONSTRAINT "jarvis_finance_invoice_attachments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."jarvis_finance_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jarvis_finance_invoices"
    ADD CONSTRAINT "jarvis_finance_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_invoices"
    ADD CONSTRAINT "jarvis_finance_invoices_income_record_id_fkey" FOREIGN KEY ("income_record_id") REFERENCES "public"."jarvis_finance_income_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jarvis_finance_pipeline"
    ADD CONSTRAINT "jarvis_finance_pipeline_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_upcoming_revenue"
    ADD CONSTRAINT "jarvis_finance_upcoming_revenue_activated_income_id_fkey" FOREIGN KEY ("activated_income_id") REFERENCES "public"."jarvis_finance_income_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_finance_upcoming_revenue"
    ADD CONSTRAINT "jarvis_finance_upcoming_revenue_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_personal_income_events"
    ADD CONSTRAINT "jarvis_personal_income_events_owner_draw_id_fkey" FOREIGN KEY ("owner_draw_id") REFERENCES "public"."jarvis_finance_owner_draws"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jarvis_research_runs"
    ADD CONSTRAINT "jarvis_research_runs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jarvis_research_sources"
    ADD CONSTRAINT "jarvis_research_sources_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."jarvis_research_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jarvis_tasks"
    ADD CONSTRAINT "jarvis_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."learning_events"
    ADD CONSTRAINT "learning_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_events"
    ADD CONSTRAINT "learning_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_events"
    ADD CONSTRAINT "learning_events_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_cycles"
    ADD CONSTRAINT "monthly_cycles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_cycles"
    ADD CONSTRAINT "monthly_cycles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pitch_deck_research_sources"
    ADD CONSTRAINT "pitch_deck_research_sources_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."pitch_deck_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_execution_review_id_fkey" FOREIGN KEY ("execution_review_id") REFERENCES "public"."execution_reviews"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_execution_run_id_fkey" FOREIGN KEY ("execution_run_id") REFERENCES "public"."execution_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rejection_patterns"
    ADD CONSTRAINT "rejection_patterns_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_monthly_cycle_id_fkey" FOREIGN KEY ("monthly_cycle_id") REFERENCES "public"."monthly_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "public"."research_library"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_links"
    ADD CONSTRAINT "research_links_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_tasks"
    ADD CONSTRAINT "research_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_activity"
    ADD CONSTRAINT "roadmap_activity_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_activity"
    ADD CONSTRAINT "roadmap_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."roadmap_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_dependencies"
    ADD CONSTRAINT "roadmap_dependencies_depends_on_item_id_fkey" FOREIGN KEY ("depends_on_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_dependencies"
    ADD CONSTRAINT "roadmap_dependencies_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_activity"
    ADD CONSTRAINT "roadmap_idea_activity_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."roadmap_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_agent_links"
    ADD CONSTRAINT "roadmap_idea_agent_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."roadmap_idea_agent_links"
    ADD CONSTRAINT "roadmap_idea_agent_links_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."roadmap_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_capability_links"
    ADD CONSTRAINT "roadmap_idea_capability_links_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."roadmap_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_capability_links"
    ADD CONSTRAINT "roadmap_idea_capability_links_roadmap_item_id_fkey" FOREIGN KEY ("roadmap_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."roadmap_idea_skill_links"
    ADD CONSTRAINT "roadmap_idea_skill_links_agent_skill_id_fkey" FOREIGN KEY ("agent_skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."roadmap_idea_skill_links"
    ADD CONSTRAINT "roadmap_idea_skill_links_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."roadmap_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_tool_links"
    ADD CONSTRAINT "roadmap_idea_tool_links_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."roadmap_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_idea_tool_links"
    ADD CONSTRAINT "roadmap_idea_tool_links_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."roadmap_ideas"
    ADD CONSTRAINT "roadmap_ideas_potential_phase_id_fkey" FOREIGN KEY ("potential_phase_id") REFERENCES "public"."roadmap_phases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_ideas"
    ADD CONSTRAINT "roadmap_ideas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."roadmap_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_ideas"
    ADD CONSTRAINT "roadmap_ideas_promoted_roadmap_item_id_fkey" FOREIGN KEY ("promoted_roadmap_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."roadmap_phases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."roadmap_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."roadmap_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sandbox_runs"
    ADD CONSTRAINT "sandbox_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sandbox_runs"
    ADD CONSTRAINT "sandbox_runs_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "public"."telegram_commands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sandbox_runs"
    ADD CONSTRAINT "sandbox_runs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sandbox_runs"
    ADD CONSTRAINT "sandbox_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."skill_lessons"
    ADD CONSTRAINT "skill_lessons_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."skill_lessons"
    ADD CONSTRAINT "skill_lessons_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_audience_snapshots"
    ADD CONSTRAINT "social_audience_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_caption_generations"
    ADD CONSTRAINT "social_caption_generations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_caption_generations"
    ADD CONSTRAINT "social_caption_generations_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_caption_intervention_events"
    ADD CONSTRAINT "social_caption_intervention_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_caption_intervention_events"
    ADD CONSTRAINT "social_caption_intervention_events_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."social_caption_generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_caption_intervention_events"
    ADD CONSTRAINT "social_caption_intervention_events_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_caption_profiles"
    ADD CONSTRAINT "social_caption_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_caption_options"
    ADD CONSTRAINT "social_content_caption_options_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_caption_options"
    ADD CONSTRAINT "social_content_caption_options_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_items"
    ADD CONSTRAINT "social_content_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_items"
    ADD CONSTRAINT "social_content_items_selected_caption_option_id_fkey" FOREIGN KEY ("selected_caption_option_id") REFERENCES "public"."social_content_caption_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_content_items"
    ADD CONSTRAINT "social_content_items_social_content_month_id_fkey" FOREIGN KEY ("social_content_month_id") REFERENCES "public"."social_content_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_items"
    ADD CONSTRAINT "social_content_items_story_schedule_slot_id_fkey" FOREIGN KEY ("story_schedule_slot_id") REFERENCES "public"."social_story_schedule_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_content_media"
    ADD CONSTRAINT "social_content_media_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_media"
    ADD CONSTRAINT "social_content_media_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_months"
    ADD CONSTRAINT "social_content_months_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_platform_targets"
    ADD CONSTRAINT "social_content_platform_targets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_platform_targets"
    ADD CONSTRAINT "social_content_platform_targets_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_understanding"
    ADD CONSTRAINT "social_content_understanding_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_understanding"
    ADD CONSTRAINT "social_content_understanding_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_content_understanding"
    ADD CONSTRAINT "social_content_understanding_social_content_media_id_fkey" FOREIGN KEY ("social_content_media_id") REFERENCES "public"."social_content_media"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_follower_observations"
    ADD CONSTRAINT "social_follower_observations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_intelligence_artifacts"
    ADD CONSTRAINT "social_intelligence_artifacts_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_intelligence_artifacts"
    ADD CONSTRAINT "social_intelligence_artifacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_i_client_id_activation_record__fkey" FOREIGN KEY ("client_id", "activation_record_id") REFERENCES "public"."client_brain_v2_records"("client_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_item_client_id_monthly_plan_id_fkey" FOREIGN KEY ("client_id", "monthly_plan_id") REFERENCES "public"."social_monthly_content_plans"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_content_plan_items"
    ADD CONSTRAINT "social_monthly_content_plan_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_content_plans"
    ADD CONSTRAINT "social_monthly_content_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_content_plans"
    ADD CONSTRAINT "social_monthly_content_plans_supersedes_plan_id_fkey" FOREIGN KEY ("supersedes_plan_id") REFERENCES "public"."social_monthly_content_plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_monthly_plan_activity"
    ADD CONSTRAINT "social_monthly_plan_activity_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_activity"
    ADD CONSTRAINT "social_monthly_plan_activity_client_id_item_id_fkey" FOREIGN KEY ("client_id", "item_id") REFERENCES "public"."social_monthly_content_plan_items"("client_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_monthly_plan_activity"
    ADD CONSTRAINT "social_monthly_plan_activity_client_id_monthly_plan_id_fkey" FOREIGN KEY ("client_id", "monthly_plan_id") REFERENCES "public"."social_monthly_content_plans"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_ai_executions"
    ADD CONSTRAINT "social_monthly_plan_ai_execution_client_id_monthly_plan_id_fkey" FOREIGN KEY ("client_id", "monthly_plan_id") REFERENCES "public"."social_monthly_content_plans"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_ai_executions"
    ADD CONSTRAINT "social_monthly_plan_ai_executions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_concept_grids"
    ADD CONSTRAINT "social_monthly_plan_concept_grid_client_id_monthly_plan_id_fkey" FOREIGN KEY ("client_id", "monthly_plan_id") REFERENCES "public"."social_monthly_content_plans"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_concept_grids"
    ADD CONSTRAINT "social_monthly_plan_concept_grids_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_concept_grids"
    ADD CONSTRAINT "social_monthly_plan_concept_grids_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_productio_client_id_monthly_plan_item__fkey" FOREIGN KEY ("client_id", "monthly_plan_item_id") REFERENCES "public"."social_monthly_content_plan_items"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_production_a_client_id_monthly_plan_id_fkey" FOREIGN KEY ("client_id", "monthly_plan_id") REFERENCES "public"."social_monthly_content_plans"("client_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_production_artifacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_monthly_plan_production_artifacts"
    ADD CONSTRAINT "social_monthly_plan_production_artifacts_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "public"."client_brain_file_objects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_obser_social_provider_execution_id_fkey" FOREIGN KEY ("social_provider_execution_id") REFERENCES "public"."social_provider_executions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_obser_social_provider_execution_ta_fkey" FOREIGN KEY ("social_provider_execution_target_id") REFERENCES "public"."social_provider_execution_targets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_observations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_performance_post_observations"
    ADD CONSTRAINT "social_performance_post_observations_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."social_performance_snapshots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_performance_snapshots"
    ADD CONSTRAINT "social_performance_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posting_frequency_snapshots"
    ADD CONSTRAINT "social_posting_frequency_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_connections"
    ADD CONSTRAINT "social_provider_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_tar_social_content_platform_targ_fkey" FOREIGN KEY ("social_content_platform_target_id") REFERENCES "public"."social_content_platform_targets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_tar_social_provider_execution_id_fkey" FOREIGN KEY ("social_provider_execution_id") REFERENCES "public"."social_provider_executions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_targets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_execution_targets"
    ADD CONSTRAINT "social_provider_execution_targets_provider_connection_id_fkey" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."social_provider_connections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_provider_executions"
    ADD CONSTRAINT "social_provider_executions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_executions"
    ADD CONSTRAINT "social_provider_executions_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_provider_webhook_events"
    ADD CONSTRAINT "social_provider_webhook_event_social_provider_execution_id_fkey" FOREIGN KEY ("social_provider_execution_id") REFERENCES "public"."social_provider_executions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_refresh_diagnostics"
    ADD CONSTRAINT "social_refresh_diagnostics_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_social_content_item_id_fkey" FOREIGN KEY ("social_content_item_id") REFERENCES "public"."social_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_social_content_month_id_fkey" FOREIGN KEY ("social_content_month_id") REFERENCES "public"."social_content_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_story_placements"
    ADD CONSTRAINT "social_story_placements_social_story_schedule_slot_id_fkey" FOREIGN KEY ("social_story_schedule_slot_id") REFERENCES "public"."social_story_schedule_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_story_schedule_slots"
    ADD CONSTRAINT "social_story_schedule_slots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_execution_review_id_fkey" FOREIGN KEY ("execution_review_id") REFERENCES "public"."execution_reviews"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_execution_run_id_fkey" FOREIGN KEY ("execution_run_id") REFERENCES "public"."execution_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."successful_outputs"
    ADD CONSTRAINT "successful_outputs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_commands"
    ADD CONSTRAINT "telegram_commands_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_commands"
    ADD CONSTRAINT "telegram_commands_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_commands"
    ADD CONSTRAINT "telegram_commands_monthly_cycle_id_fkey" FOREIGN KEY ("monthly_cycle_id") REFERENCES "public"."monthly_cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."token_budgets"
    ADD CONSTRAINT "token_budgets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tool_activity"
    ADD CONSTRAINT "tool_activity_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tool_capability_links"
    ADD CONSTRAINT "tool_capability_links_roadmap_item_id_fkey" FOREIGN KEY ("roadmap_item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tool_capability_links"
    ADD CONSTRAINT "tool_capability_links_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



CREATE POLICY "Enable insert for authenticated users only" ON "public"."clients" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."agent_lessons" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."asset_library" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."clients" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."copy_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."deliverables" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."monthly_cycles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."research_tasks" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."workspaces" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable select for all users" ON "public"."deliverables" FOR SELECT USING (true);



CREATE POLICY "Enable update for all users" ON "public"."deliverables" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "activity_insert_public" ON "public"."deliverable_activity" FOR INSERT WITH CHECK (true);



CREATE POLICY "activity_select_public" ON "public"."deliverable_activity" FOR SELECT USING (true);



CREATE POLICY "activity_update_public" ON "public"."deliverable_activity" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."agent_capability_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_organization_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_organization_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_run_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_run_model_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_run_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runtime_definition_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runtime_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runtime_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_skills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_skills_insert_public" ON "public"."agent_skills" FOR INSERT WITH CHECK (true);



CREATE POLICY "agent_skills_select_public" ON "public"."agent_skills" FOR SELECT USING (true);



CREATE POLICY "agent_skills_update_public" ON "public"."agent_skills" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."agent_task_outputs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_tool_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_insert_public" ON "public"."agents" FOR INSERT WITH CHECK (true);



CREATE POLICY "agents_select_public" ON "public"."agents" FOR SELECT USING (true);



CREATE POLICY "agents_update_public" ON "public"."agents" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_content_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_content_prompt_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_content_provider_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_content_session_references" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_content_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_model_accessories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_accessories_delete" ON "public"."ai_model_accessories" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_accessories_insert" ON "public"."ai_model_accessories" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_model_accessories_select" ON "public"."ai_model_accessories" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_accessories_update" ON "public"."ai_model_accessories" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_model_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_assets_delete" ON "public"."ai_model_assets" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_assets_insert" ON "public"."ai_model_assets" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_model_assets_select" ON "public"."ai_model_assets" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_assets_update" ON "public"."ai_model_assets" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_model_outfits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_outfits_delete" ON "public"."ai_model_outfits" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_outfits_insert" ON "public"."ai_model_outfits" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_model_outfits_select" ON "public"."ai_model_outfits" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_outfits_update" ON "public"."ai_model_outfits" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_model_prompts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_prompts_delete" ON "public"."ai_model_prompts" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_prompts_insert" ON "public"."ai_model_prompts" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_model_prompts_select" ON "public"."ai_model_prompts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_prompts_update" ON "public"."ai_model_prompts" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_model_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_relationships_delete" ON "public"."ai_model_relationships" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_relationships_insert" ON "public"."ai_model_relationships" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_model_relationships_select" ON "public"."ai_model_relationships" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_model_relationships_update" ON "public"."ai_model_relationships" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_models" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_models_delete" ON "public"."ai_models" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_models_insert" ON "public"."ai_models" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_models_select" ON "public"."ai_models" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_models_update" ON "public"."ai_models" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_photography" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_photography_delete" ON "public"."ai_photography" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_photography_insert" ON "public"."ai_photography" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "ai_photography_select" ON "public"."ai_photography" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ai_photography_update" ON "public"."ai_photography" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_read" ON "public"."ai_usage_logs" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."asset_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_uploads_insert_public" ON "public"."asset_uploads" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "asset_uploads_select_public" ON "public"."asset_uploads" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "asset_uploads_update_public" ON "public"."asset_uploads" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_insert_public" ON "public"."deliverable_assets" FOR INSERT WITH CHECK (true);



CREATE POLICY "assets_select_public" ON "public"."deliverable_assets" FOR SELECT USING (true);



CREATE POLICY "assets_update_public" ON "public"."deliverable_assets" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."audit_findings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_findings_insert_public" ON "public"."audit_findings" FOR INSERT WITH CHECK (true);



CREATE POLICY "audit_findings_select_public" ON "public"."audit_findings" FOR SELECT USING (true);



CREATE POLICY "audit_findings_update_public" ON "public"."audit_findings" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."audit_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_sessions_insert_public" ON "public"."audit_sessions" FOR INSERT WITH CHECK (true);



CREATE POLICY "audit_sessions_select_public" ON "public"."audit_sessions" FOR SELECT USING (true);



CREATE POLICY "audit_sessions_update_public" ON "public"."audit_sessions" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."blueprint_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blueprint_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blueprint_templates_public_read" ON "public"."blueprint_templates" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "brain_proposals_insert_public" ON "public"."brain_update_proposals" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "brain_proposals_select_public" ON "public"."brain_update_proposals" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "brain_proposals_update_public" ON "public"."brain_update_proposals" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."brain_update_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brand_playbooks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brand_playbooks_delete_public" ON "public"."brand_playbooks" FOR DELETE USING (true);



CREATE POLICY "brand_playbooks_insert_public" ON "public"."brand_playbooks" FOR INSERT WITH CHECK (true);



CREATE POLICY "brand_playbooks_select_public" ON "public"."brand_playbooks" FOR SELECT USING (true);



CREATE POLICY "brand_playbooks_update_public" ON "public"."brand_playbooks" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."client_blueprints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_brain_delete_public" ON "public"."client_brain" FOR DELETE TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."client_brain_file_objects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_brain_insert_public" ON "public"."client_brain" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."client_brain_pinterest_inspirations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_brain_select_public" ON "public"."client_brain" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "client_brain_update_public" ON "public"."client_brain" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."client_brain_v2_asset_ingestion_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_asset_ingestion_temp_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_commercial_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_record_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_record_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_brain_v2_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_content_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_content_months" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_claim_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_competitors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_discoveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_opportunity_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_public_discrepancies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_scan_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intelligence_scans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_knowledge" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_knowledge_insert_public" ON "public"."client_knowledge" FOR INSERT WITH CHECK (true);



CREATE POLICY "client_knowledge_select_public" ON "public"."client_knowledge" FOR SELECT USING (true);



CREATE POLICY "client_knowledge_update_public" ON "public"."client_knowledge" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."client_secure_credential_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_secure_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."command_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commands_insert_public" ON "public"."telegram_commands" FOR INSERT WITH CHECK (true);



CREATE POLICY "commands_select_public" ON "public"."telegram_commands" FOR SELECT USING (true);



CREATE POLICY "commands_update_public" ON "public"."telegram_commands" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."commercial_product_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_product_roadmap_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_recommended_combination_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_recommended_combinations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."context_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "context_logs_delete_public" ON "public"."context_logs" FOR DELETE USING (true);



CREATE POLICY "context_logs_insert_public" ON "public"."context_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "context_logs_select_public" ON "public"."context_logs" FOR SELECT USING (true);



CREATE POLICY "context_logs_update_public" ON "public"."context_logs" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "copy_insert_public" ON "public"."deliverable_copy" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."copy_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "copy_select_public" ON "public"."deliverable_copy" FOR SELECT USING (true);



CREATE POLICY "copy_update_public" ON "public"."deliverable_copy" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."crm_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cycles_select_public" ON "public"."monthly_cycles" FOR SELECT USING (true);



CREATE POLICY "cycles_update_public" ON "public"."monthly_cycles" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."deliverable_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliverable_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliverable_copy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliverable_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliverables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."execution_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "execution_queue_insert_public" ON "public"."execution_queue" FOR INSERT WITH CHECK (true);



CREATE POLICY "execution_queue_select_public" ON "public"."execution_queue" FOR SELECT USING (true);



CREATE POLICY "execution_queue_update_public" ON "public"."execution_queue" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."execution_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "execution_reviews_insert_public" ON "public"."execution_reviews" FOR INSERT WITH CHECK (true);



CREATE POLICY "execution_reviews_select_public" ON "public"."execution_reviews" FOR SELECT USING (true);



CREATE POLICY "execution_reviews_update_public" ON "public"."execution_reviews" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."execution_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "execution_runs_insert_public" ON "public"."execution_runs" FOR INSERT WITH CHECK (true);



CREATE POLICY "execution_runs_select_public" ON "public"."execution_runs" FOR SELECT USING (true);



CREATE POLICY "execution_runs_update_public" ON "public"."execution_runs" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."guest_model_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_models" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_cost_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_bank_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_bank_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_bank_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_capital_policy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_fx_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_income_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_investments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_invoice_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_owner_draws" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_pipeline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_upcoming_revenue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_finance_vendor_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_personal_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_personal_income_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_research_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_research_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_task_suggestion_suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jarvis_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_events_delete" ON "public"."learning_events" FOR DELETE USING (true);



CREATE POLICY "learning_events_insert" ON "public"."learning_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "learning_events_select" ON "public"."learning_events" FOR SELECT USING (true);



CREATE POLICY "learning_events_update" ON "public"."learning_events" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."model_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "model_pricing_insert_public" ON "public"."model_pricing" FOR INSERT WITH CHECK (true);



CREATE POLICY "model_pricing_select_public" ON "public"."model_pricing" FOR SELECT USING (true);



CREATE POLICY "model_pricing_update_public" ON "public"."model_pricing" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."monthly_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pitch_deck_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pitch_deck_research_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_insert_public" ON "public"."command_plans" FOR INSERT WITH CHECK (true);



CREATE POLICY "plans_select_public" ON "public"."command_plans" FOR SELECT USING (true);



CREATE POLICY "plans_update_public" ON "public"."command_plans" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."platform_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_rules_delete_public" ON "public"."platform_rules" FOR DELETE USING (true);



CREATE POLICY "platform_rules_insert_public" ON "public"."platform_rules" FOR INSERT WITH CHECK (true);



CREATE POLICY "platform_rules_select_public" ON "public"."platform_rules" FOR SELECT USING (true);



CREATE POLICY "platform_rules_update_public" ON "public"."platform_rules" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public insert" ON "public"."brand_playbooks" FOR INSERT WITH CHECK (true);



CREATE POLICY "public select" ON "public"."brand_playbooks" FOR SELECT USING (true);



CREATE POLICY "public update" ON "public"."brand_playbooks" FOR UPDATE USING (true);



ALTER TABLE "public"."rejection_patterns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rejection_patterns_delete" ON "public"."rejection_patterns" FOR DELETE USING (true);



CREATE POLICY "rejection_patterns_insert" ON "public"."rejection_patterns" FOR INSERT WITH CHECK (true);



CREATE POLICY "rejection_patterns_select" ON "public"."rejection_patterns" FOR SELECT USING (true);



CREATE POLICY "rejection_patterns_update" ON "public"."rejection_patterns" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."research_library" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "research_library_insert_public" ON "public"."research_library" FOR INSERT WITH CHECK (true);



CREATE POLICY "research_library_select_public" ON "public"."research_library" FOR SELECT USING (true);



CREATE POLICY "research_library_update_public" ON "public"."research_library" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."research_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "research_links_insert_public" ON "public"."research_links" FOR INSERT WITH CHECK (true);



CREATE POLICY "research_links_select_public" ON "public"."research_links" FOR SELECT USING (true);



CREATE POLICY "research_links_update_public" ON "public"."research_links" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."research_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "revisions_insert_public" ON "public"."deliverable_revisions" FOR INSERT WITH CHECK (true);



CREATE POLICY "revisions_select_public" ON "public"."deliverable_revisions" FOR SELECT USING (true);



CREATE POLICY "revisions_update_public" ON "public"."deliverable_revisions" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."roadmap_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_dependencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_idea_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_idea_agent_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_idea_capability_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_idea_skill_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_idea_tool_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_ideas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sandbox_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sandbox_runs_insert_public" ON "public"."sandbox_runs" FOR INSERT WITH CHECK (true);



CREATE POLICY "sandbox_runs_select_public" ON "public"."sandbox_runs" FOR SELECT USING (true);



CREATE POLICY "sandbox_runs_update_public" ON "public"."sandbox_runs" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain file objects" ON "public"."client_brain_file_objects" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 commercial details" ON "public"."client_brain_v2_commercial_details" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 links" ON "public"."client_brain_v2_links" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 menu items" ON "public"."client_brain_v2_menu_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 record files" ON "public"."client_brain_v2_record_files" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 records" ON "public"."client_brain_v2_records" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role manages client brain v2 versions" ON "public"."client_brain_v2_record_versions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_write" ON "public"."ai_usage_logs" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."skill_lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "skill_lessons_insert_public" ON "public"."skill_lessons" FOR INSERT WITH CHECK (true);



CREATE POLICY "skill_lessons_select_public" ON "public"."skill_lessons" FOR SELECT USING (true);



CREATE POLICY "skill_lessons_update_public" ON "public"."skill_lessons" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_audience_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_caption_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_caption_intervention_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_caption_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_caption_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_months" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_platform_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_content_understanding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_follower_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_intelligence_artifacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_content_plan_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_content_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_plan_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_plan_ai_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_plan_concept_grids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_monthly_plan_production_artifacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_performance_post_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_performance_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_posting_frequency_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_provider_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_provider_execution_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_provider_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_provider_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_refresh_diagnostics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_story_placements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_story_schedule_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."successful_outputs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "successful_outputs_delete" ON "public"."successful_outputs" FOR DELETE USING (true);



CREATE POLICY "successful_outputs_insert" ON "public"."successful_outputs" FOR INSERT WITH CHECK (true);



CREATE POLICY "successful_outputs_select" ON "public"."successful_outputs" FOR SELECT USING (true);



CREATE POLICY "successful_outputs_update" ON "public"."successful_outputs" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "task_outputs_insert_public" ON "public"."agent_task_outputs" FOR INSERT WITH CHECK (true);



CREATE POLICY "task_outputs_select_public" ON "public"."agent_task_outputs" FOR SELECT USING (true);



CREATE POLICY "task_outputs_update_public" ON "public"."agent_task_outputs" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "tasks_insert_public" ON "public"."agent_tasks" FOR INSERT WITH CHECK (true);



CREATE POLICY "tasks_select_public" ON "public"."agent_tasks" FOR SELECT USING (true);



CREATE POLICY "tasks_update_public" ON "public"."agent_tasks" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."telegram_commands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."token_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "token_budgets_delete_public" ON "public"."token_budgets" FOR DELETE USING (true);



CREATE POLICY "token_budgets_insert_public" ON "public"."token_budgets" FOR INSERT WITH CHECK (true);



CREATE POLICY "token_budgets_select_public" ON "public"."token_budgets" FOR SELECT USING (true);



CREATE POLICY "token_budgets_update_public" ON "public"."token_budgets" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."tool_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tool_capability_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tool_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_jarvis_finance_upcoming_revenue"("p_id" "uuid", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_jarvis_finance_upcoming_revenue"("p_id" "uuid", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_asset_classification"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_asset_classification"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_category" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_asset_edit"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_metadata" "jsonb", "p_record_status" "text", "p_last_verified_at" timestamp with time zone, "p_semantic_role" "text", "p_assignment_approval_status" "text", "p_menu_ids" "uuid"[], "p_activation_ids" "uuid"[], "p_source_ids" "uuid"[], "p_provenance" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_asset_edit"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_metadata" "jsonb", "p_record_status" "text", "p_last_verified_at" timestamp with time zone, "p_semantic_role" "text", "p_assignment_approval_status" "text", "p_menu_ids" "uuid"[], "p_activation_ids" "uuid"[], "p_source_ids" "uuid"[], "p_provenance" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_brand_guideline_edit"("p_client_id" "uuid", "p_change" "jsonb", "p_links" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_brand_guideline_edit"("p_client_id" "uuid", "p_change" "jsonb", "p_links" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_intelligence_edit"("p_client_id" "uuid", "p_changes" "jsonb", "p_archives" "jsonb", "p_resolve_gap_keys" "jsonb", "p_commercial_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_intelligence_edit"("p_client_id" "uuid", "p_changes" "jsonb", "p_archives" "jsonb", "p_resolve_gap_keys" "jsonb", "p_commercial_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_learning_mutation"("p_client_id" "uuid", "p_change" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_learning_mutation"("p_client_id" "uuid", "p_change" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_source_edit"("p_client_id" "uuid", "p_change" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_source_edit"("p_client_id" "uuid", "p_change" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_client_brain_v2_source_v2_edit"("p_client_id" "uuid", "p_change" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_client_brain_v2_source_v2_edit"("p_client_id" "uuid", "p_change" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_social_monthly_plan_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_social_monthly_plan_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_social_monthly_plan_visual_direction"("p_client_id" "uuid", "p_plan_id" "uuid", "p_execution_id" "uuid", "p_prompt_version" "text", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text", "p_correction" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_social_monthly_plan_visual_direction"("p_client_id" "uuid", "p_plan_id" "uuid", "p_execution_id" "uuid", "p_prompt_version" "text", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text", "p_correction" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."capture_client_brain_v2_record_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."capture_client_brain_v2_record_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_client_brain_v2_brand_file"("p_client_id" "uuid", "p_title" "text", "p_brand_file_type" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_file_name" "text", "p_file_type" "text", "p_file_size_bytes" bigint, "p_file_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_client_brain_v2_brand_file"("p_client_id" "uuid", "p_title" "text", "p_brand_file_type" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_file_name" "text", "p_file_type" "text", "p_file_size_bytes" bigint, "p_file_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_client_brain_v2_source_v2"("p_client_id" "uuid", "p_source" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_client_brain_v2_source_v2"("p_client_id" "uuid", "p_source" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_social_monthly_plan_version_from_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_social_monthly_plan_version_from_ai_generation"("p_client_id" "uuid", "p_plan_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_strategy" "jsonb", "p_visual_direction" "text", "p_grid_notes" "text", "p_client_brain_snapshot" "jsonb", "p_ai_provenance" "jsonb", "p_items" "jsonb", "p_action_type" "text", "p_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_client_brain_pinterest_inspiration"("p_client_id" "uuid", "p_inspiration_id" "uuid", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_client_brain_pinterest_inspiration"("p_client_id" "uuid", "p_inspiration_id" "uuid", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_client_brain_v2_asset"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_client_brain_v2_asset"("p_client_id" "uuid", "p_asset_id" "uuid", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_client_brain_v2_asset_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_output_bucket" "text", "p_output_path" "text", "p_output_file_name" "text", "p_output_file_type" "text", "p_output_file_size_bytes" bigint, "p_output_file_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_client_brain_v2_asset_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_output_bucket" "text", "p_output_path" "text", "p_output_file_name" "text", "p_output_file_type" "text", "p_output_file_size_bytes" bigint, "p_output_file_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_client_brain_v2_staff_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_files" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_client_brain_v2_staff_ingestion"("p_client_id" "uuid", "p_draft_id" "uuid", "p_title" "text", "p_metadata" "jsonb", "p_files" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_item"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_item"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_plan"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_social_monthly_plan_concept_grids_stale_from_plan"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_social_monthly_production_artifacts_stale_from_item"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_social_monthly_production_artifacts_stale_from_item"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_crm_contact"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_crm_contact"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_dependencies" TO "service_role";



REVOKE ALL ON FUNCTION "public"."roadmap_add_dependency"("p_item_id" "uuid", "p_depends_on_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roadmap_add_dependency"("p_item_id" "uuid", "p_depends_on_item_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_ideas" TO "service_role";



REVOKE ALL ON FUNCTION "public"."roadmap_create_idea"("p_project_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roadmap_create_idea"("p_project_id" "uuid", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."roadmap_promote_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_phase_id" "uuid", "p_parent_item_id" "uuid", "p_item_type" "text", "p_priority" "text", "p_title" "text", "p_description" "text", "p_dependency_ids" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roadmap_promote_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_phase_id" "uuid", "p_parent_item_id" "uuid", "p_item_type" "text", "p_priority" "text", "p_title" "text", "p_description" "text", "p_dependency_ids" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."roadmap_update_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roadmap_update_idea"("p_idea_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_payload" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."roadmap_update_item"("p_item_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roadmap_update_item"("p_item_id" "uuid", "p_expected_updated_at" timestamp with time zone, "p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_ai_content_studio_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_ai_content_studio_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_client_brain_v2_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_client_brain_v2_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_social_monthly_content_plan_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_social_monthly_content_plan_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_social_monthly_plan_concept_grid_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_social_monthly_plan_concept_grid_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_social_monthly_plan_production_artifact_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_social_monthly_plan_production_artifact_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_social_publishing_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_social_publishing_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."agent_capability_links" TO "service_role";



GRANT ALL ON TABLE "public"."agent_departments" TO "service_role";



GRANT ALL ON TABLE "public"."agent_lessons" TO "anon";
GRANT ALL ON TABLE "public"."agent_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."agent_organization_activity" TO "service_role";



GRANT ALL ON TABLE "public"."agent_organization_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_model_calls" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_steps" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runtime_definition_skills" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runtime_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runtime_settings" TO "service_role";



GRANT ALL ON TABLE "public"."agent_skills" TO "anon";
GRANT ALL ON TABLE "public"."agent_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_skills" TO "service_role";



GRANT ALL ON TABLE "public"."agent_task_outputs" TO "anon";
GRANT ALL ON TABLE "public"."agent_task_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_task_outputs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_tasks" TO "anon";
GRANT ALL ON TABLE "public"."agent_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."agent_tool_links" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_generations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_prompt_versions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_provider_requests" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_session_references" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_accessories" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_accessories" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_accessories" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_assets" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_assets" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_outfits" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_outfits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_outfits" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_prompts" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_relationships" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."ai_models" TO "anon";
GRANT ALL ON TABLE "public"."ai_models" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_models" TO "service_role";



GRANT ALL ON TABLE "public"."ai_photography" TO "anon";
GRANT ALL ON TABLE "public"."ai_photography" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_photography" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."asset_library" TO "anon";
GRANT ALL ON TABLE "public"."asset_library" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_library" TO "service_role";



GRANT ALL ON TABLE "public"."asset_uploads" TO "anon";
GRANT ALL ON TABLE "public"."asset_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."audit_findings" TO "anon";
GRANT ALL ON TABLE "public"."audit_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_findings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_sessions" TO "anon";
GRANT ALL ON TABLE "public"."audit_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."blueprint_answers" TO "service_role";



GRANT ALL ON TABLE "public"."blueprint_templates" TO "service_role";
GRANT SELECT ON TABLE "public"."blueprint_templates" TO "anon";
GRANT SELECT ON TABLE "public"."blueprint_templates" TO "authenticated";



GRANT ALL ON TABLE "public"."brain_update_proposals" TO "anon";
GRANT ALL ON TABLE "public"."brain_update_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."brain_update_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."brand_playbooks" TO "anon";
GRANT ALL ON TABLE "public"."brand_playbooks" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_playbooks" TO "service_role";



GRANT ALL ON TABLE "public"."client_blueprints" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain" TO "anon";
GRANT ALL ON TABLE "public"."client_brain" TO "authenticated";
GRANT ALL ON TABLE "public"."client_brain" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_file_objects" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_pinterest_inspirations" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_asset_ingestion_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_asset_ingestion_temp_files" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_commercial_details" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_links" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_record_files" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_record_versions" TO "service_role";



GRANT ALL ON TABLE "public"."client_brain_v2_records" TO "service_role";



GRANT ALL ON TABLE "public"."client_content_items" TO "service_role";



GRANT ALL ON TABLE "public"."client_content_months" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_claim_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_claims" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_competitors" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_discoveries" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_opportunity_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_public_discrepancies" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_scan_steps" TO "service_role";



GRANT ALL ON TABLE "public"."client_intelligence_scans" TO "service_role";



GRANT ALL ON TABLE "public"."client_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."client_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."client_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."client_secure_credential_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."client_secure_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."command_plans" TO "anon";
GRANT ALL ON TABLE "public"."command_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."command_plans" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_product_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_product_roadmap_phases" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_products" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_recommended_combination_items" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_recommended_combinations" TO "service_role";



GRANT ALL ON TABLE "public"."context_logs" TO "anon";
GRANT ALL ON TABLE "public"."context_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."context_logs" TO "service_role";



GRANT ALL ON TABLE "public"."copy_requests" TO "anon";
GRANT ALL ON TABLE "public"."copy_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."copy_requests" TO "service_role";



GRANT ALL ON TABLE "public"."crm_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."crm_contact_data_quality" TO "service_role";



GRANT ALL ON TABLE "public"."deliverable_activity" TO "anon";
GRANT ALL ON TABLE "public"."deliverable_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverable_activity" TO "service_role";



GRANT ALL ON TABLE "public"."deliverable_assets" TO "anon";
GRANT ALL ON TABLE "public"."deliverable_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverable_assets" TO "service_role";



GRANT ALL ON TABLE "public"."deliverable_copy" TO "anon";
GRANT ALL ON TABLE "public"."deliverable_copy" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverable_copy" TO "service_role";



GRANT ALL ON TABLE "public"."deliverable_revisions" TO "anon";
GRANT ALL ON TABLE "public"."deliverable_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverable_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."deliverables" TO "anon";
GRANT ALL ON TABLE "public"."deliverables" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverables" TO "service_role";



GRANT ALL ON TABLE "public"."execution_queue" TO "anon";
GRANT ALL ON TABLE "public"."execution_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."execution_queue" TO "service_role";



GRANT ALL ON TABLE "public"."execution_reviews" TO "anon";
GRANT ALL ON TABLE "public"."execution_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."execution_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."execution_runs" TO "anon";
GRANT ALL ON TABLE "public"."execution_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."execution_runs" TO "service_role";



GRANT ALL ON TABLE "public"."guest_model_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."guest_models" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_cost_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_activity" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_bank_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_bank_statements" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_capital_policy" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_fx_rates" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_income_records" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_investments" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_invoice_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_owner_draws" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_pipeline" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_settings" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_upcoming_revenue" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_finance_vendor_rules" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_personal_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_personal_income_events" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_research_runs" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_research_sources" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_task_suggestion_suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."jarvis_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."learning_events" TO "anon";
GRANT ALL ON TABLE "public"."learning_events" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_events" TO "service_role";



GRANT ALL ON TABLE "public"."model_pricing" TO "anon";
GRANT ALL ON TABLE "public"."model_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."model_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_cycles" TO "anon";
GRANT ALL ON TABLE "public"."monthly_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."pitch_deck_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."pitch_deck_research_sources" TO "service_role";



GRANT ALL ON TABLE "public"."platform_rules" TO "anon";
GRANT ALL ON TABLE "public"."platform_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_rules" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."rejection_patterns" TO "anon";
GRANT ALL ON TABLE "public"."rejection_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."rejection_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."research_library" TO "anon";
GRANT ALL ON TABLE "public"."research_library" TO "authenticated";
GRANT ALL ON TABLE "public"."research_library" TO "service_role";



GRANT ALL ON TABLE "public"."research_links" TO "anon";
GRANT ALL ON TABLE "public"."research_links" TO "authenticated";
GRANT ALL ON TABLE "public"."research_links" TO "service_role";



GRANT ALL ON TABLE "public"."research_tasks" TO "anon";
GRANT ALL ON TABLE "public"."research_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."research_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_activity" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_idea_activity" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_idea_agent_links" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_idea_capability_links" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_idea_skill_links" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_idea_tool_links" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_phases" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_projects" TO "service_role";



GRANT ALL ON TABLE "public"."sandbox_runs" TO "anon";
GRANT ALL ON TABLE "public"."sandbox_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."sandbox_runs" TO "service_role";



GRANT ALL ON TABLE "public"."skill_lessons" TO "anon";
GRANT ALL ON TABLE "public"."skill_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."social_audience_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."social_caption_generations" TO "service_role";



GRANT ALL ON TABLE "public"."social_caption_intervention_events" TO "service_role";



GRANT ALL ON TABLE "public"."social_caption_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_caption_options" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_items" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_media" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_months" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_platform_targets" TO "service_role";



GRANT ALL ON TABLE "public"."social_content_understanding" TO "service_role";



GRANT ALL ON TABLE "public"."social_follower_observations" TO "service_role";



GRANT ALL ON TABLE "public"."social_intelligence_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_content_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_content_plans" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_plan_activity" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_plan_ai_executions" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_plan_concept_grids" TO "service_role";



GRANT ALL ON TABLE "public"."social_monthly_plan_production_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."social_performance_post_observations" TO "service_role";



GRANT ALL ON TABLE "public"."social_performance_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."social_posting_frequency_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."social_provider_connections" TO "service_role";



GRANT ALL ON TABLE "public"."social_provider_execution_targets" TO "service_role";



GRANT ALL ON TABLE "public"."social_provider_executions" TO "service_role";



GRANT ALL ON TABLE "public"."social_provider_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."social_refresh_diagnostics" TO "service_role";



GRANT ALL ON TABLE "public"."social_story_placements" TO "service_role";



GRANT ALL ON TABLE "public"."social_story_schedule_slots" TO "service_role";



GRANT ALL ON TABLE "public"."successful_outputs" TO "anon";
GRANT ALL ON TABLE "public"."successful_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."successful_outputs" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_commands" TO "anon";
GRANT ALL ON TABLE "public"."telegram_commands" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_commands" TO "service_role";



GRANT ALL ON TABLE "public"."token_budgets" TO "anon";
GRANT ALL ON TABLE "public"."token_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."token_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."tool_activity" TO "service_role";



GRANT ALL ON TABLE "public"."tool_capability_links" TO "service_role";



GRANT ALL ON TABLE "public"."tool_registry" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








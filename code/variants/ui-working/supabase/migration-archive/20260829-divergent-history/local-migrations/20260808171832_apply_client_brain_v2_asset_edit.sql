-- Atomic, client-scoped semantic metadata edits for restaurant V2 assets.
-- Existing records, files, version triggers, RLS, and legacy asset rows remain canonical and intact.

create or replace function public.capture_client_brain_v2_record_version()
returns trigger
language plpgsql
set search_path = public
as $$
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.client_brain_v2_records%rowtype;
  target_id uuid;
  saved_updated_at timestamptz;
  resolved_gap_count integer := 0;
begin
  if not exists (
    select 1 from public.clients
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
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'Asset not found for this client.';
  end if;
  if existing.updated_at <> p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This Asset changed after editing began. Your values are preserved; refresh before saving again.';
  end if;
  if coalesce(p_metadata->>'asset_category', '') not in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset category.';
  end if;
  if p_semantic_role not in ('truth_reference', 'creative_reference', 'approved_marketing_asset', 'generated_asset', 'raw_asset', 'archived_asset') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset role.';
  end if;
  if p_assignment_approval_status not in ('approved', 'needs_review') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset approval state.';
  end if;
  if coalesce(p_metadata->>'asset_category', '') not in ('food', 'drinks')
     and cardinality(coalesce(p_menu_ids, '{}')) > 0 then
    raise exception using errcode = 'PT400', message = 'Only Food and Drink assets can link to Menus.';
  end if;

  foreach target_id in array coalesce(p_menu_ids, '{}') loop
    if not exists (
      select 1 from public.client_brain_v2_records
      where id = target_id and client_id = p_client_id and subsection = 'menus' and record_type = 'menu'
    ) then
      raise exception using errcode = 'PT403', message = 'A selected Menu does not belong to this client.';
    end if;
  end loop;
  foreach target_id in array coalesce(p_activation_ids, '{}') loop
    if not exists (
      select 1 from public.client_brain_v2_records
      where id = target_id and client_id = p_client_id and subsection = 'activations' and record_type = 'activation'
    ) then
      raise exception using errcode = 'PT403', message = 'A selected Activation does not belong to this client.';
    end if;
  end loop;
  foreach target_id in array coalesce(p_source_ids, '{}') loop
    if not exists (
      select 1 from public.client_brain_v2_records
      where id = target_id and client_id = p_client_id and top_section = 'sources'
    ) then
      raise exception using errcode = 'PT403', message = 'A selected Source does not belong to this client.';
    end if;
  end loop;

  -- Keep the existing V2 history model, enriching this snapshot with the
  -- semantic file assignment and canonical relationships changed by this RPC.
  insert into public.client_brain_v2_record_versions (client_id, record_id, version_snapshot)
  values (
    p_client_id,
    p_asset_id,
    to_jsonb(existing) || jsonb_build_object(
      'asset_file_assignments', coalesce((
        select jsonb_agg(to_jsonb(assignment) order by assignment.sort_order, assignment.id)
        from public.client_brain_v2_record_files assignment
        where assignment.client_id = p_client_id and assignment.record_id = p_asset_id
      ), '[]'::jsonb),
      'asset_relationships', coalesce((
        select jsonb_agg(to_jsonb(link) order by link.created_at, link.id)
        from public.client_brain_v2_links link
        where link.client_id = p_client_id
          and link.from_record_id = p_asset_id
          and (
            link.relation_type in ('belongs_to_menu', 'supports_activation')
            or exists (
              select 1 from public.client_brain_v2_records target
              where target.id = link.to_record_id
                and target.client_id = p_client_id
                and target.top_section = 'sources'
            )
          )
      ), '[]'::jsonb)
    )
  );

  perform set_config('jarvis.skip_client_brain_v2_record_version', 'on', true);
  update public.client_brain_v2_records
  set metadata = coalesce(p_metadata, '{}'::jsonb),
      status = p_record_status,
      last_verified_at = p_last_verified_at,
      source_type = 'client_provided',
      provenance = coalesce(existing.provenance, '{}'::jsonb) || coalesce(p_provenance, '{}'::jsonb)
  where id = p_asset_id and client_id = p_client_id
  returning updated_at into saved_updated_at;
  perform set_config('jarvis.skip_client_brain_v2_record_version', 'off', true);

  update public.client_brain_v2_record_files
  set semantic_role = p_semantic_role,
      approval_status = p_assignment_approval_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approved_for_generation', coalesce((p_metadata->>'approved_for_generation')::boolean, false),
        'edited_by', 'Manual Client Brain Edit',
        'edited_at', now()
      )
  where client_id = p_client_id and record_id = p_asset_id;

  delete from public.client_brain_v2_links
  where client_id = p_client_id
    and from_record_id = p_asset_id
    and relation_type in ('belongs_to_menu', 'supports_activation');

  delete from public.client_brain_v2_links link
  using public.client_brain_v2_records target
  where link.client_id = p_client_id
    and link.from_record_id = p_asset_id
    and link.to_record_id = target.id
    and target.client_id = p_client_id
    and target.top_section = 'sources'
    and link.relation_type = 'derived_from';

  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'belongs_to_menu', jsonb_build_object('linked_by', 'Manual Client Brain Edit')
  from unnest(coalesce(p_menu_ids, '{}')) as selected(id)
  on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;

  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'supports_activation', jsonb_build_object('linked_by', 'Manual Client Brain Edit')
  from unnest(coalesce(p_activation_ids, '{}')) as selected(id)
  on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;

  insert into public.client_brain_v2_links (client_id, from_record_id, to_record_id, relation_type, metadata)
  select p_client_id, p_asset_id, selected.id, 'derived_from', jsonb_build_object('linked_by', 'Manual Client Brain Edit')
  from unnest(coalesce(p_source_ids, '{}')) as selected(id)
  on conflict (client_id, from_record_id, to_record_id, relation_type) do nothing;

  -- Only explicit, narrowly named asset gaps can resolve automatically.
  if p_semantic_role = 'truth_reference'
     and coalesce((p_metadata->>'approved_for_generation')::boolean, false) then
    update public.client_brain_v2_records
    set status = 'resolved',
        last_verified_at = now(),
        provenance = provenance || jsonb_build_object(
          'resolved_by', 'Manual Client Brain Asset Edit',
          'resolved_by_asset_id', p_asset_id,
          'resolved_at', now()
        )
    where client_id = p_client_id
      and record_type = 'knowledge_gap'
      and stable_key = case p_metadata->>'asset_category'
        when 'food' then 'knowledge_gap:assets:missing_approved_food_truth_reference'
        when 'drinks' then 'knowledge_gap:assets:missing_approved_drink_truth_reference'
        when 'interiors' then 'knowledge_gap:assets:missing_approved_interior_truth_reference'
        when 'exteriors' then 'knowledge_gap:assets:missing_approved_exterior_truth_reference'
        when 'venue_items' then 'knowledge_gap:assets:missing_approved_venue_item_truth_reference'
      end
      and status not in ('resolved', 'superseded', 'archived');
    get diagnostics resolved_gap_count = row_count;
  end if;

  return jsonb_build_object(
    'asset_id', p_asset_id,
    'updated_at', saved_updated_at,
    'resolved_gap_count', resolved_gap_count
  );
end;
$$;

revoke all on function public.apply_client_brain_v2_asset_edit(
  uuid, uuid, timestamptz, jsonb, text, timestamptz, text, text, uuid[], uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.apply_client_brain_v2_asset_edit(
  uuid, uuid, timestamptz, jsonb, text, timestamptz, text, text, uuid[], uuid[], uuid[], jsonb
) to service_role;

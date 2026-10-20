-- Manual classification is a semantic change only. Preserve the asset's
-- original source identity while retaining classification audit metadata.

create or replace function public.apply_client_brain_v2_asset_classification(
  p_client_id uuid,
  p_asset_id uuid,
  p_expected_updated_at timestamptz,
  p_category text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.client_brain_v2_records%rowtype;
  next_metadata jsonb;
  previous_category text;
  saved_updated_at timestamptz;
begin
  if not exists (
    select 1
    from public.clients
    where id = p_client_id
      and brain_architecture_version = 'hospitality_restaurant_v2'
  ) then
    raise exception using errcode = 'PT404', message = 'Restaurant Client Brain v2 is not enabled for this client.';
  end if;

  if p_category not in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'unclassified') then
    raise exception using errcode = 'PT400', message = 'Invalid Asset category.';
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
    raise exception using errcode = 'PT409', message = 'This Asset changed after classification began. Refresh before saving again.';
  end if;

  previous_category := case
    when existing.metadata->>'asset_category_source' = 'human_confirmed'
      then coalesce(existing.metadata->>'asset_category', 'unclassified')
    else 'unclassified'
  end;

  next_metadata := coalesce(existing.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'asset_category', p_category,
      'asset_category_source', 'human_confirmed',
      'asset_category_confirmed_at', now(),
      'asset_category_confirmed_by', 'Manual Client Brain Classification'
    );

  if previous_category is distinct from p_category then
    next_metadata := jsonb_set(
      next_metadata,
      '{asset_category_history}',
      coalesce(next_metadata->'asset_category_history', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'from', previous_category,
          'to', p_category,
          'changed_at', now(),
          'changed_by', 'Manual Client Brain Classification'
        )),
      true
    );
  end if;

  update public.client_brain_v2_records
  set metadata = next_metadata,
      provenance = coalesce(existing.provenance, '{}'::jsonb) || jsonb_build_object(
        'manual_classification', true,
        'classification_source', 'Manual Client Brain Classification',
        'classified_at', now()
      )
  where id = p_asset_id
    and client_id = p_client_id
  returning updated_at into saved_updated_at;

  return jsonb_build_object(
    'asset_id', p_asset_id,
    'category', p_category,
    'updated_at', saved_updated_at
  );
end;
$$;

revoke all on function public.apply_client_brain_v2_asset_classification(
  uuid, uuid, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.apply_client_brain_v2_asset_classification(
  uuid, uuid, timestamptz, text
) to service_role;

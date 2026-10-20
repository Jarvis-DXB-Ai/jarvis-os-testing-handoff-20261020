-- Hard-delete only the scoped V2 Asset representation. Shared file objects,
-- legacy Asset Uploads, Sources, and Storage paths are preserved by default.
-- The caller receives storage paths only when no other semantic or legacy use
-- remains, so physical Storage cleanup can run safely after this transaction.

create or replace function public.delete_client_brain_v2_asset(
  p_client_id uuid,
  p_asset_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Remove the scoped semantic connections explicitly. Record deletion then
  -- cascades remaining V2-only links and record history by schema contract.
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

revoke all on function public.delete_client_brain_v2_asset(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.delete_client_brain_v2_asset(uuid, uuid, timestamptz) to service_role;

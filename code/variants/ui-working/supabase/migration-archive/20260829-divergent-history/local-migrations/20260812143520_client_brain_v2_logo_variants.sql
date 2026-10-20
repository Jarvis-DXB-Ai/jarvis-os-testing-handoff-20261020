-- Logo variants are stored in the existing Brand Kit logos field. The saved
-- semantic role is authoritative; filename and file pixels are never inferred.

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

revoke all on function public.create_client_brain_v2_brand_file(uuid, text, text, text, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.create_client_brain_v2_brand_file(uuid, text, text, text, text, text, text, bigint, jsonb) to service_role;

-- DemoClientB's existing uploaded white logo is explicitly confirmed
-- as the light wordmark. Preserve its asset, file and any existing notes.
with democlientb as (
  select id from public.clients where name = 'DemoClientB'
), current_logos as (
  select r.id, r.metadata
  from public.client_brain_v2_records r
  join democlientb c on c.id = r.client_id
  where r.stable_key = 'brand_guideline:logos'
), remapped as (
  select id,
    jsonb_agg(
      case when item->>'role' = 'wordmark'
        then jsonb_set(item, '{role}', '"light_wordmark"'::jsonb)
        else item
      end
      order by ordinality
    ) as logos
  from current_logos, jsonb_array_elements(coalesce(metadata->'editor_data'->'logos', '[]'::jsonb)) with ordinality as items(item, ordinality)
  group by id
)
update public.client_brain_v2_records record
set metadata = jsonb_set(record.metadata, '{editor_data,logos}', remapped.logos, true)
from remapped
where record.id = remapped.id;

with democlientb as (
  select id from public.clients where name = 'DemoClientB'
)
update public.client_brain_v2_records asset
set metadata = jsonb_set(asset.metadata, '{brand_file_type}', '"light_wordmark"'::jsonb, true)
from democlientb
where asset.client_id = democlientb.id
  and asset.id = 'd8489095-790f-56a5-b109-2262b910bf2f'::uuid
  and asset.metadata->>'brand_file_type' = 'wordmark';

with democlientb as (
  select id from public.clients where name = 'DemoClientB'
)
update public.client_brain_v2_record_files assignment
set metadata = jsonb_set(assignment.metadata, '{brand_file_type}', '"light_wordmark"'::jsonb, true)
from democlientb
where assignment.client_id = democlientb.id
  and assignment.record_id = 'd8489095-790f-56a5-b109-2262b910bf2f'::uuid
  and assignment.metadata->>'brand_file_type' = 'wordmark';

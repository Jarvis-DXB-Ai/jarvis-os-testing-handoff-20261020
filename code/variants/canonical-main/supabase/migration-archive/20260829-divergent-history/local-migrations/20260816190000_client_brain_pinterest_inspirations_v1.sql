-- Client-scoped creative inspiration. These records intentionally do not enter
-- client_brain_v2_records or asset assignments, so they can never acquire an
-- approved Client Asset role by accident.

create table if not exists public.client_brain_pinterest_inspirations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  file_object_id uuid not null references public.client_brain_file_objects(id) on delete restrict,
  title text not null,
  source_type text not null default 'pinterest' check (source_type in ('pinterest', 'manual_external')),
  source_url text,
  source_board text,
  external_source_id text,
  original_source_note text,
  status text not null default 'needs_review' check (status in ('active', 'needs_review', 'disabled')),
  creative_categories text[] not null default '{}'::text[],
  shot_scale text,
  camera_angle text,
  composition text,
  human_presence text,
  interaction text,
  motion text,
  lighting_style text,
  background_style text,
  creative_techniques text[] not null default '{}'::text[],
  visual_summary text,
  best_for text[] not null default '{}'::text[],
  notes text,
  analysis_state text not null default 'pending' check (analysis_state in ('pending', 'analyzed', 'failed')),
  analysis_provider text,
  analysis_model text,
  analyzed_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, file_object_id)
);

create index if not exists client_brain_pinterest_inspirations_client_status_idx
  on public.client_brain_pinterest_inspirations (client_id, status, updated_at desc);
create index if not exists client_brain_pinterest_inspirations_categories_idx
  on public.client_brain_pinterest_inspirations using gin (creative_categories);
create index if not exists client_brain_pinterest_inspirations_techniques_idx
  on public.client_brain_pinterest_inspirations using gin (creative_techniques);
create index if not exists client_brain_pinterest_inspirations_best_for_idx
  on public.client_brain_pinterest_inspirations using gin (best_for);

drop trigger if exists touch_client_brain_pinterest_inspirations on public.client_brain_pinterest_inspirations;
create trigger touch_client_brain_pinterest_inspirations
before update on public.client_brain_pinterest_inspirations
for each row execute function public.touch_client_brain_v2_updated_at();

alter table public.client_brain_pinterest_inspirations enable row level security;
revoke all on public.client_brain_pinterest_inspirations from anon, authenticated;
grant all on public.client_brain_pinterest_inspirations to service_role;

create or replace function public.delete_client_brain_pinterest_inspiration(
  p_client_id uuid,
  p_inspiration_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.delete_client_brain_pinterest_inspiration(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.delete_client_brain_pinterest_inspiration(uuid, uuid, timestamptz) to service_role;

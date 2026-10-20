-- Staged Asset Ingestion for Restaurant Client Brain V2.
-- Temporary reference files are intentionally isolated from normal V2 Asset
-- records. A final Asset is created only by the finalization RPC below.

create table if not exists public.client_brain_v2_asset_ingestion_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_category text not null check (asset_category in ('food', 'drinks', 'interiors', 'exteriors', 'venue_items')),
  state text not null default 'draft' check (state in ('draft', 'ready_for_review', 'finalization_failed', 'finalized', 'cleanup_pending', 'cancelled')),
  display_name text,
  menu_record_id uuid,
  menu_item_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  generated_output jsonb not null default '{}'::jsonb,
  final_asset_id uuid,
  cleanup_attempts integer not null default 0,
  cleanup_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  foreign key (client_id, menu_record_id) references public.client_brain_v2_records(client_id, id) on delete set null,
  foreign key (client_id, final_asset_id) references public.client_brain_v2_records(client_id, id) on delete set null
);

create table if not exists public.client_brain_v2_asset_ingestion_temp_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  draft_id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width integer,
  height integer,
  sort_order integer not null default 0,
  file_kind text not null check (file_kind in ('raw_reference', 'original_venue', 'generated_preview')),
  cleanup_state text not null default 'active' check (cleanup_state in ('active', 'cleanup_pending', 'cleaned')),
  created_at timestamptz not null default now(),
  foreign key (client_id, draft_id)
    references public.client_brain_v2_asset_ingestion_drafts(client_id, id)
    on delete cascade,
  unique (storage_bucket, storage_path)
);

create index if not exists client_brain_v2_asset_ingestion_drafts_client_state_idx
  on public.client_brain_v2_asset_ingestion_drafts (client_id, state, updated_at desc);
create index if not exists client_brain_v2_asset_ingestion_temp_files_draft_idx
  on public.client_brain_v2_asset_ingestion_temp_files (client_id, draft_id, sort_order);

drop trigger if exists touch_client_brain_v2_asset_ingestion_drafts on public.client_brain_v2_asset_ingestion_drafts;
create trigger touch_client_brain_v2_asset_ingestion_drafts
before update on public.client_brain_v2_asset_ingestion_drafts
for each row execute function public.touch_client_brain_v2_updated_at();

alter table public.client_brain_v2_asset_ingestion_drafts enable row level security;
alter table public.client_brain_v2_asset_ingestion_temp_files enable row level security;
revoke all on public.client_brain_v2_asset_ingestion_drafts from anon, authenticated;
revoke all on public.client_brain_v2_asset_ingestion_temp_files from anon, authenticated;
grant all on public.client_brain_v2_asset_ingestion_drafts to service_role;
grant all on public.client_brain_v2_asset_ingestion_temp_files to service_role;

create or replace function public.finalize_client_brain_v2_asset_ingestion(
  p_client_id uuid,
  p_draft_id uuid,
  p_title text,
  p_metadata jsonb,
  p_output_bucket text,
  p_output_path text,
  p_output_file_name text,
  p_output_file_type text,
  p_output_file_size_bytes bigint,
  p_output_file_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.client_brain_v2_asset_ingestion_drafts%rowtype;
  v_menu_item public.client_brain_v2_menu_items%rowtype;
  v_asset_id uuid := gen_random_uuid();
  v_file_id uuid := gen_random_uuid();
  v_source_record_id uuid;
  v_activation_record_id uuid;
  v_role text;
  v_required_files integer;
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
  if nullif(trim(p_title), '') is null or nullif(trim(p_output_path), '') is null or nullif(trim(p_output_bucket), '') is null then
    raise exception using errcode = 'PT400', message = 'A title and final file are required.';
  end if;
  if p_output_file_size_bytes is null or p_output_file_size_bytes <= 0 then
    raise exception using errcode = 'PT400', message = 'Final file metadata is invalid.';
  end if;

  v_required_files := case when v_draft.asset_category in ('food', 'drinks') then 1 else 1 end;
  if (select count(*) from public.client_brain_v2_asset_ingestion_temp_files where client_id = p_client_id and draft_id = p_draft_id and cleanup_state = 'active') < v_required_files then
    raise exception using errcode = 'PT400', message = 'The ingestion draft has no recoverable source reference.';
  end if;
  if v_draft.asset_category in ('food', 'drinks') and (v_draft.menu_record_id is null or v_draft.menu_item_id is null) then
    raise exception using errcode = 'PT400', message = 'Food and Drink Assets require a selected official menu item.';
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

  v_role := case when v_draft.asset_category in ('food', 'drinks') then 'truth_reference' else 'truth_reference' end;
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
    'assets', 'images', 'asset', trim(p_title), null, null,
    'asset', case when coalesce((p_metadata->>'approved_for_generation')::boolean, false) then 'approved' else 'needs_review' end, 3, 'client_provided',
    jsonb_build_object(
      'ingestion_draft_id', p_draft_id,
      'ingestion_mode', case when v_draft.asset_category in ('food', 'drinks') then 'studio_truth_reference' else 'venue_truth_reference' end,
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
        'approved_for_generation', coalesce((p_metadata->>'approved_for_generation')::boolean, false),
        'review_state', case when coalesce((p_metadata->>'approved_for_generation')::boolean, false) then 'approved' else 'needs_review' end
      )
  );

  insert into public.client_brain_v2_record_files (
    client_id, record_id, file_object_id, semantic_role, approval_status, sort_order, metadata
  ) values (
    p_client_id, v_asset_id, v_file_id, v_role, case when coalesce((p_metadata->>'approved_for_generation')::boolean, false) then 'approved' else 'needs_review' end, 0,
    jsonb_build_object('ingested_via', 'asset_ingestion_v1', 'approved_for_generation', coalesce((p_metadata->>'approved_for_generation')::boolean, false))
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

revoke all on function public.finalize_client_brain_v2_asset_ingestion(uuid, uuid, text, jsonb, text, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_client_brain_v2_asset_ingestion(uuid, uuid, text, jsonb, text, text, text, text, bigint, jsonb) to service_role;

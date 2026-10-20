-- Phase 3: bind one immutable approved Final Review manifest to one canonical
-- Publishing target and one idempotent provider execution. This remains an
-- additive linkage layer: Planner, Publishing, provider execution and Social
-- observation tables remain authoritative for their own state.

alter table public.social_provider_execution_targets
  add constraint social_provider_execution_targets_client_id_id_key unique (client_id, id);

alter table public.social_provider_connections
  add constraint social_provider_connections_client_id_id_key unique (client_id, id);

alter table public.content_final_review_manifest_targets
  add constraint content_final_review_manifest_targets_client_id_id_key unique (client_id, id);

alter table public.social_provider_execution_targets
  add column published_at timestamptz,
  add column publication_evidence jsonb not null default '{}'::jsonb;

create table public.content_lineage_execution_authorizations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_lineage_item_id uuid not null,
  final_review_manifest_id uuid not null,
  final_review_manifest_target_id uuid not null,
  social_content_item_id uuid not null,
  social_content_platform_target_id uuid not null,
  social_provider_execution_id uuid,
  idempotency_key uuid not null,
  manifest_version integer not null check (manifest_version > 0),
  manifest_payload_hash text not null,
  platform text not null check (platform in ('instagram', 'facebook')),
  provider_connection_id uuid not null,
  provider_account_id text not null,
  scheduled_at timestamptz not null,
  authorization_mode text not null check (authorization_mode in ('dry_run', 'live')),
  authorization_state text not null default 'authorized'
    check (authorization_state in ('authorized', 'consumed', 'stale', 'revoked')),
  authorized_by text,
  authorized_at timestamptz not null default now(),
  consumed_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  unique (client_id, idempotency_key),
  unique (client_id, final_review_manifest_id, final_review_manifest_target_id),
  unique (client_id, social_provider_execution_id),
  foreign key (client_id, content_lineage_item_id)
    references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, final_review_manifest_id)
    references public.content_final_review_manifests(client_id, id) on delete restrict,
  foreign key (client_id, final_review_manifest_target_id)
    references public.content_final_review_manifest_targets(client_id, id) on delete restrict,
  foreign key (client_id, social_content_item_id)
    references public.social_content_items(client_id, id) on delete restrict,
  foreign key (client_id, social_content_platform_target_id)
    references public.social_content_platform_targets(client_id, id) on delete restrict,
  foreign key (client_id, provider_connection_id)
    references public.social_provider_connections(client_id, id) on delete restrict,
  foreign key (client_id, social_provider_execution_id)
    references public.social_provider_executions(client_id, id) on delete restrict,
  check ((authorization_mode <> 'live') or authorized_by is not null),
  check ((authorization_state <> 'consumed') or (social_provider_execution_id is not null and consumed_at is not null))
);

create index content_lineage_execution_authorizations_lineage_idx
  on public.content_lineage_execution_authorizations (client_id, content_lineage_item_id, created_at desc);

create index content_lineage_execution_authorizations_execution_idx
  on public.content_lineage_execution_authorizations (client_id, social_provider_execution_id)
  where social_provider_execution_id is not null;

-- Composite foreign keys prevent cross-client linkage. This trigger enforces
-- the remaining same-client *relationship* invariants which a composite FK
-- alone cannot express: one approved manifest target must map to its actual
-- selected publishing target, its captured account and schedule, and the
-- exact social item/lineage pair.
create or replace function public.assert_content_lineage_execution_authorization_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_manifest record;
  v_manifest_target record;
  v_social_target record;
  v_connection record;
  v_execution record;
begin
  select id, content_lineage_item_id, social_content_item_id, manifest_version,
         payload_hash, review_status
    into v_manifest
    from public.content_final_review_manifests
   where client_id = new.client_id and id = new.final_review_manifest_id;

  if not found then
    raise exception 'Final Review manifest is not available for this client.' using errcode = 'P0001';
  end if;

  if v_manifest.content_lineage_item_id <> new.content_lineage_item_id
     or v_manifest.social_content_item_id <> new.social_content_item_id
     or v_manifest.manifest_version <> new.manifest_version
     or v_manifest.payload_hash <> new.manifest_payload_hash then
    raise exception 'Execution authorization must retain the exact manifest lineage, item, version, and payload hash.' using errcode = 'P0001';
  end if;

  -- Creation and reservation linkage require a currently approved manifest.
  -- An existing authorization is allowed to transition from authorized to
  -- stale after the manifest was deliberately invalidated by canonical change.
  if (tg_op = 'INSERT' or (old.authorization_state = 'authorized' and new.authorization_state = 'authorized'))
     and v_manifest.review_status <> 'approved' then
    raise exception 'Execution authorization requires a currently approved Final Review manifest.' using errcode = 'P0001';
  end if;

  select id, social_content_platform_target_id, platform, account_snapshot, scheduled_at
    into v_manifest_target
    from public.content_final_review_manifest_targets
   where client_id = new.client_id
     and id = new.final_review_manifest_target_id
     and final_review_manifest_id = new.final_review_manifest_id;

  if not found then
    raise exception 'Final Review platform target does not belong to the supplied manifest.' using errcode = 'P0001';
  end if;

  if v_manifest_target.social_content_platform_target_id <> new.social_content_platform_target_id
     or v_manifest_target.platform <> new.platform
     or v_manifest_target.scheduled_at is distinct from new.scheduled_at then
    raise exception 'Execution authorization must retain the exact manifest platform target and schedule.' using errcode = 'P0001';
  end if;

  select id, social_content_item_id, platform, selected
    into v_social_target
    from public.social_content_platform_targets
   where client_id = new.client_id and id = new.social_content_platform_target_id;

  if not found or v_social_target.social_content_item_id <> new.social_content_item_id
     or v_social_target.platform <> new.platform or not v_social_target.selected then
    raise exception 'Execution authorization requires the manifest-selected canonical publishing target.' using errcode = 'P0001';
  end if;

  select id, platform, platform_account_id, status
    into v_connection
    from public.social_provider_connections
   where client_id = new.client_id and id = new.provider_connection_id;

  if not found or v_connection.platform <> new.platform
     or v_connection.platform_account_id <> new.provider_account_id then
    raise exception 'Execution authorization provider account does not match its canonical connection.' using errcode = 'P0001';
  end if;

  if coalesce(v_manifest_target.account_snapshot ->> 'connectionId', '') <> new.provider_connection_id::text
     or coalesce(v_manifest_target.account_snapshot ->> 'accountId', '') <> new.provider_account_id then
    raise exception 'Execution authorization provider account does not match the immutable manifest snapshot.' using errcode = 'P0001';
  end if;

  if new.social_provider_execution_id is not null then
    select id, social_content_item_id
      into v_execution
      from public.social_provider_executions
     where client_id = new.client_id and id = new.social_provider_execution_id;
    if not found or v_execution.social_content_item_id <> new.social_content_item_id then
      raise exception 'Provider execution does not belong to the authorized canonical content item.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.content_lineage_stale_manifests_for_social_item(
  p_client_id uuid,
  p_social_content_item_id uuid,
  p_reason text
) returns void
language plpgsql
set search_path = public
as $$
begin
  update public.content_final_review_manifests
  set review_status = 'stale', stale_at = now(), stale_reason = p_reason
  where client_id = p_client_id
    and social_content_item_id = p_social_content_item_id
    and review_status in ('ready', 'approved');

  update public.content_lineage_publishing_handoffs handoff
  set handoff_state = 'stale'
  from public.content_final_review_manifests manifest
  where handoff.client_id = p_client_id
    and handoff.final_review_manifest_id = manifest.id
    and manifest.social_content_item_id = p_social_content_item_id
    and handoff.handoff_state = 'linked';

  -- Do not rewrite a provider execution already consumed by dispatch. Its own
  -- immutable snapshot remains auditable. Only an unused authorization may be
  -- invalidated by a changed canonical payload.
  update public.content_lineage_execution_authorizations authz
  set authorization_state = 'stale', updated_at = now()
  from public.content_final_review_manifests manifest
  where authz.client_id = p_client_id
    and authz.final_review_manifest_id = manifest.id
    and manifest.social_content_item_id = p_social_content_item_id
    and authz.authorization_state = 'authorized';
end;
$$;

create or replace function public.touch_content_lineage_execution_authorizations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_content_lineage_execution_authorizations_updated_at
before update on public.content_lineage_execution_authorizations
for each row execute function public.touch_content_lineage_execution_authorizations_updated_at();

create trigger assert_content_lineage_execution_authorization_integrity_before_write
before insert or update on public.content_lineage_execution_authorizations
for each row execute function public.assert_content_lineage_execution_authorization_integrity();

alter table public.content_lineage_execution_authorizations enable row level security;

revoke all on public.content_lineage_execution_authorizations from anon, authenticated;
grant all on public.content_lineage_execution_authorizations to service_role;

revoke all on function public.content_lineage_stale_manifests_for_social_item(uuid, uuid, text) from public;
revoke all on function public.touch_content_lineage_execution_authorizations_updated_at() from public;
revoke all on function public.assert_content_lineage_execution_authorization_integrity() from public;

-- Phase 2: explicit production attachments and immutable combined final-review
-- snapshots. Planner, Studio, captions, publishing and Social keep owning their
-- own domain state; this migration adds only the audited handoff boundary.

alter table public.social_content_caption_options
  add constraint social_content_caption_options_client_id_id_key unique (client_id, id),
  add constraint social_content_caption_options_client_item_id_id_key unique (client_id, social_content_item_id, id);

alter table public.social_content_media
  add constraint social_content_media_client_id_id_key unique (client_id, id);

alter table public.social_content_platform_targets
  add constraint social_content_platform_targets_client_id_id_key unique (client_id, id);

create table public.content_lineage_media_attachments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_lineage_item_id uuid not null,
  final_content_item_id uuid not null,
  studio_session_id uuid not null,
  studio_generation_id uuid not null,
  attachment_state text not null default 'active' check (attachment_state in ('active', 'replaced')),
  attached_at timestamptz not null default now(),
  replaced_at timestamptz,
  replaced_by_attachment_id uuid references public.content_lineage_media_attachments(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  unique (client_id, id),
  foreign key (client_id, content_lineage_item_id)
    references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, final_content_item_id)
    references public.client_content_items(client_id, id) on delete restrict,
  foreign key (client_id, studio_session_id)
    references public.ai_content_sessions(client_id, id) on delete restrict,
  foreign key (client_id, studio_generation_id)
    references public.ai_content_generations(client_id, id) on delete restrict,
  check ((attachment_state = 'active' and replaced_at is null) or attachment_state = 'replaced')
);

create unique index content_lineage_media_one_active_per_item
  on public.content_lineage_media_attachments (client_id, content_lineage_item_id)
  where attachment_state = 'active';

create unique index content_lineage_media_one_active_per_final_content
  on public.content_lineage_media_attachments (client_id, final_content_item_id)
  where attachment_state = 'active';

create table public.content_lineage_caption_attachments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_lineage_item_id uuid not null,
  social_content_item_id uuid not null,
  caption_option_id uuid,
  attachment_state text not null default 'active' check (attachment_state in ('active', 'replaced')),
  attached_at timestamptz not null default now(),
  replaced_at timestamptz,
  replaced_by_attachment_id uuid references public.content_lineage_caption_attachments(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  unique (client_id, id),
  foreign key (client_id, content_lineage_item_id)
    references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, social_content_item_id)
    references public.social_content_items(client_id, id) on delete restrict,
  foreign key (client_id, social_content_item_id, caption_option_id)
    references public.social_content_caption_options(client_id, social_content_item_id, id) on delete restrict,
  check ((attachment_state = 'active' and replaced_at is null) or attachment_state = 'replaced')
);

create unique index content_lineage_caption_one_active_per_item
  on public.content_lineage_caption_attachments (client_id, content_lineage_item_id)
  where attachment_state = 'active';

create table public.content_final_review_manifests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_lineage_item_id uuid not null,
  operating_cycle_id uuid not null,
  manifest_version integer not null check (manifest_version > 0),
  review_status text not null default 'ready'
    check (review_status in ('ready', 'approved', 'stale', 'superseded')),
  media_attachment_id uuid not null,
  caption_attachment_id uuid not null,
  social_content_item_id uuid not null,
  media_snapshot jsonb not null,
  caption_snapshot text not null,
  target_snapshot jsonb not null default '[]'::jsonb,
  schedule_snapshot jsonb not null default '{}'::jsonb,
  plan_snapshot jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  provenance jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  stale_at timestamptz,
  stale_reason text,
  created_at timestamptz not null default now(),
  unique (client_id, id),
  unique (client_id, content_lineage_item_id, manifest_version),
  foreign key (client_id, content_lineage_item_id)
    references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, operating_cycle_id)
    references public.client_operating_cycles(client_id, id) on delete restrict,
  foreign key (client_id, media_attachment_id)
    references public.content_lineage_media_attachments(client_id, id) on delete restrict,
  foreign key (client_id, caption_attachment_id)
    references public.content_lineage_caption_attachments(client_id, id) on delete restrict,
  foreign key (client_id, social_content_item_id)
    references public.social_content_items(client_id, id) on delete restrict,
  check ((review_status = 'approved' and approved_by is not null and approved_at is not null) or review_status <> 'approved')
);

create index content_final_review_manifests_lineage_idx
  on public.content_final_review_manifests (client_id, content_lineage_item_id, manifest_version desc);

create index content_final_review_manifests_social_item_idx
  on public.content_final_review_manifests (client_id, social_content_item_id, review_status);

create table public.content_final_review_manifest_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  final_review_manifest_id uuid not null,
  social_content_platform_target_id uuid not null,
  platform text not null,
  account_snapshot jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, final_review_manifest_id, social_content_platform_target_id),
  foreign key (client_id, final_review_manifest_id)
    references public.content_final_review_manifests(client_id, id) on delete cascade,
  foreign key (client_id, social_content_platform_target_id)
    references public.social_content_platform_targets(client_id, id) on delete restrict
);

create table public.content_lineage_publishing_handoffs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_lineage_item_id uuid not null,
  final_review_manifest_id uuid not null,
  social_content_item_id uuid not null,
  handoff_state text not null default 'linked' check (handoff_state in ('linked', 'stale', 'superseded')),
  linked_at timestamptz not null default now(),
  provenance jsonb not null default '{}'::jsonb,
  unique (client_id, id),
  unique (client_id, content_lineage_item_id, final_review_manifest_id),
  unique (client_id, social_content_item_id, final_review_manifest_id),
  foreign key (client_id, content_lineage_item_id)
    references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, final_review_manifest_id)
    references public.content_final_review_manifests(client_id, id) on delete restrict,
  foreign key (client_id, social_content_item_id)
    references public.social_content_items(client_id, id) on delete restrict
);

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
end;
$$;

create or replace function public.content_lineage_stale_from_social_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client_id uuid;
  v_item_id uuid;
begin
  v_client_id := coalesce(new.client_id, old.client_id);
  v_item_id := coalesce(new.id, old.id);
  if tg_op <> 'UPDATE'
     or new.final_caption is distinct from old.final_caption
     or new.caption_approved_at is distinct from old.caption_approved_at
     or new.selected_caption_option_id is distinct from old.selected_caption_option_id
     or new.scheduled_date is distinct from old.scheduled_date
     or new.scheduled_time is distinct from old.scheduled_time
     or new.scheduled_at is distinct from old.scheduled_at
     or new.format is distinct from old.format then
    perform public.content_lineage_stale_manifests_for_social_item(v_client_id, v_item_id, 'Canonical caption, format, or schedule changed.');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.content_lineage_stale_from_social_child_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.content_lineage_stale_manifests_for_social_item(
    coalesce(new.client_id, old.client_id),
    coalesce(new.social_content_item_id, old.social_content_item_id),
    case tg_table_name
      when 'social_content_media' then 'Canonical final media changed.'
      else 'Selected platform target changed.'
    end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.content_final_review_manifest_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.review_status = 'approved' and (
    new.client_id is distinct from old.client_id or
    new.content_lineage_item_id is distinct from old.content_lineage_item_id or
    new.operating_cycle_id is distinct from old.operating_cycle_id or
    new.manifest_version is distinct from old.manifest_version or
    new.media_attachment_id is distinct from old.media_attachment_id or
    new.caption_attachment_id is distinct from old.caption_attachment_id or
    new.social_content_item_id is distinct from old.social_content_item_id or
    new.media_snapshot is distinct from old.media_snapshot or
    new.caption_snapshot is distinct from old.caption_snapshot or
    new.target_snapshot is distinct from old.target_snapshot or
    new.schedule_snapshot is distinct from old.schedule_snapshot or
    new.plan_snapshot is distinct from old.plan_snapshot or
    new.payload_hash is distinct from old.payload_hash or
    new.provenance is distinct from old.provenance or
    new.approved_by is distinct from old.approved_by or
    new.approved_at is distinct from old.approved_at
  ) then
    raise exception 'Approved final review manifests are immutable; create a new version instead.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger content_lineage_stale_social_item
after update or delete on public.social_content_items
for each row execute function public.content_lineage_stale_from_social_item_change();

create trigger content_lineage_stale_social_media
after insert or update or delete on public.social_content_media
for each row execute function public.content_lineage_stale_from_social_child_change();

create trigger content_lineage_stale_social_target
after insert or update or delete on public.social_content_platform_targets
for each row execute function public.content_lineage_stale_from_social_child_change();

create trigger content_final_review_manifest_immutable_before_update
before update on public.content_final_review_manifests
for each row execute function public.content_final_review_manifest_immutable();

alter table public.content_lineage_media_attachments enable row level security;
alter table public.content_lineage_caption_attachments enable row level security;
alter table public.content_final_review_manifests enable row level security;
alter table public.content_final_review_manifest_targets enable row level security;
alter table public.content_lineage_publishing_handoffs enable row level security;

revoke all on public.content_lineage_media_attachments,
  public.content_lineage_caption_attachments,
  public.content_final_review_manifests,
  public.content_final_review_manifest_targets,
  public.content_lineage_publishing_handoffs from anon, authenticated;

grant all on public.content_lineage_media_attachments,
  public.content_lineage_caption_attachments,
  public.content_final_review_manifests,
  public.content_final_review_manifest_targets,
  public.content_lineage_publishing_handoffs to service_role;

revoke all on function public.content_lineage_stale_manifests_for_social_item(uuid, uuid, text) from public;
revoke all on function public.content_lineage_stale_from_social_item_change() from public;
revoke all on function public.content_lineage_stale_from_social_child_change() from public;
revoke all on function public.content_final_review_manifest_immutable() from public;

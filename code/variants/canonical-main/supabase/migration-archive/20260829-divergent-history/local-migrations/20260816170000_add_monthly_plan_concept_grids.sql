-- Stage 2B keeps generated visual storyboards beside Monthly Plans. They are
-- review artifacts, never Client Brain Assets or production social media.

create table if not exists public.social_monthly_plan_concept_grids (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  monthly_plan_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'generating' check (status in ('generating', 'generated', 'failed', 'stale', 'accepted')),
  is_selected boolean not null default false,
  plan_snapshot_hash text not null,
  plan_snapshot jsonb not null default '{}'::jsonb,
  correction_text text not null default '',
  prompt_version text not null,
  provider text,
  model text,
  reference_count integer not null default 0 check (reference_count >= 0),
  reference_snapshot jsonb not null default '[]'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  file_object_id uuid references public.client_brain_file_objects(id) on delete restrict,
  failure_reason text,
  generated_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, monthly_plan_id)
    references public.social_monthly_content_plans(client_id, id) on delete cascade,
  unique (monthly_plan_id, version)
);

create index if not exists social_monthly_plan_concept_grids_client_plan_created_idx
  on public.social_monthly_plan_concept_grids (client_id, monthly_plan_id, created_at desc);
create unique index if not exists social_monthly_plan_concept_grids_selected_idx
  on public.social_monthly_plan_concept_grids (monthly_plan_id)
  where is_selected;

create or replace function public.touch_social_monthly_plan_concept_grid_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_social_monthly_plan_concept_grid_updated_at on public.social_monthly_plan_concept_grids;
create trigger touch_social_monthly_plan_concept_grid_updated_at
before update on public.social_monthly_plan_concept_grids
for each row execute function public.touch_social_monthly_plan_concept_grid_updated_at();

create or replace function public.mark_social_monthly_plan_concept_grids_stale_from_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.social_monthly_plan_concept_grids
  set status = 'stale', is_selected = false
  where client_id = new.client_id
    and monthly_plan_id = new.id
    and status in ('generated', 'accepted');
  return new;
end;
$$;

create or replace function public.mark_social_monthly_plan_concept_grids_stale_from_item()
returns trigger
language plpgsql
set search_path = public
as $$
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

drop trigger if exists stale_concept_grids_after_plan_change on public.social_monthly_content_plans;
create trigger stale_concept_grids_after_plan_change
after update on public.social_monthly_content_plans
for each row execute function public.mark_social_monthly_plan_concept_grids_stale_from_plan();

drop trigger if exists stale_concept_grids_after_item_change on public.social_monthly_content_plan_items;
create trigger stale_concept_grids_after_item_change
after insert or update or delete on public.social_monthly_content_plan_items
for each row execute function public.mark_social_monthly_plan_concept_grids_stale_from_item();

alter table public.social_monthly_plan_activity
  drop constraint if exists social_monthly_plan_activity_action_type_check;
alter table public.social_monthly_plan_activity
  add constraint social_monthly_plan_activity_action_type_check
  check (action_type in (
    'plan_created', 'context_saved', 'strategy_saved', 'item_created', 'item_updated',
    'item_deleted', 'item_reordered', 'plan_ready', 'plan_approved', 'plan_reopened',
    'snapshot_refreshed', 'plan_generated', 'plan_regenerated',
    'strategy_regenerated', 'concept_regenerated',
    'concept_grid_generated', 'concept_grid_failed', 'concept_grid_selected', 'concept_grid_accepted'
  ));

alter table public.social_monthly_plan_concept_grids enable row level security;
revoke all on public.social_monthly_plan_concept_grids from anon, authenticated;
grant all on public.social_monthly_plan_concept_grids to service_role;
revoke execute on function public.touch_social_monthly_plan_concept_grid_updated_at() from public, anon, authenticated;
grant execute on function public.touch_social_monthly_plan_concept_grid_updated_at() to service_role;
revoke execute on function public.mark_social_monthly_plan_concept_grids_stale_from_plan() from public, anon, authenticated;
grant execute on function public.mark_social_monthly_plan_concept_grids_stale_from_plan() to service_role;
revoke execute on function public.mark_social_monthly_plan_concept_grids_stale_from_item() from public, anon, authenticated;
grant execute on function public.mark_social_monthly_plan_concept_grids_stale_from_item() to service_role;

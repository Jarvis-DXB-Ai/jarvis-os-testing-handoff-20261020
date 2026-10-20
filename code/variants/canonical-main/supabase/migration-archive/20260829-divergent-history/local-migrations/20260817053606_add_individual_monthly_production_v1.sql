-- Individual Production V1 stores generated candidates beside a Monthly Plan item.
-- They remain review artifacts and never become canonical Client Brain Assets automatically.

create table if not exists public.social_monthly_plan_production_artifacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  monthly_plan_id uuid not null,
  monthly_plan_item_id uuid not null,
  version integer not null check (version > 0),
  status text not null check (status in ('blocked', 'ready', 'generating', 'generated', 'selected', 'failed', 'stale')),
  execution_mode text not null default 'dry_run' check (execution_mode in ('dry_run', 'live')),
  is_selected boolean not null default false,
  correction_text text not null default '',
  prompt_version text not null,
  provider text,
  model text,
  aspect_ratio text not null default '4:5' check (aspect_ratio = '4:5'),
  output_resolution text not null default '4K',
  package_snapshot jsonb not null default '{}'::jsonb,
  package_hash text not null,
  reference_snapshot jsonb not null default '[]'::jsonb,
  prompt_text text not null default '',
  execution jsonb not null default '{}'::jsonb,
  file_object_id uuid references public.client_brain_file_objects(id) on delete restrict,
  failure_reason text,
  generated_at timestamptz,
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, monthly_plan_id)
    references public.social_monthly_content_plans(client_id, id) on delete cascade,
  foreign key (client_id, monthly_plan_item_id)
    references public.social_monthly_content_plan_items(client_id, id) on delete cascade,
  unique (monthly_plan_item_id, version)
);

create index if not exists social_monthly_production_artifacts_item_created_idx
  on public.social_monthly_plan_production_artifacts (client_id, monthly_plan_id, monthly_plan_item_id, created_at desc);
create unique index if not exists social_monthly_production_artifacts_selected_idx
  on public.social_monthly_plan_production_artifacts (monthly_plan_item_id)
  where is_selected;

create or replace function public.touch_social_monthly_plan_production_artifact_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_social_monthly_plan_production_artifact_updated_at on public.social_monthly_plan_production_artifacts;
create trigger touch_social_monthly_plan_production_artifact_updated_at
before update on public.social_monthly_plan_production_artifacts
for each row execute function public.touch_social_monthly_plan_production_artifact_updated_at();

create or replace function public.mark_social_monthly_production_artifacts_stale_from_item()
returns trigger
language plpgsql
set search_path = public
as $$
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

drop trigger if exists stale_production_artifacts_after_item_change on public.social_monthly_content_plan_items;
create trigger stale_production_artifacts_after_item_change
after update or delete on public.social_monthly_content_plan_items
for each row execute function public.mark_social_monthly_production_artifacts_stale_from_item();

alter table public.social_monthly_plan_production_artifacts enable row level security;
revoke all on public.social_monthly_plan_production_artifacts from anon, authenticated;
grant all on public.social_monthly_plan_production_artifacts to service_role;
revoke execute on function public.touch_social_monthly_plan_production_artifact_updated_at() from public, anon, authenticated;
grant execute on function public.touch_social_monthly_plan_production_artifact_updated_at() to service_role;
revoke execute on function public.mark_social_monthly_production_artifacts_stale_from_item() from public, anon, authenticated;
grant execute on function public.mark_social_monthly_production_artifacts_stale_from_item() to service_role;

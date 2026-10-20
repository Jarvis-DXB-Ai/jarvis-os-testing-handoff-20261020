-- Persistent, client-scoped Monthly Content Planning V1.
-- This is a planning-only model. It deliberately stores no generated media,
-- captions, scheduling jobs, provider payloads, or publishing state.

create table if not exists public.social_monthly_content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram')),
  plan_month date not null check (plan_month = date_trunc('month', plan_month)::date),
  target_feed_count integer not null default 15 check (target_feed_count between 1 and 60),
  status text not null default 'draft' check (status in ('draft', 'strategy_ready', 'plan_ready', 'approved')),
  owner_client_notes text not null default '',
  priority_offers text not null default '',
  items_to_avoid text not null default '',
  products_to_push text not null default '',
  temporary_availability_notes text not null default '',
  commercial_priorities text not null default '',
  other_month_notes text not null default '',
  research_context jsonb not null default '{}'::jsonb,
  strategy jsonb not null default '{}'::jsonb,
  content_pillars jsonb not null default '["lifestyle","food","drinks","interiors","events","bts_service"]'::jsonb,
  visual_direction text not null default '',
  grid_notes text not null default '',
  facebook_mirror boolean not null default true,
  client_brain_snapshot jsonb not null default '{}'::jsonb,
  snapshot_at timestamptz,
  approved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform, plan_month),
  unique (client_id, id)
);

create table if not exists public.social_monthly_content_plan_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  monthly_plan_id uuid not null,
  -- Positions 61-120 are reserved only for a server-side reorder transaction.
  -- The planner itself accepts and renders slots 1-60.
  position integer not null check (position between 1 and 120),
  planned_date date,
  date_fixed boolean not null default false,
  pillar text not null default 'lifestyle' check (pillar in ('lifestyle', 'food', 'drinks', 'interiors', 'events', 'bts_service')),
  objective text not null default '',
  subject text not null default '',
  creative_concept text not null default '',
  production_method text not null default 'ai_photography' check (production_method in ('ai_photography', 'graphic_design', 'photo_graphic_overlay', 'existing_asset', 'carousel', 'other')),
  required_assets text[] not null default '{}'::text[],
  missing_asset_note text not null default '',
  visual_direction text not null default '',
  grid_role text not null default 'other' check (grid_role in ('hero_food', 'lifestyle_break', 'graphic_accent', 'venue_breather', 'human_moment', 'product_detail', 'event_commercial', 'other')),
  activation_record_id uuid,
  commercial_rationale text not null default '',
  caption_brief text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'approved_for_plan', 'blocked')),
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, monthly_plan_id)
    references public.social_monthly_content_plans(client_id, id) on delete cascade,
  foreign key (client_id, activation_record_id)
    references public.client_brain_v2_records(client_id, id) on delete set null,
  unique (monthly_plan_id, position),
  unique (client_id, id)
);

create table if not exists public.social_monthly_plan_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  monthly_plan_id uuid not null,
  item_id uuid,
  action_type text not null check (action_type in ('plan_created', 'context_saved', 'strategy_saved', 'item_created', 'item_updated', 'item_deleted', 'item_reordered', 'plan_ready', 'plan_approved', 'plan_reopened', 'snapshot_refreshed')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (client_id, monthly_plan_id)
    references public.social_monthly_content_plans(client_id, id) on delete cascade,
  foreign key (client_id, item_id)
    references public.social_monthly_content_plan_items(client_id, id) on delete set null
);

create index if not exists social_monthly_content_plans_client_month_idx
  on public.social_monthly_content_plans (client_id, plan_month desc, updated_at desc);
create index if not exists social_monthly_content_plan_items_plan_position_idx
  on public.social_monthly_content_plan_items (monthly_plan_id, position);
create index if not exists social_monthly_plan_activity_plan_created_idx
  on public.social_monthly_plan_activity (monthly_plan_id, created_at desc);

-- Kept explicit because this migration is deployed through the targeted
-- migration path in a repository with a divergent migration ledger.
alter table public.social_monthly_content_plan_items
  drop constraint if exists social_monthly_content_plan_items_position_check;
alter table public.social_monthly_content_plan_items
  add constraint social_monthly_content_plan_items_position_check
  check (position between 1 and 120);

create or replace function public.touch_social_monthly_content_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists touch_social_monthly_content_plan_updated_at on public.social_monthly_content_plans;
create trigger touch_social_monthly_content_plan_updated_at
before update on public.social_monthly_content_plans
for each row execute function public.touch_social_monthly_content_plan_updated_at();

drop trigger if exists touch_social_monthly_content_plan_item_updated_at on public.social_monthly_content_plan_items;
create trigger touch_social_monthly_content_plan_item_updated_at
before update on public.social_monthly_content_plan_items
for each row execute function public.touch_social_monthly_content_plan_updated_at();

alter table public.social_monthly_content_plans enable row level security;
alter table public.social_monthly_content_plan_items enable row level security;
alter table public.social_monthly_plan_activity enable row level security;

-- Internal workspace: records are exposed only through scoped server routes
-- until Jarvis has a reusable authenticated membership layer.
revoke all on public.social_monthly_content_plans from anon, authenticated;
revoke all on public.social_monthly_content_plan_items from anon, authenticated;
revoke all on public.social_monthly_plan_activity from anon, authenticated;
grant all on public.social_monthly_content_plans to service_role;
grant all on public.social_monthly_content_plan_items to service_role;
grant all on public.social_monthly_plan_activity to service_role;
revoke execute on function public.touch_social_monthly_content_plan_updated_at() from public, anon, authenticated;
grant execute on function public.touch_social_monthly_content_plan_updated_at() to service_role;

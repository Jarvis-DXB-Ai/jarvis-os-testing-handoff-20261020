-- Phase 1: additive lineage spine. Domain state remains in its existing tables.
-- Composite parent keys make every optional lineage relationship client-scoped at
-- the database boundary.  `id` remains the canonical identity in each domain.
alter table public.ai_content_sessions
  add constraint ai_content_sessions_client_id_id_key unique (client_id, id);

alter table public.ai_content_generations
  add constraint ai_content_generations_client_id_id_key unique (client_id, id);

alter table public.client_content_items
  add constraint client_content_items_client_id_id_key unique (client_id, id);

alter table public.social_content_items
  add constraint social_content_items_client_id_id_key unique (client_id, id);

alter table public.social_provider_executions
  add constraint social_provider_executions_client_id_id_key unique (client_id, id);

alter table public.social_performance_post_observations
  add constraint social_performance_post_observations_client_id_id_key unique (client_id, id);

create table if not exists public.client_operating_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cycle_key text not null check (cycle_key ~ '^[0-9]{4}-[0-9]{2}$'),
  source text not null default 'monthly_plan' check (source in ('monthly_plan','manual_backfill')),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, cycle_key),
  unique (client_id, id)
);

create table if not exists public.content_lineage_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  operating_cycle_id uuid not null,
  monthly_plan_id uuid,
  monthly_plan_item_id uuid,
  studio_session_id uuid,
  studio_generation_id uuid,
  final_content_item_id uuid,
  social_content_item_id uuid,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, operating_cycle_id) references public.client_operating_cycles(client_id, id) on delete cascade,
  foreign key (client_id, monthly_plan_id) references public.social_monthly_content_plans(client_id, id) on delete set null (monthly_plan_id),
  foreign key (client_id, monthly_plan_item_id) references public.social_monthly_content_plan_items(client_id, id) on delete set null (monthly_plan_item_id),
  foreign key (client_id, studio_session_id) references public.ai_content_sessions(client_id, id) on delete set null (studio_session_id),
  foreign key (client_id, studio_generation_id) references public.ai_content_generations(client_id, id) on delete set null (studio_generation_id),
  foreign key (client_id, final_content_item_id) references public.client_content_items(client_id, id) on delete set null (final_content_item_id),
  foreign key (client_id, social_content_item_id) references public.social_content_items(client_id, id) on delete set null (social_content_item_id),
  unique (client_id, monthly_plan_item_id),
  unique (client_id, social_content_item_id),
  unique (client_id, id)
);

create table if not exists public.content_lineage_observation_links (
  id uuid primary key default gen_random_uuid(),
  content_lineage_item_id uuid not null references public.content_lineage_items(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  social_provider_execution_id uuid,
  social_performance_post_observation_id uuid,
  created_at timestamptz not null default now(),
  check (social_provider_execution_id is not null or social_performance_post_observation_id is not null),
  unique nulls not distinct (content_lineage_item_id, social_provider_execution_id, social_performance_post_observation_id),
  foreign key (client_id, content_lineage_item_id) references public.content_lineage_items(client_id, id) on delete cascade,
  foreign key (client_id, social_provider_execution_id) references public.social_provider_executions(client_id, id) on delete restrict,
  foreign key (client_id, social_performance_post_observation_id) references public.social_performance_post_observations(client_id, id) on delete restrict
);

create index if not exists client_operating_cycles_client_key_idx on public.client_operating_cycles(client_id, cycle_key desc);
create index if not exists content_lineage_items_cycle_idx on public.content_lineage_items(client_id, operating_cycle_id);
create index if not exists content_lineage_items_plan_idx on public.content_lineage_items(client_id, monthly_plan_id, monthly_plan_item_id);

alter table public.client_operating_cycles enable row level security;
alter table public.content_lineage_items enable row level security;
alter table public.content_lineage_observation_links enable row level security;
revoke all on public.client_operating_cycles, public.content_lineage_items, public.content_lineage_observation_links from anon, authenticated;
grant all on public.client_operating_cycles, public.content_lineage_items, public.content_lineage_observation_links to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


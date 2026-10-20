-- Research / Web Intelligence and Finance & Costs V1.
-- These records are system-level operating data. Research evidence remains
-- separate from Client Brain truth until a person explicitly promotes it.

create table if not exists public.jarvis_research_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  feature text not null default 'tools_research' check (char_length(feature) between 1 and 120),
  provider text not null default 'tavily' check (provider in ('tavily')),
  operation text not null check (operation in ('search', 'research', 'extract_url', 'crawl_site', 'map_site')),
  objective text not null check (char_length(objective) between 3 and 1600),
  query text not null check (char_length(query) between 3 and 2000),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'blocked')),
  source_count integer not null default 0 check (source_count >= 0),
  credits_used numeric(12, 3),
  cost_usd_estimated numeric(12, 6),
  cost_usd_actual numeric(12, 6),
  latency_ms integer check (latency_ms >= 0),
  summary text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_research_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jarvis_research_runs(id) on delete cascade,
  source_url text not null check (char_length(source_url) between 8 and 4000),
  source_title text,
  excerpt text,
  published_at timestamptz,
  relevance_score numeric(6, 5),
  source_type text not null default 'web' check (source_type in ('web', 'document', 'api')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, source_url)
);

create table if not exists public.jarvis_cost_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (char_length(vendor) between 1 and 160),
  plan_name text,
  category text not null check (category in ('ai', 'infrastructure', 'development', 'research', 'creative', 'social', 'analytics', 'communication', 'other')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  amount numeric(12, 2) not null check (amount >= 0),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual', 'quarterly', 'one_off')),
  start_date date,
  next_renewal_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  allocation_scope text not null default 'agency_wide' check (allocation_scope in ('agency_wide', 'client_specific')),
  client_id uuid references public.clients(id) on delete set null,
  notes text,
  documentation_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((allocation_scope = 'agency_wide' and client_id is null) or (allocation_scope = 'client_specific' and client_id is not null))
);

create index if not exists jarvis_research_runs_created_idx on public.jarvis_research_runs(created_at desc);
create index if not exists jarvis_research_runs_client_idx on public.jarvis_research_runs(client_id, created_at desc) where client_id is not null;
create index if not exists jarvis_research_sources_run_idx on public.jarvis_research_sources(run_id, created_at);
create index if not exists jarvis_cost_subscriptions_renewal_idx on public.jarvis_cost_subscriptions(status, next_renewal_date) where status = 'active';
create index if not exists jarvis_cost_subscriptions_client_idx on public.jarvis_cost_subscriptions(client_id) where client_id is not null;

create or replace function public.jarvis_tools_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_research_runs_set_updated_at on public.jarvis_research_runs;
create trigger jarvis_research_runs_set_updated_at before update on public.jarvis_research_runs
for each row execute function public.jarvis_tools_set_updated_at();

drop trigger if exists jarvis_cost_subscriptions_set_updated_at on public.jarvis_cost_subscriptions;
create trigger jarvis_cost_subscriptions_set_updated_at before update on public.jarvis_cost_subscriptions
for each row execute function public.jarvis_tools_set_updated_at();

alter table public.jarvis_research_runs enable row level security;
alter table public.jarvis_research_sources enable row level security;
alter table public.jarvis_cost_subscriptions enable row level security;
revoke all on public.jarvis_research_runs, public.jarvis_research_sources, public.jarvis_cost_subscriptions from anon, authenticated;
grant all on public.jarvis_research_runs, public.jarvis_research_sources, public.jarvis_cost_subscriptions to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


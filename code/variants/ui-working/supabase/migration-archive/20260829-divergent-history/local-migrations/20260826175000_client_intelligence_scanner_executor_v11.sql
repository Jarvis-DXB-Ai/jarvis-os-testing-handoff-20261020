alter table public.client_intelligence_scans drop constraint if exists client_intelligence_scans_status_check;
alter table public.client_intelligence_scans add constraint client_intelligence_scans_status_check check (status in ('draft','planned','authorized','researching','synthesizing','completed','partial','failed','cancelled','blocked'));
alter table public.client_intelligence_scans add column execution_id uuid unique, add column max_tavily_calls smallint not null default 8 check (max_tavily_calls between 0 and 12), add column max_sonnet_calls smallint not null default 3 check (max_sonnet_calls between 0 and 3), add column tavily_calls_used smallint not null default 0 check (tavily_calls_used >= 0), add column sonnet_calls_used smallint not null default 0 check (sonnet_calls_used >= 0), add column max_research_depth smallint not null default 1 check (max_research_depth between 1 and 2), add column max_sources smallint not null default 32 check (max_sources between 1 and 60), add column cancellation_requested_at timestamptz;
create table public.client_intelligence_scan_steps (
  id uuid primary key default gen_random_uuid(), scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  step_key text not null, provider text not null check (provider in ('tavily','anthropic')), status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled','blocked')),
  attempt_count smallint not null default 0 check (attempt_count <= 1), provider_run_id uuid references public.jarvis_research_runs(id) on delete set null,
  input_metadata jsonb not null default '{}'::jsonb, output_metadata jsonb not null default '{}'::jsonb, error_message text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
  unique(scan_id, step_key)
);
create index client_intelligence_steps_scan_idx on public.client_intelligence_scan_steps(scan_id, created_at);
alter table public.client_intelligence_scan_steps enable row level security;
revoke all on public.client_intelligence_scan_steps from anon, authenticated;
grant all on public.client_intelligence_scan_steps to service_role;

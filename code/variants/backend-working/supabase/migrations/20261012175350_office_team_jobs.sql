-- Office runs are internal work records. No browser database role may access them.
create table public.office_team_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  idempotency_key uuid not null unique,
  brief text not null check (char_length(trim(brief)) between 1 and 2000),
  model_policy text not null check (model_policy in ('quality','balanced','fast')),
  concurrency smallint not null check (concurrency between 1 and 4),
  execution_mode text not null check (execution_mode in ('fixture','anthropic')),
  status text not null default 'queued' check (status in ('queued','running','cancel_requested','needs_review','reviewed','failed','recovery_required','cancelled')),
  selected_agent_ids text[] not null check (cardinality(selected_agent_ids) between 1 and 6),
  context_manifest jsonb not null default '{}'::jsonb,
  synthesis text,
  review_note text not null default '',
  error_message text,
  provider_calls smallint not null default 0 check (provider_calls between 0 and 9),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index office_team_jobs_recent_idx on public.office_team_jobs (created_at desc);
create index office_team_jobs_client_idx on public.office_team_jobs (client_id, created_at desc);

create table public.office_team_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.office_team_jobs(id) on delete cascade,
  agent_id text not null,
  position smallint not null check (position between 0 and 5),
  agent_name text not null,
  role_name text not null,
  assignment text not null,
  model_id text,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','unknown','cancelled')),
  output text,
  error_message text,
  provider_request_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id, agent_id)
);
create index office_team_steps_job_idx on public.office_team_steps (job_id, position);

alter table public.office_team_jobs enable row level security;
alter table public.office_team_steps enable row level security;
revoke all on public.office_team_jobs, public.office_team_steps from public, anon, authenticated;
grant select, insert, update on public.office_team_jobs, public.office_team_steps to service_role;

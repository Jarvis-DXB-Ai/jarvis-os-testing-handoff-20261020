-- V2.5 makes one explicit Creative Director action durable before provider execution.
-- The ledger is service-role-only and retains both completed and incomplete provider work.

create table if not exists public.ai_content_provider_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.ai_content_sessions(id) on delete cascade,
  action_type text not null check (action_type in ('creative_director_prompt', 'nano_banana_generation')),
  request_id uuid not null,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  provider text not null default 'anthropic',
  model text not null,
  prompt_version text not null,
  prompt_version_id uuid references public.ai_content_prompt_versions(id) on delete set null,
  raw_response text,
  failure_diagnostic text,
  execution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, action_type, request_id)
);

create index if not exists ai_content_provider_requests_session_created_idx
  on public.ai_content_provider_requests (session_id, created_at desc);

drop trigger if exists touch_ai_content_provider_requests_updated_at on public.ai_content_provider_requests;
create trigger touch_ai_content_provider_requests_updated_at
  before update on public.ai_content_provider_requests
  for each row execute function public.touch_ai_content_studio_updated_at();

alter table public.ai_content_provider_requests enable row level security;
revoke all on public.ai_content_provider_requests from anon, authenticated;
grant all on public.ai_content_provider_requests to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


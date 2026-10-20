-- V2 keeps Creative Director work separate from immutable image versions.
-- The tables remain service-role-only, matching the existing Studio boundary.

create table if not exists public.ai_content_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.ai_content_sessions(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'ready' check (status in ('ready', 'superseded', 'failed')),
  execution_mode text not null default 'dry_run' check (execution_mode in ('dry_run', 'live')),
  provider text not null default 'anthropic',
  model text not null,
  prompt_version text not null,
  user_brief text not null default '',
  correction text,
  generated_prompt text not null,
  provider_prompt text not null,
  structured_context jsonb not null default '{}'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, version)
);

alter table public.ai_content_generations
  add column if not exists prompt_version_id uuid references public.ai_content_prompt_versions(id) on delete restrict;

create index if not exists ai_content_prompt_versions_session_version_idx
  on public.ai_content_prompt_versions (session_id, version desc);

drop trigger if exists touch_ai_content_prompt_versions_updated_at on public.ai_content_prompt_versions;
create trigger touch_ai_content_prompt_versions_updated_at
  before update on public.ai_content_prompt_versions
  for each row execute function public.touch_ai_content_studio_updated_at();

alter table public.ai_content_prompt_versions enable row level security;
revoke all on public.ai_content_prompt_versions from anon, authenticated;
grant all on public.ai_content_prompt_versions to service_role;

create table if not exists public.social_refresh_diagnostics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  stage text not null,
  diagnostic jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists social_refresh_diagnostics_client_created_idx on public.social_refresh_diagnostics (client_id, created_at desc);
alter table public.social_refresh_diagnostics enable row level security;
revoke all on public.social_refresh_diagnostics from anon, authenticated;
grant all on public.social_refresh_diagnostics to service_role;

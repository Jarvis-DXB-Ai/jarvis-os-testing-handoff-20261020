-- A business owner draw and the corresponding personal receipt are one linked
-- economic event, never two independent manual entries.
create table if not exists public.jarvis_personal_income_events (
  id uuid primary key default gen_random_uuid(),
  owner_draw_id uuid not null unique references public.jarvis_finance_owner_draws(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  received_at date not null,
  category text not null default 'owner_draw' check (category = 'owner_draw'),
  source_reference text not null,
  created_at timestamptz not null default now()
);
alter table public.jarvis_personal_income_events enable row level security;
revoke all on public.jarvis_personal_income_events from anon, authenticated;
grant all on public.jarvis_personal_income_events to service_role;

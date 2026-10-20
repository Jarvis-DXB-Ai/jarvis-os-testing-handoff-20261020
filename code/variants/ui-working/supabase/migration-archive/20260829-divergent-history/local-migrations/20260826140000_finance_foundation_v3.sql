-- Finance foundation V3: AED reporting, traceable FX, recurring-cost metadata,
-- owner draws and a personal boundary. Existing ledgers remain canonical.

alter table public.jarvis_finance_settings drop constraint if exists jarvis_finance_settings_display_currency_check;
alter table public.jarvis_finance_settings add constraint jarvis_finance_settings_display_currency_check check (display_currency in ('aed', 'eur', 'usd', 'both'));

create table if not exists public.jarvis_finance_fx_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(20, 10) not null check (rate > 0),
  source text not null check (char_length(source) between 1 and 160),
  source_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (rate_date, base_currency, quote_currency, source)
);

alter table public.jarvis_cost_subscriptions
  add column if not exists source_key text,
  add column if not exists source_provenance text,
  add column if not exists billing_day smallint check (billing_day between 1 and 31),
  add column if not exists billing_date_known boolean not null default true,
  add column if not exists base_amount numeric(12, 2) check (base_amount is null or base_amount >= 0),
  add column if not exists discount_percent numeric(6, 3) check (discount_percent is null or discount_percent between 0 and 100),
  add column if not exists discount_temporary boolean not null default false,
  add column if not exists discount_end_date date,
  add column if not exists fx_snapshot jsonb;

drop index if exists public.jarvis_cost_subscriptions_source_key_idx;
alter table public.jarvis_cost_subscriptions
  drop constraint if exists jarvis_cost_subscriptions_source_key_key,
  add constraint jarvis_cost_subscriptions_source_key_key unique (source_key);

alter table public.jarvis_finance_expenses
  add column if not exists payment_status text not null default 'committed' check (payment_status in ('planned', 'committed', 'paid', 'cancelled')),
  add column if not exists payment_date date,
  add column if not exists billing_day smallint check (billing_day between 1 and 31),
  add column if not exists next_deduction_date date,
  add column if not exists source_provenance text,
  add column if not exists source_reference text,
  add column if not exists fx_snapshot jsonb;

create table if not exists public.jarvis_finance_owner_draws (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'planned' check (status in ('planned', 'paid', 'cancelled')),
  business_period_start date not null,
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);

create table if not exists public.jarvis_personal_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  category text not null default 'other' check (category in ('rent', 'subscriptions', 'food', 'transport', 'travel', 'investing', 'savings', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  recurrence text not null default 'one_off' check (recurrence in ('monthly', 'annual', 'quarterly', 'one_off')),
  expense_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_finance_fx_rates_date_idx on public.jarvis_finance_fx_rates(rate_date desc);
create index if not exists jarvis_finance_owner_draws_period_idx on public.jarvis_finance_owner_draws(business_period_start, status);
create index if not exists jarvis_personal_expenses_active_idx on public.jarvis_personal_expenses(active, expense_date desc);

drop trigger if exists jarvis_finance_owner_draws_set_updated_at on public.jarvis_finance_owner_draws;
create trigger jarvis_finance_owner_draws_set_updated_at before update on public.jarvis_finance_owner_draws for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_personal_expenses_set_updated_at on public.jarvis_personal_expenses;
create trigger jarvis_personal_expenses_set_updated_at before update on public.jarvis_personal_expenses for each row execute function public.jarvis_finance_set_updated_at();

alter table public.jarvis_finance_fx_rates enable row level security;
alter table public.jarvis_finance_owner_draws enable row level security;
alter table public.jarvis_personal_expenses enable row level security;
revoke all on public.jarvis_finance_fx_rates, public.jarvis_finance_owner_draws, public.jarvis_personal_expenses from anon, authenticated;
grant all on public.jarvis_finance_fx_rates, public.jarvis_finance_owner_draws, public.jarvis_personal_expenses to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


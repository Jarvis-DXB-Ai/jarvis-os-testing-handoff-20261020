-- Finance V2: income, expenses, source-preserving AED/EUR display settings,
-- and a lightweight audit trail. Existing subscriptions and AI usage remain
-- canonical sources and are deliberately not migrated into these tables.

create table if not exists public.jarvis_finance_settings (
  id text primary key default 'mc-studios' check (id = 'mc-studios'),
  source_currency text not null default 'AED' check (source_currency = 'AED'),
  display_currency text not null default 'both' check (display_currency in ('aed', 'eur', 'both')),
  aed_eur_rate numeric(16, 8),
  rate_source text not null default 'manual' check (rate_source = 'manual'),
  rate_effective_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (aed_eur_rate is null or aed_eur_rate > 0)
);

create table if not exists public.jarvis_finance_income_records (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  client_id uuid references public.clients(id) on delete set null,
  counterparty_name text not null check (char_length(counterparty_name) between 1 and 180),
  description text not null check (char_length(description) between 1 and 300),
  income_type text not null check (income_type in ('recurring_service_revenue', 'one_off_revenue', 'other_revenue')),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(6, 3) not null default 0 check (vat_rate between 0 and 100),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  billing_cycle text not null default 'one_off' check (billing_cycle in ('monthly', 'annual', 'quarterly', 'one_off')),
  start_date date,
  end_date date,
  next_billing_date date,
  due_date date,
  payment_date date,
  payment_status text not null default 'not_set' check (payment_status in ('not_set', 'expected', 'invoiced', 'paid', 'overdue')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (gross_amount = round(net_amount + vat_amount, 2)),
  check (vat_amount = round(net_amount * vat_rate / 100, 2))
);

create table if not exists public.jarvis_finance_expenses (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  client_id uuid references public.clients(id) on delete set null,
  vendor text not null check (char_length(vendor) between 1 and 160),
  description text not null check (char_length(description) between 1 and 300),
  category text not null check (category in ('operating', 'contractors', 'software', 'office', 'advertising', 'equipment', 'professional_services', 'travel', 'other')),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(6, 3) not null default 0 check (vat_rate between 0 and 100),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  billing_cycle text not null default 'one_off' check (billing_cycle in ('monthly', 'annual', 'quarterly', 'one_off')),
  expense_date date,
  start_date date,
  end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (gross_amount = round(net_amount + vat_amount, 2)),
  check (vat_amount = round(net_amount * vat_rate / 100, 2))
);

create table if not exists public.jarvis_finance_activity (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('income', 'expense', 'subscription', 'settings')),
  record_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jarvis_finance_income_active_idx on public.jarvis_finance_income_records(active, billing_cycle, start_date);
create index if not exists jarvis_finance_income_client_idx on public.jarvis_finance_income_records(client_id) where client_id is not null;
create index if not exists jarvis_finance_expenses_active_idx on public.jarvis_finance_expenses(active, expense_date desc);
create index if not exists jarvis_finance_expenses_client_idx on public.jarvis_finance_expenses(client_id) where client_id is not null;
create index if not exists jarvis_finance_activity_record_idx on public.jarvis_finance_activity(record_type, record_id, created_at desc);

create or replace function public.jarvis_finance_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_finance_settings_set_updated_at on public.jarvis_finance_settings;
create trigger jarvis_finance_settings_set_updated_at before update on public.jarvis_finance_settings for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_income_set_updated_at on public.jarvis_finance_income_records;
create trigger jarvis_finance_income_set_updated_at before update on public.jarvis_finance_income_records for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_expenses_set_updated_at on public.jarvis_finance_expenses;
create trigger jarvis_finance_expenses_set_updated_at before update on public.jarvis_finance_expenses for each row execute function public.jarvis_finance_set_updated_at();

alter table public.jarvis_finance_settings enable row level security;
alter table public.jarvis_finance_income_records enable row level security;
alter table public.jarvis_finance_expenses enable row level security;
alter table public.jarvis_finance_activity enable row level security;
revoke all on public.jarvis_finance_settings, public.jarvis_finance_income_records, public.jarvis_finance_expenses, public.jarvis_finance_activity from anon, authenticated;
grant all on public.jarvis_finance_settings, public.jarvis_finance_income_records, public.jarvis_finance_expenses, public.jarvis_finance_activity to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


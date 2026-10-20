-- Finance V2.3: confirmed upcoming and potential pipeline records are separate from actual income.
-- Neither table participates in current revenue, VAT, profit, or active MRR
-- until a user explicitly promotes a confirmed record to the actual income ledger.

create table if not exists public.jarvis_finance_upcoming_revenue (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  client_id uuid references public.clients(id) on delete set null,
  counterparty_name text not null check (char_length(counterparty_name) between 1 and 180),
  description text not null check (char_length(description) between 1 and 300),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(6, 3) not null default 0 check (vat_rate between 0 and 100),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  vat_applicable boolean not null default true,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual', 'quarterly', 'one_off')),
  expected_start_date date not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'activated', 'cancelled')),
  notes text,
  activated_income_id uuid references public.jarvis_finance_income_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_amount = round(net_amount + vat_amount, 2)),
  check (vat_amount = round(net_amount * vat_rate / 100, 2))
);

create table if not exists public.jarvis_finance_pipeline (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  client_id uuid references public.clients(id) on delete set null,
  name text not null check (char_length(name) between 1 and 180),
  description text,
  stage text not null default 'not_contacted' check (stage in ('not_contacted', 'referred', 'contacted', 'talks_pending', 'proposal', 'negotiation', 'verbal_agreement', 'won', 'lost')),
  stage_detail text,
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(6, 3) not null default 0 check (vat_rate between 0 and 100),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  vat_applicable boolean not null default true,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual', 'quarterly', 'one_off')),
  expected_start_date date,
  probability numeric(5, 2) check (probability is null or probability between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_amount = round(net_amount + vat_amount, 2)),
  check (vat_amount = round(net_amount * vat_rate / 100, 2))
);

create index if not exists jarvis_finance_upcoming_status_start_idx on public.jarvis_finance_upcoming_revenue (status, expected_start_date);
create index if not exists jarvis_finance_pipeline_stage_start_idx on public.jarvis_finance_pipeline (stage, expected_start_date);

drop trigger if exists jarvis_finance_upcoming_revenue_set_updated_at on public.jarvis_finance_upcoming_revenue;
create trigger jarvis_finance_upcoming_revenue_set_updated_at before update on public.jarvis_finance_upcoming_revenue for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_pipeline_set_updated_at on public.jarvis_finance_pipeline;
create trigger jarvis_finance_pipeline_set_updated_at before update on public.jarvis_finance_pipeline for each row execute function public.jarvis_finance_set_updated_at();

alter table public.jarvis_finance_upcoming_revenue enable row level security;
alter table public.jarvis_finance_pipeline enable row level security;
revoke all on public.jarvis_finance_upcoming_revenue, public.jarvis_finance_pipeline from anon, authenticated;
grant all on public.jarvis_finance_upcoming_revenue, public.jarvis_finance_pipeline to service_role;

alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_record_type_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_record_type_check check (record_type in ('income', 'expense', 'subscription', 'settings', 'upcoming_revenue', 'pipeline'));
alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_action_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_action_check check (action in ('created', 'updated', 'deleted', 'activated', 'won', 'lost'));
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


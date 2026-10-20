-- Finance cash management V4: invoice instances, secure documents, capital policy
-- and planned business/personal investments. Recurring income contracts remain
-- separate from monthly invoice facts so no payment state is inferred.

create table if not exists public.jarvis_finance_invoices (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  income_record_id uuid not null references public.jarvis_finance_income_records(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  counterparty_name text not null check (char_length(counterparty_name) between 1 and 180),
  title text not null check (char_length(title) between 1 and 300),
  invoice_number text,
  invoice_month date not null check (invoice_month = date_trunc('month', invoice_month)::date),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  invoice_available_date date,
  sent_at date,
  paid_at date,
  paid_amount numeric(12, 2),
  payment_reference text,
  notes text,
  provenance text not null default 'Finance invoice record',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at date generated always as (case when sent_at is null then null else sent_at + 7 end) stored,
  check (paid_amount is null or (paid_amount > 0 and paid_amount <= amount)),
  check ((paid_at is null and paid_amount is null) or (paid_at is not null and paid_amount is not null))
);

create unique index if not exists jarvis_finance_invoices_income_month_idx on public.jarvis_finance_invoices(income_record_id, invoice_month);
create index if not exists jarvis_finance_invoices_month_idx on public.jarvis_finance_invoices(invoice_month, sent_at, due_at);
create index if not exists jarvis_finance_invoices_client_idx on public.jarvis_finance_invoices(client_id) where client_id is not null;

create table if not exists public.jarvis_finance_invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.jarvis_finance_invoices(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  storage_bucket text not null default 'finance-documents' check (storage_bucket = 'finance-documents'),
  storage_path text not null unique check (char_length(storage_path) between 1 and 1024),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now()
);
create index if not exists jarvis_finance_invoice_attachments_invoice_idx on public.jarvis_finance_invoice_attachments(invoice_id, created_at desc);

create table if not exists public.jarvis_finance_capital_policy (
  id text primary key default 'mc-studios' check (id = 'mc-studios'),
  reserve_target_months numeric(4, 2) not null default 1 check (reserve_target_months >= 0 and reserve_target_months <= 24),
  custom_reserve_aed numeric(12, 2) check (custom_reserve_aed is null or custom_reserve_aed >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_finance_investments (
  id uuid primary key default gen_random_uuid(), source_key text unique,
  name text not null check (char_length(name) between 1 and 180), category text not null check (char_length(category) between 1 and 180),
  estimated_amount numeric(12, 2) not null check (estimated_amount > 0), currency text not null check (currency ~ '^[A-Z]{3}$'),
  classification text not null default 'business' check (classification in ('business', 'personal')),
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  desired_purchase_date date, status text not null default 'planned' check (status in ('planned', 'saving', 'affordable', 'purchased', 'paused', 'cancelled')),
  allocated_amount numeric(12, 2) not null default 0 check (allocated_amount >= 0 and allocated_amount <= estimated_amount),
  notes text, source_provenance text not null default 'Finance planned purchase', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jarvis_finance_investments_active_idx on public.jarvis_finance_investments(classification, status, priority, desired_purchase_date);

drop trigger if exists jarvis_finance_invoices_set_updated_at on public.jarvis_finance_invoices;
create trigger jarvis_finance_invoices_set_updated_at before update on public.jarvis_finance_invoices for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_capital_policy_set_updated_at on public.jarvis_finance_capital_policy;
create trigger jarvis_finance_capital_policy_set_updated_at before update on public.jarvis_finance_capital_policy for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_investments_set_updated_at on public.jarvis_finance_investments;
create trigger jarvis_finance_investments_set_updated_at before update on public.jarvis_finance_investments for each row execute function public.jarvis_finance_set_updated_at();

alter table public.jarvis_finance_invoices enable row level security;
alter table public.jarvis_finance_invoice_attachments enable row level security;
alter table public.jarvis_finance_capital_policy enable row level security;
alter table public.jarvis_finance_investments enable row level security;
revoke all on public.jarvis_finance_invoices, public.jarvis_finance_invoice_attachments, public.jarvis_finance_capital_policy, public.jarvis_finance_investments from anon, authenticated;
grant all on public.jarvis_finance_invoices, public.jarvis_finance_invoice_attachments, public.jarvis_finance_capital_policy, public.jarvis_finance_investments to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_record_type_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_record_type_check check (record_type in ('income', 'expense', 'subscription', 'settings', 'upcoming_revenue', 'pipeline', 'owner_draw', 'personal_expense', 'invoice', 'invoice_attachment', 'investment', 'capital_policy'));
alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_action_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_action_check check (action in ('created', 'updated', 'deleted', 'activated', 'won', 'lost', 'sent', 'paid', 'attachment_added', 'attachment_removed', 'allocated'));
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


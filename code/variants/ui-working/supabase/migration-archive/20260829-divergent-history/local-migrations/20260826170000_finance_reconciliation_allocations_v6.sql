-- Explicit, immutable reconciliation links. A source transaction can be
-- allocated across several invoices, but never beyond its bank-recorded value.
create table if not exists public.jarvis_finance_bank_allocations (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.jarvis_finance_bank_transactions(id) on delete restrict,
  target_type text not null check (target_type in ('invoice','expense','owner_draw','personal_expense','transfer')),
  target_id uuid,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  confirmed_at timestamptz not null default now(),
  confirmation_source text not null default 'user_confirmed', provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bank_transaction_id, target_type, target_id)
);
create index if not exists jarvis_finance_bank_allocations_transaction_idx on public.jarvis_finance_bank_allocations(bank_transaction_id);
create index if not exists jarvis_finance_bank_allocations_target_idx on public.jarvis_finance_bank_allocations(target_type, target_id);
alter table public.jarvis_finance_bank_allocations enable row level security;
revoke all on public.jarvis_finance_bank_allocations from anon, authenticated;
grant all on public.jarvis_finance_bank_allocations to service_role;
alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_record_type_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_record_type_check check (record_type in ('income','expense','subscription','settings','upcoming_revenue','pipeline','owner_draw','personal_expense','invoice','invoice_attachment','investment','capital_policy','bank_statement','bank_transaction','vendor_rule','bank_allocation'));

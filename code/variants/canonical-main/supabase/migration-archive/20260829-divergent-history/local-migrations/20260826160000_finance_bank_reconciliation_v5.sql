-- Finance bank-reconciliation V5: immutable source statements, normalized
-- transactions, review-only classifications, and narrowly scoped vendor rules.
create table if not exists public.jarvis_finance_bank_statements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  account_label text not null check (char_length(account_label) between 1 and 180),
  statement_start_date date, statement_end_date date,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_bucket text not null default 'finance-statements' check (storage_bucket = 'finance-statements'),
  storage_path text not null unique, mime_type text not null check (mime_type in ('text/csv','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520), currency text,
  opening_balance numeric(14,2), closing_balance numeric(14,2), parser text not null,
  status text not null default 'review' check (status in ('parsing','review','reconciled','failed')),
  parser_diagnostics jsonb not null default '{}'::jsonb, imported_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jarvis_finance_bank_statements_period_idx on public.jarvis_finance_bank_statements(statement_end_date desc);

create table if not exists public.jarvis_finance_bank_transactions (
  id uuid primary key default gen_random_uuid(), statement_id uuid not null references public.jarvis_finance_bank_statements(id) on delete cascade,
  transaction_date date not null, posting_date date, description text not null, merchant text, debit numeric(14,2) not null default 0 check (debit >= 0), credit numeric(14,2) not null default 0 check (credit >= 0), signed_amount numeric(14,2) not null check (signed_amount <> 0), currency text not null check (currency ~ '^[A-Z]{3}$'), reference text, account_label text not null,
  identity_fingerprint text not null unique, raw_source text not null,
  scope text not null default 'unresolved' check (scope in ('business','personal','transfer','unresolved','excluded')),
  category text, classification_status text not null default 'needs_review' check (classification_status in ('needs_review','suggested','confirmed','excluded','duplicate')),
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  classification_source text not null default 'parser', classification_reason text,
  matched_record_type text, matched_record_id uuid, confirmed_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((debit = 0) <> (credit = 0)), check ((signed_amount < 0) = (debit > 0))
);
create index if not exists jarvis_finance_bank_transactions_review_idx on public.jarvis_finance_bank_transactions(classification_status, scope, transaction_date desc);
create index if not exists jarvis_finance_bank_transactions_statement_idx on public.jarvis_finance_bank_transactions(statement_id, transaction_date);

create table if not exists public.jarvis_finance_vendor_rules (
  id uuid primary key default gen_random_uuid(), normalized_pattern text not null check (char_length(normalized_pattern) between 3 and 160), category text, scope text not null check (scope in ('business','personal','transfer')), confidence text not null default 'high' check (confidence in ('high','medium','low')), source text not null default 'user_confirmed', created_at timestamptz not null default now(), confirmed_at timestamptz not null default now(), unique(normalized_pattern, scope, category)
);

drop trigger if exists jarvis_finance_bank_statements_set_updated_at on public.jarvis_finance_bank_statements;
create trigger jarvis_finance_bank_statements_set_updated_at before update on public.jarvis_finance_bank_statements for each row execute function public.jarvis_finance_set_updated_at();
drop trigger if exists jarvis_finance_bank_transactions_set_updated_at on public.jarvis_finance_bank_transactions;
create trigger jarvis_finance_bank_transactions_set_updated_at before update on public.jarvis_finance_bank_transactions for each row execute function public.jarvis_finance_set_updated_at();

alter table public.jarvis_finance_bank_statements enable row level security;
alter table public.jarvis_finance_bank_transactions enable row level security;
alter table public.jarvis_finance_vendor_rules enable row level security;
revoke all on public.jarvis_finance_bank_statements, public.jarvis_finance_bank_transactions, public.jarvis_finance_vendor_rules from anon, authenticated;
grant all on public.jarvis_finance_bank_statements, public.jarvis_finance_bank_transactions, public.jarvis_finance_vendor_rules to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_record_type_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_record_type_check check (record_type in ('income','expense','subscription','settings','upcoming_revenue','pipeline','owner_draw','personal_expense','invoice','invoice_attachment','investment','capital_policy','bank_statement','bank_transaction','vendor_rule'));
alter table public.jarvis_finance_activity drop constraint if exists jarvis_finance_activity_action_check;
alter table public.jarvis_finance_activity add constraint jarvis_finance_activity_action_check check (action in ('created','updated','deleted','activated','won','lost','sent','paid','attachment_added','attachment_removed','allocated','imported','confirmed','matched','reconciled'));

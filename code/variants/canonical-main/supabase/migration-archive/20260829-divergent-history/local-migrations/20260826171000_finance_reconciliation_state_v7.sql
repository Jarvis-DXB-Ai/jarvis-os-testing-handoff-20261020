-- Reconciliation state is distinct from a deterministic suggestion: only an
-- explicit user confirmation makes a transaction reconciled/postable.
alter table public.jarvis_finance_bank_transactions
  drop constraint if exists jarvis_finance_bank_transactions_classification_status_check;
alter table public.jarvis_finance_bank_transactions
  add constraint jarvis_finance_bank_transactions_classification_status_check
  check (classification_status in ('needs_review','suggested','confirmed','reconciled','excluded','duplicate'));

-- Each allocation is immutable evidence of an actual settlement amount. The
-- source transaction amount remains untouched; forecast values stay on the
-- canonical expense/invoice records.
alter table public.jarvis_finance_bank_allocations
  add column if not exists actual_native_amount numeric(14,2),
  add column if not exists variance_amount numeric(14,2);

create index if not exists jarvis_finance_bank_transactions_statement_resolution_idx
  on public.jarvis_finance_bank_transactions(statement_id, classification_status);

-- Finance V2.2: approved recurring client income and operating costs.
-- This keeps original source currencies canonical and introduces two small
-- distinctions required for clear reporting: VAT applicability and a named
-- client allocation when a canonical Client record does not yet exist.

alter table public.jarvis_finance_income_records
  add column if not exists vat_applicable boolean not null default true;

alter table public.jarvis_finance_expenses
  add column if not exists client_allocation_name text
  check (client_allocation_name is null or char_length(client_allocation_name) between 1 and 180);

create index if not exists jarvis_finance_expenses_allocation_idx
  on public.jarvis_finance_expenses (client_allocation_name)
  where client_allocation_name is not null;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


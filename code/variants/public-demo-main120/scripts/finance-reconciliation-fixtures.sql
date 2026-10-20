-- Isolated reconciliation integrity fixture. Run with:
-- supabase db query --linked -f scripts/finance-reconciliation-fixtures.sql
-- Every test row is rolled back; no production Finance record is retained.
begin;

do $$
declare
  income_a uuid := gen_random_uuid(); income_b uuid := gen_random_uuid(); income_c uuid := gen_random_uuid();
  invoice_a uuid := gen_random_uuid(); invoice_b uuid := gen_random_uuid(); invoice_c uuid := gen_random_uuid();
  statement_id uuid := gen_random_uuid(); payment_id uuid := gen_random_uuid(); partial_id uuid := gen_random_uuid(); debit_id uuid := gen_random_uuid();
  expense_id uuid := gen_random_uuid(); draw_id uuid := gen_random_uuid(); personal_id uuid := gen_random_uuid();
  total numeric(14,2); duplicate_rejected boolean := false; overrun_rejected boolean := false;
begin
  insert into public.jarvis_finance_income_records (id, source_key, counterparty_name, description, income_type, net_amount, currency, vat_rate, vat_amount, gross_amount, billing_cycle, active)
  values
    (income_a, 'qa-recon-income-a', 'QA A', 'QA invoice A', 'one_off_revenue', 1000, 'AED', 0, 0, 1000, 'one_off', true),
    (income_b, 'qa-recon-income-b', 'QA B', 'QA invoice B', 'one_off_revenue', 800, 'AED', 0, 0, 800, 'one_off', true),
    (income_c, 'qa-recon-income-c', 'QA C', 'QA invoice C', 'one_off_revenue', 1000, 'AED', 0, 0, 1000, 'one_off', true);
  insert into public.jarvis_finance_invoices (id, income_record_id, counterparty_name, title, invoice_month, amount, currency, sent_at)
  values
    (invoice_a, income_a, 'QA A', 'QA A', '2026-08-01', 1000, 'AED', '2026-08-01'),
    (invoice_b, income_b, 'QA B', 'QA B', '2026-08-01', 800, 'AED', '2026-08-01'),
    (invoice_c, income_c, 'QA C', 'QA C', '2026-08-01', 1000, 'AED', '2026-08-01');
  insert into public.jarvis_finance_bank_statements (id, account_label, original_filename, storage_path, mime_type, byte_size, currency, parser)
  values (statement_id, 'QA reconciliation account', 'qa.csv', 'qa/fixture.csv', 'text/csv', 1, 'AED', 'fixture');
  insert into public.jarvis_finance_bank_transactions (id, statement_id, transaction_date, description, debit, credit, signed_amount, currency, account_label, identity_fingerprint, raw_source)
  values
    (payment_id, statement_id, '2026-08-12', 'QA multi invoice payment', 0, 1800, 1800, 'AED', 'QA reconciliation account', 'qa-recon-payment', 'fixture'),
    (partial_id, statement_id, '2026-08-13', 'QA partial payment', 0, 600, 600, 'AED', 'QA reconciliation account', 'qa-recon-partial', 'fixture'),
    (debit_id, statement_id, '2026-08-14', 'QA operating debit', 120, 0, -120, 'AED', 'QA reconciliation account', 'qa-recon-debit', 'fixture');
  insert into public.jarvis_finance_bank_allocations (bank_transaction_id, target_type, target_id, allocated_amount, actual_native_amount, currency)
  values
    (payment_id, 'invoice', invoice_a, 1000, 1000, 'AED'),
    (payment_id, 'invoice', invoice_b, 800, 800, 'AED'),
    (partial_id, 'invoice', invoice_c, 600, 600, 'AED');
  select sum(allocated_amount) into total from public.jarvis_finance_bank_allocations where bank_transaction_id = payment_id;
  if total <> 1800 then raise exception 'multi-invoice allocation fixture failed'; end if;
  begin
    insert into public.jarvis_finance_bank_allocations (bank_transaction_id, target_type, target_id, allocated_amount, currency)
    values (partial_id, 'transfer', null, 401, 'AED');
  exception when others then overrun_rejected := true;
  end;
  if not overrun_rejected then raise exception 'allocation overrun guard failed'; end if;
  begin
    insert into public.jarvis_finance_bank_transactions (statement_id, transaction_date, description, debit, credit, signed_amount, currency, account_label, identity_fingerprint, raw_source)
    values (statement_id, '2026-08-12', 'duplicate', 0, 1800, 1800, 'AED', 'QA reconciliation account', 'qa-recon-payment', 'fixture');
  exception when unique_violation then duplicate_rejected := true;
  end;
  if not duplicate_rejected then raise exception 'duplicate fingerprint guard failed'; end if;
  insert into public.jarvis_finance_expenses (id, vendor, description, category, net_amount, currency, vat_rate, vat_amount, gross_amount, billing_cycle, expense_date, payment_status, payment_date)
  values (expense_id, 'QA vendor', 'Expected expense retained separately from actual debit', 'software', 100, 'AED', 0, 0, 100, 'one_off', '2026-08-01', 'paid', '2026-08-14');
  insert into public.jarvis_finance_bank_allocations (bank_transaction_id, target_type, target_id, allocated_amount, actual_native_amount, variance_amount, currency)
  values (debit_id, 'expense', expense_id, 120, 120, 20, 'AED');
  insert into public.jarvis_finance_owner_draws (id, amount, currency, status, business_period_start, paid_at)
  values (draw_id, 50, 'AED', 'paid', '2026-08-01', '2026-08-15');
  insert into public.jarvis_personal_income_events (owner_draw_id, amount, currency, received_at, source_reference)
  values (draw_id, 50, 'AED', '2026-08-15', 'QA owner draw');
  insert into public.jarvis_personal_expenses (id, name, category, amount, currency, recurrence, expense_date)
  values (personal_id, 'QA personal spend', 'other', 25, 'AED', 'one_off', '2026-08-16');
  insert into public.jarvis_finance_vendor_rules (normalized_pattern, category, scope, confidence, source)
  values ('QA VENDOR', 'software', 'business', 'high', 'fixture');
end $$;

select 'finance-reconciliation-fixtures: passed (all writes will roll back)' as result;
rollback;

select
  (select count(*) from public.jarvis_finance_bank_statements where account_label = 'QA reconciliation account') as qa_statements_after_rollback,
  (select count(*) from public.jarvis_finance_bank_transactions where identity_fingerprint like 'qa-recon-%') as qa_transactions_after_rollback,
  (select count(*) from public.jarvis_personal_income_events where source_reference = 'QA owner draw') as qa_personal_income_after_rollback;

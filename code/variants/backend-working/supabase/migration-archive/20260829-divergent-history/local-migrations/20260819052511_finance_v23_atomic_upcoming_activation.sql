-- Promotion is explicit and atomic: the current-income ledger changes only
-- when the future record is successfully marked activated in the same transaction.
create or replace function public.activate_jarvis_finance_upcoming_revenue(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  future_record public.jarvis_finance_upcoming_revenue%rowtype;
  created_income_id uuid;
begin
  update public.jarvis_finance_upcoming_revenue
  set status = 'activated'
  where id = p_id
    and updated_at = p_expected_updated_at
    and status = 'upcoming'
  returning * into future_record;

  if not found then
    raise exception 'Upcoming revenue changed elsewhere or is not available for activation.' using errcode = 'P0001';
  end if;

  insert into public.jarvis_finance_income_records (
    source_key, client_id, counterparty_name, description, income_type,
    net_amount, currency, vat_rate, vat_amount, gross_amount, vat_applicable,
    billing_cycle, start_date, payment_status, active, notes
  ) values (
    'activated:' || coalesce(future_record.source_key, future_record.id::text),
    future_record.client_id, future_record.counterparty_name, future_record.description,
    'recurring_service_revenue', future_record.net_amount, future_record.currency,
    future_record.vat_rate, future_record.vat_amount, future_record.gross_amount,
    future_record.vat_applicable, future_record.billing_cycle, current_date,
    'expected', true, future_record.notes
  ) returning id into created_income_id;

  update public.jarvis_finance_upcoming_revenue
  set activated_income_id = created_income_id
  where id = future_record.id;

  return created_income_id;
end;
$$;

revoke all on function public.activate_jarvis_finance_upcoming_revenue(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.activate_jarvis_finance_upcoming_revenue(uuid, timestamptz) to service_role;

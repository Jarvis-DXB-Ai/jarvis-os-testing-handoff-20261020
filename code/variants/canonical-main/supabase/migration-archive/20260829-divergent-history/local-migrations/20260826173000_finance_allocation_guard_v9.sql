-- Application validation gives a clear message; this trigger is the final
-- concurrency-safe guard against an allocation total exceeding the immutable
-- bank amount through any write path.
create or replace function public.jarvis_finance_guard_bank_allocation_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bank_total numeric(14,2);
  allocated_total numeric(14,2);
begin
  select abs(signed_amount) into bank_total
  from public.jarvis_finance_bank_transactions
  where id = new.bank_transaction_id
  for update;
  if bank_total is null then
    raise exception 'Bank transaction does not exist';
  end if;
  select coalesce(sum(allocated_amount), 0) into allocated_total
  from public.jarvis_finance_bank_allocations
  where bank_transaction_id = new.bank_transaction_id
    and id is distinct from new.id;
  if allocated_total + new.allocated_amount > bank_total + 0.000001 then
    raise exception 'Allocation total exceeds immutable bank transaction amount';
  end if;
  return new;
end;
$$;

drop trigger if exists jarvis_finance_bank_allocation_total_guard on public.jarvis_finance_bank_allocations;
create trigger jarvis_finance_bank_allocation_total_guard
before insert or update of bank_transaction_id, allocated_amount
on public.jarvis_finance_bank_allocations
for each row execute function public.jarvis_finance_guard_bank_allocation_total();

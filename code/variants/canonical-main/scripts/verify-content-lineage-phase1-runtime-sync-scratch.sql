-- Disposable PostgreSQL fixture for the Phase 1 runtime linkage repair.
-- Run only after the production-schema baseline and active lineage migrations.
-- It never connects to the linked Supabase project.

insert into public.clients (id, name) values
  ('7b8da57e-af0b-5051-917e-d920da12aaa3', 'Phase 1 Runtime Client A'),
  ('c1d7856f-0813-59df-9358-54efdb6603c7', 'Phase 1 Runtime Client B');

insert into public.social_monthly_content_plans (id, client_id, plan_month, status) values
  ('2a42ffb6-ccc0-5720-bc09-6977d80ba723', '7b8da57e-af0b-5051-917e-d920da12aaa3', '2026-09-01', 'plan_ready'),
  ('4b0a0892-7b9a-5b42-b992-e6f0ec402389', 'c1d7856f-0813-59df-9358-54efdb6603c7', '2026-09-01', 'plan_ready');

insert into public.social_monthly_content_plan_items (id, client_id, monthly_plan_id, position, objective, subject, creative_concept) values
  ('5c83aa4b-8542-5871-a62d-6e7b16305638', '7b8da57e-af0b-5051-917e-d920da12aaa3', '2a42ffb6-ccc0-5720-bc09-6977d80ba723', 1, 'Objective A1', 'Subject A1', 'Concept A1'),
  ('66280707-2ba8-50ed-8c6f-5dbe84a00a8c', '7b8da57e-af0b-5051-917e-d920da12aaa3', '2a42ffb6-ccc0-5720-bc09-6977d80ba723', 2, 'Objective A2', 'Subject A2', 'Concept A2'),
  ('43546bea-183b-58e0-93b7-9f4d79b614a5', 'c1d7856f-0813-59df-9358-54efdb6603c7', '4b0a0892-7b9a-5b42-b992-e6f0ec402389', 1, 'Objective B1', 'Subject B1', 'Concept B1'),
  ('66c33c48-182f-5687-9ad5-f0d520151277', 'c1d7856f-0813-59df-9358-54efdb6603c7', '4b0a0892-7b9a-5b42-b992-e6f0ec402389', 2, 'Objective B2', 'Subject B2', 'Concept B2');

do $$
begin
  begin
    perform * from public.sync_approved_monthly_plan_lineage(
      '7b8da57e-af0b-5051-917e-d920da12aaa3',
      '2a42ffb6-ccc0-5720-bc09-6977d80ba723'
    );
    raise exception 'Expected unapproved-plan recovery rejection.';
  exception when sqlstate 'PT400' then
    raise notice 'unapproved plan recovery rejected as expected';
  end;

  begin
    perform * from public.sync_approved_monthly_plan_lineage(
      'c1d7856f-0813-59df-9358-54efdb6603c7',
      '2a42ffb6-ccc0-5720-bc09-6977d80ba723'
    );
    raise exception 'Expected cross-client plan recovery rejection.';
  exception when sqlstate 'PT404' then
    raise notice 'cross-client plan recovery rejected as expected';
  end;
end;
$$;

do $$
declare
  v_baseline timestamptz;
  v_result jsonb;
  v_repeat record;
begin
  select updated_at into v_baseline
  from public.social_monthly_content_plans
  where id = '2a42ffb6-ccc0-5720-bc09-6977d80ba723';

  v_result := public.approve_monthly_plan_and_sync_lineage(
    '7b8da57e-af0b-5051-917e-d920da12aaa3',
    '2a42ffb6-ccc0-5720-bc09-6977d80ba723',
    v_baseline
  );

  if (v_result->'plan'->>'status') <> 'approved'
     or (v_result->'lineage_sync'->>'cycles_created')::integer <> 1
     or (v_result->'lineage_sync'->>'lineage_created')::integer <> 2
     or (v_result->'lineage_sync'->>'lineage_existing')::integer <> 0 then
    raise exception 'Approval did not atomically create the expected lineage: %', v_result;
  end if;

  if (select count(*) from public.client_operating_cycles where client_id = '7b8da57e-af0b-5051-917e-d920da12aaa3' and cycle_key = '2026-09') <> 1
     or (select count(*) from public.content_lineage_items where client_id = '7b8da57e-af0b-5051-917e-d920da12aaa3' and monthly_plan_id = '2a42ffb6-ccc0-5720-bc09-6977d80ba723') <> 2 then
    raise exception 'Approved plan did not create exactly one cycle and one lineage item per plan item.';
  end if;

  select * into v_repeat
  from public.sync_approved_monthly_plan_lineage(
    '7b8da57e-af0b-5051-917e-d920da12aaa3',
    '2a42ffb6-ccc0-5720-bc09-6977d80ba723'
  );
  if v_repeat.cycles_created <> 0 or v_repeat.lineage_created <> 0 or v_repeat.lineage_existing <> 2 then
    raise exception 'Idempotent rerun did not converge: %', row_to_json(v_repeat);
  end if;
  raise notice 'approval and idempotent recovery converged as expected';
end;
$$;

insert into public.client_operating_cycles (id, client_id, cycle_key, provenance) values
  ('8a031c07-a035-5dd7-8c3a-d46f2209631e', 'c1d7856f-0813-59df-9358-54efdb6603c7', '2026-09', '{"preexisting":true}');

insert into public.content_lineage_items (id, client_id, operating_cycle_id, monthly_plan_id, monthly_plan_item_id, provenance) values
  ('5b14da27-60b1-5401-aca2-059b41e2f081', 'c1d7856f-0813-59df-9358-54efdb6603c7', '8a031c07-a035-5dd7-8c3a-d46f2209631e', '4b0a0892-7b9a-5b42-b992-e6f0ec402389', '43546bea-183b-58e0-93b7-9f4d79b614a5', '{"preserve":"existing"}');

do $$
declare
  v_baseline timestamptz;
  v_result jsonb;
begin
  select updated_at into v_baseline
  from public.social_monthly_content_plans
  where id = '4b0a0892-7b9a-5b42-b992-e6f0ec402389';

  v_result := public.approve_monthly_plan_and_sync_lineage(
    'c1d7856f-0813-59df-9358-54efdb6603c7',
    '4b0a0892-7b9a-5b42-b992-e6f0ec402389',
    v_baseline
  );

  if (v_result->'lineage_sync'->>'cycles_created')::integer <> 0
     or (v_result->'lineage_sync'->>'lineage_created')::integer <> 1
     or (v_result->'lineage_sync'->>'lineage_existing')::integer <> 1 then
    raise exception 'Partial existing lineage did not converge safely: %', v_result;
  end if;
  if (select provenance->>'preserve' from public.content_lineage_items where id = '5b14da27-60b1-5401-aca2-059b41e2f081') <> 'existing' then
    raise exception 'Existing lineage was destructively overwritten.';
  end if;
  if (select count(*) from public.content_lineage_items where client_id = 'c1d7856f-0813-59df-9358-54efdb6603c7' and monthly_plan_id = '4b0a0892-7b9a-5b42-b992-e6f0ec402389') <> 2 then
    raise exception 'Partial existing lineage did not create its missing item.';
  end if;
  raise notice 'partial existing lineage converged without replacement as expected';
end;
$$;

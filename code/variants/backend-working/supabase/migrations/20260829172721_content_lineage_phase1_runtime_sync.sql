-- Phase 1 runtime repair: the original migration could only backfill plans that
-- were approved when it ran. These functions make the same cycle/item linkage
-- available to the canonical Planner approval transaction and to server-only
-- recovery for an already-approved plan. They deliberately do not infer any
-- Studio, caption, review, publishing, execution, or observation relationship.

create or replace function public.sync_approved_monthly_plan_lineage(
  p_client_id uuid,
  p_monthly_plan_id uuid
)
returns table (
  operating_cycle_id uuid,
  cycles_created integer,
  lineage_created integer,
  lineage_existing integer
)
language plpgsql
set search_path to 'public'
as $$
declare
  v_plan public.social_monthly_content_plans%rowtype;
  v_cycle_id uuid;
  v_cycles_created integer := 0;
  v_lineage_created integer := 0;
  v_lineage_existing integer := 0;
begin
  select *
  into v_plan
  from public.social_monthly_content_plans
  where id = p_monthly_plan_id
    and client_id = p_client_id
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'Monthly Plan was not found for this client.';
  end if;

  if v_plan.status <> 'approved' then
    raise exception using errcode = 'PT400', message = 'Only an approved Monthly Plan can be reconciled into content lineage.';
  end if;

  insert into public.client_operating_cycles (client_id, cycle_key, source, provenance)
  values (
    p_client_id,
    to_char(v_plan.plan_month, 'YYYY-MM'),
    'monthly_plan',
    jsonb_build_object(
      'monthly_plan_id', v_plan.id,
      'source', 'monthly_plan_approval'
    )
  )
  on conflict (client_id, cycle_key) do nothing
  returning id into v_cycle_id;
  get diagnostics v_cycles_created = row_count;

  if v_cycle_id is null then
    select id
    into v_cycle_id
    from public.client_operating_cycles
    where client_id = p_client_id
      and cycle_key = to_char(v_plan.plan_month, 'YYYY-MM');
  end if;

  select count(*)::integer
  into v_lineage_existing
  from public.content_lineage_items lineage
  join public.social_monthly_content_plan_items item
    on item.id = lineage.monthly_plan_item_id
   and item.client_id = lineage.client_id
  where lineage.client_id = p_client_id
    and item.monthly_plan_id = p_monthly_plan_id;

  insert into public.content_lineage_items (
    client_id,
    operating_cycle_id,
    monthly_plan_id,
    monthly_plan_item_id,
    provenance
  )
  select
    p_client_id,
    v_cycle_id,
    p_monthly_plan_id,
    item.id,
    jsonb_build_object(
      'source', 'monthly_plan_item',
      'monthly_plan_id', p_monthly_plan_id,
      'runtime_sync', 'phase1'
    )
  from public.social_monthly_content_plan_items item
  where item.client_id = p_client_id
    and item.monthly_plan_id = p_monthly_plan_id
  on conflict (client_id, monthly_plan_item_id) do nothing;
  get diagnostics v_lineage_created = row_count;

  return query
  select v_cycle_id, v_cycles_created, v_lineage_created, v_lineage_existing;
end;
$$;

create or replace function public.approve_monthly_plan_and_sync_lineage(
  p_client_id uuid,
  p_monthly_plan_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_plan public.social_monthly_content_plans%rowtype;
  v_sync record;
begin
  select *
  into v_plan
  from public.social_monthly_content_plans
  where id = p_monthly_plan_id
    and client_id = p_client_id
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'Monthly Plan was not found for this client.';
  end if;

  if v_plan.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This Monthly Plan changed after editing began. Refresh and review the latest version.';
  end if;

  if not exists (
    select 1
    from public.social_monthly_content_plan_items item
    where item.client_id = p_client_id
      and item.monthly_plan_id = p_monthly_plan_id
  ) then
    raise exception using errcode = 'PT400', message = 'Add Feed items before approving the plan.';
  end if;

  if exists (
    select 1
    from public.social_monthly_content_plan_items item
    where item.client_id = p_client_id
      and item.monthly_plan_id = p_monthly_plan_id
      and (
        btrim(item.objective) = ''
        or btrim(item.subject) = ''
        or btrim(item.creative_concept) = ''
      )
  ) then
    raise exception using errcode = 'PT400', message = 'Every Feed item needs an objective, subject, and creative concept before approval.';
  end if;

  update public.social_monthly_content_plans
  set status = 'approved', approved_at = now()
  where id = p_monthly_plan_id
    and client_id = p_client_id
  returning * into v_plan;

  select *
  into v_sync
  from public.sync_approved_monthly_plan_lineage(p_client_id, p_monthly_plan_id);

  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'lineage_sync', jsonb_build_object(
      'operating_cycle_id', v_sync.operating_cycle_id,
      'cycles_created', v_sync.cycles_created,
      'lineage_created', v_sync.lineage_created,
      'lineage_existing', v_sync.lineage_existing
    )
  );
end;
$$;

revoke all on function public.sync_approved_monthly_plan_lineage(uuid, uuid) from public, anon, authenticated;
grant all on function public.sync_approved_monthly_plan_lineage(uuid, uuid) to service_role;

revoke all on function public.approve_monthly_plan_and_sync_lineage(uuid, uuid, timestamptz) from public, anon, authenticated;
grant all on function public.approve_monthly_plan_and_sync_lineage(uuid, uuid, timestamptz) to service_role;

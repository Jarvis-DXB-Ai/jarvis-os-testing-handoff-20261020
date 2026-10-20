-- Task board ordering is a server-authorised, column-scoped operation.
-- It locks the affected column and checks the browser's exact prior order before
-- writing a deterministic index, so concurrent reorders fail closed.

create or replace function public.reorder_jarvis_tasks(
  p_status text,
  p_expected_task_ids uuid[],
  p_ordered_task_ids uuid[]
)
returns table (id uuid, manual_order numeric, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actual_task_ids uuid[];
  expected_count integer := coalesce(array_length(p_expected_task_ids, 1), 0);
  ordered_count integer := coalesce(array_length(p_ordered_task_ids, 1), 0);
begin
  if p_status not in ('not_started', 'in_progress', 'completed', 'reviewed', 'archived') then
    raise exception 'TASK_STATUS_INVALID';
  end if;

  if expected_count = 0 or expected_count <> ordered_count or expected_count > 200 then
    raise exception 'TASK_REORDER_INPUT_INVALID';
  end if;

  if (select count(distinct task_id) from unnest(p_expected_task_ids) as task_id) <> expected_count
    or (select count(distinct task_id) from unnest(p_ordered_task_ids) as task_id) <> ordered_count then
    raise exception 'TASK_REORDER_DUPLICATE_ID';
  end if;

  -- The lock covers only the target status column. A lifecycle transition is
  -- performed first through the existing task action, then this function can
  -- reorder the task in its new column.
  perform 1
  from public.jarvis_tasks
  where status = p_status
  order by manual_order asc, created_at asc, id asc
  for update;

  select array_agg(id order by manual_order asc, created_at asc, id asc)
  into actual_task_ids
  from public.jarvis_tasks
  where status = p_status;

  if actual_task_ids is distinct from p_expected_task_ids then
    raise exception 'TASK_REORDER_CONFLICT';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_task_ids) as requested(task_id)
    where not (requested.task_id = any(actual_task_ids))
  ) then
    raise exception 'TASK_REORDER_COLUMN_MISMATCH';
  end if;

  with positions as (
    select requested.task_id, requested.position
    from unnest(p_ordered_task_ids) with ordinality as requested(task_id, position)
  ), updated as (
    update public.jarvis_tasks as task
    set manual_order = positions.position * 1000
    from positions
    where task.id = positions.task_id
      and task.status = p_status
    returning task.id, task.manual_order, task.updated_at
  )
  select updated.id, updated.manual_order, updated.updated_at
  from updated
  order by updated.manual_order asc, updated.id asc;
end;
$$;

revoke all on function public.reorder_jarvis_tasks(text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_jarvis_tasks(text, uuid[], uuid[]) to service_role;

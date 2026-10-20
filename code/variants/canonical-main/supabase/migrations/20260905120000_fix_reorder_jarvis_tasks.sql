-- reorder_jarvis_tasks has never been able to run. Two faults:
--
-- 1. RETURNS TABLE(id, manual_order, updated_at) declares OUT variables whose
--    names collide with jarvis_tasks' own columns, so the unqualified
--    `order by manual_order` clauses raised
--    42702 "column reference \"manual_order\" is ambiguous".
-- 2. The closing statement was a bare SELECT. In plpgsql that has no
--    destination, so even once the ambiguity was resolved the function would
--    still fail and return no rows.
--
-- Behaviour is otherwise unchanged: same validations, same advisory locking of
-- the target column, same conflict signals, same 1000-step ordering. Every
-- reference to a table column is now alias-qualified.

CREATE OR REPLACE FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "manual_order" numeric, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  from public.jarvis_tasks as locked
  where locked.status = p_status
  order by locked.manual_order asc, locked.created_at asc, locked.id asc
  for update;

  select array_agg(current_task.id order by current_task.manual_order asc, current_task.created_at asc, current_task.id asc)
  into actual_task_ids
  from public.jarvis_tasks as current_task
  where current_task.status = p_status;

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

  return query
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

ALTER FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_jarvis_tasks"("p_status" "text", "p_expected_task_ids" "uuid"[], "p_ordered_task_ids" "uuid"[]) TO "service_role";

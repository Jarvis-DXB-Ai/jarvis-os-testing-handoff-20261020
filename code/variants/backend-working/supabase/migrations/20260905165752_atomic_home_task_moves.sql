-- Atomic Home moves; legacy reorder shares the same writer lock.
-- No client data backfill. Invoker privileges; callable only by the server role.
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

  if expected_count = 0 or expected_count <> ordered_count or expected_count > 10000 then
    raise exception 'TASK_REORDER_INPUT_INVALID';
  end if;

  if (select count(distinct task_id) from unnest(p_expected_task_ids) as task_id) <> expected_count
    or (select count(distinct task_id) from unnest(p_ordered_task_ids) as task_id) <> ordered_count then
    raise exception 'TASK_REORDER_DUPLICATE_ID';
  end if;

  -- Serialize against ALL task writers, including inserts into empty lanes.
  -- Home is a small owner board; this short table lock avoids phantom rows and
  -- deadlocks across opposing lane moves. Readers are not blocked.
  lock table public.jarvis_tasks in share row exclusive mode;

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

CREATE OR REPLACE FUNCTION public.move_jarvis_task(
  p_task_id uuid,
  p_expected_updated_at timestamptz,
  p_from text,
  p_to text,
  p_expected_destination_ids uuid[],
  p_ordered_task_ids uuid[]
) RETURNS SETOF public.jarvis_tasks
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  current_task public.jarvis_tasks%rowtype;
  actual_ids uuid[];
  post_move_ids uuid[];
  desired_count integer := cardinality(p_ordered_task_ids);
  moved_at timestamptz := clock_timestamp();
BEGIN
  IF p_from IS NULL OR p_to IS NULL
    OR p_from NOT IN ('not_started','in_progress','completed','reviewed')
    OR p_to NOT IN ('not_started','in_progress','completed','reviewed') THEN
    RAISE EXCEPTION 'TASK_MOVE_INPUT_INVALID';
  END IF;
  IF p_expected_updated_at IS NULL OR p_expected_destination_ids IS NULL
    OR p_ordered_task_ids IS NULL OR desired_count < 1 OR desired_count > 10000
    OR array_position(p_expected_destination_ids, NULL) IS NOT NULL
    OR array_position(p_ordered_task_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT x) FROM unnest(p_ordered_task_ids) x) <> desired_count THEN
    RAISE EXCEPTION 'TASK_MOVE_INPUT_INVALID';
  END IF;

  LOCK TABLE public.jarvis_tasks IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO current_task FROM public.jarvis_tasks t WHERE t.id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_MOVE_NOT_FOUND'; END IF;
  IF current_task.updated_at IS DISTINCT FROM p_expected_updated_at
    OR current_task.status IS DISTINCT FROM p_from THEN
    RAISE EXCEPTION 'TASK_MOVE_CONFLICT';
  END IF;
  SELECT coalesce(array_agg(t.id ORDER BY t.manual_order,t.created_at,t.id), '{}'::uuid[])
    INTO actual_ids FROM public.jarvis_tasks t WHERE t.status = p_to;
  IF actual_ids IS DISTINCT FROM p_expected_destination_ids THEN
    RAISE EXCEPTION 'TASK_MOVE_CONFLICT';
  END IF;
  post_move_ids := CASE WHEN p_from = p_to THEN actual_ids ELSE array_append(actual_ids,p_task_id) END;
  IF cardinality(post_move_ids) <> desired_count
    OR NOT (post_move_ids @> p_ordered_task_ids AND post_move_ids <@ p_ordered_task_ids) THEN
    RAISE EXCEPTION 'TASK_MOVE_INPUT_INVALID';
  END IF;

  -- Same semantics as moveTransitionActions: direct review records completion
  -- first; returning to an unfinished lane clears completion/review markers.
  IF p_from <> p_to THEN
    UPDATE public.jarvis_tasks t SET
      status = p_to,
      completed_at = CASE WHEN p_to IN ('not_started','in_progress') THEN NULL
        WHEN p_to = 'reviewed' AND p_from = 'completed' THEN t.completed_at ELSE moved_at END,
      reviewed_at = CASE WHEN p_to = 'reviewed' THEN moved_at ELSE NULL END,
      archived_at = NULL
    WHERE t.id = p_task_id;
  END IF;
  -- Reread the true destination order AFTER the lifecycle change, inside the
  -- same transaction. Never use the requested order as reorder's expectation.
  SELECT array_agg(t.id ORDER BY t.manual_order,t.created_at,t.id)
    INTO post_move_ids FROM public.jarvis_tasks t WHERE t.status = p_to;
  PERFORM * FROM public.reorder_jarvis_tasks(p_to,post_move_ids,p_ordered_task_ids);
  RETURN QUERY SELECT t.* FROM public.jarvis_tasks t WHERE t.id = p_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_jarvis_task(uuid,timestamptz,text,text,uuid[],uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_jarvis_task(uuid,timestamptz,text,text,uuid[],uuid[]) TO service_role;

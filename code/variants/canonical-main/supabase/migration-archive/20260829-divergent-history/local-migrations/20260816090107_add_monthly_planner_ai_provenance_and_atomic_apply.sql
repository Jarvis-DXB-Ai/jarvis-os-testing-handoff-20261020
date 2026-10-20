-- Stage 2A keeps the existing Monthly Plan tables and adds only execution
-- provenance plus one atomic server-side apply operation for AI plan output.

alter table public.social_monthly_content_plans
  add column if not exists ai_provenance jsonb not null default '{}'::jsonb;

alter table public.social_monthly_plan_activity
  drop constraint if exists social_monthly_plan_activity_action_type_check;
alter table public.social_monthly_plan_activity
  add constraint social_monthly_plan_activity_action_type_check
  check (action_type in (
    'plan_created', 'context_saved', 'strategy_saved', 'item_created', 'item_updated',
    'item_deleted', 'item_reordered', 'plan_ready', 'plan_approved', 'plan_reopened',
    'snapshot_refreshed', 'plan_generated', 'plan_regenerated',
    'strategy_regenerated', 'concept_regenerated'
  ));

create or replace function public.apply_social_monthly_plan_ai_generation(
  p_client_id uuid,
  p_plan_id uuid,
  p_expected_updated_at timestamptz,
  p_strategy jsonb,
  p_visual_direction text,
  p_grid_notes text,
  p_client_brain_snapshot jsonb,
  p_ai_provenance jsonb,
  p_items jsonb,
  p_action_type text,
  p_summary text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_target_count integer;
  v_item jsonb;
  v_plan_id uuid;
begin
  if p_action_type not in ('plan_generated', 'plan_regenerated') then
    raise exception using errcode = 'PT400', message = 'Unsupported AI plan apply action.';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'AI Feed items must be an array.';
  end if;

  select target_feed_count
    into v_target_count
  from public.social_monthly_content_plans
  where id = p_plan_id
    and client_id = p_client_id
    and updated_at = p_expected_updated_at
  for update;

  if not found then
    raise exception using errcode = 'PT409', message = 'This Monthly Plan changed after AI planning began. Refresh and review the latest version.';
  end if;

  if jsonb_array_length(p_items) <> v_target_count then
    raise exception using errcode = 'PT400', message = 'AI output does not contain the exact target Feed count.';
  end if;

  update public.social_monthly_content_plans
  set strategy = coalesce(p_strategy, '{}'::jsonb),
      visual_direction = coalesce(p_visual_direction, ''),
      grid_notes = coalesce(p_grid_notes, ''),
      client_brain_snapshot = coalesce(p_client_brain_snapshot, '{}'::jsonb),
      snapshot_at = now(),
      ai_provenance = coalesce(p_ai_provenance, '{}'::jsonb),
      status = 'plan_ready',
      approved_at = null
  where id = p_plan_id
    and client_id = p_client_id
  returning id into v_plan_id;

  delete from public.social_monthly_content_plan_items
  where client_id = p_client_id
    and monthly_plan_id = p_plan_id;

  for v_item in select value from jsonb_array_elements(p_items) as value loop
    insert into public.social_monthly_content_plan_items (
      client_id, monthly_plan_id, position, planned_date, date_fixed,
      pillar, objective, subject, creative_concept, production_method,
      required_assets, missing_asset_note, visual_direction, grid_role,
      activation_record_id, commercial_rationale, caption_brief, status, metadata
    ) values (
      p_client_id,
      p_plan_id,
      (v_item ->> 'position')::integer,
      nullif(v_item ->> 'planned_date', '')::date,
      coalesce((v_item ->> 'date_fixed')::boolean, false),
      v_item ->> 'pillar',
      coalesce(v_item ->> 'objective', ''),
      coalesce(v_item ->> 'subject', ''),
      coalesce(v_item ->> 'creative_concept', ''),
      v_item ->> 'production_method',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'required_assets', '[]'::jsonb))), '{}'::text[]),
      coalesce(v_item ->> 'missing_asset_note', ''),
      coalesce(v_item ->> 'visual_direction', ''),
      v_item ->> 'grid_role',
      nullif(v_item ->> 'activation_record_id', '')::uuid,
      coalesce(v_item ->> 'commercial_rationale', ''),
      coalesce(v_item ->> 'caption_brief', ''),
      coalesce(v_item ->> 'status', 'draft'),
      coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  insert into public.social_monthly_plan_activity (
    client_id, monthly_plan_id, action_type, summary, metadata
  ) values (
    p_client_id, p_plan_id, p_action_type, p_summary,
    jsonb_build_object('execution', coalesce(p_ai_provenance, '{}'::jsonb))
  );

  return v_plan_id;
end;
$$;

revoke execute on function public.apply_social_monthly_plan_ai_generation(uuid, uuid, timestamptz, jsonb, text, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.apply_social_monthly_plan_ai_generation(uuid, uuid, timestamptz, jsonb, text, text, jsonb, jsonb, jsonb, text, text) to service_role;

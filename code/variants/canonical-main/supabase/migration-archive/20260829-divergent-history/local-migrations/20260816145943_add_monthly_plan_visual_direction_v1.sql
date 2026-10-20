-- Stage 2A.5 stores creative visual direction as first-class, queryable
-- planning data. It remains separate from the canonical content concept.

alter table public.social_monthly_content_plan_items
  add column if not exists shot_scale text not null default 'other'
    check (shot_scale in ('extreme_macro', 'macro', 'close', 'medium', 'wide', 'environmental_wide', 'detail', 'graphic', 'not_applicable', 'other')),
  add column if not exists camera_angle text not null default 'other'
    check (camera_angle in ('birds_eye', 'high_angle', 'eye_level', 'table_level', 'low_angle', 'three_quarter', 'pov', 'over_the_shoulder', 'architectural_straight_on', 'not_applicable', 'other')),
  add column if not exists composition text not null default 'other'
    check (composition in ('centered_hero', 'asymmetrical', 'rule_of_thirds', 'negative_space', 'layered_foreground', 'frame_within_frame', 'diagonal', 'symmetrical', 'edge_crop', 'immersive_crop', 'editorial_still_life', 'environmental', 'graphic', 'other')),
  add column if not exists human_presence text not null default 'none'
    check (human_presence in ('none', 'hands_only', 'partial_figure', 'single_person', 'couple', 'small_group', 'background_guests', 'staff_service', 'mixed_foreground_background', 'not_applicable', 'other')),
  add column if not exists interaction text not null default 'none'
    check (interaction in ('none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting', 'picking_up', 'taking_a_bite', 'cooking', 'plating', 'carrying', 'toasting_raising_glasses', 'conversation', 'walking_through_frame', 'pet_interaction', 'staff_interaction', 'not_applicable', 'other')),
  add column if not exists motion text not null default 'static'
    check (motion in ('static', 'subtle', 'active', 'dynamic', 'not_applicable', 'other')),
  add column if not exists production_aspect_ratio text not null default '4:5'
    check (production_aspect_ratio = '4:5'),
  add column if not exists grid_crop_behavior text not null default 'safe'
    check (grid_crop_behavior in ('safe', 'edge_aware', 'intentional_crop')),
  add column if not exists visual_direction_source text not null default 'unassigned'
    check (visual_direction_source in ('unassigned', 'ai', 'manual')),
  add column if not exists visual_direction_prompt_version text,
  add column if not exists visual_direction_execution_id uuid,
  add column if not exists visual_direction_generated_at timestamptz;

create index if not exists social_monthly_plan_items_visual_direction_idx
  on public.social_monthly_content_plan_items (monthly_plan_id, shot_scale, camera_angle, composition);

alter table public.social_monthly_plan_activity
  drop constraint if exists social_monthly_plan_activity_action_type_check;
alter table public.social_monthly_plan_activity
  add constraint social_monthly_plan_activity_action_type_check
  check (action_type in (
    'plan_created', 'context_saved', 'strategy_saved', 'item_created', 'item_updated',
    'item_deleted', 'item_reordered', 'plan_ready', 'plan_approved', 'plan_reopened',
    'snapshot_refreshed', 'plan_generated', 'plan_regenerated',
    'strategy_regenerated', 'concept_regenerated',
    'concept_grid_generated', 'concept_grid_failed', 'concept_grid_selected', 'concept_grid_accepted',
    'visual_direction_generated', 'visual_direction_regenerated'
  ));

alter table public.social_monthly_plan_ai_executions
  drop constraint if exists social_monthly_plan_ai_executions_action_type_check;
alter table public.social_monthly_plan_ai_executions
  add constraint social_monthly_plan_ai_executions_action_type_check
  check (action_type in ('full_plan', 'strategy_only', 'feed_plan', 'single_concept', 'visual_direction'));

create or replace function public.apply_social_monthly_plan_visual_direction(
  p_client_id uuid,
  p_plan_id uuid,
  p_execution_id uuid,
  p_prompt_version text,
  p_items jsonb,
  p_action_type text,
  p_summary text,
  p_correction text default ''
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_plan_count integer;
  v_payload_count integer;
  v_row record;
  v_entry jsonb;
  v_ref text;
  v_expected_updated_at timestamptz;
  v_shot_scale text;
  v_camera_angle text;
  v_composition text;
  v_human_presence text;
  v_interaction text;
  v_motion text;
  v_visual_direction text;
begin
  if p_action_type not in ('visual_direction_generated', 'visual_direction_regenerated') then
    raise exception 'Unsupported Visual Direction activity type.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Visual Direction payload must be an array.' using errcode = '22023';
  end if;

  select count(*) into v_plan_count
  from public.social_monthly_content_plan_items
  where client_id = p_client_id and monthly_plan_id = p_plan_id;
  v_payload_count := jsonb_array_length(p_items);
  if v_plan_count = 0 or v_payload_count <> v_plan_count then
    raise exception 'Visual Direction must include every saved Feed concept.' using errcode = '22023';
  end if;
  if (select count(distinct entry ->> 'plan_item_ref') from jsonb_array_elements(p_items) entry) <> v_plan_count then
    raise exception 'Visual Direction contains duplicate or missing plan item references.' using errcode = '22023';
  end if;

  for v_row in
    select id, position, updated_at
    from public.social_monthly_content_plan_items
    where client_id = p_client_id and monthly_plan_id = p_plan_id
    order by position
  loop
    v_ref := 'P' || lpad(v_row.position::text, 2, '0');
    select entry into v_entry
    from jsonb_array_elements(p_items) entry
    where entry ->> 'plan_item_ref' = v_ref;
    if v_entry is null then
      raise exception 'Visual Direction is missing %.', v_ref using errcode = '22023';
    end if;
    begin
      v_expected_updated_at := (v_entry ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Visual Direction baseline is invalid for %.', v_ref using errcode = '22023';
    end;
    if v_expected_updated_at <> v_row.updated_at then
      raise exception 'Feed concept % changed while Visual Direction was being prepared. Refresh and try again.', v_ref using errcode = '40001';
    end if;

    v_shot_scale := v_entry ->> 'shot_scale';
    v_camera_angle := v_entry ->> 'camera_angle';
    v_composition := v_entry ->> 'composition';
    v_human_presence := v_entry ->> 'human_presence';
    v_interaction := v_entry ->> 'interaction';
    v_motion := v_entry ->> 'motion';
    v_visual_direction := btrim(coalesce(v_entry ->> 'visual_direction', ''));
    if v_shot_scale not in ('extreme_macro', 'macro', 'close', 'medium', 'wide', 'environmental_wide', 'detail', 'graphic', 'not_applicable', 'other')
      or v_camera_angle not in ('birds_eye', 'high_angle', 'eye_level', 'table_level', 'low_angle', 'three_quarter', 'pov', 'over_the_shoulder', 'architectural_straight_on', 'not_applicable', 'other')
      or v_composition not in ('centered_hero', 'asymmetrical', 'rule_of_thirds', 'negative_space', 'layered_foreground', 'frame_within_frame', 'diagonal', 'symmetrical', 'edge_crop', 'immersive_crop', 'editorial_still_life', 'environmental', 'graphic', 'other')
      or v_human_presence not in ('none', 'hands_only', 'partial_figure', 'single_person', 'couple', 'small_group', 'background_guests', 'staff_service', 'mixed_foreground_background', 'not_applicable', 'other')
      or v_interaction not in ('none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting', 'picking_up', 'taking_a_bite', 'cooking', 'plating', 'carrying', 'toasting_raising_glasses', 'conversation', 'walking_through_frame', 'pet_interaction', 'staff_interaction', 'not_applicable', 'other')
      or v_motion not in ('static', 'subtle', 'active', 'dynamic', 'not_applicable', 'other')
      or length(v_visual_direction) < 25 or length(v_visual_direction) > 600 then
      raise exception 'Visual Direction values are invalid for %.', v_ref using errcode = '22023';
    end if;
  end loop;

  for v_row in
    select id, position
    from public.social_monthly_content_plan_items
    where client_id = p_client_id and monthly_plan_id = p_plan_id
    order by position
  loop
    v_ref := 'P' || lpad(v_row.position::text, 2, '0');
    select entry into v_entry
    from jsonb_array_elements(p_items) entry
    where entry ->> 'plan_item_ref' = v_ref;
    update public.social_monthly_content_plan_items
    set shot_scale = v_entry ->> 'shot_scale',
        camera_angle = v_entry ->> 'camera_angle',
        composition = v_entry ->> 'composition',
        human_presence = v_entry ->> 'human_presence',
        interaction = v_entry ->> 'interaction',
        motion = v_entry ->> 'motion',
        visual_direction = btrim(v_entry ->> 'visual_direction'),
        production_aspect_ratio = '4:5',
        grid_crop_behavior = case when v_entry ->> 'composition' in ('edge_crop', 'immersive_crop') then 'edge_aware' else 'safe' end,
        visual_direction_source = 'ai',
        visual_direction_prompt_version = p_prompt_version,
        visual_direction_execution_id = p_execution_id,
        visual_direction_generated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visual_direction', jsonb_build_object(
          'source', 'ai', 'prompt_version', p_prompt_version, 'execution_id', p_execution_id,
          'generated_at', now(), 'correction', p_correction
        ))
    where id = v_row.id and client_id = p_client_id and monthly_plan_id = p_plan_id;
  end loop;

  insert into public.social_monthly_plan_activity (client_id, monthly_plan_id, action_type, summary, metadata)
  values (p_client_id, p_plan_id, p_action_type, p_summary, jsonb_build_object(
    'execution_id', p_execution_id, 'prompt_version', p_prompt_version, 'correction', p_correction
  ));
end;
$$;

revoke execute on function public.apply_social_monthly_plan_visual_direction(uuid, uuid, uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_social_monthly_plan_visual_direction(uuid, uuid, uuid, text, jsonb, text, text, text) to service_role;

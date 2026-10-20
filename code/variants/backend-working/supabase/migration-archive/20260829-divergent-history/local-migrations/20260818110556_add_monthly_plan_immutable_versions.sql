-- Keep Monthly Plan content and production history immutable when a complete
-- AI regeneration becomes the new working version for the same client/month.

alter table public.social_monthly_content_plans
  add column if not exists plan_version integer not null default 1,
  add column if not exists is_current boolean not null default true,
  add column if not exists supersedes_plan_id uuid,
  add column if not exists superseded_at timestamptz;

alter table public.social_monthly_content_plans
  drop constraint if exists social_monthly_content_plans_client_id_platform_plan_month_key;

alter table public.social_monthly_content_plans
  drop constraint if exists social_monthly_content_plans_plan_version_check;
alter table public.social_monthly_content_plans
  add constraint social_monthly_content_plans_plan_version_check
  check (plan_version > 0);

alter table public.social_monthly_content_plans
  drop constraint if exists social_monthly_content_plans_supersedes_plan_id_fkey;
alter table public.social_monthly_content_plans
  add constraint social_monthly_content_plans_supersedes_plan_id_fkey
  foreign key (supersedes_plan_id) references public.social_monthly_content_plans(id) on delete restrict;

create unique index if not exists social_monthly_content_plans_month_version_idx
  on public.social_monthly_content_plans (client_id, platform, plan_month, plan_version);
create unique index if not exists social_monthly_content_plans_current_month_idx
  on public.social_monthly_content_plans (client_id, platform, plan_month)
  where is_current;
create index if not exists social_monthly_content_plans_supersedes_idx
  on public.social_monthly_content_plans (supersedes_plan_id)
  where supersedes_plan_id is not null;

-- A version/archive update is not a creative edit. Preserve historical grids
-- rather than marking them stale just because a newer plan version is current.
create or replace function public.mark_social_monthly_plan_concept_grids_stale_from_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.strategy is not distinct from new.strategy
    and old.visual_direction is not distinct from new.visual_direction
    and old.grid_notes is not distinct from new.grid_notes
    and old.client_brain_snapshot is not distinct from new.client_brain_snapshot
    and old.ai_provenance is not distinct from new.ai_provenance then
    return new;
  end if;

  update public.social_monthly_plan_concept_grids
  set status = 'stale', is_selected = false
  where client_id = new.client_id
    and monthly_plan_id = new.id
    and status in ('generated', 'accepted');
  return new;
end;
$$;

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
    'visual_direction_generated', 'visual_direction_regenerated',
    'plan_version_created', 'plan_version_superseded'
  ));

create or replace function public.create_social_monthly_plan_version_from_ai_generation(
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
  v_source public.social_monthly_content_plans%rowtype;
  v_new_plan_id uuid;
  v_next_plan_version integer;
  v_item jsonb;
begin
  if p_action_type <> 'plan_generated' then
    raise exception using errcode = 'PT400', message = 'An immutable version must be created by a complete plan generation.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'AI Feed items must be an array.';
  end if;

  select * into v_source
  from public.social_monthly_content_plans
  where id = p_plan_id
    and client_id = p_client_id
    and is_current = true
    and updated_at = p_expected_updated_at
  for update;

  if not found then
    raise exception using errcode = 'PT409', message = 'This Monthly Plan changed after AI planning began. Refresh and review the latest version.';
  end if;
  if jsonb_array_length(p_items) <> v_source.target_feed_count then
    raise exception using errcode = 'PT400', message = 'AI output does not contain the exact target Feed count.';
  end if;

  select coalesce(max(plan_version), 0) + 1 into v_next_plan_version
  from public.social_monthly_content_plans
  where client_id = p_client_id
    and platform = v_source.platform
    and plan_month = v_source.plan_month;

  update public.social_monthly_content_plans
  set is_current = false,
      superseded_at = now()
  where id = v_source.id
    and client_id = p_client_id;

  insert into public.social_monthly_content_plans (
    client_id, platform, plan_month, target_feed_count, status,
    owner_client_notes, priority_offers, items_to_avoid, products_to_push,
    temporary_availability_notes, commercial_priorities, other_month_notes,
    research_context, strategy, content_pillars, visual_direction, grid_notes,
    facebook_mirror, client_brain_snapshot, snapshot_at, approved_at,
    ai_provenance, plan_version, is_current, supersedes_plan_id, superseded_at
  ) values (
    v_source.client_id, v_source.platform, v_source.plan_month, v_source.target_feed_count, 'plan_ready',
    v_source.owner_client_notes, v_source.priority_offers, v_source.items_to_avoid, v_source.products_to_push,
    v_source.temporary_availability_notes, v_source.commercial_priorities, v_source.other_month_notes,
    v_source.research_context, coalesce(p_strategy, '{}'::jsonb), v_source.content_pillars,
    coalesce(p_visual_direction, ''), coalesce(p_grid_notes, ''), v_source.facebook_mirror,
    coalesce(p_client_brain_snapshot, '{}'::jsonb), now(), null,
    coalesce(p_ai_provenance, '{}'::jsonb), v_next_plan_version, true, v_source.id, null
  ) returning id into v_new_plan_id;

  for v_item in select value from jsonb_array_elements(p_items) as value loop
    insert into public.social_monthly_content_plan_items (
      client_id, monthly_plan_id, position, planned_date, date_fixed,
      pillar, objective, subject, creative_concept, production_method,
      required_assets, missing_asset_note, visual_direction, grid_role,
      activation_record_id, commercial_rationale, caption_brief, status, metadata
    ) values (
      p_client_id, v_new_plan_id, (v_item ->> 'position')::integer,
      nullif(v_item ->> 'planned_date', '')::date, coalesce((v_item ->> 'date_fixed')::boolean, false),
      v_item ->> 'pillar', coalesce(v_item ->> 'objective', ''), coalesce(v_item ->> 'subject', ''),
      coalesce(v_item ->> 'creative_concept', ''), v_item ->> 'production_method',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'required_assets', '[]'::jsonb))), '{}'::text[]),
      coalesce(v_item ->> 'missing_asset_note', ''), coalesce(v_item ->> 'visual_direction', ''),
      v_item ->> 'grid_role', nullif(v_item ->> 'activation_record_id', '')::uuid,
      coalesce(v_item ->> 'commercial_rationale', ''), coalesce(v_item ->> 'caption_brief', ''),
      coalesce(v_item ->> 'status', 'draft'), coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  insert into public.social_monthly_plan_activity (client_id, monthly_plan_id, action_type, summary, metadata)
  values
    (p_client_id, v_source.id, 'plan_version_superseded', 'Preserved this Monthly Plan as a historical version.', jsonb_build_object('new_plan_id', v_new_plan_id, 'new_plan_version', v_next_plan_version)),
    (p_client_id, v_new_plan_id, 'plan_version_created', 'Created a new immutable Monthly Plan version from validated AI output.', jsonb_build_object('supersedes_plan_id', v_source.id, 'plan_version', v_next_plan_version, 'execution', coalesce(p_ai_provenance, '{}'::jsonb))),
    (p_client_id, v_new_plan_id, 'plan_generated', p_summary, jsonb_build_object('execution', coalesce(p_ai_provenance, '{}'::jsonb)));

  return v_new_plan_id;
end;
$$;

revoke execute on function public.create_social_monthly_plan_version_from_ai_generation(uuid, uuid, timestamptz, jsonb, text, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_social_monthly_plan_version_from_ai_generation(uuid, uuid, timestamptz, jsonb, text, text, jsonb, jsonb, jsonb, text, text) to service_role;

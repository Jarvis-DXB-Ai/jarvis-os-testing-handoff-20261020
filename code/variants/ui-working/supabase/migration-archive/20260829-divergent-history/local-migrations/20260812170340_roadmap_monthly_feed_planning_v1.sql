-- Roadmap-only refinement for OS 1 monthly feed planning. This migration
-- records the agreed product scope; it creates no planner, generation, media,
-- scheduling, provider, or client data model.

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), os1 as (
  select id from public.roadmap_phases
  where project_id = (select id from project_row) and slug = 'os1-create'
), capabilities as (
  select id, slug from public.roadmap_items
  where project_id = (select id from project_row) and phase_id = (select id from os1) and item_type = 'capability'
)
update public.roadmap_phases
set
  goal = 'Jarvis can guide a client through a reviewable monthly Instagram Feed plan, then produce, approve, schedule and publish the selected work with Facebook mirroring where appropriate.',
  completion_condition = 'A configured client can provide month-specific context, review grounded monthly research and strategy, approve a 15-post Instagram Feed plan and visual rhythm, produce approved individual creatives, review the deterministic final 3x5 grid, approve captions, then schedule Instagram with Facebook mirroring where appropriate.',
  metadata = metadata || jsonb_build_object(
    'monthly_feed_planning_v1', true,
    'v1_primary_platform', 'instagram_feed',
    'v1_default_feed_post_count', 15,
    'v1_excluded_formats', jsonb_build_array('stories', 'reels', 'linkedin'),
    'v1_planning_principle', 'Planning and generation are separate stages. Production generation begins only after plan approval.'
  )
where id = (select id from os1);

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), os1 as (
  select id from public.roadmap_phases
  where project_id = (select id from project_row) and slug = 'os1-create'
)
update public.roadmap_items
set
  description = case slug
    when 'social-media-strategy' then 'Client-specific social strategy that balances current Client Brain truth, commercial priorities, monthly context, relevant monthly research, activations, approved assets and content pillars without permanently rewriting brand strategy.'
    when 'monthly-content-planning-capability' then 'Guided monthly Instagram Feed planning: temporary monthly context, relevant monthly research, strategy, 15 structured concepts, visual rhythm, a low-resolution concept grid, review and plan approval before production.'
    when 'thirty-day-content-calendar' then 'A reviewable monthly plan that records Feed positions, dates where meaningful, Instagram as the primary platform, Facebook mirroring where appropriate, pillar, objective, production method, asset needs, grid role and caption angle.'
    when 'ai-photography' then 'Truth-grounded individual production for approved concepts. Every final post is generated independently after plan approval, preserving asset, food, venue and model truth with targeted regeneration.'
    when 'graphic-design' then 'Brand-guideline-aware graphic work for selected Feed concepts, combining reusable design-system elements with original layouts where typography or promotion is genuinely useful.'
    when 'caption-copy' then 'Final fact-checked captions generated after the approved creative exists, using the finished visual, current offer truth, client copy rules and active scoped Learnings.'
    when 'stories-feed' then 'Format readiness. Instagram Feed is the V1 monthly-planning focus; Stories, Reels and LinkedIn remain deliberately outside this first planner release.'
    when 'human-approval' then 'Human gates for monthly context, strategy, the structured 15-post plan, visual rhythm, concept grid, final creatives, captions and scheduling. Production must not begin before plan approval.'
    when 'scheduling' then 'Final approved Instagram Feed scheduling with Facebook mirroring where appropriate. Exact posting-time optimisation remains outside the initial monthly planner scope.'
    when 'publishing' then 'Safe connected Instagram publishing with Facebook mirroring where appropriate, published-record capture and observable success, failure and retry state.'
    else description
  end,
  metadata = metadata || case slug
    when 'social-media-strategy' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'content_pillars', jsonb_build_array('lifestyle', 'food', 'drinks', 'interiors', 'events', 'bts_service'),
      'allocation_rule', 'Balance derives from client truth, monthly context, commercial priorities, activations, approved assets, visual diversity and active Learnings; never force equal allocation.'
    )
    when 'monthly-content-planning-capability' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'guided_stages', jsonb_build_array('monthly_context', 'monthly_research', 'strategy', '15_feed_concepts', 'visual_rhythm', 'concept_grid', 'review_approve_plan'),
      'planning_truth', 'Structured feed concepts are canonical planning truth. The concept grid is a low-resolution visual planning aid, never production content.',
      'plan_approval_gate', true,
      'agent_responsibilities', jsonb_build_array(
        jsonb_build_object('role', 'Social Strategist', 'owner', 'Strategy Agent', 'responsibility', 'Converts approved monthly context and relevant research into a grounded content strategy.'),
        jsonb_build_object('role', 'Content Planner', 'owner', 'Strategy Agent', 'responsibility', 'Builds the structured 15-post Feed plan, dates and visual rhythm.'),
        jsonb_build_object('role', 'Creative Director', 'owner', 'Creative Director Agent', 'responsibility', 'Reviews concept quality, visual rhythm and final-grid diversity before production approval.'),
        jsonb_build_object('role', 'Execution Specialists', 'owner', 'AI Image Agent, Copywriting Agent and QC Agent', 'responsibility', 'Produce approved individual visuals, then captions and QA after visual approval.')
      ),
      'default_feed_post_count', 15
    )
    when 'thirty-day-content-calendar' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'structured_concept_fields', jsonb_build_array('slot', 'proposed_date', 'platform', 'content_pillar', 'objective', 'subject', 'creative_concept', 'production_method', 'required_assets', 'visual_direction', 'grid_role', 'activation_relationship', 'commercial_reason', 'caption_angle', 'status'),
      'production_methods', jsonb_build_array('ai_photography', 'graphic_design', 'photo_graphic_overlay', 'existing_asset', 'carousel', 'other'),
      'facebook_rule', 'Mirror approved Instagram Feed posts where appropriate; do not create a separate Facebook visual grid.'
    )
    when 'ai-photography' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'production_after_plan_approval', true,
      'candidate_guidance', 'Approximately two candidates per post is the initial intended approach, subject to future cost controls.',
      'single_post_regeneration', 'Regenerate only a selected visual candidate while retaining its approved concept, pillar, objective, grid position, subject, method and brief.'
    )
    when 'human-approval' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'gates', jsonb_build_array('monthly_context', 'strategy', 'structured_plan', 'visual_rhythm', 'concept_grid', 'final_grid', 'captions', 'schedule'),
      'cost_control', 'No high-quality batch production before the monthly plan is approved.'
    )
    when 'stories-feed' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'v1_scope', 'instagram_feed_only',
      'excluded_from_v1', jsonb_build_array('stories', 'reels', 'linkedin')
    )
    when 'scheduling' then jsonb_build_object(
      'monthly_feed_planning_v1', true,
      'placement', 'After approved final creative and approved final caption.',
      'timing_scope', 'Dates support launches, special occasions and logical spacing. Optimized posting times are not a V1 priority.'
    )
    else '{}'::jsonb
  end
where project_id = (select id from project_row) and phase_id = (select id from os1)
  and slug in ('social-media-strategy', 'monthly-content-planning-capability', 'thirty-day-content-calendar', 'ai-photography', 'graphic-design', 'caption-copy', 'stories-feed', 'human-approval', 'scheduling', 'publishing');

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), os1 as (
  select id from public.roadmap_phases
  where project_id = (select id from project_row) and slug = 'os1-create'
), monthly_planning as (
  select id from public.roadmap_items
  where project_id = (select id from project_row) and phase_id = (select id from os1)
    and slug = 'monthly-content-planning-capability' and item_type = 'capability'
), seeds(slug, title, description, priority, weight, metadata) as (
  values
    (
      'monthly-context-client-notes',
      'Monthly Context and Client Notes',
      'Capture temporary owner and client inputs for a specific month without overwriting permanent Client Brain truth.',
      'high', 3,
      jsonb_build_object('monthly_feed_planning_v1', true, 'planned_input', true, 'examples', jsonb_build_array('temporary menu availability', 'chef availability', 'private-event emphasis', 'activation priority'))
    ),
    (
      'monthly-context-research',
      'Monthly Context Research',
      'Research genuinely relevant Dubai and client-specific dates, seasonal shifts, public holidays and hospitality moments for the target month using current evidence.',
      'high', 3,
      jsonb_build_object('monthly_feed_planning_v1', true, 'research_boundary', 'Monthly planning context, not competitor intelligence. Relevance must be evidenced, never invented.')
    ),
    (
      'structured-15-feed-concepts',
      'Structured 15-Post Feed Plan',
      'Create a reviewable Instagram Feed plan of 15 structured concepts before any production creative is generated.',
      'critical', 5,
      jsonb_build_object('monthly_feed_planning_v1', true, 'canonical_planning_truth', true, 'default_post_count', 15)
    ),
    (
      'feed-visual-rhythm',
      'Feed Visual Rhythm',
      'Plan intentional variation across subject, scale, people, light, visual density, colour, graphic use and production method so the Feed feels editorial rather than repetitive.',
      'high', 4,
      jsonb_build_object('monthly_feed_planning_v1', true, 'grid_roles', jsonb_build_array('hero_food', 'lifestyle_break', 'graphic_accent', 'venue_breather', 'human_moment', 'product_detail', 'event_commercial'))
    ),
    (
      'low-resolution-concept-grid',
      'Low-Resolution 3x5 Concept Grid',
      'Generate one low-resolution visual planning grid from approved concepts to review rhythm and composition. It is a storyboard, not production content.',
      'high', 4,
      jsonb_build_object('monthly_feed_planning_v1', true, 'non_production_truth', true, 'must_not_be_cropped_into_posts', true, 'review_dimensions', jsonb_build_array('colour', 'subject', 'people', 'food', 'graphic_balance', 'light_dark', 'wide_close'))
    ),
    (
      'creative-diversity-final-grid-qa',
      'Creative Diversity Check and Final Grid QA',
      'Compare approved concepts and selected individual outputs, then assemble the actual selected assets into a deterministic 3x5 grid for targeted creative QA.',
      'high', 4,
      jsonb_build_object('monthly_feed_planning_v1', true, 'final_grid', 'Deterministic composite of selected production outputs; never AI-generated.', 'targeted_regeneration_only', true, 'checks', jsonb_build_array('subject', 'dish_drink', 'model', 'camera_angle', 'shot_distance', 'background', 'interior_area', 'colour', 'graphic_composition', 'production_method', 'pillar', 'visual_density'))
    )
)
insert into public.roadmap_items (
  project_id, phase_id, parent_item_id, slug, title, description, item_type, status, priority, weight, progress, is_focus, metadata
)
select
  project_row.id, os1.id, monthly_planning.id, seed.slug, seed.title, seed.description,
  'implementation', 'planned', seed.priority, seed.weight, 0, false, seed.metadata
from project_row cross join os1 cross join monthly_planning cross join seeds seed
on conflict (project_id, slug) do update set
  parent_item_id = excluded.parent_item_id,
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  status = public.roadmap_items.status,
  priority = excluded.priority,
  weight = excluded.weight,
  progress = public.roadmap_items.progress,
  is_focus = public.roadmap_items.is_focus,
  metadata = public.roadmap_items.metadata || excluded.metadata;

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), os1 as (
  select id from public.roadmap_phases where project_id = (select id from project_row) and slug = 'os1-create'
)
insert into public.roadmap_ideas (
  project_id, title, description, category, potential_phase_id, potential_value, complexity, status, dependency_notes, notes, metadata
)
select
  project_row.id,
  'Creative Showcase Generator',
  'Explore an agency-facing case-study and carousel workflow that turns completed, approved client work into a concise MC Studios creative showcase.',
  'content', os1.id, 'medium', 'medium', 'idea',
  'Requires completed approved client work, attribution rules, human editorial review and a separate presentation workflow.',
  'Uncommitted. This does not generate public case studies automatically or alter client deliverables.',
  jsonb_build_object('roadmap_monthly_feed_planning_v1', true, 'idea_vault_role', 'agency_showcase')
from project_row cross join os1
on conflict (project_id, lower(title)) do update set
  description = excluded.description,
  category = excluded.category,
  potential_phase_id = excluded.potential_phase_id,
  potential_value = excluded.potential_value,
  complexity = excluded.complexity,
  dependency_notes = excluded.dependency_notes,
  notes = excluded.notes,
  metadata = public.roadmap_ideas.metadata || excluded.metadata;

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), item_row as (
  select id, title from public.roadmap_items
  where project_id = (select id from project_row) and slug in (
    'monthly-context-client-notes', 'monthly-context-research', 'structured-15-feed-concepts',
    'feed-visual-rhythm', 'low-resolution-concept-grid', 'creative-diversity-final-grid-qa'
  )
)
insert into public.roadmap_activity (project_id, item_id, action_type, description, metadata)
select
  project_row.id, item_row.id, 'updated',
  'Refined OS 1 monthly Instagram Feed planning V1: ' || item_row.title,
  jsonb_build_object('source', 'roadmap_monthly_feed_planning_v1', 'representation_only', true)
from project_row cross join item_row
where not exists (
  select 1 from public.roadmap_activity activity
  where activity.item_id = item_row.id and activity.action_type = 'updated'
    and activity.metadata->>'source' = 'roadmap_monthly_feed_planning_v1'
);

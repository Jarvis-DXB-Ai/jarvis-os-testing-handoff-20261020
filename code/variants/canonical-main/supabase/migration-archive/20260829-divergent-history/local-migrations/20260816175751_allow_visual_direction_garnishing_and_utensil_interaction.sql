-- Keep the shared Visual Direction interaction vocabulary compatible with
-- Pinterest creative-technique retrieval. Existing direction values are not
-- changed by this constraint-only migration.

alter table public.social_monthly_content_plan_items
  drop constraint if exists social_monthly_content_plan_items_interaction_check;

alter table public.social_monthly_content_plan_items
  add constraint social_monthly_content_plan_items_interaction_check
  check (interaction in (
    'none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting',
    'picking_up', 'taking_a_bite', 'cooking', 'plating', 'garnishing',
    'utensil_interaction', 'carrying', 'toasting_raising_glasses',
    'conversation', 'walking_through_frame', 'pet_interaction',
    'staff_interaction', 'not_applicable', 'other'
  ));

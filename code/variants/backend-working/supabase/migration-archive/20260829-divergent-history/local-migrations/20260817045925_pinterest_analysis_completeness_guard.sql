
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.client_brain_pinterest_inspirations
  drop constraint if exists client_brain_pinterest_inspirations_analyzed_metadata_complete_chk;

alter table public.client_brain_pinterest_inspirations
  add constraint client_brain_pinterest_inspirations_analyzed_metadata_complete_chk
  check (
    analysis_state <> 'analyzed'
    or (
      cardinality(creative_categories) > 0
      and shot_scale is not null
      and camera_angle is not null
      and composition is not null
      and human_presence is not null
      and interaction is not null
      and motion is not null
      and lighting_style is not null
      and cardinality(creative_techniques) > 0
      and nullif(btrim(coalesce(visual_summary, '')), '') is not null
      and cardinality(best_for) > 0
    )
  );

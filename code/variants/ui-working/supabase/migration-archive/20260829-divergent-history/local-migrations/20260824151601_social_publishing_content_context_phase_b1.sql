-- Caption context is owned by the canonical final Social Content Item. It may
-- inherit safe lineage from production systems, but inference is never Client
-- Brain truth and is excluded from the provider contract until confirmed.
alter table public.social_content_items
  add column if not exists content_context jsonb not null default '{}'::jsonb;

alter table public.social_caption_intervention_events
  drop constraint if exists social_caption_intervention_events_event_type_check;

alter table public.social_caption_intervention_events
  add constraint social_caption_intervention_events_event_type_check
  check (event_type in ('generated_without_edit', 'selected_generated_option', 'edited_generated_option', 'fully_manual_caption', 'regenerated_options', 'quality_reviewed'));

create index if not exists social_content_items_context_gin_idx
  on public.social_content_items using gin (content_context);

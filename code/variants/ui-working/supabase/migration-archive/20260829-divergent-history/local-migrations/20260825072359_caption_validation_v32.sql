-- Caption Validation V3.2: provider candidates survive validation and every
-- option carries a compact, publication-safe QC outcome.
alter table public.social_caption_generations
  add column if not exists raw_candidate jsonb,
  add column if not exists validation_status text not null default 'ready',
  add column if not exists validation_diagnostics jsonb not null default '[]'::jsonb;

alter table public.social_content_caption_options
  add column if not exists validation_status text not null default 'ready',
  add column if not exists validation_diagnostics jsonb not null default '[]'::jsonb;

alter table public.social_caption_generations
  drop constraint if exists social_caption_generations_validation_status_check;
alter table public.social_caption_generations
  add constraint social_caption_generations_validation_status_check
  check (validation_status in ('ready', 'needs_review', 'blocked'));

alter table public.social_content_caption_options
  drop constraint if exists social_content_caption_options_validation_status_check;
alter table public.social_content_caption_options
  add constraint social_content_caption_options_validation_status_check
  check (validation_status in ('ready', 'needs_review', 'blocked'));
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.client_brain_pinterest_inspirations
  add column if not exists requires_individual_pin_upload boolean not null default false,
  add column if not exists analysis_error text;

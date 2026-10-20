-- Social Publishing Phase A
-- Final, client-scoped publishable content. This is deliberately separate from
-- monthly strategy/idea records and from Client Brain factual assets.

create table if not exists public.social_content_months (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month_start date not null,
  timezone text not null default 'Asia/Dubai',
  feed_start_date date,
  feed_interval_days integer not null default 2 check (feed_interval_days between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month_start),
  check (date_trunc('month', month_start::timestamp)::date = month_start)
);

create table if not exists public.social_content_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_month_id uuid not null references public.social_content_months(id) on delete cascade,
  source text not null default 'manual_upload' check (source in ('manual_upload', 'monthly_plan', 'ai_content', 'existing_asset')),
  content_kind text not null check (content_kind in ('feed', 'story')),
  format text not null check (format in ('feed', 'carousel', 'reel', 'story')),
  title text,
  schedule_label text,
  notes text,
  sequence integer not null default 1 check (sequence > 0),
  status text not null default 'Draft' check (status in ('Draft', 'Needs Caption', 'Ready for Review', 'Approved', 'Scheduled', 'Publishing', 'Published', 'Failed')),
  scheduled_date date,
  scheduled_time time,
  scheduled_at timestamptz,
  date_locked boolean not null default false,
  time_selection_source text not null default 'manual' check (time_selection_source in ('manual', 'client_default', 'insight', 'historical', 'unavailable')),
  time_recommendation jsonb not null default '{}'::jsonb,
  story_schedule_slot_id uuid,
  selected_caption_option_id uuid,
  final_caption text,
  caption_selected_at timestamptz,
  caption_edited_at timestamptz,
  publishing_payload_version integer not null default 1,
  scheduled_payload_version integer,
  scheduled_payload_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_content_media (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  storage_bucket text not null default 'social-content',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width integer,
  height integer,
  duration_seconds numeric,
  sort_order integer not null default 1 check (sort_order > 0),
  crop_x numeric not null default 50 check (crop_x between 0 and 100),
  crop_y numeric not null default 50 check (crop_y between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_content_item_id, sort_order)
);

create table if not exists public.social_content_caption_options (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  option_number integer not null check (option_number between 1 and 5),
  body text not null,
  source text not null default 'mock' check (source in ('mock', 'ai', 'manual')),
  selected_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_content_item_id, option_number)
);

create table if not exists public.social_content_platform_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin')),
  selected boolean not null default true,
  caption_override text,
  status text not null default 'Draft' check (status in ('Draft', 'Ready for Review', 'Approved', 'Scheduled', 'Publishing', 'Published', 'Failed')),
  scheduled_at timestamptz,
  external_post_id text,
  external_post_url text,
  provider_response_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_content_item_id, platform)
);

create table if not exists public.social_story_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  local_time time not null,
  label text not null,
  sort_order integer not null default 1 check (sort_order > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, weekday, local_time, label)
);

alter table public.social_content_items
  add constraint social_content_items_story_schedule_slot_id_fkey
  foreign key (story_schedule_slot_id) references public.social_story_schedule_slots(id) on delete set null;

alter table public.social_content_items
  add constraint social_content_items_selected_caption_option_id_fkey
  foreign key (selected_caption_option_id) references public.social_content_caption_options(id) on delete set null;

create index if not exists social_content_months_client_month_idx on public.social_content_months (client_id, month_start desc);
create index if not exists social_content_items_month_kind_sequence_idx on public.social_content_items (social_content_month_id, content_kind, sequence);
create index if not exists social_content_items_client_schedule_idx on public.social_content_items (client_id, scheduled_at);
create index if not exists social_content_media_item_order_idx on public.social_content_media (social_content_item_id, sort_order);
create index if not exists social_content_targets_item_idx on public.social_content_platform_targets (social_content_item_id);
create index if not exists social_story_schedule_slots_client_idx on public.social_story_schedule_slots (client_id, weekday, local_time);

create or replace function public.touch_social_publishing_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_social_content_months_updated_at on public.social_content_months;
create trigger touch_social_content_months_updated_at before update on public.social_content_months for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_social_content_items_updated_at on public.social_content_items;
create trigger touch_social_content_items_updated_at before update on public.social_content_items for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_social_content_media_updated_at on public.social_content_media;
create trigger touch_social_content_media_updated_at before update on public.social_content_media for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_social_content_caption_options_updated_at on public.social_content_caption_options;
create trigger touch_social_content_caption_options_updated_at before update on public.social_content_caption_options for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_social_content_platform_targets_updated_at on public.social_content_platform_targets;
create trigger touch_social_content_platform_targets_updated_at before update on public.social_content_platform_targets for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_social_story_schedule_slots_updated_at on public.social_story_schedule_slots;
create trigger touch_social_story_schedule_slots_updated_at before update on public.social_story_schedule_slots for each row execute function public.touch_social_publishing_updated_at();
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.social_content_months enable row level security;
alter table public.social_content_items enable row level security;
alter table public.social_content_media enable row level security;
alter table public.social_content_caption_options enable row level security;
alter table public.social_content_platform_targets enable row level security;
alter table public.social_story_schedule_slots enable row level security;

revoke all on public.social_content_months, public.social_content_items, public.social_content_media, public.social_content_caption_options, public.social_content_platform_targets, public.social_story_schedule_slots from anon, authenticated;
grant all on public.social_content_months, public.social_content_items, public.social_content_media, public.social_content_caption_options, public.social_content_platform_targets, public.social_story_schedule_slots to service_role;
revoke execute on function public.touch_social_publishing_updated_at() from public, anon, authenticated;
grant execute on function public.touch_social_publishing_updated_at() to service_role;

-- Social Publishing Phase A.1
-- Keep final monthly creative, reusable Story placements, and the Planner
-- handoff distinct from Client Brain factual truth and external publishing.

alter table public.social_content_items
  drop constraint if exists social_content_items_content_kind_check;

alter table public.social_content_items
  add constraint social_content_items_content_kind_check
  check (content_kind in ('feed', 'reel', 'story'));

alter table public.social_content_items
  add column if not exists planner_synced_payload_version integer,
  add column if not exists planner_synced_at timestamptz;

create table if not exists public.social_story_placements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_month_id uuid not null references public.social_content_months(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  social_story_schedule_slot_id uuid references public.social_story_schedule_slots(id) on delete set null,
  scheduled_date date not null,
  scheduled_time time not null,
  scheduled_at timestamptz not null,
  sequence integer not null default 1 check (sequence > 0),
  status text not null default 'Ready for Review'
    check (status in ('Draft', 'Ready for Review', 'Approved', 'Scheduled', 'Publishing', 'Published', 'Failed')),
  planner_synced_payload_version integer,
  planner_synced_at timestamptz,
  scheduled_payload_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_content_item_id, scheduled_date, scheduled_time)
);

create index if not exists social_story_placements_month_schedule_idx
  on public.social_story_placements (social_content_month_id, scheduled_date, scheduled_time);
create index if not exists social_story_placements_client_item_idx
  on public.social_story_placements (client_id, social_content_item_id);

drop trigger if exists touch_social_story_placements_updated_at on public.social_story_placements;
create trigger touch_social_story_placements_updated_at
  before update on public.social_story_placements
  for each row execute function public.touch_social_publishing_updated_at();

alter table public.social_story_placements enable row level security;
revoke all on public.social_story_placements from anon, authenticated;
grant all on public.social_story_placements to service_role;

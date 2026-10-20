-- The current Jarvis deployment is an owner-operated workspace without a
-- browser-authenticated user identity. Read state is therefore intentionally
-- shared by that workspace, rather than pretending it is per-user. The source
-- key is deterministic and derived from an existing canonical record.
create table if not exists public.home_notification_reads (
  source_key text primary key,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint home_notification_reads_source_key_check
    check (char_length(source_key) between 1 and 280)
);

alter table public.home_notification_reads enable row level security;

revoke all on table public.home_notification_reads from anon, authenticated;
grant select, insert, update, delete on table public.home_notification_reads to service_role;

comment on table public.home_notification_reads is
  'Shared owner-dashboard read receipts for deterministic Home notification sources.';

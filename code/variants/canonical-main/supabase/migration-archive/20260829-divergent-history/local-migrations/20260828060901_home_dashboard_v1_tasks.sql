-- Home Dashboard V1 — canonical operational task queue.
--
-- This intentionally does not replace legacy agent_tasks. Those rows remain
-- historical execution-plan records; Home owns a separate human operating
-- queue with explicit completion and review states.

create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'reviewed', 'archived')),
  priority text not null default 'p3'
    check (priority in ('p1', 'p2', 'p3')),
  due_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  archived_at timestamptz,
  client_id uuid references public.clients(id) on delete restrict,
  linked_object_type text check (linked_object_type is null or char_length(linked_object_type) <= 80),
  linked_object_id text check (linked_object_id is null or char_length(linked_object_id) <= 160),
  origin text not null default 'manual' check (origin in ('manual', 'suggested')),
  source jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  source_evidence_hash text check (source_evidence_hash is null or source_evidence_hash ~ '^[a-f0-9]{64}$'),
  dedupe_identity text check (dedupe_identity is null or char_length(dedupe_identity) <= 280),
  manual_order numeric(20, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_tasks_queue_idx
  on public.jarvis_tasks (status, due_at nulls last, priority, manual_order, created_at);
create index if not exists jarvis_tasks_client_idx
  on public.jarvis_tasks (client_id, status) where client_id is not null;
create index if not exists jarvis_tasks_dedupe_evidence_idx
  on public.jarvis_tasks (dedupe_identity, source_evidence_hash)
  where dedupe_identity is not null and source_evidence_hash is not null;

create table if not exists public.jarvis_task_suggestion_suppressions (
  id uuid primary key default gen_random_uuid(),
  dedupe_identity text not null check (char_length(dedupe_identity) between 1 and 280),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  reason text not null default 'dismissed' check (reason in ('dismissed', 'archived')),
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (dedupe_identity, evidence_hash)
);

create index if not exists jarvis_task_suggestion_suppressions_lookup_idx
  on public.jarvis_task_suggestion_suppressions (dedupe_identity, evidence_hash);

alter table public.jarvis_tasks enable row level security;
alter table public.jarvis_task_suggestion_suppressions enable row level security;
revoke all on public.jarvis_tasks from anon, authenticated;
revoke all on public.jarvis_task_suggestion_suppressions from anon, authenticated;
grant all on public.jarvis_tasks to service_role;
grant all on public.jarvis_task_suggestion_suppressions to service_role;

drop trigger if exists jarvis_tasks_set_updated_at on public.jarvis_tasks;
create trigger jarvis_tasks_set_updated_at before update on public.jarvis_tasks
for each row execute function public.agent_runtime_set_updated_at();

-- Jarvis Tool Registry
-- System-level registry for external platforms, providers and development tools.
-- This intentionally does not store credentials or client-specific connections.

create table if not exists public.tool_registry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  provider text,
  category text not null check (category in (
    'ai_agents', 'development', 'infrastructure_data', 'research_scraping',
    'creative_ai', 'social_publishing', 'advertising', 'google_ecosystem',
    'communication', 'crm_reservations', 'automation_connectivity',
    'analytics_monitoring', 'other'
  )),
  tool_type text not null default 'runtime_integration' check (tool_type in (
    'runtime_integration', 'development_tool', 'manual_external_tool',
    'infrastructure', 'candidate'
  )),
  description text not null check (char_length(description) between 1 and 420),
  jarvis_usage text,
  why_we_use text,
  usage_status text not null default 'explore' check (usage_status in ('active', 'experimental', 'planned', 'explore', 'deprecated')),
  connection_status text not null default 'not_connected' check (connection_status in ('connected', 'configured', 'partial', 'not_connected', 'not_required', 'unknown', 'error')),
  health_status text not null default 'not_applicable' check (health_status in ('healthy', 'needs_attention', 'not_checked', 'not_applicable')),
  potential_value text check (potential_value in ('high', 'medium', 'low')),
  decision_status text check (decision_status in ('not_evaluated', 'researching', 'shortlisted', 'rejected', 'promoted_to_planned')),
  logo_key text,
  official_website text,
  documentation_url text,
  developer_docs_url text,
  configuration_summary text,
  alternatives jsonb not null default '[]'::jsonb check (jsonb_typeof(alternatives) = 'array'),
  notes text,
  os_release_overrides text[] not null default '{}'::text[] check (os_release_overrides <@ array['os1-create', 'os2-distribute', 'os3-grow', 'os4-operate']::text[]),
  is_core boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_capability_links (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tool_registry(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('used_by', 'required_for', 'candidate_for')),
  created_at timestamptz not null default now(),
  unique (tool_id, roadmap_item_id, relationship_type)
);

create table if not exists public.tool_activity (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tool_registry(id) on delete cascade,
  action_type text not null check (action_type in ('created', 'updated', 'seeded', 'status_changed', 'connection_verified', 'connection_failed', 'promoted', 'rejected', 'deprecated')),
  description text not null check (char_length(description) between 1 and 360),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tool_registry_usage_category_idx on public.tool_registry(usage_status, category, name);
create index if not exists tool_registry_connection_idx on public.tool_registry(connection_status) where connection_status in ('connected', 'configured', 'partial', 'error');
create index if not exists tool_capability_links_tool_idx on public.tool_capability_links(tool_id);
create index if not exists tool_capability_links_capability_idx on public.tool_capability_links(roadmap_item_id);
create index if not exists tool_activity_tool_created_idx on public.tool_activity(tool_id, created_at desc);

create or replace function public.tool_registry_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tool_registry_set_updated_at on public.tool_registry;
create trigger tool_registry_set_updated_at before update on public.tool_registry
for each row execute function public.tool_registry_set_updated_at();

alter table public.tool_registry enable row level security;
alter table public.tool_capability_links enable row level security;
alter table public.tool_activity enable row level security;

revoke all on public.tool_registry, public.tool_capability_links, public.tool_activity from anon, authenticated;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


with links(tool_slug, capability_slug, relationship_type) as (
  values
    ('supabase', 'core-product-foundation', 'used_by'), ('supabase', 'client-brain', 'used_by'), ('supabase', 'ai-photography', 'used_by'), ('supabase', 'thirty-day-content-calendar', 'used_by'),
    ('anthropic-api', 'client-brain', 'used_by'), ('anthropic-api', 'ai-photography', 'used_by'), ('anthropic-api', 'caption-copy', 'used_by'),
    ('google-gemini-api', 'ai-photography', 'required_for'), ('topaz-photo-ai-api', 'ai-photography', 'used_by'), ('pinterest-api', 'ai-photography', 'used_by'),
    ('zernio', 'basic-platform-management', 'used_by'), ('zernio', 'scheduling', 'candidate_for'),
    ('ultimate-web-scraper', 'research-monitoring', 'candidate_for'), ('higgsfield', 'ai-video', 'candidate_for'),
    ('meta', 'publishing', 'required_for'), ('meta', 'meta-ads', 'required_for'),
    ('google-ads', 'google-advanced-paid-media', 'required_for'), ('sevenrooms', 'whatsapp-reservations', 'candidate_for'), ('sevenrooms', 'crm-leads', 'candidate_for'),
    ('whatsapp-business-platform', 'whatsapp-reservations', 'required_for'),
    ('openai-api', 'ai-photography', 'candidate_for'), ('openai-api', 'ai-video', 'candidate_for'),
    ('apify', 'research-monitoring', 'candidate_for'), ('apify', 'market-intelligence', 'candidate_for'), ('firecrawl', 'research-monitoring', 'candidate_for'),
    ('n8n', 'optimization-autonomy', 'candidate_for'), ('resend', 'email-marketing', 'candidate_for'), ('twilio', 'whatsapp-reservations', 'candidate_for'),
    ('sentry', 'core-product-foundation', 'candidate_for'), ('sentry', 'governance-controls', 'candidate_for'), ('posthog', 'performance-learning', 'candidate_for'),
    ('dataforseo', 'seo-local-search', 'candidate_for'), ('dataforseo', 'market-intelligence', 'candidate_for'), ('kling-ai', 'ai-video', 'candidate_for')
)
insert into public.tool_capability_links(tool_id, roadmap_item_id, relationship_type)
select tool.id, item.id, links.relationship_type
from links
join public.tool_registry tool on tool.slug = links.tool_slug
join public.roadmap_items item on item.slug = links.capability_slug and item.item_type = 'capability'
on conflict (tool_id, roadmap_item_id, relationship_type) do nothing;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


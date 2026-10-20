create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  email text,
  phone text,
  phone_country_code text,
  company text,
  job_title text,
  date_of_birth date,
  nationality text,
  preferred_language text,
  notes text,
  source text not null default 'manual'
    check (source in ('manual', 'reservation', 'event', 'website', 'instagram', 'walk_in', 'sevenrooms', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  external_ids jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  marketing_consent_email boolean,
  marketing_consent_sms boolean,
  marketing_consent_whatsapp boolean,
  consent_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint crm_contacts_name_required check (
    nullif(btrim(display_name), '') is not null
    or nullif(btrim(first_name), '') is not null
  ),
  constraint crm_contacts_email_shape check (
    email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create index if not exists crm_contacts_client_active_updated_idx
  on public.crm_contacts (client_id, updated_at desc)
  where deleted_at is null;

create index if not exists crm_contacts_client_created_idx
  on public.crm_contacts (client_id, created_at desc)
  where deleted_at is null;

create index if not exists crm_contacts_client_email_idx
  on public.crm_contacts (client_id, lower(email))
  where deleted_at is null and email is not null;

create index if not exists crm_contacts_client_phone_idx
  on public.crm_contacts (client_id, phone)
  where deleted_at is null and phone is not null;

create index if not exists crm_contacts_client_display_name_idx
  on public.crm_contacts (client_id, lower(display_name))
  where deleted_at is null;

create or replace function public.normalize_crm_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  new.display_name := nullif(btrim(new.display_name), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone_country_code := nullif(btrim(new.phone_country_code), '');
  new.company := nullif(btrim(new.company), '');
  new.job_title := nullif(btrim(new.job_title), '');
  new.nationality := nullif(btrim(new.nationality), '');
  new.preferred_language := nullif(btrim(new.preferred_language), '');
  new.notes := nullif(btrim(new.notes), '');

  if new.phone is not null then
    new.phone := regexp_replace(btrim(new.phone), '[^0-9+]', '', 'g');
    if new.phone like '00%' then
      new.phone := '+' || substring(new.phone from 3);
    end if;
    new.phone := nullif(new.phone, '');
  end if;

  if new.display_name is null then
    new.display_name := nullif(btrim(concat_ws(' ', new.first_name, new.last_name)), '');
  end if;

  new.tags := coalesce(
    (select array_agg(distinct btrim(tag) order by btrim(tag))
      from unnest(coalesce(new.tags, '{}'::text[])) as tag
      where nullif(btrim(tag), '') is not null),
    '{}'::text[]
  );
  new.external_ids := coalesce(new.external_ids, '{}'::jsonb);
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_crm_contact_before_write on public.crm_contacts;
create trigger normalize_crm_contact_before_write
before insert or update on public.crm_contacts
for each row execute function public.normalize_crm_contact();

alter table public.crm_contacts enable row level security;

-- CRM data contains PII. It is available only through server-side service-role
-- routes until Jarvis OS has a reusable authenticated client-membership model.
revoke all on table public.crm_contacts from anon, authenticated;
grant all on table public.crm_contacts to service_role;
revoke execute on function public.normalize_crm_contact() from public, anon, authenticated;
grant execute on function public.normalize_crm_contact() to service_role;

create or replace view public.crm_contact_data_quality
with (security_invoker = true)
as
with active_contacts as (
  select client_id, email, phone
  from public.crm_contacts
  where deleted_at is null
),
duplicate_groups as (
  select client_id, count(*)::bigint as duplicate_group_count
  from (
    select client_id, 'email'::text as match_type, email as match_value
    from active_contacts
    where email is not null
    group by client_id, email
    having count(*) > 1
    union all
    select client_id, 'phone'::text as match_type, phone as match_value
    from active_contacts
    where phone is not null
    group by client_id, phone
    having count(*) > 1
  ) groups
  group by client_id
)
select
  contacts.client_id,
  count(*)::bigint as total_guests,
  count(*) filter (where contacts.email is not null)::bigint as guests_with_email,
  count(*) filter (where contacts.phone is not null)::bigint as guests_with_phone,
  count(*) filter (where contacts.email is null or contacts.phone is null)::bigint as incomplete_profiles,
  count(*) filter (where contacts.email is null)::bigint as missing_email,
  count(*) filter (where contacts.phone is null)::bigint as missing_phone,
  count(*) filter (where contacts.email is null and contacts.phone is null)::bigint as missing_both,
  coalesce(max(duplicate_groups.duplicate_group_count), 0)::bigint as possible_duplicate_groups
from active_contacts contacts
left join duplicate_groups on duplicate_groups.client_id = contacts.client_id
group by contacts.client_id;

revoke all on table public.crm_contact_data_quality from anon, authenticated;
grant select on table public.crm_contact_data_quality to service_role;

comment on table public.crm_contacts is
  'Client-scoped hospitality CRM contacts. Reservations, visits, orders, preferences, tags, and sync history belong in separate relational tables.';
comment on column public.crm_contacts.external_ids is
  'Provider identifiers keyed by provider, reserved for future integrations such as SevenRooms.';
comment on column public.crm_contacts.metadata is
  'Non-core integration metadata only; never use for reservation, visit, order, or spend history.';

alter table public.asset_uploads
  add column if not exists metadata_status text,
  add column if not exists has_metadata boolean default false,
  add column if not exists metadata_success_count integer default 0,
  add column if not exists metadata_fail_count integer default 0;

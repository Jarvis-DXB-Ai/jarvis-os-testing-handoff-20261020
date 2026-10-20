create index if not exists client_brain_v2_records_superseded_by_idx
  on public.client_brain_v2_records (superseded_by_id)
  where superseded_by_id is not null;

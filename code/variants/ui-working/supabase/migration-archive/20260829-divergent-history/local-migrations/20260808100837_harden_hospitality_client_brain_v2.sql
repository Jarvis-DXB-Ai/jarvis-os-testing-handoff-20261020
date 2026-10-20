-- Make the server-only access model explicit to Supabase's RLS advisor.
create policy "service role manages client brain v2 records"
  on public.client_brain_v2_records
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages client brain v2 versions"
  on public.client_brain_v2_record_versions
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages client brain v2 links"
  on public.client_brain_v2_links
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages client brain file objects"
  on public.client_brain_file_objects
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages client brain v2 record files"
  on public.client_brain_v2_record_files
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages client brain v2 commercial details"
  on public.client_brain_v2_commercial_details
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists client_brain_v2_records_legacy_brain_idx
  on public.client_brain_v2_records (legacy_client_brain_id)
  where legacy_client_brain_id is not null;

create index if not exists client_brain_v2_record_files_file_idx
  on public.client_brain_v2_record_files (file_object_id);

create index if not exists client_brain_v2_commercial_record_client_idx
  on public.client_brain_v2_commercial_details (client_id, record_id);

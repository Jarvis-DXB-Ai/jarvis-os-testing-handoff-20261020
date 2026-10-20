-- Isolated PostgreSQL 17 fixture: Phase 2 lineage integrity only.
-- It is intentionally never run against the linked production project.

insert into public.clients (id, name) values
  ('a7604343-92d7-56ec-bf35-b272cac7f8b7', 'Phase 2 Client A'),
  ('c8aef456-9613-5dd2-9a9e-2207708a7338', 'Phase 2 Client B');

insert into public.client_operating_cycles (id, client_id, cycle_key) values
  ('94c54566-66ed-5b65-9b10-a819a972b148', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '2026-09'),
  ('59b8c942-a65c-5f1d-8eea-042ad9b007ce', 'c8aef456-9613-5dd2-9a9e-2207708a7338', '2026-09');

insert into public.ai_content_sessions (id, client_id, title, creative_request, aspect_ratio, output_resolution, status) values
  ('5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'Phase 2 Studio', 'Fixture', '4:5', '4K', 'active');

insert into public.ai_content_generations (id, client_id, session_id, version, status, prompt_version, aspect_ratio, output_resolution, prompt_text) values
  ('c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 1, 'generated', 'fixture', '4:5', '4K', 'Fixture');

insert into public.client_content_months (id, client_id, month_start) values
  ('4ee42478-0d93-517d-8787-39935ca36acb', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '2026-09-01');

insert into public.client_content_items (id, client_id, client_content_month_id, content_type, media_type, source, storage_bucket, storage_path, file_name, mime_type, byte_size, final_state, source_session_id, source_generation_id) values
  ('b4b48090-780e-5de3-8e77-e81801d57855', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '4ee42478-0d93-517d-8787-39935ca36acb', 'ai_photography', 'image', 'ai_content', 'client-content', 'fixture/final.jpg', 'final.jpg', 'image/jpeg', 100, 'final', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba');

insert into public.social_content_months (id, client_id, month_start, timezone) values
  ('b1803f97-1294-5c74-a3e8-217efb57717e', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '2026-09-01', 'Asia/Dubai');

insert into public.social_content_items (id, client_id, social_content_month_id, source, content_kind, format, sequence, status, scheduled_date, scheduled_time, scheduled_at, final_caption, caption_approved_at) values
  ('f135b6a7-88e8-538b-83ad-84c3897c5330', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'b1803f97-1294-5c74-a3e8-217efb57717e', 'monthly_plan', 'feed', 'feed', 1, 'Approved', '2026-09-12', '19:30', '2026-09-12T15:30:00Z', 'Fixture caption', now());

insert into public.social_content_media (id, client_id, social_content_item_id, storage_bucket, storage_path, file_name, mime_type, byte_size, sort_order) values
  ('d424a067-0860-5b8e-9d19-8e1514c0abd8', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'client-content', 'fixture/final.jpg', 'final.jpg', 'image/jpeg', 100, 1);

insert into public.social_content_platform_targets (id, client_id, social_content_item_id, platform, selected, status) values
  ('ea6b546d-3316-57b9-960a-4fadc945a9c7', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'instagram', true, 'Approved');

insert into public.content_lineage_items (id, client_id, operating_cycle_id, studio_session_id, studio_generation_id, final_content_item_id, social_content_item_id) values
  ('016cf6c5-a920-59f0-ac7a-f550d53a670f', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '94c54566-66ed-5b65-9b10-a819a972b148', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba', 'b4b48090-780e-5de3-8e77-e81801d57855', 'f135b6a7-88e8-538b-83ad-84c3897c5330');

insert into public.content_lineage_media_attachments (id, client_id, content_lineage_item_id, final_content_item_id, studio_session_id, studio_generation_id) values
  ('62d31d37-2ac2-5d7c-bbba-b44420bb66e7', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'b4b48090-780e-5de3-8e77-e81801d57855', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba');

insert into public.content_lineage_caption_attachments (id, client_id, content_lineage_item_id, social_content_item_id) values
  ('11f92f29-7496-5461-a188-c291e96f742b', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'f135b6a7-88e8-538b-83ad-84c3897c5330');

insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash) values
  ('0c6216ad-d772-5ced-b401-b495f03c9ee0', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 1, 'ready', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"path":"fixture/final.jpg"}', 'Fixture caption', '[{"platform":"instagram"}]', '{"date":"2026-09-12","time":"19:30"}', '{}', 'fixture-v1');

insert into public.content_final_review_manifest_targets (client_id, final_review_manifest_id, social_content_platform_target_id, platform, account_snapshot, scheduled_at) values
  ('a7604343-92d7-56ec-bf35-b272cac7f8b7', '0c6216ad-d772-5ced-b401-b495f03c9ee0', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', 'instagram', '{}', '2026-09-12T15:30:00Z');

do $$
begin
  begin
    insert into public.content_lineage_media_attachments (client_id, content_lineage_item_id, final_content_item_id, studio_session_id, studio_generation_id)
    values ('c8aef456-9613-5dd2-9a9e-2207708a7338', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'b4b48090-780e-5de3-8e77-e81801d57855', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba');
    raise exception 'Expected cross-client media attachment rejection.';
  exception when foreign_key_violation then
    raise notice 'cross-client media attachment rejected as expected';
  end;
  begin
    insert into public.content_lineage_media_attachments (client_id, content_lineage_item_id, final_content_item_id, studio_session_id, studio_generation_id)
    values ('a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'b4b48090-780e-5de3-8e77-e81801d57855', '5ce2af44-b4f4-5665-b3e9-6c0aa50a93f1', 'c6bd6e2f-4e61-5b5f-a15c-50f8f90f07ba');
    raise exception 'Expected duplicate active media rejection.';
  exception when unique_violation then
    raise notice 'duplicate active media attachment rejected as expected';
  end;
end;
$$;

update public.content_final_review_manifests
set review_status = 'approved', approved_by = 'Fixture reviewer', approved_at = now()
where id = '0c6216ad-d772-5ced-b401-b495f03c9ee0';

do $$
begin
  begin
    update public.content_final_review_manifests
    set caption_snapshot = 'A silently changed caption'
    where id = '0c6216ad-d772-5ced-b401-b495f03c9ee0';
    raise exception 'Expected approved manifest immutability rejection.';
  exception when raise_exception then
    raise notice 'approved manifest payload mutation rejected as expected';
  end;
end;
$$;

update public.social_content_items
set final_caption = 'Replacement caption', caption_approved_at = now()
where id = 'f135b6a7-88e8-538b-83ad-84c3897c5330';

do $$
begin
  if (select review_status from public.content_final_review_manifests where id = '0c6216ad-d772-5ced-b401-b495f03c9ee0') <> 'stale' then
    raise exception 'Caption replacement did not stale the approved manifest.';
  end if;
  raise notice 'caption replacement staled the manifest as expected';
end;
$$;

insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash, approved_by, approved_at) values
  ('56faa1ea-fd30-5912-ab09-17dc49abd081', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 2, 'approved', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"path":"fixture/final.jpg"}', 'Replacement caption', '[{"platform":"instagram"}]', '{"date":"2026-09-12","time":"19:30"}', '{}', 'fixture-v2', 'Fixture reviewer', now());

update public.social_content_platform_targets set selected = false where id = 'ea6b546d-3316-57b9-960a-4fadc945a9c7';

do $$
begin
  if (select review_status from public.content_final_review_manifests where id = '56faa1ea-fd30-5912-ab09-17dc49abd081') <> 'stale' then
    raise exception 'Platform change did not stale the approved manifest.';
  end if;
  raise notice 'platform change staled the manifest as expected';
end;
$$;

-- Each change must stale exactly the manifest version that approved the old payload.
insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash, approved_by, approved_at) values
  ('c9e31bbb-52c3-56a6-b58c-ebfca7e31389', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 3, 'approved', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"path":"fixture/final.jpg"}', 'Replacement caption', '[{"platform":"instagram"}]', '{"date":"2026-09-12","time":"19:30"}', '{}', 'fixture-v3', 'Fixture reviewer', now());

update public.social_content_items set scheduled_time = '20:00', scheduled_at = '2026-09-12T16:00:00Z' where id = 'f135b6a7-88e8-538b-83ad-84c3897c5330';

do $$
begin
  if (select review_status from public.content_final_review_manifests where id = 'c9e31bbb-52c3-56a6-b58c-ebfca7e31389') <> 'stale' then
    raise exception 'Schedule change did not stale the approved manifest.';
  end if;
  raise notice 'schedule change staled the manifest as expected';
end;
$$;

insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash, approved_by, approved_at) values
  ('caed22b2-db4f-59f2-a2ce-745c8735177a', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 4, 'approved', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"path":"fixture/final.jpg"}', 'Replacement caption', '[{"platform":"instagram"}]', '{"date":"2026-09-12","time":"20:00"}', '{}', 'fixture-v4', 'Fixture reviewer', now());

update public.social_content_media set storage_path = 'fixture/replacement.jpg' where id = 'd424a067-0860-5b8e-9d19-8e1514c0abd8';

do $$
begin
  if (select review_status from public.content_final_review_manifests where id = 'caed22b2-db4f-59f2-a2ce-745c8735177a') <> 'stale' then
    raise exception 'Media change did not stale the approved manifest.';
  end if;
  raise notice 'media change staled the manifest as expected';
end;
$$;

insert into public.content_lineage_publishing_handoffs (id, client_id, content_lineage_item_id, final_review_manifest_id, social_content_item_id) values
  ('31728687-16bb-5547-95b4-32cc31facf9b', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '56faa1ea-fd30-5912-ab09-17dc49abd081', 'f135b6a7-88e8-538b-83ad-84c3897c5330');

do $$
begin
  begin
    insert into public.content_lineage_publishing_handoffs (client_id, content_lineage_item_id, final_review_manifest_id, social_content_item_id)
    values ('a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '56faa1ea-fd30-5912-ab09-17dc49abd081', 'f135b6a7-88e8-538b-83ad-84c3897c5330');
    raise exception 'Expected duplicate publishing handoff rejection.';
  exception when unique_violation then
    raise notice 'duplicate publishing handoff rejected as expected';
  end;
end;
$$;

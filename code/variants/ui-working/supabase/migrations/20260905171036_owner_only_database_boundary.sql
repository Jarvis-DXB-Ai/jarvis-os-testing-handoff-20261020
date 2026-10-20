-- Jarvis is owner-only. Legacy browser queries now use /api/owner-data with
-- verified Access identity; server jobs retain service_role access.
-- Deploy the compatibility endpoint and this migration in the same release.
-- No rows are changed. The two formerly public buckets become private; legacy URLs use owner-media.
BEGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Remove the old anonymous-policy escape hatch as well as its grants. This
-- prevents an accidental future grant from restoring unrestricted access.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname = 'public' AND roles && ARRAY['public','anon','authenticated']::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO service_role',p.policyname,p.schemaname,p.tablename);
  END LOOP;
  FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname = 'storage' AND policyname IN (
      'guest_models_storage_select','guest_models_storage_insert','guest_models_storage_update','guest_models_storage_delete')
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO service_role',p.policyname,p.schemaname,p.tablename);
  END LOOP;
END;
$$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

COMMIT;

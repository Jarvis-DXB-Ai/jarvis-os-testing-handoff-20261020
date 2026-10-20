-- The application already exposes Caption Intelligence as an editable Brand Kit
-- subsection. Extend both existing subsection guards without changing tenant,
-- concurrency, approved-state, asset-link or permission checks.
DO $migration$
DECLARE
  definition text;
  old_list text := '''logos'', ''colours'', ''typography'', ''graphics_icons''';
  new_list text := '''logos'', ''colours'', ''typography'', ''graphics_icons'', ''caption_intelligence''';
BEGIN
  SELECT pg_get_functiondef('public.apply_client_brain_v2_brand_guideline_edit(uuid,jsonb,jsonb)'::regprocedure) INTO definition;
  IF strpos(definition, new_list) > 0 THEN RETURN; END IF;
  IF (length(definition) - length(replace(definition, old_list, ''))) / length(old_list) <> 2 THEN
    RAISE EXCEPTION 'Brand Kit function changed; review both subsection guards before migrating';
  END IF;
  EXECUTE replace(definition, old_list, new_list);
END $migration$;

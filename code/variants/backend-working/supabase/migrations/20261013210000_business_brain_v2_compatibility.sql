-- Reuse the existing generic Brain sections for non-hospitality clients.
-- Restaurant-only predicates and procedures are unchanged.
DO $business_brain$
DECLARE fn record; definition text; next_definition text;
BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
 WHERE n.nspname='public' AND p.prokind='f' AND p.proname LIKE 'client_brain_v2_%'
 LOOP
  definition := pg_get_functiondef(fn.oid);
  next_definition := replace(definition, '''hospitality_v2'', ''hospitality_restaurant_v2''', '''hospitality_v2'', ''hospitality_restaurant_v2'', ''business_v2''');
  IF next_definition<>definition THEN EXECUTE next_definition; END IF;
 END LOOP;
END $business_brain$;

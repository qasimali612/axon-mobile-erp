-- TrackingMethod uses IMEI and SERIAL for individually tracked stock. Correct
-- the operational posting guard created in the prior migration before any
-- operational document can be posted.
DO $$
DECLARE
  function_ddl TEXT;
BEGIN
  SELECT pg_get_functiondef('verify_inventory_document_effects()'::regprocedure)
    INTO function_ddl;
  function_ddl := replace(
    function_ddl,
    'p."trackingMethod" = ''SERIALIZED''',
    'p."trackingMethod" IN (''IMEI'', ''SERIAL'')'
  );
  IF position('SERIALIZED' in function_ddl) > 0 THEN
    RAISE EXCEPTION 'Could not safely replace the serialized tracking predicate';
  END IF;
  EXECUTE function_ddl;
END;
$$;

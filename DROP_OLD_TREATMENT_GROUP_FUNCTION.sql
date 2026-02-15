-- Drop old create_treatment_group function (5 parameters)
-- This will force backend to use the new 7-parameter version with timeline support

DROP FUNCTION IF EXISTS public.create_treatment_group(
  uuid,
  uuid,
  uuid,
  text,
  text
);

-- Verify the new function exists
SELECT 
  routine_name,
  parameter_count,
  data_type,
  external_language
FROM information_schema.routines 
WHERE routine_name = 'create_treatment_group'
AND routine_schema = 'public'
ORDER BY routine_name;

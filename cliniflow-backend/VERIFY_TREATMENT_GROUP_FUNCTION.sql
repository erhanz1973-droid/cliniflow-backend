-- Verify create_treatment_group_atomic function exists and has correct parameters
-- This function should include timeline event creation

SELECT 
  routine_name,
  parameter_count,
  data_type,
  external_language
FROM information_schema.routines 
WHERE routine_name = 'create_treatment_group_atomic'
AND routine_schema = 'public'
ORDER BY routine_name;

-- Check function parameters
SELECT 
  parameter_name,
  parameter_mode,
  data_type,
  ordinal_position
FROM information_schema.parameters 
WHERE specific_name = 'create_treatment_group_atomic'
AND parameter_schema = 'public'
ORDER BY ordinal_position;

-- Test the function with sample data (will rollback)
BEGIN;
SELECT create_treatment_group_atomic(
  '00000000-0000-0000-0000-000000000001'::UUID, -- p_admin_id
  '00000000-0000-0000-0000-000000000002'::UUID, -- p_clinic_id
  '00000000-0000-0000-0000-000000000003'::UUID, -- p_patient_id
  'Test Group', -- p_name
  'Test Description', -- p_description
  ARRAY['00000000-0000-0000-0000-000000000004'::UUID], -- p_doctor_ids
  '00000000-0000-0000-0000-000000000004'::UUID -- p_primary_doctor_id
);
ROLLBACK;

-- Check if timeline events table exists and has correct schema
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'admin_timeline_events'
AND table_schema = 'public'
ORDER BY ordinal_position;

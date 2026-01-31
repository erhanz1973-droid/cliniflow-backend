-- Check the actual column names in the patients table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'patients' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

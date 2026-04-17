-- Check referrals table structure and foreign key relationships
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'referrals' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

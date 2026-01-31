-- Check if clinics exist in Supabase
SELECT 
  id,
  name,
  email,
  status,
  created_at
FROM clinics 
ORDER BY created_at DESC
LIMIT 10;

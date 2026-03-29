-- Check clinics without status column
SELECT 
  id,
  name,
  email,
  created_at
FROM clinics 
ORDER BY created_at DESC
LIMIT 10;

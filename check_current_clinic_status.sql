-- Check current status of all clinics
SELECT 
  id,
  name,
  email,
  status,
  created_at,
  updated_at
FROM clinics 
ORDER BY created_at DESC;

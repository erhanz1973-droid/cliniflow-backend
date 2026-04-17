-- ================== CHECK CLINIC DATA ==================
-- RUN THIS IN SUPABASE SQL EDITOR TO CHECK CLINIC DATA

-- Check all clinics in the database
SELECT 
  id,
  clinic_code,
  name,
  email,
  status,
  created_at
FROM clinics 
ORDER BY created_at DESC;

-- Check specifically for ZLATAN
SELECT 
  id,
  clinic_code,
  name,
  email,
  status,
  created_at
FROM clinics 
WHERE clinic_code = 'ZLATAN';

-- Check all clinic codes (case insensitive)
SELECT 
  DISTINCT clinic_code,
  COUNT(*) as count
FROM clinics 
GROUP BY clinic_code
ORDER BY clinic_code;

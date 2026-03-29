-- ================== CHECK ZLATAN CLINIC PASSWORD ==================
-- RUN THIS IN SUPABASE SQL EDITOR

-- Check ZLATAN clinic data including password
SELECT 
  id,
  clinic_code,
  name,
  email,
  password,
  status,
  created_at,
  updated_at
FROM clinics 
WHERE clinic_code = 'ZLATAN';

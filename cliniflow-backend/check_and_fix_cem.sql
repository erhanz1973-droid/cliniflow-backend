-- Check CEM clinic in Supabase
-- Run this in Supabase SQL Editor

SELECT 
  clinic_code,
  name,
  email,
  status,
  created_at
FROM clinics 
WHERE clinic_code = 'CEM';

-- If no results, insert CEM clinic
INSERT INTO clinics (
  id,
  clinic_code,
  name,
  email,
  password_hash,
  status,
  created_at
) VALUES (
  gen_random_uuid(),
  'CEM',
  'CEM Clinic',
  'cem@clinifly.net',
  'admin123',
  'ACTIVE',
  NOW()
) ON CONFLICT (clinic_code) DO NOTHING;

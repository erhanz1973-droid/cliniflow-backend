-- Check clinics table structure
-- Run this in Supabase SQL Editor

SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'clinics' 
ORDER BY ordinal_position;

-- Check if CEM clinic exists
SELECT * FROM clinics WHERE clinic_code = 'CEM';

-- Insert CEM clinic with existing columns only
INSERT INTO clinics (
  id,
  clinic_code,
  name,
  email,
  password_hash,
  status,
  created_at
) VALUES (
  uuid_generate_v4(),
  'CEM',
  'CEM Clinic',
  'cem@clinifly.net',
  'admin123',
  'ACTIVE',
  current_timestamp
)
ON CONFLICT (clinic_code) DO NOTHING;

-- Simple CEM clinic insert with basic columns only
-- Run this in Supabase SQL Editor

-- First, check existing columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clinics' 
ORDER BY ordinal_position;

-- Check if CEM exists
SELECT * FROM clinics WHERE clinic_code = 'CEM';

-- Insert CEM with only basic required columns
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
);

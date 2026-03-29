-- Fix CEM clinic in Supabase
-- Run this in Supabase SQL Editor

-- First, check if CEM exists
SELECT * FROM clinics WHERE clinic_code = 'CEM';

-- If no results, insert CEM clinic with correct UUID
INSERT INTO clinics (
  id,
  clinic_code,
  name,
  email,
  password_hash,
  status,
  created_at
) VALUES (
  'cem-clinic-id-' || substr(md5(random()::text), 1, 8),
  'CEM',
  'CEM Clinic',
  'cem@clinifly.net',
  'admin123',
  'ACTIVE',
  current_timestamp
);

-- Verify insertion
SELECT * FROM clinics WHERE clinic_code = 'CEM';

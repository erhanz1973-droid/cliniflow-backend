-- Fix CEM clinic in Supabase with proper UUID
-- Run this in Supabase SQL Editor

-- First, check if CEM exists
SELECT * FROM clinics WHERE clinic_code = 'CEM';

-- Insert CEM clinic with proper UUID
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

-- Verify insertion
SELECT * FROM clinics WHERE clinic_code = 'CEM';

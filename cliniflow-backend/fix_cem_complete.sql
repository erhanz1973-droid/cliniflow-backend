-- Fix CEM clinic with all required fields
-- Run this in Supabase SQL Editor

-- First, check if CEM exists
SELECT * FROM clinics WHERE clinic_code = 'CEM';

-- Insert CEM clinic with correct columns
INSERT INTO clinics (
  clinic_code,
  name,
  email,
  password,
  address,
  phone,
  created_at,
  updated_at
) VALUES (
  'CEM',
  'CEM Clinic',
  'cem@clinifly.net',
  'admin123',
  'CEM Clinic Address, Istanbul, Turkey',
  '+90 555 123456',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Verify insertion
SELECT * FROM clinics WHERE clinic_code = 'CEM';

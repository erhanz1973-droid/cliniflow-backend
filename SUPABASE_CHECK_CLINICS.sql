-- Supabase: Check clinics table data
-- Run this SQL in Supabase SQL Editor to verify clinic data

SELECT 
  clinic_code,
  name,
  email,
  phone,
  address,
  website,
  logo_url,
  created_at,
  updated_at
FROM public.clinics
ORDER BY clinic_code;


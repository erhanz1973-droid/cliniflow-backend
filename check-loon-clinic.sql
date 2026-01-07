-- Check LOON clinic in Supabase
-- Run this in Supabase SQL Editor to see current state

SELECT 
  clinic_code,
  name,
  email,
  phone,
  address,
  website,
  logo_url,
  google_maps_url,
  created_at,
  updated_at
FROM public.clinics
WHERE clinic_code = 'LOON';


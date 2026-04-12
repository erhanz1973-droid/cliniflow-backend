-- Check referral discount columns in clinics table
-- Run this in Supabase SQL Editor to see what discount data exists

SELECT 
  clinic_code,
  name,
  default_inviter_discount_percent,
  default_invited_discount_percent,
  settings,
  created_at,
  updated_at
FROM public.clinics
WHERE clinic_code = 'ZLATAN'  -- Filter for your specific clinic
ORDER BY clinic_code;

-- Also check all clinics to see the data structure
SELECT 
  clinic_code,
  default_inviter_discount_percent,
  default_invited_discount_percent,
  settings
FROM public.clinics
ORDER BY clinic_code;

-- Check if settings contains referral data
SELECT 
  clinic_code,
  settings->'referralLevels' as referral_levels_in_settings,
  settings->'referralLevel1Percent' as level1_percent_in_settings
FROM public.clinics
WHERE clinic_code = 'ZLATAN';

-- Check what columns actually exist in clinics table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clinics' 
AND table_schema = 'public'
ORDER BY ordinal_position;

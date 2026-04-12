-- Check current ZLATAN clinic data before fixing
-- Run this to see what's currently stored

SELECT 
  clinic_code,
  name,
  default_inviter_discount_percent,
  default_invited_discount_percent,
  settings,
  settings->'referralLevels' as referral_levels_in_settings,
  settings->'referralLevel1Percent' as level1_percent_in_settings
FROM public.clinics
WHERE clinic_code = 'ZLATAN';

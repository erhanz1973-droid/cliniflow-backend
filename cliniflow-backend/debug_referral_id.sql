-- Check if the specific referral exists and verify the ID columns
SELECT 
  id,
  referral_id,
  clinic_id,
  status,
  created_at
FROM public.referrals 
WHERE id = '1a13708e-fc4c-4be6-9314-825678283fe1' 
   OR referral_id = '1a13708e-fc4c-4be6-9314-825678283fe1';

-- Also check all referrals for ZLATAN clinic
SELECT 
  id,
  referral_id,
  clinic_id,
  status,
  created_at
FROM public.referrals 
WHERE clinic_id = (SELECT id FROM public.clinics WHERE clinic_code = 'ZLATAN')
ORDER BY created_at DESC;

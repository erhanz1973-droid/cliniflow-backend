-- Check actual referral data to understand the column structure
-- Run this to see what data exists and which columns are used

SELECT 
  id,
  referral_id,
  clinic_id,
  inviter_patient_id,
  invited_patient_id,
  status,
  created_at
FROM public.referrals
WHERE clinic_id = (SELECT id FROM public.clinics WHERE clinic_code = 'ZLATAN')
ORDER BY created_at DESC
LIMIT 5;

-- Also check if the specific referral ID exists in either column
SELECT 
  id,
  referral_id,
  clinic_id,
  status
FROM public.referrals 
WHERE id = '1a13708e-fc4c-4be6-9314-825678283fe1' 
   OR referral_id = '1a13708e-fc4c-4be6-9314-825678283fe1';

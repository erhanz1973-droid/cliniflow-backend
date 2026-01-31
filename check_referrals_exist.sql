-- Check what referrals exist for ZLATAN clinic
-- Run this to see all referrals and their IDs

SELECT 
  id,
  inviter_patient_id,
  invited_patient_id,
  status,
  created_at,
  updated_at
FROM public.referrals
WHERE clinic_id = (SELECT id FROM public.clinics WHERE clinic_code = 'ZLATAN')
ORDER BY created_at DESC;

-- Also check if the specific referral ID exists anywhere
SELECT 
  id,
  clinic_id,
  inviter_patient_id,
  invited_patient_id,
  status
FROM public.referrals 
WHERE id = '1a13708e-fc4c-4be6-9314-825678283fe1';

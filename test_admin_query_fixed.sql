-- Test the exact query the admin backend is running (without deleted_at)
-- This will help us understand why the search is failing

SELECT 
  id,
  referral_id,
  clinic_id,
  status,
  created_at
FROM public.referrals 
WHERE id = '1a13708e-fc4c-4be6-9314-825678283fe1'
  AND clinic_id = '0c4358c9-e102-4b76-b649-f595319d9d23';

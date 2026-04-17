-- Update ZLATAN clinic to use 10% discount (Level 1 only)
-- Run this to set discount to match the Clinic Settings form

UPDATE public.clinics 
SET 
  default_inviter_discount_percent = 10,
  default_invited_discount_percent = 10,
  updated_at = NOW()
WHERE clinic_code = 'ZLATAN';

-- Verify the update
SELECT 
  clinic_code,
  name,
  default_inviter_discount_percent,
  default_invited_discount_percent,
  updated_at
FROM public.clinics
WHERE clinic_code = 'ZLATAN';

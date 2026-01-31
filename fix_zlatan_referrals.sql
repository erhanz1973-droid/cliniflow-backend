-- Fix ZLATAN clinic referral discounts
-- Run this in Supabase SQL Editor to set your 66% discount values

-- Update ZLATAN clinic with 66% discount for both inviter and invited
UPDATE public.clinics 
SET 
  default_inviter_discount_percent = 66,
  default_invited_discount_percent = 66,
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

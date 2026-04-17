-- Check the ZLATAN clinic ID to verify it matches
SELECT 
  id,
  clinic_code,
  name
FROM public.clinics 
WHERE clinic_code = 'ZLATAN';

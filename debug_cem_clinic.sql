-- Debug CEM clinic credentials
-- Supabase SQL Editor'da çalıştırın

SELECT 
  clinic_code,
  name,
  email,
  password_hash,
  status
FROM clinics 
WHERE clinic_code = 'CEM';

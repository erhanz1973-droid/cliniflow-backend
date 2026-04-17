-- Check CEM clinic details and fix password
-- Supabase SQL Editor'da çalıştırın

-- 1. Mevcut CEM klinik bilgilerini gör
SELECT 
  clinic_code,
  name,
  email,
  password_hash,
  status
FROM clinics 
WHERE clinic_code = 'CEM';

-- 2. Eğer şifre hash'liyse, plain text yap
UPDATE clinics 
SET password_hash = 'admin123'
WHERE clinic_code = 'CEM';

-- 3. Kontrol et
SELECT 
  clinic_code,
  name,
  email,
  password_hash,
  status
FROM clinics 
WHERE clinic_code = 'CEM';

-- Update CEM clinic email to match frontend
-- Supabase SQL Editor'da çalıştırın

UPDATE clinics 
SET email = 'erhanz19731@gmail.com'
WHERE clinic_code = 'CEM';

-- Verify update
SELECT clinic_code, name, email, password_hash 
FROM clinics 
WHERE clinic_code = 'CEM';

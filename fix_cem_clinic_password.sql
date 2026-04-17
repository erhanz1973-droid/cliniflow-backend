-- Fix CEM Clinic Password Hash
-- This corrects the password hash to the proper bcrypt hash of "123456"
-- Run this in Supabase SQL Editor

UPDATE clinics 
SET 
  password_hash = '$2b$10$Beb4EJxSQC8BF82vvnRiJOxVa/j4LLU2wWW7HkoL4OXPfVuR3S.iG',
  updated_at = NOW()
WHERE clinic_code = 'CEM';

-- Verify the update
SELECT clinic_code, email, password_hash, created_at, updated_at FROM clinics WHERE clinic_code = 'CEM';

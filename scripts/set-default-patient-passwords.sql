-- =============================================================================
-- Set default password "123456" for all existing patients
-- =============================================================================
-- Run this once in Supabase SQL Editor.
-- After this, patients can log in with their phone/email + password "123456".
-- They can change their password later (if that feature is built).
--
-- bcrypt hash of "123456" with cost 10:
--   $2b$10$.17ji1p588eAS5hRhwA1Pe2g.PXDQnB1elLct7Y.j0FyR9okKXAjO
-- =============================================================================

-- 1. Make sure the column exists (safe to run even if already added)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Set password_hash = bcrypt("123456") for every patient that has no password yet
UPDATE patients
SET
  password_hash = '$2b$10$.17ji1p588eAS5hRhwA1Pe2g.PXDQnB1elLct7Y.j0FyR9okKXAjO',
  updated_at    = NOW()
WHERE
  password_hash IS NULL
  AND role = 'PATIENT';

-- 3. Verify — shows how many patients now have a password
SELECT
  COUNT(*)                                      AS total_patients,
  COUNT(password_hash)                          AS with_password,
  COUNT(*) - COUNT(password_hash)               AS without_password
FROM patients
WHERE role = 'PATIENT';

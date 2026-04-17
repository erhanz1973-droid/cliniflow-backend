-- =============================================================================
-- Set default password "123456" for all existing doctors without password_hash
-- =============================================================================
-- Run this once in Supabase SQL Editor.
-- After this, doctors can log in with their email + "123456" + clinic code.
-- They should change their password after first login.
--
-- bcrypt hash of "123456" with cost 10:
--   $2b$10$.17ji1p588eAS5hRhwA1Pe2g.PXDQnB1elLct7Y.j0FyR9okKXAjO
-- =============================================================================

-- 1. Make sure the column exists (safe to run even if already added)
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Set password_hash = bcrypt("123456") for every doctor that has no password yet
UPDATE doctors
SET
  password_hash = '$2b$10$.17ji1p588eAS5hRhwA1Pe2g.PXDQnB1elLct7Y.j0FyR9okKXAjO',
  updated_at    = NOW()
WHERE
  password_hash IS NULL;

-- 3. Verify
SELECT
  COUNT(*)                            AS total_doctors,
  COUNT(password_hash)                AS with_password,
  COUNT(*) - COUNT(password_hash)     AS without_password
FROM doctors;
